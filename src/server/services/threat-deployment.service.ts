import { createHash,randomUUID,randomBytes,createPublicKey,verify,createCipheriv,createDecipheriv } from 'node:crypto';
import { z } from 'zod';
import type { BankUser } from '../../shared/types/auth.js';
import { hasThreatCapability } from '../../shared/threat-permissions.js';
import { config } from '../config/index.js';
import { pgClient } from '../db/postgres/client.js';
import { ThreatModelService } from './threat-model.service.js';
import { AuditService } from './audit.service.js';
import type { ReadinessConnection } from './threat-readiness.service.js';
type Row=Record<string,any>;
export interface SecurityDeploymentProvider {
 verifyIdentity(mapping:Row,token:string):Promise<Row>;
 verifyDeployment(mapping:Row,authorization:Row,deploymentId:string):Promise<Row>;
 findDeployment(mapping:Row,authorization:Row):Promise<string|undefined>;
}
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const key=()=>{if(!config.DATA_ENCRYPTION_KEY||config.DATA_ENCRYPTION_KEY.length<32)throw new Error('A server encryption key is required for delivery credentials');return createHash('sha256').update(config.DATA_ENCRYPTION_KEY).digest();};
function encrypt(secret:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([cipher.update(secret),cipher.final()]).toString('base64');return {iv:iv.toString('base64'),data,tag:cipher.getAuthTag().toString('base64')};}
function decrypt(value:Row){const cipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(value.iv,'base64'));cipher.setAuthTag(Buffer.from(value.tag,'base64'));return Buffer.concat([cipher.update(Buffer.from(value.data,'base64')),cipher.final()]).toString();}
async function json(url:string,headers:Record<string,string>={}){
 const response=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error(`Provider verification failed (${response.status}).`);
 const reader=response.body?.getReader();if(!reader)throw new Error('Provider returned empty response');const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>1048576)throw new Error('Provider response too large');chunks.push(r.value);}}finally{await reader.cancel();}
 return JSON.parse(Buffer.concat(chunks).toString());
}
export class GitLabSecurityDeploymentProvider implements SecurityDeploymentProvider {
 constructor(private readonly readJson=json){}
 async verifyIdentity(mapping:Row,token:string){
  if(token.length>20000)throw new Error('Invalid provider identity');const parts=token.split('.');if(parts.length!==3)throw new Error('Invalid provider identity');
  const header=JSON.parse(Buffer.from(parts[0],'base64url').toString()),claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());
  if(header.alg!=='RS256'||typeof header.kid!=='string')throw new Error('Unsupported provider signature');
  const jwks=await this.readJson(`${mapping.issuer}/oauth/discovery/keys`);const jwk=jwks.keys?.find((k:Row)=>k.kid===header.kid&&k.kty==='RSA');
  if(!jwk||!verify('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw new Error('Invalid provider signature');
  const now=Date.now()/1000;
  if(claims.iss!==mapping.issuer||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(mapping.audience)||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+30||claims.exp-claims.iat>86400||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>now+30)))throw new Error('Expired or incorrectly scoped provider identity');
  if(String(claims.project_id)!==mapping.project_id||String(claims.job_project_id||claims.project_id)!==mapping.project_id||claims.environment!==mapping.environment||claims.ref!==mapping.ref||![true,'true'].includes(claims.ref_protected)||![true,'true'].includes(claims.environment_protected)||!claims.jti)throw new Error('Provider project, ref or protected environment mismatch');
  const job=await this.readJson(`${mapping.issuer}/api/v4/projects/${encodeURIComponent(mapping.project_id)}/jobs/${encodeURIComponent(String(claims.job_id))}`,{'PRIVATE-TOKEN':decrypt(mapping.api_credential)});
  if(String(job.id)!==String(claims.job_id)||String(job.pipeline?.id)!==String(claims.pipeline_id)||job.ref!==mapping.ref||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(job.commit?.id)||claims.sha&&claims.sha!==job.commit.id)throw new Error('Provider job identity or commit mismatch');
  let artifactDigest:string|undefined;
  if(mapping.artifact_job_name){
   const jobs=await this.readJson(`${mapping.issuer}/api/v4/projects/${encodeURIComponent(mapping.project_id)}/pipelines/${encodeURIComponent(String(job.pipeline.id))}/jobs?scope[]=success&per_page=100`,{'PRIVATE-TOKEN':decrypt(mapping.api_credential)});
   if(!Array.isArray(jobs))throw new Error('Invalid provider build inventory');
   const builds=jobs.filter(j=>j.name===mapping.artifact_job_name&&j.status==='success'&&j.commit?.id===job.commit.id&&String(j.pipeline?.id)===String(job.pipeline.id));
   if(builds.length!==1)throw new Error('Exactly one trusted successful artifact build is required');
   const manifest=await this.readJson(`${mapping.issuer}/api/v4/projects/${encodeURIComponent(mapping.project_id)}/jobs/${encodeURIComponent(String(builds[0].id))}/artifacts/security-artifact.json`,{'PRIVATE-TOKEN':decrypt(mapping.api_credential)});
   if(manifest.commitSha!==job.commit.id||!/^sha256:[a-f0-9]{64}$/.test(manifest.artifactDigest))throw new Error('Trusted artifact manifest does not match the provider commit');
   artifactDigest=manifest.artifactDigest;
  }
  return {...claims,sha:job.commit.id,artifact_digest:artifactDigest,job_status:job.status,job_id:String(job.id),pipeline_id:String(job.pipeline.id),user_id:String(job.user?.id||claims.user_id)};
 }
 async verifyDeployment(mapping:Row,a:Row,deploymentId:string){
  const d=await this.readJson(`${mapping.issuer}/api/v4/projects/${encodeURIComponent(mapping.project_id)}/deployments/${encodeURIComponent(deploymentId)}`,{'PRIVATE-TOKEN':decrypt(mapping.api_credential)});
  if(String(d.id)!==deploymentId||d.sha!==a.commit_sha||d.environment?.name!==a.environment||String(d.deployable?.id)!==a.provider_job_id||String(d.deployable?.pipeline?.id)!==a.provider_pipeline_id)throw new Error('Deployment receipt identity mismatch');
  return d;
 }
 async findDeployment(mapping:Row,a:Row){
  for(let page=1;page<=5;page++){
   const rows=await this.readJson(`${mapping.issuer}/api/v4/projects/${encodeURIComponent(mapping.project_id)}/deployments?environment=${encodeURIComponent(a.environment)}&order_by=id&sort=desc&per_page=100&page=${page}`,{'PRIVATE-TOKEN':decrypt(mapping.api_credential)});
   if(!Array.isArray(rows))throw new Error('Invalid provider deployment inventory');
   const match=rows.find(d=>d.sha===a.commit_sha&&String(d.deployable?.id)===a.provider_job_id&&d.environment?.name===a.environment);
   if(match)return String(match.id);
   if(rows.length<100)break;
  }
  return undefined;
 }
}
const binding=z.object({applicationId:z.string(),releaseId:z.string(),commitSha:z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),environment:z.string().min(1),artifactDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()}).strict();
export class ThreatDeploymentService {
 static readonly provider:SecurityDeploymentProvider=new GitLabSecurityDeploymentProvider();
 static async configure(input:unknown,actor:BankUser){
  if(!hasThreatCapability(actor,'threat_model.admin')||!hasThreatCapability(actor,'threat_model.release_authorize'))throw new Error('Delivery administration and explicit release authority required');
  const p=z.object({id:z.string().optional(),issuer:z.string().url(),audience:z.string().url(),projectId:z.string().regex(/^\d+$/),environment:z.string().min(1).max(128),ref:z.string().min(1).max(255),applicationId:z.string(),modelId:z.string(),releaseId:z.string(),artifactJobName:z.string().min(1).max(255).optional(),apiCredential:z.string().min(16).max(4096),enabled:z.boolean().default(true)}).strict().parse(input);
  const origin=new URL(p.issuer);if(origin.protocol!=='https:'||origin.origin!==p.issuer||origin.username||origin.password)throw new Error('GitLab issuer must be an HTTPS origin');
  return ThreatModelService.withGovernanceModel(p.modelId,actor,async(client,model)=>{
   if(![model.assetId,model.serviceId].includes(p.applicationId)||![model.releaseId,model.changeId].includes(p.releaseId))throw new Error('Delivery mapping must match canonical model application and release');
   if(p.enabled&&!(await ThreatModelService.evaluateDeploymentGate(client,model.id)).allowed)throw new Error('Release delegation requires a passing current security gate');
   const id=p.id||randomUUID();if(p.id&&!(await client.query('SELECT 1 FROM threat_delivery_mappings WHERE id=$1 AND model_id=$2',[id,p.modelId])).rowCount)throw new Error('Mapping not found in this model');
   await client.query(`INSERT INTO threat_delivery_mappings(id,provider,issuer,audience,project_id,environment,ref,application_id,model_id,release_id,api_credential,enabled,updated_by) VALUES($1,'GITLAB',$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
    ON CONFLICT(id) DO UPDATE SET issuer=EXCLUDED.issuer,audience=EXCLUDED.audience,project_id=EXCLUDED.project_id,environment=EXCLUDED.environment,ref=EXCLUDED.ref,application_id=EXCLUDED.application_id,release_id=EXCLUDED.release_id,api_credential=EXCLUDED.api_credential,enabled=EXCLUDED.enabled,updated_by=EXCLUDED.updated_by,version=threat_delivery_mappings.version+1,updated_at=now()`,[id,p.issuer,p.audience,p.projectId,p.environment,p.ref,p.applicationId,p.modelId,p.releaseId,JSON.stringify(encrypt(p.apiCredential)),p.enabled,actor.id]);
   await client.query('UPDATE threat_delivery_mappings SET artifact_job_name=$2 WHERE id=$1',[id,p.artifactJobName||null]);
   await AuditService.logPostgres(client,{actor,action:'DELIVERY_MAPPING_CONFIGURED',entityType:'DELIVERY_MAPPING',entityId:id,after:{...p,approvedRevisionId:model.currentRevisionId,apiCredential:'[ENCRYPTED]'}});return {id};
  });
 }
 static async machine(mappingId:string,identity:string){
  const mapping=(await pgClient.query(`SELECT d.* FROM threat_delivery_mappings d JOIN threat_models m ON m.id=d.model_id JOIN bank_users u ON u.id=d.updated_by WHERE d.id=$1 AND d.enabled AND d.approved_revision_id=m.current_revision_id AND u.is_active AND u.roles ? 'RELEASE_AUTHORITY' AND NOT u.roles ? 'AUDITOR'`,[mappingId])).rows[0];if(!mapping)throw new Error('Provider mapping not available or release delegation requires renewal');
  return {mapping,claims:await this.provider.verifyIdentity(mapping,identity)};
 }
 static assertBinding(p:z.infer<typeof binding>,m:Row,claims:Row){if(p.applicationId!==m.application_id||p.releaseId!==m.release_id||p.environment!==m.environment||p.commitSha!==claims.sha||p.artifactDigest!==claims.artifact_digest)throw new Error('Deployment artifact, application or environment mismatch');}
 static async authorize(mappingId:string,identity:string,input:unknown){
  const p=binding.parse(input),{mapping:m,claims}=await this.machine(mappingId,identity);this.assertBinding(p,m,claims);
  if(claims.job_status!=='running')throw new Error('Deployment authorization requires a running provider job');
  // Both commit and any requested digest must match trusted provider records.
  return pgClient.transaction(async client=>{
   await client.query('SELECT id FROM threat_models WHERE id=$1 FOR UPDATE',[m.model_id]);
   const current=(await client.query('SELECT * FROM threat_delivery_mappings WHERE id=$1 AND enabled FOR SHARE',[m.id])).rows[0];if(current?.version!==m.version)throw new Error('Mapping changed');
   const model=(await client.query('SELECT * FROM threat_models WHERE id=$1',[m.model_id])).rows[0];
   const gate=await ThreatModelService.evaluateDeploymentGate(client,m.model_id);if(!gate.allowed)throw new Error(`Release blocked: ${gate.blockers.join(' ')}`);
   const id=randomUUID(),token=randomBytes(32).toString('base64url'),gateId=randomUUID();
   await client.query(`INSERT INTO threat_deployment_authorizations(id,mapping_id,mapping_version,revision_id,release_id,application_id,commit_sha,environment,project_id,artifact_digest,provider_job_id,provider_pipeline_id,provider_actor,identity_jti,token_hash,gate_evaluation_id,gate_snapshot,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,now()+interval '5 minutes')`,[id,m.id,m.version,model.current_revision_id,m.release_id,m.application_id,p.commitSha,m.environment,m.project_id,p.artifactDigest||null,claims.job_id,claims.pipeline_id,claims.user_id,claims.jti,hash(token),gateId,JSON.stringify(gate)]);
   await this.event(client,id,'AUTHORIZED');return {authorizationId:id,token,gateEvaluationId:gateId,gate,expiresIn:300};
  });
 }
 static async consume(mappingId:string,identity:string,input:unknown){
  const p=z.object({authorizationId:z.string(),token:z.string(),binding}).strict().parse(input),{mapping:m,claims}=await this.machine(mappingId,identity);this.assertBinding(p.binding,m,claims);
  if(claims.job_status!=='running')throw new Error('Deployment consumption requires a running provider job');
  return pgClient.transaction(async client=>{
   await client.query('SELECT id FROM threat_models WHERE id=$1 FOR UPDATE',[m.model_id]);
   const a=(await client.query('SELECT * FROM threat_deployment_authorizations WHERE id=$1 AND mapping_id=$2 FOR UPDATE',[p.authorizationId,m.id])).rows[0];
   const live=(await client.query('SELECT * FROM threat_delivery_mappings WHERE id=$1 AND enabled FOR SHARE',[m.id])).rows[0];
   const model=(await client.query('SELECT * FROM threat_models WHERE id=$1',[m.model_id])).rows[0];
   if(!a||a.token_hash!==hash(p.token)||a.mapping_version!==live?.version||a.revision_id!==model.current_revision_id||a.commit_sha!==p.binding.commitSha||a.environment!==p.binding.environment||a.application_id!==p.binding.applicationId||a.release_id!==p.binding.releaseId||a.artifact_digest!==(p.binding.artifactDigest||null)||a.provider_job_id!==claims.job_id||a.identity_jti!==claims.jti||new Date(a.expires_at)<=new Date())throw new Error('Deployment authorization binding invalid or expired');
   if((await client.query("SELECT 1 FROM threat_deployment_events WHERE authorization_id=$1 AND state<>'AUTHORIZED'",[a.id])).rowCount)throw new Error('Authorization already consumed or invalidated');
   const gate=await ThreatModelService.evaluateDeploymentGate(client,m.model_id);if(!gate.allowed)throw new Error(`Release blocked: ${gate.blockers.join(' ')}`);
   await this.event(client,a.id,'CONSUMED');return {authorizationId:a.id,state:'CONSUMED',deploymentExecuted:false};
  });
 }
 static async event(client:ReadinessConnection,id:string,state:string,deployment?:Row){
  await client.query('INSERT INTO threat_deployment_events(id,authorization_id,state,provider_deployment_id,provider_payload,correlation_id) VALUES($1,$2,$3,$4,$5::jsonb,$2)',[randomUUID(),id,state,deployment?String(deployment.id):null,JSON.stringify(deployment?{id:deployment.id,sha:deployment.sha,status:deployment.status,environment:deployment.environment?.name,createdAt:deployment.created_at,updatedAt:deployment.updated_at}: {})]);
 }
 static async reconcileOne(authorizationId:string,deploymentId?:string){
  const a=(await pgClient.query('SELECT * FROM threat_deployment_authorizations WHERE id=$1',[authorizationId])).rows[0];if(!a)return;
  const m=(await pgClient.query('SELECT * FROM threat_delivery_mappings WHERE id=$1',[a.mapping_id])).rows[0];if(!m)return;
  // Issuer/project become immutable after issuance. Rotated credentials may
  // reconcile old receipts, while consumption still requires the exact version.
  const candidate=deploymentId||await this.provider.findDeployment(m,a);
  const d=candidate?await this.provider.verifyDeployment(m,a,candidate):undefined;
  return pgClient.transaction(async client=>{
   await client.query('SELECT id FROM threat_deployment_authorizations WHERE id=$1 FOR UPDATE',[a.id]);
   const events=(await client.query('SELECT * FROM threat_deployment_events WHERE authorization_id=$1 ORDER BY event_sequence DESC',[a.id])).rows;
   if(events.some(e=>['SUCCEEDED','FAILED','EXPIRED_UNUSED'].includes(e.state)))return {state:events[0].state};
   if(d){
    if(!events.some(e=>e.state==='CONSUMED'))throw new Error('Provider execution has no consumed security authorization');
    if(!['running','success','failed','canceled'].includes(d.status))return {state:'CONSUMED',deploymentExecuted:false};
    if(!events.some(e=>e.state==='DEPLOYMENT_STARTED'))await this.event(client,a.id,'DEPLOYMENT_STARTED',d);
    const state=d.status==='success'?'SUCCEEDED':['failed','canceled'].includes(d.status)?'FAILED':'DEPLOYMENT_STARTED';
    if(state!=='DEPLOYMENT_STARTED')await this.event(client,a.id,state,d);return {state,deploymentExecuted:state==='SUCCEEDED'};
   }
   if(new Date(a.expires_at)<=new Date()&&!events.some(e=>e.state==='EXPIRED_UNUSED'||e.state==='RECONCILIATION_REQUIRED'))await this.event(client,a.id,events.some(e=>e.state==='CONSUMED')?'RECONCILIATION_REQUIRED':'EXPIRED_UNUSED');
  });
 }
 static async callback(mappingId:string,identity:string,input:unknown){const p=z.object({authorizationId:z.string(),deploymentId:z.string().regex(/^\d+$/)}).parse(input);await this.machine(mappingId,identity);if(!(await pgClient.query('SELECT 1 FROM threat_deployment_authorizations WHERE id=$1 AND mapping_id=$2',[p.authorizationId,mappingId])).rowCount)throw new Error('Deployment receipt scope mismatch');return this.reconcileOne(p.authorizationId,p.deploymentId);}
 static async receipts(modelId:string,actor:BankUser){return ThreatModelService.withGovernanceModel(modelId,actor,async(client)=>({receipts:(await client.query('SELECT a.id,a.commit_sha,a.environment,a.application_id,a.gate_evaluation_id,a.issued_at,a.expires_at,e.state,e.provider_payload,e.occurred_at FROM threat_deployment_authorizations a JOIN threat_delivery_mappings m ON m.id=a.mapping_id JOIN threat_deployment_events e ON e.authorization_id=a.id WHERE m.model_id=$1 ORDER BY e.occurred_at DESC LIMIT 200',[modelId])).rows}));}
 static async reconcile(){const pending=(await pgClient.query("SELECT a.id FROM threat_deployment_authorizations a WHERE NOT EXISTS(SELECT 1 FROM threat_deployment_events e WHERE e.authorization_id=a.id AND e.state IN ('SUCCEEDED','FAILED','EXPIRED_UNUSED')) ORDER BY expires_at LIMIT 100")).rows;for(const a of pending)await this.reconcileOne(a.id);return {processed:pending.length};}
}
