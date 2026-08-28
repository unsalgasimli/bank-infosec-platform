import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';
import { WorkflowOrchestrationService } from '../server/services/workflow-orchestration.service.js';
import type { BankUser } from '../shared/types/auth.js';

const actor: BankUser = {
  id: 'threat-workflow-admin', username: 'threat-workflow-admin', email: 'threat-workflow-admin@example.test', fullName: 'Threat Workflow Admin', title: 'AppSec lead',
  divisionId: 'div-bank', departmentId: 'dept-secops', teamIds: ['team-secops'], roles: ['PLATFORM_ADMIN', 'APPSEC_ANALYST', 'INFOSEC_MANAGER'],
  securityClearance: 'CONFIDENTIAL_SECURITY_ONLY', ownedApplicationIds: [], ownedAssetIds: [], ownedRiskIds: [], isActive: true,
  distinguishedName: 'CN=threat-workflow-admin,OU=People,DC=example,DC=test', directorySource: 'ACTIVE_DIRECTORY',
};

test('Threat Model governance is a catalogued workflow with a protected release action', (t) => {
  const snapshot = structuredClone(db.data);
  t.after(() => db.reset(snapshot));
  db.reset(structuredClone(initialSeedData));
  db.data.users.push(actor);

  const catalog = WorkflowOrchestrationService.catalogPayload(actor);
  const template = catalog.templates.find((item) => item.id === 'template-threat-model-governance');
  assert.ok(template, 'Threat Model lifecycle must be installed as a real catalogue workflow');
  assert.equal(template.kind, 'WORKFLOW');
  assert.equal(template.domain, 'INFORMATION_SECURITY');

  const source = WorkflowOrchestrationService.getTemplate('template-threat-model-governance', actor);
  assert.deepEqual(
    source.version.nodes.filter((node) => node.type === 'APPROVAL').map((node) => node.key).sort(),
    ['appsec-review', 'risk-acceptance', 'security-architecture-review'],
  );
  assert.deepEqual(
    source.version.nodes.filter((node) => node.type === 'APPROVAL').map((node) => node.approval?.approverSource),
    ['ROLE', 'ROLE', 'ROLE'],
    'Approval labels must resolve the configured security role, never every department member.',
  );
  const releaseGate = source.version.nodes.find((node) => node.key === 'server-release-gate');
  assert.equal(releaseGate?.type, 'SYSTEM_ACTION');
  assert.equal(releaseGate?.action?.actionKey, 'DEPLOY');
  assert.ok(source.version.nodes.some((node) => node.key === 'control-verification'));
  assert.ok(source.version.nodes.some((node) => node.key === 'stride-and-bank-abuse-analysis'));
  assert.ok(source.version.nodes.some((node) => node.key === 'risk-acceptance-required' && node.type === 'CONDITION'));
});
