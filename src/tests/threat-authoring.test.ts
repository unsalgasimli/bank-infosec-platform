import test from 'node:test';
import assert from 'node:assert/strict';
import { threatAuthoringSchema, threatEditSchema } from '../server/services/threat-authoring.schema.js';

const valid={title:'Scenario',description:'Description',attackScenario:'Actor bypasses object authorization',categories:['SPOOFING'],inherentLikelihood:2,inherentImpact:3};
test('threat authoring validates categories and canonical risk bounds',()=>{
  assert.equal(threatAuthoringSchema.parse(valid).title,'Scenario');
  for(const invalid of [{categories:['NOT_STRIDE']},{categories:[]},{inherentImpact:6},{title:'x'.repeat(256)}]) assert.equal(threatAuthoringSchema.safeParse({...valid,...invalid}).success,false);
});
test('threat edit requires a captured content version and reason, and strips governance overrides',()=>{
  assert.equal(threatEditSchema.safeParse(valid).success,false);
  const result=threatEditSchema.parse({...valid,contentVersion:1,reason:'Reassess',status:'MITIGATED',residualScore:1,previousThreatId:'foreign'});
  assert.equal('status' in result,false);assert.equal('residualScore' in result,false);assert.equal('previousThreatId' in result,false);
  assert.equal(threatEditSchema.parse({...valid,contentVersion:1,reason:'Round trip persisted nullable fields',dueDate:null,ownerId:null}).dueDate,'');
});
test('authoring rejects invalid calendar dates and normalizes deduplicated references',()=>{
  for(const dueDate of ['2026-02-30','2026-13-01','tomorrow']) assert.equal(threatAuthoringSchema.safeParse({...valid,dueDate}).success,false);
  const result=threatAuthoringSchema.parse({...valid,dueDate:'2028-02-29',categories:['TAMPERING','SPOOFING','SPOOFING'],cweIds:['CWE-89','CWE-89']});
  assert.deepEqual(result.categories,['SPOOFING','TAMPERING']);assert.deepEqual(result.cweIds,['CWE-89']);
  assert.equal(threatAuthoringSchema.safeParse({...valid,capecIds:['invented']}).success,false);
});
