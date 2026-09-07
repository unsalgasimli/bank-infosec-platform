import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryContextSchema,deliveryIntegrationStatus,executeWithDeliveryAdapter } from '../server/services/threat-delivery-contract.js';
const context={provider:'GITLAB',repositoryUrl:'https://gitlab.example.invalid/bank/service',commitSha:'a'.repeat(40),pipelineId:'12',pipelineUrl:'https://gitlab.example.invalid/bank/service/-/pipelines/12',environment:'production',releaseId:'change-1',modelId:'tm-1'};
test('deferred GitLab integration fails closed before authorization consumption',async()=>{
  assert.equal(deliveryIntegrationStatus.deploymentEnabled,false);let consumed=false;
  await assert.rejects(executeWithDeliveryAdapter(context,{consume:async()=>{consumed=true;throw new Error('must not run');}}),/not configured/);assert.equal(consumed,false);
});
test('delivery references reject secrets and ambiguous commit identity',()=>{
  for(const change of [{repositoryUrl:'https://token:secret@example.invalid/repo'},{pipelineUrl:'https://example.invalid/job?token=secret'},{commitSha:'main'},{repositoryUrl:'http://example.invalid/repo'}])assert.equal(deliveryContextSchema.safeParse({...context,...change}).success,false);
});
test('adapter contract verifies target then consumes scoped authorization before an idempotent execution',async()=>{
  const calls:string[]=[];const keys:string[]=[];
  const dependencies={adapter:{provider:'GITLAB' as const,verifyTarget:async()=>{calls.push('target');},deploy:async(_:unknown,__:unknown,key:string)=>{calls.push('deploy');keys.push(key);return {executionReference:'stub-only'};}},consume:async()=>{calls.push('consume');return {authorizationId:'auth-1',revisionId:'rev-1',releaseId:'change-1',gate:{allowed:true},deploymentExecuted:false as const};}};
  await executeWithDeliveryAdapter(context,dependencies);await executeWithDeliveryAdapter(context,dependencies);
  assert.deepEqual(calls,['target','consume','deploy','target','consume','deploy']);assert.equal(keys[0],keys[1]);
  await assert.rejects(executeWithDeliveryAdapter(context,{...dependencies,consume:async()=>({...await dependencies.consume(),gate:{allowed:false}})}),/authorization/);
});
