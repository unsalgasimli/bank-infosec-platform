import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../server/db/database.js';
import { WorkflowOrchestrationService } from '../server/services/workflow-orchestration.service.js';
import { WorkflowRuntimeService } from '../server/services/workflow-runtime.service.js';

test('workflow creation and launch permissions follow employee scope', () => {
  const originalDatabase = structuredClone(db.data);
  try {
    const employee = db.data.users.find((user) => user.roles.includes('REQUESTER') && !user.roles.some((role) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'DEPARTMENT_ADMIN', 'IT_ADMIN', 'HR_ADMIN', 'CORE_BANK_ADMIN', 'LEGAL_ADMIN'].includes(role)));
    const admin = db.data.users.find((user) => user.roles.includes('IT_ADMIN')) || db.data.users.find((user) => user.roles.includes('CISO'));
    assert.ok(employee, 'test fixture must contain a non-admin requester');
    assert.ok(admin, 'test fixture must contain an administrator');

    const employeePermissions = WorkflowOrchestrationService.permissions(employee);
    assert.deepEqual(employeePermissions, { canCreatePersonal: true, canCreateDepartment: true, canCreateCompany: false, canLaunchWorkflows: true });
    const adminPermissions = WorkflowOrchestrationService.permissions(admin);
    assert.equal(adminPermissions.canCreateCompany, true);

    const source = WorkflowOrchestrationService.getTemplate('template-standard-task', employee);
    const version = { ...structuredClone(source.version), status: 'DRAFT' as const };
    const departmentDraft = WorkflowOrchestrationService.saveDraft({
      definition: { name: 'Employee department workflow', scope: 'DEPARTMENT' },
      version,
    }, employee);
    assert.equal(departmentDraft.definition.departmentId, employee.departmentId);
    assert.throws(
      () => WorkflowOrchestrationService.saveDraft({ definition: { name: 'Employee company workflow', scope: 'COMPANY' }, version }, employee),
      /not authorized/i,
    );

    const companyDraft = WorkflowOrchestrationService.saveDraft({
      definition: { name: 'Admin company workflow', scope: 'COMPANY' },
      version: { ...structuredClone(source.version), status: 'DRAFT' as const },
    }, admin);
    assert.equal(companyDraft.definition.scope, 'COMPANY');

    const launched = WorkflowRuntimeService.launchQuickWork({
      requestTypeId: 'request-standard-task',
      values: { summary: 'Requester can launch standard workflow', description: 'Permission matrix test.', requesterId: employee.id },
      actor: employee,
      idempotencyKey: 'workflow-auth-launch-001',
    });
    assert.equal(launched.instance.requesterId, employee.id);
  } finally {
    db.reset(originalDatabase);
  }
});
