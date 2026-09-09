import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {pgClient} from '../db/postgres/client.js';
import {hasThreatCapability} from '../../shared/threat-permissions.js';
import type {BankUser} from '../../shared/types/auth.js';
import type {ReadinessConnection} from './threat-readiness.service.js';
import {AuditService} from './audit.service.js';

export class ThreatFindingReassessmentService {
 static async impacts(client:ReadinessConnection,revisionId:string){
  return (await client.query(`SELECT DISTINCT control_id,threat_id,finding_id,effect,reason FROM threat_automatic_finding_impacts WHERE revision_id=$1
   UNION SELECT DISTINCT e.control_id,e.threat_id,e.finding_id,e.effect,e.reason FROM threat_finding_impact_events e JOIN threat_controls c ON c.id=e.control_id
   WHERE e.revision_id=$1 AND NOT EXISTS(SELECT 1 FROM control_verifications v WHERE v.control_id=e.control_id AND v.result='PASS' AND v.executed_at>e.occurred_at AND v.control_scope_version=c.scope_version)`,[revisionId])).rows;
 }
 static async record(){
  return pgClient.transaction(async client=>{
   const result=await client.query(`WITH added AS (
    INSERT INTO threat_finding_impact_events(id,model_id,revision_id,threat_id,control_id,finding_id,policy_id,fingerprint,effect,reason)
    SELECT gen_random_uuid()::text,model_id,revision_id,threat_id,control_id,finding_id,policy_id,fingerprint,effect,reason FROM threat_automatic_finding_impacts ON CONFLICT DO NOTHING RETURNING *
   ) INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload,correlation_id,occurred_at)
   SELECT gen_random_uuid()::text,'threat-control.verification.required','THREAT_CONTROL',control_id,jsonb_build_object('threatModelId',model_id,'controlId',control_id,'threatId',threat_id,'reason','FINDING_REASSESSMENT_REQUIRED','findingId',finding_id,'policyId',policy_id,'fingerprint',fingerprint),id,now() FROM added RETURNING id`);
   return {recorded:result.rowCount};
  });
 }
 static async policy(input:unknown,actor:BankUser){
  if(!hasThreatCapability(actor,'threat_model.appsec_review'))throw new Error('Security correlation policy authority required');
  const p=z.object({organizationId:z.string().default('org-bank'),code:z.string().min(1).max(128),findingType:z.string().min(1).max(64),catalogVersionId:z.string(),minimumSeverity:z.enum(['HIGH','CRITICAL']),minimumConfidence:z.number().min(.8).max(1).default(.9),requireExploitable:z.boolean().default(true),effect:z.enum(['DEGRADED','FAILED']),reason:z.string().min(20)}).strict().parse(input);
  return pgClient.transaction(async client=>{
   await client.query("SELECT pg_advisory_xact_lock(hashtext('threat-correlation-policy'))");
   if(!(await client.query("SELECT 1 FROM threat_control_catalog_versions c WHERE c.id=$1 AND c.organization_id=$2 AND (SELECT decision FROM threat_control_catalog_decisions WHERE catalog_version_id=c.id ORDER BY event_sequence DESC LIMIT 1)='PUBLISHED'",[p.catalogVersionId,p.organizationId])).rowCount)throw new Error('Correlation requires a published canonical control definition in the organization');
   const id=randomUUID();
   await client.query(`INSERT INTO threat_finding_correlation_rules(id,organization_id,code,version,finding_type,catalog_version_id,minimum_severity,minimum_confidence,require_exploitable,effect,reason,created_by)
    SELECT $1,$2,$3,COALESCE(max(version),0)+1,$4,$5,$6,$7,$8,$9,$10,$11 FROM threat_finding_correlation_rules WHERE organization_id=$2 AND code=$3`,[id,p.organizationId,p.code,p.findingType,p.catalogVersionId,p.minimumSeverity,p.minimumConfidence,p.requireExploitable,p.effect,p.reason,actor.id]);
   await AuditService.logPostgres(client,{actor,action:'ADMIN_CONFIG_CHANGED',entityType:'THREAT_CONTROL_DEFINITION',entityId:p.catalogVersionId,after:{correlationRuleId:id,...p}});return {id};
  });
 }
 static async review(input:unknown,actor:BankUser){
  if(!hasThreatCapability(actor,'threat_model.appsec_review'))throw new Error('Security correlation policy authority required');
  const p=z.object({ruleId:z.string(),decision:z.enum(['APPROVED','REJECTED']),reason:z.string().min(20)}).strict().parse(input);
  return pgClient.transaction(async client=>{
   await client.query('INSERT INTO threat_finding_correlation_reviews(rule_id,reviewed_by,decision,reason) VALUES($1,$2,$3,$4)',[p.ruleId,actor.id,p.decision,p.reason]);
   await AuditService.logPostgres(client,{actor,action:'ADMIN_CONFIG_CHANGED',entityType:'THREAT_CONTROL_DEFINITION',entityId:p.ruleId,after:p});return p;
  });
 }
}
