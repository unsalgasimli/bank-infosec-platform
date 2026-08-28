import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSecurityReleaseGate, issueReleaseAuthorization, verifyReleaseAuthorization } from '../server/services/security-release-gate.service.js';
import { WorkflowRuntimeService } from '../server/services/workflow-runtime.service.js';

const approved = {
  applicable: true,
  threatModel: { status: 'APPROVED', currentRevisionId: 'rev-1', approvedRevisionId: 'rev-1' },
  threats: [{ id: 'th-1', key: 'TM-2026-0001-T001', inherentScore: 6, status: 'MITIGATED' }],
  controls: [{ id: 'ctl-1', title: 'Replay protection', status: 'VERIFIED', requiredBeforeRelease: true, implementationTicketStatus: 'DONE' }],
  verifications: [{ controlId: 'ctl-1', result: 'PASS', evidenceIds: ['evidence-1'], expiresAt: '2027-01-01T00:00:00.000Z' }],
  approvals: [{ stage: 'APPSEC', decision: 'APPROVED' }, { stage: 'SECURITY_ARCHITECTURE', decision: 'APPROVED' }],
  exceptions: [],
};

test('release gate permits only current approved model with verified control evidence', () => {
  assert.equal(evaluateSecurityReleaseGate(approved, new Date('2026-08-27T00:00:00.000Z')).allowed, true);
});

test('release gate blocks missing model, critical threats, failed controls, expired verifications, and missing approvals', () => {
  const result = evaluateSecurityReleaseGate({ ...approved, threatModel: undefined, threats: [{ id: 'th-critical', key: 'TM-2026-0001-T099', inherentScore: 20, status: 'OPEN' }], controls: [{ id: 'ctl-broken', title: 'Nonce validation', status: 'FAILED', requiredBeforeRelease: true }], verifications: [{ controlId: 'ctl-broken', result: 'FAIL', expiresAt: '2026-01-01T00:00:00.000Z' }], approvals: [] }, new Date('2026-08-27T00:00:00.000Z'));
  assert.equal(result.allowed, false);
  assert.match(result.blockers.join('\n'), /Threat Model required but missing/);
  assert.match(result.blockers.join('\n'), /unresolved critical threat/);
  assert.match(result.blockers.join('\n'), /not verified/);
  assert.match(result.blockers.join('\n'), /verification result is FAIL/);
  assert.match(result.blockers.join('\n'), /approval is missing/);
});

test('high threat requires a current approved exception and never treats a ticket as a verification', () => {
  const blocked = evaluateSecurityReleaseGate({ ...approved, threats: [{ id: 'th-high', key: 'TM-2026-0001-T002', inherentScore: 12, status: 'OPEN' }], controls: [{ id: 'ctl-2', title: 'MFA', status: 'IMPLEMENTED', requiredBeforeRelease: true, implementationTicketStatus: 'DONE' }], verifications: [] }, new Date('2026-08-27T00:00:00.000Z'));
  assert.equal(blocked.allowed, false);
  assert.match(blocked.blockers.join('\n'), /without a valid risk acceptance/);
  assert.match(blocked.blockers.join('\n'), /not verified/);
  const accepted = evaluateSecurityReleaseGate({ ...approved, threats: [{ id: 'th-high', key: 'TM-2026-0001-T002', inherentScore: 12, status: 'OPEN' }], exceptions: [{ threatId: 'th-high', status: 'APPROVED', expiresAt: '2026-12-01T00:00:00.000Z' }] }, new Date('2026-08-27T00:00:00.000Z'));
  assert.equal(accepted.allowed, true);
});

test('a passing result without linked evidence is still release-blocking', () => {
  const result = evaluateSecurityReleaseGate({ ...approved, verifications: [{ controlId: 'ctl-1', result: 'PASS' }] }, new Date('2026-08-27T00:00:00.000Z'));
  assert.equal(result.allowed, false);
  assert.match(result.blockers.join('\n'), /no linked evidence/);
});

test('the release gate applies the configured severity and approval matrix rather than fixed UI assumptions', () => {
  const policyBlocked = evaluateSecurityReleaseGate({
    ...approved,
    threats: [{ id: 'th-medium', key: 'TM-2026-0001-T003', inherentScore: 8, status: 'OPEN' }],
    releaseBlockingSeverities: ['MEDIUM'],
    requiredApprovalStages: ['APPSEC', 'RISK_AUTHORITY'],
  }, new Date('2026-08-27T00:00:00.000Z'));
  assert.equal(policyBlocked.allowed, false);
  assert.match(policyBlocked.blockers.join('\n'), /medium threat is release-blocking by policy/);
  assert.match(policyBlocked.blockers.join('\n'), /Required RISK_AUTHORITY approval is missing/);
  const policyApproved = evaluateSecurityReleaseGate({
    ...approved,
    threats: [{ id: 'th-medium', key: 'TM-2026-0001-T003', inherentScore: 8, status: 'MITIGATED' }],
    releaseBlockingSeverities: ['MEDIUM'],
    requiredApprovalStages: ['APPSEC', 'RISK_AUTHORITY'],
    approvals: [{ stage: 'APPSEC', decision: 'APPROVED' }, { stage: 'RISK_AUTHORITY', decision: 'APPROVED' }],
  }, new Date('2026-08-27T00:00:00.000Z'));
  assert.equal(policyApproved.allowed, true);
});

test('the workflow runtime fails closed for production deployment without a Threat Model', () => {
  assert.throws(() => (WorkflowRuntimeService as any).runGovernedAction('DEPLOY', { id: 'workflow-test', context: { environment: 'PRODUCTION' } }, { id: 'deploy', action: { actionKey: 'DEPLOY' } }, { attemptCount: 1 }), /does not identify an approved Threat Model/);
});

test('release authorization is tamper-proof, scoped to one model and release, and expires', () => {
  const token = issueReleaseAuthorization({ modelId: 'tm-1', revisionId: 'rev-1', releaseId: 'rel-1', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  assert.equal(verifyReleaseAuthorization(token, { modelId: 'tm-1', releaseId: 'rel-1' }).revisionId, 'rev-1');
  assert.throws(() => verifyReleaseAuthorization(`${token}x`, { modelId: 'tm-1', releaseId: 'rel-1' }), /signature/);
  assert.throws(() => verifyReleaseAuthorization(token, { modelId: 'tm-1', releaseId: 'rel-2' }), /does not match/);
  const expired = issueReleaseAuthorization({ modelId: 'tm-1', revisionId: 'rev-1', releaseId: 'rel-1', expiresAt: '2020-01-01T00:00:00.000Z' });
  assert.throws(() => verifyReleaseAuthorization(expired, { modelId: 'tm-1', releaseId: 'rel-1' }), /expired/);
});
