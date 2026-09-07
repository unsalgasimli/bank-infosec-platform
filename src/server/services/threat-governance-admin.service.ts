import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ThreatModelService } from './threat-model.service.js';
import { ThreatModelRepository } from '../db/postgres/threat-model-repository.js';
import { pgClient } from '../db/postgres/client.js';
import { securityReviewer } from './threat-model-policy.js';
import { AuditService } from './audit.service.js';
import type { BankUser } from '../../shared/types/auth.js';
const id=()=>randomUUID();
const reason=z.string().trim().min(1).max(4000);
export class ThreatGovernanceAdminService {
  static async replaceComplianceMapping(modelId:string,input:unknown,actor:BankUser){
    const parsed=z.object({requirementId:z.string().min(1).max(64),revisionVersion:z.number().int().positive(),complianceIds:z.array(z.string().min(1).max(64)).min(1).max(100),reason}).parse(input);
    return ThreatModelService.withAnalysisModel(modelId,actor,async(client,model)=>{
      const revision=(await client.query('SELECT version FROM threat_model_revisions WHERE id=$1',[model.currentRevisionId])).rows[0];
      if(revision.version!==parsed.revisionVersion)throw new Error('Revision changed; refresh the mapping before replacing it.');
      if(!(await client.query('SELECT 1 FROM threat_security_requirements WHERE id=$1 AND revision_id=$2',[parsed.requirementId,model.currentRevisionId])).rowCount)throw new Error('Requirement not found in this model revision.');
      const ids=[...new Set(parsed.complianceIds)];
      if((await client.query("SELECT id FROM threat_compliance_details WHERE id=ANY($1::varchar[]) AND current_validation_status='VALIDATED'",[ids])).rowCount!==ids.length)throw new Error('Every replacement interpretation requires independent validation.');
      const before=(await client.query('SELECT compliance_id FROM threat_requirement_compliance WHERE requirement_id=$1 ORDER BY compliance_id',[parsed.requirementId])).rows;
      await client.query('DELETE FROM threat_requirement_compliance WHERE requirement_id=$1',[parsed.requirementId]);
      for(const complianceId of ids)await client.query('INSERT INTO threat_requirement_compliance(requirement_id,compliance_id) VALUES($1,$2)',[parsed.requirementId,complianceId]);
      await client.query('UPDATE threat_model_revisions SET version=version+1 WHERE id=$1',[model.currentRevisionId]);
      await ThreatModelRepository.audit(client,{id:id(),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'REQUIREMENT_COMPLIANCE_REPLACED',entityType:'SECURITY_REQUIREMENT',entityId:parsed.requirementId,oldValue:before,newValue:parsed});return {id:parsed.requirementId};
    });
  }
  static async escalateException(modelId:string,exceptionId:string,input:unknown,actor:BankUser){
    const parsed=z.object({reason}).parse(input);
    return ThreatModelService.withAnalysisModel(modelId,actor,async(client,model)=>{
      if(!securityReviewer(actor))throw new Error('Independent security authority is required.');
      if(!(await client.query('SELECT 1 FROM threat_model_exceptions e JOIN threats t ON t.id=e.threat_id WHERE e.id=$1 AND t.revision_id=$2',[exceptionId,model.currentRevisionId])).rowCount)throw new Error('Exception not found in this model revision.');
      await client.query("INSERT INTO threat_exception_escalation_reviews(exception_id,assessment_sha256,reason,reviewed_by) VALUES($1,'',$2,$3)",[exceptionId,parsed.reason,actor.id]);
      await ThreatModelRepository.audit(client,{id:id(),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'EXCEPTION_ESCALATION_REVIEWED',entityType:'THREAT_MODEL_EXCEPTION',entityId:exceptionId,newValue:parsed});return {id:exceptionId};
    });
  }
  static async lifecycle(modelId:string,actor:BankUser){
    return ThreatModelService.withGovernanceModel(modelId,actor,async(client,model)=>({model,requests:(await client.query('SELECT q.*,d.decision,d.reason AS decision_reason,d.decided_by,d.decided_at FROM threat_retirement_requests q LEFT JOIN threat_retirement_decisions d ON d.request_id=q.id WHERE q.threat_model_id=$1 ORDER BY q.requested_at DESC LIMIT 100',[modelId])).rows,events:(await client.query('SELECT * FROM threat_retention_events WHERE threat_model_id=$1 ORDER BY event_sequence DESC LIMIT 100',[modelId])).rows}));
  }
  static async requestRetirement(modelId:string,input:unknown,actor:BankUser){
    const parsed=z.object({version:z.number().int().positive(),changeTicketId:z.string().min(1).max(64),attachmentId:z.string().min(1).max(64),reason}).parse(input);
    return ThreatModelService.withGovernanceModel(modelId,actor,async(client,model)=>{
      this.manageAccess(model,actor);
      if(model.version!==parsed.version)throw new Error('Model changed; refresh before requesting retirement.');
      await ThreatModelService.validateGovernanceEvidence(client,model,parsed.attachmentId,parsed.changeTicketId,actor);
      const requestId=id();
      await client.query('INSERT INTO threat_retirement_requests(id,threat_model_id,revision_id,model_version,change_ticket_id,attachment_id,reason,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[requestId,modelId,model.currentRevisionId,model.version,parsed.changeTicketId,parsed.attachmentId,parsed.reason,actor.id]);
      await ThreatModelRepository.audit(client,{id:id(),modelId,actorId:actor.id,action:'MODEL_RETIREMENT_REQUESTED',entityType:'THREAT_RETIREMENT_REQUEST',entityId:requestId,newValue:parsed});return {id:requestId};
    });
  }
  static async decideRetirement(modelId:string,requestId:string,input:unknown,actor:BankUser){
    const parsed=z.object({decision:z.enum(['APPROVED','REJECTED']),reason}).parse(input);
    return ThreatModelService.withGovernanceModel(modelId,actor,async(client,model)=>{
      if(!actor.roles.includes('CISO')||actor.roles.includes('AUDITOR'))throw new Error('Independent CISO authority is required.');
      const request=(await client.query('SELECT * FROM threat_retirement_requests WHERE id=$1 AND threat_model_id=$2',[requestId,modelId])).rows[0];
      if(!request)throw new Error('Retirement request not found in this model.');
      if(parsed.decision==='APPROVED')await ThreatModelService.validateGovernanceEvidence(client,model,request.attachment_id,request.change_ticket_id,actor);
      const decisionId=id();await client.query('INSERT INTO threat_retirement_decisions(id,request_id,decision,reason,decided_by) VALUES($1,$2,$3,$4,$5)',[decisionId,requestId,parsed.decision,parsed.reason,actor.id]);
      await ThreatModelRepository.audit(client,{id:id(),modelId,actorId:actor.id,action:'MODEL_RETIREMENT_DECIDED',entityType:'THREAT_RETIREMENT_REQUEST',entityId:requestId,oldValue:model,newValue:parsed});return {id:decisionId};
    });
  }
  static async retain(modelId:string,input:unknown,actor:BankUser){
    const parsed=z.object({action:z.enum(['HOLD_SET','HOLD_RELEASED','ARCHIVED','RETENTION_EXTENDED']),retainUntil:z.string().datetime().optional(),reason}).parse(input);
    return ThreatModelService.withGovernanceModel(modelId,actor,async(client,model)=>{
      if(actor.roles.includes('AUDITOR')||!actor.roles.some(role=>['CISO','INFOSEC_ADMIN','INFOSEC_MANAGER','GRC_ANALYST'].includes(role)))throw new Error('Retention governance authority is required.');
      const eventId=id();await client.query('INSERT INTO threat_retention_events(id,threat_model_id,action,retain_until,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6)',[eventId,modelId,parsed.action,parsed.retainUntil||null,parsed.reason,actor.id]);
      await ThreatModelRepository.audit(client,{id:id(),modelId,actorId:actor.id,action:`MODEL_${parsed.action}`,entityType:'THREAT_RETENTION_EVENT',entityId:eventId,oldValue:model,newValue:parsed});return {id:eventId};
    });
  }
  static async grants(modelId:string,actor:BankUser){
    return ThreatModelService.withGovernanceModel(modelId,actor,async(client)=>({grants:(await client.query('SELECT g.*,r.revoked_at,r.reason AS revocation_reason FROM threat_model_access_grants g LEFT JOIN threat_model_access_revocations r ON r.grant_id=g.id WHERE g.threat_model_id=$1 ORDER BY g.granted_at DESC LIMIT 200',[modelId])).rows}));
  }
  static async grant(modelId:string,input:unknown,actor:BankUser){
    const parsed=z.object({userId:z.string().min(1).max(64),permission:z.enum(['READ','CONTRIBUTE']),validUntil:z.string().datetime(),reason}).parse(input);
    if(new Date(parsed.validUntil)<=new Date()||new Date(parsed.validUntil).getTime()>Date.now()+366*86400000)throw new Error('Access expiry must be in the next 366 days.');
    return ThreatModelService.withGovernanceModel(modelId,actor,async(client,model)=>{
      this.manageAccess(model,actor);
      if(parsed.userId===actor.id||!(await client.query('SELECT 1 FROM bank_users WHERE id=$1 AND is_active',[parsed.userId])).rowCount)throw new Error('A different active user is required.');
      if((await client.query('SELECT 1 FROM threat_model_active_grants WHERE threat_model_id=$1 AND user_id=$2',[modelId,parsed.userId])).rowCount)throw new Error('An active grant already exists; revoke it before replacing access.');
      const grantId=id();await client.query('INSERT INTO threat_model_access_grants(id,threat_model_id,user_id,permission,valid_until,reason,granted_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[grantId,modelId,parsed.userId,parsed.permission,parsed.validUntil,parsed.reason,actor.id]);
      await ThreatModelRepository.audit(client,{id:id(),modelId,actorId:actor.id,action:'MODEL_ACCESS_GRANTED',entityType:'THREAT_MODEL_ACCESS',entityId:grantId,newValue:parsed});return {id:grantId};
    });
  }
  static async revoke(modelId:string,grantId:string,input:unknown,actor:BankUser){
    const parsed=z.object({reason}).parse(input);
    return ThreatModelService.withGovernanceModel(modelId,actor,async(client,model)=>{
      this.manageAccess(model,actor);
      if(!(await client.query('SELECT 1 FROM threat_model_access_grants WHERE id=$1 AND threat_model_id=$2',[grantId,modelId])).rowCount)throw new Error('Grant not found in this model.');
      await client.query('INSERT INTO threat_model_access_revocations(grant_id,reason,revoked_by) VALUES($1,$2,$3)',[grantId,parsed.reason,actor.id]);
      await ThreatModelRepository.audit(client,{id:id(),modelId,actorId:actor.id,action:'MODEL_ACCESS_REVOKED',entityType:'THREAT_MODEL_ACCESS',entityId:grantId,newValue:parsed});return {id:grantId};
    });
  }
  private static manageAccess(model:Record<string,any>,actor:BankUser){
    if(actor.roles.includes('AUDITOR')||!(securityReviewer(actor)||[model.businessOwnerId,model.technicalOwnerId,model.securityOwnerId].includes(actor.id)))throw new Error('Model owner or security authority required for access governance.');
  }
  static async decideCompliance(requirementId:string,input:unknown,actor:BankUser){
    const parsed=z.object({decision:z.enum(['VALIDATED','RETIRED']),reason}).parse(input);
    if(!actor.isActive||actor.roles.includes('AUDITOR')||!actor.roles.some(role=>['CISO','INFOSEC_ADMIN','INFOSEC_MANAGER','GRC_ANALYST'].includes(role)))throw new Error('Independent compliance-owner authority is required.');
    return pgClient.transaction(async client=>{
      const definition=(await client.query('SELECT * FROM threat_compliance_details WHERE id=$1',[requirementId])).rows[0];
      if(!definition)throw new Error('Compliance definition not found.');
      if(definition.created_by===actor.id)throw new Error('Compliance author cannot approve their own definition.');
      const decisionId=id();await client.query('INSERT INTO threat_compliance_decisions(id,requirement_id,decision,reason,decided_by) VALUES($1,$2,$3,$4,$5)',[decisionId,requirementId,parsed.decision,parsed.reason,actor.id]);
      await AuditService.logPostgres(client,{actor,action:'THREAT_COMPLIANCE_DECIDED',entityType:'THREAT_COMPLIANCE_REQUIREMENT',entityId:requirementId,before:definition,after:parsed});return {id:decisionId};
    });
  }
}
