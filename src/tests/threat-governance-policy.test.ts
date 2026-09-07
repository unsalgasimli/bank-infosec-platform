import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScreening, screeningRules, securityReviewer, seniorRiskAuthority, exceptionLimits, assertExceptionDecision, nextReviewDate, hasMaterialSecurityChange } from '../server/services/threat-model-policy.js';
import { canonicalJson } from '../shared/canonical-json.js';
import { riskRating } from '../shared/risk-matrix.js';
import { evaluateSecurityReleaseGate } from '../server/services/security-release-gate.service.js';
import type { BankUser } from '../shared/types/auth.js';
import { threatMaterialChangeFields } from '../server/services/threat-model-policy.js';

const answers = () => Object.fromEntries(screeningRules.map(rule => [rule.signal, false]));
test('material changes are distinguished from harmless metadata refreshes', () => {
  assert.equal(hasMaterialSecurityChange(['name','tags','lastSeenAt','updatedAt','departmentId']),false);
  assert.equal(hasMaterialSecurityChange(['networkInterfaces']),true);
  assert.equal(hasMaterialSecurityChange(['authentication']),true);
  assert.equal(hasMaterialSecurityChange(threatMaterialChangeFields([{field:'details',oldValue:{notes:'a',authentication:'SSO'},newValue:{notes:'b',authentication:'SSO'}}])),false);
  assert.equal(hasMaterialSecurityChange(threatMaterialChangeFields([{field:'details',oldValue:{authentication:'SSO'},newValue:{authentication:'LOCAL'}}])),true);
  assert.equal(hasMaterialSecurityChange(['details.unknownSecurityExtension']),true);
  assert.equal(hasMaterialSecurityChange(['ipAddress']),true);
});
test('screening requires explicit answers; empty questionnaire cannot get TM-0', () => {
  assert.throws(() => evaluateScreening({}, screeningRules), /answer required/);
  assert.equal(evaluateScreening(answers(), screeningRules).tier, 0);
  assert.equal(evaluateScreening({ ...answers(), internalChange: true }, screeningRules).tier, 1);
  assert.equal(evaluateScreening({ ...answers(), confidentialData: true }, screeningRules).tier, 2);
});
test('hard triggers win over configurable scores and explain every decision', () => {
  const result = evaluateScreening({ ...answers(), paymentRelated: true }, screeningRules.map(rule => ({ ...rule, weight: 0 })));
  assert.equal(result.tier, 3); assert.equal(result.score, 0); assert.equal(result.hardMinimum, 3);
  assert.equal(result.triggeredConditions[0].signal, 'paymentRelated');
});
test('platform administration is not security or risk approval, auditor is read only', () => {
  const actor = (roles: BankUser['roles']) => ({ roles } as BankUser);
  assert.equal(securityReviewer(actor(['PLATFORM_ADMIN'])), false);
  assert.equal(seniorRiskAuthority(actor(['PLATFORM_ADMIN'])), false);
  assert.equal(securityReviewer(actor(['APPSEC_ANALYST'])), true);
  assert.equal(securityReviewer(actor(['AUDITOR','CISO'])), false);
  assert.equal(seniorRiskAuthority(actor(['CISO'])), true);
});
test('exception state machine rejects expired acceptance and automatic renewal', () => {
  assert.deepEqual(exceptionLimits, { CRITICAL:7,HIGH:30,MEDIUM:90,LOW:180 });
  const now = new Date('2026-09-04T00:00:00Z');
  assert.throws(() => assertExceptionDecision('REQUESTED','APPROVED','2026-09-03',now), /Expired/);
  for (const status of ['APPROVED','REJECTED','REVOKED','EXPIRED']) assert.throws(() => assertExceptionDecision(status,'APPROVED','2026-09-30',now), /renewal/);
  assert.doesNotThrow(() => assertExceptionDecision('REQUESTED','APPROVED','2026-09-30',now));
});
test('review intervals use calendar months and clamp leap/month-end dates', () => {
  assert.equal(nextReviewDate(3,new Date('2026-08-31T00:00:00Z')), '2027-02-28T00:00:00.000Z');
  assert.equal(nextReviewDate(0,new Date('2026-09-04T00:00:00Z')), '2028-09-04T00:00:00.000Z');
  assert.equal(nextReviewDate(2,new Date('2026-09-04T00:00:00Z')), '2027-09-04T00:00:00.000Z');
});
test('canonical snapshot survives JSONB key reordering; canonical matrix rejects invalid scores', () => {
  assert.equal(canonicalJson({ z:1,a:{ y:2,b:3 } }), canonicalJson({ a:{ b:3,y:2 },z:1 }));
  assert.equal(riskRating(16),'CRITICAL'); assert.equal(riskRating(10),'HIGH'); assert.throws(() => riskRating(NaN));
});
test('gate fails closed for overdue, unscreened, legacy, missing requirements and dirty evidence', () => {
  const result = evaluateSecurityReleaseGate({ applicable:true, threatModel:{ status:'APPROVED',currentRevisionId:'r',approvedRevisionId:'r',nextReviewAt:'2020-01-01',screeningComplete:false,snapshotPresent:false }, threats:[],controls:[],verifications:[],approvals:[],exceptions:[], requirementBlockers:['Missing mandatory requirement control'],invalidEvidenceIds:['dirty'] });
  assert.equal(result.securityGate,'BLOCK'); assert.equal(result.allowed,false); assert.ok(result.blockers.length >= 6);
});
test('closed critical residual risk cannot bypass production gate', () => {
  const result = evaluateSecurityReleaseGate({ applicable:true,threats:[{id:'t',key:'T',status:'CLOSED',inherentScore:20,residualScore:20}],controls:[],verifications:[],approvals:[],exceptions:[] });
  assert.match(result.blockers.join(' '),/unresolved critical/);
});
