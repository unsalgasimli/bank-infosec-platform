import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { BankUser } from '../../shared/types/auth.js';
import { ThreatModelService } from './threat-model.service.js';
import { ThreatModelRepository } from '../db/postgres/threat-model-repository.js';
import { ThreatComplianceApplicabilityService } from './threat-compliance-applicability.service.js';

export type ReadinessConnection = {query(statement:string,params?:any[]):Promise<{rows:any[];rowCount:number|null}>};
type Connection = ReadinessConnection;
export class ThreatReadinessService {
  static async evaluateThreatModelReadiness(client: Connection, revisionId: string) {
    const revision = (await client.query('SELECT * FROM threat_model_revisions WHERE id=$1', [revisionId])).rows[0];
    const units = (await client.query('SELECT * FROM threat_analysis_coverage WHERE revision_id=$1 ORDER BY target_type,target_id,category', [revisionId])).rows;
    const blockers: Array<{code:string; entityId:string; message:string}> = [];
    const compliance=await ThreatComplianceApplicabilityService.evaluate(client,revisionId);
    blockers.push(...compliance.blockers);
    if (revision?.tier == null) blockers.push({code:'TM_SCREENING_REQUIRED',entityId:revisionId,message:'Complete security impact screening.'});
    for (const unit of units) if (!unit.completed) blockers.push({code:unit.target_type==='BUSINESS_CAPABILITY'?'ABUSE_ANALYSIS_INCOMPLETE':'STRIDE_ANALYSIS_INCOMPLETE',entityId:unit.id,message:`${unit.label}: ${unit.category} ${unit.disposition_id?'requires independent AppSec review':'has no current disposition'}.`});
    if(revision?.tier===3 && !(await client.query('SELECT 1 FROM threat_business_capabilities WHERE revision_id=$1',[revisionId])).rowCount) blockers.push({code:'ABUSE_ANALYSIS_INCOMPLETE',entityId:revisionId,message:'Identify critical business capabilities and their architecture targets.'});
    const counts=(await client.query(`SELECT
      EXISTS(SELECT 1 FROM threat_model_components WHERE revision_id=$1) AS architecture,
      EXISTS(SELECT 1 FROM threats WHERE revision_id=$1) AS threats,
      EXISTS(SELECT 1 FROM threat_model_data_flows WHERE revision_id=$1) AS flows,
      EXISTS(SELECT 1 FROM threat_model_trust_boundaries WHERE revision_id=$1) AS boundaries,
      EXISTS(SELECT 1 FROM threat_data_object_links WHERE revision_id=$1) AS data,
      EXISTS(SELECT 1 FROM threat_security_requirements WHERE revision_id=$1) AS requirements`,[revisionId])).rows[0];
    for(const key of revision?.tier>=2?['architecture','threats','flows','boundaries','data','requirements']:revision?.tier>0?['architecture','threats']:[]) if(!counts[key])blockers.push({code:'TM_STRUCTURE_INCOMPLETE',entityId:revisionId,message:`Missing ${key}.`});
    return {revisionId,ready:blockers.length===0,blockers,units,compliance,requiredAnalysisUnits:units.length,completedAnalysisUnits:units.filter(u=>u.completed).length,coveragePercentage:units.length?Math.floor(units.filter(u=>u.completed).length*100/units.length):100,architectureVersion:revision?.architecture_version};
  }
  static async refresh(client:Connection,revisionId:string) {
    await client.query(`INSERT INTO threat_analysis_units(id,revision_id,target_type,target_id,category,policy_id,fingerprint,architecture_version)
      SELECT md5(e.id||e.fingerprint),e.revision_id,e.target_type,e.target_id,e.category,e.policy_id,e.fingerprint,r.architecture_version
      FROM threat_analysis_expected_units e JOIN threat_model_revisions r ON r.id=e.revision_id WHERE e.revision_id=$1
      ON CONFLICT DO NOTHING`,[revisionId]);
  }
  static async get(modelId:string,actor:BankUser) {
    return ThreatModelService.withGovernanceModel(modelId,actor,async(client,model)=>this.evaluateThreatModelReadiness(client,model.currentRevisionId));
  }
  static async dispose(modelId:string,input:unknown,actor:BankUser) {
    const value=z.object({unitId:z.string().min(1),fingerprint:z.string().length(64),disposition:z.enum(['THREAT_IDENTIFIED','REVIEWED_NO_THREAT','NOT_APPLICABLE']),threatId:z.string().optional(),reason:z.string().trim().min(20).max(10000)}).strict().parse(input);
    return ThreatModelService.withAnalysisModel(modelId,actor,async(client,model)=>{
      await this.refresh(client,model.currentRevisionId);
      const expected=(await client.query('SELECT * FROM threat_analysis_expected_units WHERE id=$1 AND fingerprint=$2 AND revision_id=$3',[value.unitId,value.fingerprint,model.currentRevisionId])).rows[0];
      if(!expected)throw new Error('Coverage target changed; reload current analysis.');
      const unit=(await client.query('SELECT id FROM threat_analysis_units WHERE revision_id=$1 AND target_type=$2 AND target_id=$3 AND category=$4 AND fingerprint=$5',[model.currentRevisionId,expected.target_type,expected.target_id,expected.category,expected.fingerprint])).rows[0];
      const threat=value.threatId?(await client.query('SELECT content_version FROM threats WHERE id=$1 AND revision_id=$2',[value.threatId,model.currentRevisionId])).rows[0]:undefined;
      const id=randomUUID();
      await client.query('INSERT INTO threat_analysis_dispositions(id,unit_id,disposition,threat_id,threat_version,reason,analyst_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,unit.id,value.disposition,value.threatId||null,threat?.content_version||null,value.reason,actor.id]);
      await ThreatModelRepository.audit(client,{id:randomUUID(),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'COVERAGE_DISPOSITION',entityType:'THREAT_ANALYSIS',entityId:id,newValue:value});
      return {id};
    });
  }
  static async review(modelId:string,input:unknown,actor:BankUser) {
    const value=z.object({dispositionId:z.string(),decision:z.enum(['APPROVED','REJECTED']),reason:z.string().trim().min(20).max(10000)}).strict().parse(input);
    return ThreatModelService.withAnalysisModel(modelId,actor,async(client,model)=>{
      if(!(await client.query('SELECT 1 FROM threat_analysis_dispositions d JOIN threat_analysis_units u ON u.id=d.unit_id WHERE d.id=$1 AND u.revision_id=$2',[value.dispositionId,model.currentRevisionId])).rowCount)throw new Error('Coverage decision not found in this revision.');
      await client.query('INSERT INTO threat_analysis_reviews(disposition_id,reviewer_id,decision,reason) VALUES($1,$2,$3,$4)',[value.dispositionId,actor.id,value.decision,value.reason]);
      await ThreatModelRepository.audit(client,{id:randomUUID(),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'COVERAGE_REVIEWED',entityType:'THREAT_ANALYSIS',entityId:value.dispositionId,newValue:value});
      return {reviewed:true};
    });
  }
  static async capability(modelId:string,input:unknown,actor:BankUser) {
    const value=z.object({componentId:z.string(),kind:z.enum(['LOGIN','ACCOUNT_RECOVERY','PAYMENT_INITIATION','BENEFICIARY_MANAGEMENT','TRANSACTION_AUTHORIZATION','PRIVILEGE_CHANGE','ADMINISTRATION','SENSITIVE_EXPORT','ACCOUNT_LIFECYCLE','CRITICAL_CONFIGURATION','OTHER']),name:z.string().trim().min(1).max(255)}).strict().parse(input);
    return ThreatModelService.withAnalysisModel(modelId,actor,async(client,model)=>{
      if(!(await client.query('SELECT 1 FROM threat_model_components WHERE id=$1 AND revision_id=$2',[value.componentId,model.currentRevisionId])).rowCount)throw new Error('Capability component must belong to this revision.');
      const id=randomUUID();await client.query('INSERT INTO threat_business_capabilities(id,revision_id,component_id,kind,name,created_by) VALUES($1,$2,$3,$4,$5,$6)',[id,model.currentRevisionId,value.componentId,value.kind,value.name,actor.id]);
      await ThreatModelRepository.audit(client,{id:randomUUID(),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'BUSINESS_CAPABILITY_CREATED',entityType:'THREAT_ANALYSIS',entityId:id,newValue:value});return {id};
    });
  }
}
