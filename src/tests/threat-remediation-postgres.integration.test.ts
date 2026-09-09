import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import express from 'express';
import {authMiddleware,requireAuthentication} from '../server/middleware/auth.middleware.js';
import {SessionService} from '../server/services/session.service.js';
import {ThreatModelsController as controller} from '../server/controllers/threat-models.controller.js';
import {ThreatComplianceApplicabilityService as compliance} from '../server/services/threat-compliance-applicability.service.js';
import {ThreatGovernanceAdminService as governance} from '../server/services/threat-governance-admin.service.js';
import {pgClient} from '../server/db/postgres/client.js';
import {db} from '../server/db/database.js';
import {config} from '../server/config/index.js';
import {ThreatModelService as service} from '../server/services/threat-model.service.js';
import {ThreatReadinessService as coverage} from '../server/services/threat-readiness.service.js';
import {screeningRules} from '../server/services/threat-model-policy.js';
import {assertDisposableDatabase} from './fixtures/disposable-database.js';
import type {BankUser} from '../shared/types/auth.js';

const enabled=process.env.RUN_THREAT_MODEL_POSTGRES_INTEGRATION==='1'&&process.env.THREAT_MODEL_DISPOSABLE_DATABASE==='1';
if(process.env.THREAT_INTEGRATION_REQUIRED==='1'&&!enabled)throw new Error('Required Threat Modeling integration cannot skip');
before(async()=>{if(enabled)await assertDisposableDatabase(pgClient,config.DB_NAME);});
after(()=>pgClient.close());
test('critical payment architecture cannot pass on one low-risk threat or blanket unreviewed dispositions',{skip:!enabled},async t=>{
 const suffix=randomUUID().slice(0,8);
 const user=async(name:string,roles:BankUser['roles'])=>{
  const id=`tm-rem-${name}-${suffix}`;
  await pgClient.query(`INSERT INTO bank_users(id,username,email,first_name,last_name,title,roles,security_clearance) VALUES($1,$1,$2,$1,'Fixture','TEST',$3::jsonb,'CONFIDENTIAL_SECURITY_ONLY')`,[id,`${id}@example.invalid`,JSON.stringify(roles)]);
  const actor={id,username:id,fullName:id,roles,isActive:true,securityClearance:'CONFIDENTIAL_SECURITY_ONLY',ownedApplicationIds:[],ownedAssetIds:[],teamIds:[]} as unknown as BankUser;
  db.data.users.push(actor);return actor;
 };
 const owner=await user('owner',['APPLICATION_OWNER']),reviewer=await user('reviewer',['APPSEC_ANALYST']),second=await user('second',['APPSEC_ANALYST']),riskOwner=await user('risk',['RISK_OWNER']);
 const appId=`payment-${suffix}`;
 const policyId=`payment-policy-${suffix}`;
 await pgClient.query(`INSERT INTO threat_governance_policy_versions(id,organization_id,version,config) SELECT $1,$2,1,config FROM threat_governance_policy_versions WHERE organization_id='org-bank' ORDER BY version DESC LIMIT 1`,[policyId,`payment-org-${suffix}`]);
 await pgClient.query(`INSERT INTO threat_screening_rules(policy_version_id,signal,reason,weight,minimum_tier) SELECT $1,signal,reason,weight,minimum_tier FROM threat_screening_rules WHERE policy_version_id=(SELECT id FROM threat_governance_policy_versions WHERE organization_id='org-bank' ORDER BY version DESC LIMIT 1)`,[policyId]);
 await pgClient.query(`INSERT INTO bank_applications(id,code,name,tier,architecture_type,technical_owner_id,business_owner_id) VALUES($1,$1,'Payment fixture','CRITICAL','MICROSERVICES',$2,$2)`,[appId,owner.id]);
 db.data.applications.push({id:appId,name:'Payment fixture',technicalOwnerId:owner.id,businessOwnerId:owner.id} as any);
 const created=await service.create({title:'Critical internet payment',organizationId:`payment-org-${suffix}`,serviceId:appId,criticality:'CRITICAL',dataClassification:'CONFIDENTIAL_SECURITY_ONLY',businessOwnerId:owner.id,technicalOwnerId:owner.id,assumptions:'All payment boundaries and capabilities require explicit analysis'},owner);
 const mid=String(created.model!.id),rid=String(created.revision.id);
 const components=[];
 for(const [name,type,zone] of [['Mobile client','CLIENT','INTERNET'],['API gateway','API','DMZ'],['Payment service','SERVICE','RESTRICTED'],['Customer DB','DATABASE','RESTRICTED'],['Payment processor','EXTERNAL_SYSTEM','PARTNER']])components.push(await service.addComponent(mid,{name,type,securityZone:zone},owner));
 const internet=await service.addTrustBoundary(mid,{name:'Internet boundary',boundaryType:'NETWORK',trustLevelFrom:'PUBLIC',trustLevelTo:'INTERNAL'},owner);
 const internal=await service.addTrustBoundary(mid,{name:'Restricted boundary',boundaryType:'NETWORK',trustLevelFrom:'INTERNAL',trustLevelTo:'RESTRICTED'},owner);
 for(const [from,to,boundary] of [[0,1,internet.id],[1,2,internal.id],[2,3,null],[2,4,internal.id]] as const)await service.addDataFlow(mid,{name:`Payment flow ${from}-${to}`,sourceComponentId:components[from].id,destinationComponentId:components[to].id,trustBoundaryId:boundary,protocol:'HTTPS',encryptionInTransit:true,dataClassification:'RESTRICTED'},owner);
 await service.addDataObject(mid,{name:'Customer payment data',classification:'RESTRICTED',personalData:true,paymentData:true,ownerId:owner.id,retention:'Bank policy',allowedLocations:'Bank restricted network',encryptionRequirements:'Encryption at rest and in transit',componentId:components[2].id},owner);
 await coverage.capability(mid,{componentId:components[2].id,kind:'PAYMENT_INITIATION',name:'Payment initiation'},owner);
 const threat=await service.addThreat(mid,{title:'One low threat',description:'Insufficient audit failure fixture',attackScenario:'One limited spoofing scenario',categories:['SPOOFING'],affectedComponentId:components[1].id,inherentLikelihood:1,inherentImpact:1},owner);
 const answers=Object.fromEntries(screeningRules.map(r=>[r.signal,['paymentRelated','internetExposed','customerData'].includes(r.signal)]));
 assert.equal((await service.assessApplicability({threatModelId:mid,answers,justification:'Critical payment scope'},owner)).tier,3);
 await t.test('all entry points reject incomplete analysis',async()=>{
  const r=await coverage.get(mid,owner);assert.ok(r.requiredAnalysisUnits>50);assert.equal(r.completedAnalysisUnits,0);
  assert.ok(r.units.some(u=>u.category==='BENEFICIARY_SUBSTITUTION'));
  await assert.rejects(service.submit(mid,owner),/TM_COVERAGE_INCOMPLETE/);
  await assert.rejects(service.decideApproval(mid,{stage:'APPSEC',decision:'APPROVED'},reviewer));
  await assert.rejects(service.decideApproval(mid,{stage:'SECURITY_ARCHITECTURE',decision:'APPROVED'},second),/authority/);
  assert.equal((await service.releaseGate(mid,owner)).securityGate,'BLOCK');
  await assert.rejects(pgClient.query("UPDATE threat_model_revisions SET status='IN_REVIEW' WHERE id=$1",[rid]),/TM_COVERAGE_INCOMPLETE/);
  await assert.rejects(service.detail(mid,riskOwner),/restricted/);
 });
 await t.test('HTTP cookies resolve persisted sessions and database roles; forged identity and cross-application reads/writes fail',async()=>{
  const otherOwner=await user('otherowner',['APPLICATION_OWNER']),platform=await user('platform',['PLATFORM_ADMIN']);
  const tokens=new Map<string,string>();
  for(const [index,actor] of [owner,otherOwner,reviewer,second,riskOwner,platform].entries()){
   await pgClient.query("UPDATE bank_users SET directory_source='ACTIVE_DIRECTORY',username=$2,first_name='Nigar',last_name='Rahimli',title='Security Engineer' WHERE id=$1",[actor.id,`n.rahimli${index}${suffix}`]);
   tokens.set(actor.id,await SessionService.create(actor.id));
  }
  assert.equal((await pgClient.query('SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1',[owner.id])).rows[0].n,1);
  const app=express();app.use(express.json());app.use(authMiddleware);app.use(requireAuthentication);
  app.get('/api/threat-models/:id',controller.get);
  app.get('/api/threat-models/:id/readiness',controller.readiness);
  app.post('/api/threat-models/:id/components',controller.addComponent);
  app.post('/api/threat-models/:id/approvals',controller.approve);
  app.post('/api/threat-models/:id/release-authorizations',controller.authorizeRelease);
  app.post('/api/threat-models/:id/coverage/dispositions',controller.coverageDisposition);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address() as import('node:net').AddressInfo,base=`http://127.0.0.1:${address.port}`;
  const request=(path:string,actor?:BankUser,body?:unknown)=>fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-user-id':owner.id,...(actor?{cookie:`aegis_session=${tokens.get(actor.id)}`}:{})},body:body?JSON.stringify(body):undefined});
  try{
   assert.equal((await request(`/api/threat-models/${mid}`)).status,401);
   assert.equal((await request(`/api/threat-models/${mid}`,owner)).status,200);
   for(const denied of [otherOwner,riskOwner,platform]){
    assert.equal((await request(`/api/threat-models/${mid}`,denied)).status,403);
    assert.equal((await request(`/api/threat-models/${mid}/readiness`,denied)).status,403);
    assert.equal((await request(`/api/threat-models/${mid}/components`,denied,{name:'Injected',type:'API',securityZone:'INTERNAL'})).status,403);
   }
   for(const appsec of [reviewer,second])assert.equal((await request(`/api/threat-models/${mid}/approvals`,appsec,{stage:'SECURITY_ARCHITECTURE',decision:'APPROVED'})).status,403);
   await pgClient.query('UPDATE bank_users SET is_active=false WHERE id=$1',[otherOwner.id]);
   assert.equal((await request(`/api/threat-models/${mid}`,otherOwner)).status,401);
   await SessionService.revoke(tokens.get(owner.id));
   assert.equal((await request(`/api/threat-models/${mid}`,owner)).status,401);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
 });
 await t.test('every disposition requires independent persisted review; inventory is unique',async()=>{
  const r=await coverage.get(mid,owner);
  for(const unit of r.units){
   const d=await coverage.dispose(mid,{unitId:unit.id,fingerprint:unit.fingerprint,disposition:'REVIEWED_NO_THREAT',reason:`Fixture documented analysis for ${unit.target_type} ${unit.category}; independent review required.`},owner);
   if(unit===r.units[0]){
    await assert.rejects(coverage.review(mid,{dispositionId:d.id,decision:'APPROVED',reason:'Self approval must fail regardless of model ownership'},owner),/authority/);
    assert.equal((await coverage.get(mid,owner)).completedAnalysisUnits,0);
   }
   await coverage.review(mid,{dispositionId:d.id,decision:'APPROVED',reason:'Independent fixture review of this specific target and prompt'},reviewer);
  }
  const completed=await coverage.get(mid,owner);assert.equal(completed.coveragePercentage,100);
  assert.equal(completed.completedAnalysisUnits,completed.requiredAnalysisUnits);
  assert.ok(completed.blockers.some(b=>b.code==='COMPLIANCE_APPLICABILITY_PENDING'));
  await assert.rejects(service.submit(mid,owner),/compliance applicability profile/);
  await pgClient.transaction(async client=>{await coverage.refresh(client,rid);await coverage.refresh(client,rid);});
  assert.equal(Number((await pgClient.query('SELECT count(*) AS n FROM threat_analysis_units WHERE revision_id=$1',[rid])).rows[0].n),completed.requiredAnalysisUnits);
  await assert.rejects(pgClient.query("UPDATE threat_analysis_dispositions SET reason='tamper' WHERE unit_id IN (SELECT id FROM threat_analysis_units WHERE revision_id=$1)",[rid]),/append-only/);
 });
 await t.test('complete reviewed coverage, compliance, evidence and owner attestation permit independent approval',async()=>{
  const grc=await user('grc',['GRC_ANALYST']),grcReview=await user('grcreview',['GRC_ANALYST']),architect=await user('architect',['SECURITY_ARCHITECT']);
  const definition=await service.addComplianceRequirement({framework:'Payment fixture policy',frameworkVersion:'1',code:`PAY-${suffix}`,title:'Verified payment authorization',requirementKind:'BANK_POLICY',sourceUrl:'https://example.invalid/payment-policy'},grc);
  await governance.decideCompliance(definition.id,{decision:'VALIDATED',reason:'Independently reviewed fixture policy source'},grcReview);
  const profile=await compliance.profile({organizationId:`payment-org-${suffix}`,code:'PAYMENTS',effectiveAt:new Date(Date.now()-1000).toISOString(),predicates:{paymentRelated:true},complianceIds:[definition.id],humanReview:false,reason:'Payment capability deterministically requires this fixture bank control'},grc);
  await assert.rejects(compliance.reviewProfile({profileId:profile.id,decision:'APPROVED',reason:'Self-review of policy must not be permitted'},grc),/Independent/);
  await compliance.reviewProfile({profileId:profile.id,decision:'APPROVED',reason:'Independent review validates applicability for payment functionality'},grcReview);
  const control=await service.addControl(threat.id,{title:'Payment authorization',description:'Server side payment authorization',controlType:'PREVENTIVE',implementationOwnerId:owner.id},owner);
  await service.createRequirement(mid,{title:'Verified payment authorization',description:'Verify payment authorization before release',ownerId:owner.id,verificationMethod:'API_SECURITY_TEST',threatIds:[threat.id],controlIds:[control.id],complianceIds:[definition.id]},owner);
  const ticketId=`payment-ticket-${suffix}`,attachmentId=`payment-evidence-${suffix}`;
  await pgClient.query(`INSERT INTO tickets(id,key,project_code,ticket_type_id,ticket_type_name,category,security_domain,title,description,status_id,status_name,status_category,workflow_id,technical_severity,business_priority,business_impact,inherent_risk,residual_risk,reporter_id,due_date,remediation_deadline) VALUES($1,$1,'TEST','TEST','Fixture','SECURITY_REVIEW','APPSEC','Payment evidence','Fixture','test-open','Open','TODO','test-workflow','LOW','P3_MEDIUM','MODERATE','LOW','LOW',$2,NOW()+INTERVAL '1 day',NOW()+INTERVAL '1 day')`,[ticketId,owner.id]);
  await pgClient.query(`INSERT INTO ticket_attachments(id,ticket_id,file_name,file_size_bytes,mime_type,storage_key,sha256_hash,uploaded_by_user_id,source_payload) VALUES($1,$2,'fixture.txt',4,'text/plain','test-only',$3,$4,'{"virusScanStatus":"CLEAN"}'::jsonb)`,[attachmentId,ticketId,createHash('sha256').update('test').digest('hex'),owner.id]);
  db.data.tickets.push({id:ticketId,reporterId:owner.id,requesterId:owner.id,ownerId:owner.id,confidentiality:'INTERNAL',securityDomain:'APPSEC',watcherIds:[],participantIds:[]} as any);
  db.data.attachments.push({id:attachmentId,ticketId,virusScanStatus:'CLEAN'} as any);
  const evidence=await service.linkEvidence(mid,{attachmentId,controlId:control.id},owner);
  await service.recordVerification(control.id,{result:'PASS',verificationType:'API_SECURITY_TEST',testCase:'Reject unauthorized payment',expectedResult:'403',evidenceIds:[evidence.id]},reviewer);
  await service.calculateResidualRisk(threat.id,{residualLikelihood:1,residualImpact:1,residualRiskRationale:'Fixture evidence demonstrates payment authorization'},reviewer);
  await assert.rejects(service.submit(mid,owner),/Technical owner/);
  await coverage.attest(mid,{reason:'Technical owner attests to all current payment surfaces, evidence and assumptions'},owner);
  await service.submit(mid,owner);
  await service.decideApproval(mid,{stage:'APPSEC',decision:'APPROVED'},reviewer);
  await assert.rejects(service.decideApproval(mid,{stage:'SECURITY_ARCHITECTURE',decision:'APPROVED'},second),/authority/);
  await service.decideApproval(mid,{stage:'SECURITY_ARCHITECTURE',decision:'APPROVED'},architect);
  assert.equal((await service.releaseGate(mid,owner)).securityGate,'PASS');
 });
});
