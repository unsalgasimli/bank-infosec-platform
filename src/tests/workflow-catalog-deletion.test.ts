import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';
import { WorkflowOrchestrationService } from '../server/services/workflow-orchestration.service.js';
import type { BankUser } from '../shared/types/auth.js';

test('workflow catalog deletion is scoped and preserves audit dependencies', (t) => {
  const originalDatabase = structuredClone(db.data);
  t.after(() => {
    db.reset(originalDatabase);
  });

  db.reset(JSON.parse(JSON.stringify(initialSeedData)));
  const admin: BankUser = {
    id: 'workflow-delete-admin', username: 'workflow.delete.admin', email: 'workflow.delete.admin@example.test', fullName: 'Workflow Delete Admin', title: 'Platform Admin',
    divisionId: 'division-test', departmentId: 'department-test', teamIds: [], roles: ['CISO'], securityClearance: 'INTERNAL',
    ownedApplicationIds: [], ownedAssetIds: [], ownedRiskIds: [], isActive: true,
  };
  const template = WorkflowOrchestrationService.catalogPayload(admin).templates.find((item) => item.canDelete)!;
  const requester: BankUser = { ...admin, id: 'workflow-delete-requester', roles: ['REQUESTER'] };

  assert.throws(
    () => WorkflowOrchestrationService.deleteTemplate(template.id, requester),
    /authorized owner|designer permission/i,
  );

  const deleted = WorkflowOrchestrationService.deleteTemplate(template.id, admin);
  assert.equal(deleted.templateId, template.id);
  assert.equal(
    db.data.workflowCatalogTemplates.find((item) => item.id === template.id)?.lifecycle,
    'ARCHIVED',
  );
  assert.equal(
    db.data.workflowDefinitions.find((item) => item.id === template.workflowDefinitionId)?.lifecycle,
    'ARCHIVED',
  );
  assert.ok(
    db.data.requestTypesV2
      .filter((item) => item.workflowDefinitionId === template.workflowDefinitionId)
      .every((item) => !item.isActive),
  );
  assert.ok(!WorkflowOrchestrationService.catalogPayload(admin).templates.some((item) => item.id === template.id));
  assert.throws(
    () => WorkflowOrchestrationService.getTemplate(template.id, admin),
    /no longer available/i,
  );
});
