import { randomUUID,createHash } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { BankUser } from '../../shared/types/auth.js';
import { canonicalJson } from '../../shared/canonical-json.js';
import { hasThreatCapability } from '../../shared/threat-permissions.js';
import { pgClient } from '../db/postgres/client.js';
import { ThreatModelService } from './threat-model.service.js';
import { ThreatModelRepository } from '../db/postgres/threat-model-repository.js';
import { AuditService } from './audit.service.js';
import type { ReadinessConnection } from './threat-readiness.service.js';
export class ThreatComplianceApplicabilityService {
 static authority(actor:BankUser){if(!hasThreatCapability(actor,'threat_model.compliance_review'))throw new Error('Compliance owner authority required.');}
 static async evaluate(client:ReadinessConnection,rid:string){
  const model=(await client.query('SELECT m.*,r.tier FROM threat_models m JOIN threat_model_revisions r ON r.threat_model_id=m.id WHERE r.id=$1',[rid])).rows[0];
  const screening=(await client.query('SELECT answers FROM threat_model_applicability WHERE revision_id=$1 ORDER BY assessed_at DESC LIMIT 1',[rid])).rows[0];
  const facts={organizationId:model.organization_id,criticality:model.criticality,classification:model.data_classification,...screening?.answers};
  const hash=createHash('sha256').update(canonicalJson(facts)).digest('hex');
  const profiles=(await client.query(`SELECT DISTINCT ON(p.code) p.* FROM threat_compliance_profiles p JOIN threat_compliance_profile_reviews v ON v.profile_id=p.id AND v.decision='APPROVED' WHERE p.organization_id=$1 AND p.effective_at<=now() ORDER BY p.code,p.version DESC`,[model.organization_id])).rows;
  const blockers:Array<{code:string;entityId:string;message:string}>=[];
  if(model.tier>=2&&!profiles.length)blockers.push({code:'COMPLIANCE_APPLICABILITY_PENDING',entityId:rid,message:'A validated organization compliance applicability profile is required.'});
  const decisions=(await client.query('SELECT DISTINCT ON(profile_id) * FROM threat_compliance_applicability_decisions WHERE revision_id=$1 AND facts_hash=$2 ORDER BY profile_id,created_at DESC,id DESC',[rid,hash])).rows;
  const applicable:string[]=[];
  const evaluated=profiles.map(p=>{
   const matches=Object.entries(p.predicates).every(([key,value])=>canonicalJson(facts[key as keyof typeof facts])===canonicalJson(value));
   const decision=decisions.find(d=>d.profile_id===p.id);
   let status=matches?(p.human_review?decision?.decision||'REQUIRES_REVIEW':'APPLICABLE'):'NOT_APPLICABLE';
   // A mandatory deterministic match cannot be dismissed by an interpretation.
   if(matches&&status==='NOT_APPLICABLE')status='REQUIRES_REVIEW';
   if(matches&&['REQUIRES_REVIEW','CONDITIONAL'].includes(status))blockers.push({code:'COMPLIANCE_APPLICABILITY_PENDING',entityId:p.id,message:`${p.code}: compliance owner review required.`});
   if(matches)applicable.push(...p.compliance_ids);
   return {...p,status,factsHash:hash,sourceFacts:facts};
  });
  for(const cid of [...new Set(applicable)])if(!(await client.query(`SELECT 1 FROM threat_requirement_compliance m JOIN threat_security_requirements r ON r.id=m.requirement_id JOIN threat_compliance_details c ON c.id=m.compliance_id WHERE r.revision_id=$1 AND r.mandatory AND c.id=$2 AND c.current_validation_status='VALIDATED'`,[rid,cid])).rowCount)blockers.push({code:'COMPLIANCE_MAPPING_MISSING',entityId:cid,message:'Applicable obligation requires a mandatory security requirement mapped to its validated definition.'});
  return {profiles:evaluated,blockers,facts,factsHash:hash};
 }
 static async profile(input:unknown,actor:BankUser){
  this.authority(actor);const p=z.object({organizationId:z.string().default('org-bank'),code:z.string().min(1).max(128),effectiveAt:z.string().datetime(),predicates:z.record(z.union([z.string(),z.boolean()])),complianceIds:z.array(z.string()).min(1),humanReview:z.boolean().default(true),reason:z.string().min(20)}).strict().parse(input);
  const allowed=new Set(['organizationId','criticality','classification','jurisdiction','applicationType','paymentRelated','customerData','bankSecrecy','internetExposed','thirdPartyIntegration','cloudDeployment','criticalInfrastructure']);
  if(Object.keys(p.predicates).some(k=>!allowed.has(k)))throw new Error('Unknown applicability fact.');
  return pgClient.transaction(async client=>{await client.query("SELECT pg_advisory_xact_lock(hashtext('compliance-profile'))");const id=randomUUID();const version=Number((await client.query('SELECT COALESCE(max(version),0)+1 AS v FROM threat_compliance_profiles WHERE organization_id=$1 AND code=$2',[p.organizationId,p.code])).rows[0].v);
   if((await client.query("SELECT id FROM threat_compliance_details WHERE id=ANY($1::varchar[]) AND current_validation_status='VALIDATED'",[p.complianceIds])).rowCount!==new Set(p.complianceIds).size)throw new Error('Profile obligations require independently validated definitions.');
   await client.query('INSERT INTO threat_compliance_profiles(id,organization_id,code,version,effective_at,predicates,compliance_ids,human_review,reason,created_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)',[id,p.organizationId,p.code,version,p.effectiveAt,JSON.stringify(p.predicates),JSON.stringify(p.complianceIds),p.humanReview,p.reason,actor.id]);await AuditService.logPostgres(client,{actor,action:'COMPLIANCE_PROFILE_PROPOSED',entityType:'COMPLIANCE_PROFILE',entityId:id,after:p});return {id,version};});
 }
 static async reviewProfile(input:unknown,actor:BankUser){this.authority(actor);const p=z.object({profileId:z.string(),decision:z.enum(['APPROVED','REJECTED']),reason:z.string().min(20)}).parse(input);return pgClient.transaction(async client=>{await client.query('INSERT INTO threat_compliance_profile_reviews(profile_id,reviewer_id,decision,reason) VALUES($1,$2,$3,$4)',[p.profileId,actor.id,p.decision,p.reason]);await AuditService.logPostgres(client,{actor,action:'COMPLIANCE_PROFILE_REVIEWED',entityType:'COMPLIANCE_PROFILE',entityId:p.profileId,after:p});return p;});}
 static async decide(modelId:string,input:unknown,actor:BankUser){this.authority(actor);const p=z.object({profileId:z.string(),factsHash:z.string().length(64),decision:z.enum(['APPLICABLE','NOT_APPLICABLE','CONDITIONAL','REQUIRES_REVIEW']),reason:z.string().min(20)}).parse(input);return ThreatModelService.withGovernanceModel(modelId,actor,async(client,model)=>{
  await ThreatModelRepository.requireMutableRevision(model.currentRevisionId,client);const evaluated=await this.evaluate(client,model.currentRevisionId);if(evaluated.factsHash!==p.factsHash||!evaluated.profiles.some(f=>f.id===p.profileId))throw new Error('Applicability facts changed; reassessment required.');const id=randomUUID();await client.query('INSERT INTO threat_compliance_applicability_decisions(id,revision_id,profile_id,facts_hash,source_facts,decision,reason,decided_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8)',[id,model.currentRevisionId,p.profileId,p.factsHash,JSON.stringify(evaluated.facts),p.decision,p.reason,actor.id]);await ThreatModelRepository.audit(client,{id:randomUUID(),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'COMPLIANCE_APPLICABILITY_DECIDED',entityType:'COMPLIANCE_PROFILE',entityId:id,newValue:p});return {id};});}
}
