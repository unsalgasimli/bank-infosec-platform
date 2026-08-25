import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';
import { ApprovalService } from '../server/services/approval.service.js';
import { WorkflowOrchestrationService } from '../server/services/workflow-orchestration.service.js';
import { WorkflowRuntimeService } from '../server/services/workflow-runtime.service.js';
import type { BankDepartment, BankUser } from '../shared/types/auth.js';

const person = (id: string, roles: BankUser['roles'], departmentId: string, teamIds: string[], managerId?: string): BankUser => ({
  id, username: id, email: `${id}@example.test`, fullName: id.replaceAll('-', ' '), title: 'Bank employee',
  divisionId: 'div-bank', departmentId, teamIds, roles, securityClearance: 'INTERNAL', managerId,
  ownedApplicationIds: [], ownedAssetIds: [], ownedRiskIds: [], isActive: true, directorySource: 'ACTIVE_DIRECTORY',
});

test('Website Access Request executable workflow', async (t) => {
  const manager = person('usr-web-manager', ['DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER'], 'dept-retail', ['team-retail']);
  const employee = person('usr-web-employee', ['REQUESTER'], 'dept-retail', ['team-retail'], manager.id);
  const infosec = person('usr-web-infosec', ['INFOSEC_MANAGER', 'APPROVER', 'REQUESTER'], 'dept-secops', ['team-soc']);
  const helpdesk = person('usr-web-helpdesk', ['IT_ADMIN', 'REQUESTER'], 'dept-it', ['team-it-infra']);
  const outsider = person('usr-web-outsider', ['REQUESTER'], 'dept-retail', ['team-retail']);
  const retail: BankDepartment = { id: 'dept-retail', divisionId: 'div-bank', name: 'Retail', code: 'RETAIL', managerId: manager.id, isActive: true, directorySource: 'ACTIVE_DIRECTORY' };

  t.after(() => { db.data = structuredClone(initialSeedData); });
  const reset = () => {
    db.reset(structuredClone(initialSeedData));
    db.data.users.push(employee, manager, infosec, helpdesk, outsider);
    db.data.departments.push(retail);
    db.persist();
  };
  const values = () => ({
    summary: 'Regulator research website access', websiteUrl: 'https://www.example.test',
    businessJustification: 'Research regulatory material needed for the current retail controls review.',
    requiredDuration: 'ONE_MONTH', accessType: 'STANDARD',
  });

  await t.test('persists the manager → InfoSec → Help Desk path as real approval and task work items', () => {
    reset();
    const catalog = WorkflowOrchestrationService.catalogPayload(employee);
    assert.ok(catalog.sections[0].templates.some((template) => template.id === 'template-website-access'));
    assert.ok(catalog.requestTypes.some((requestType) => requestType.id === 'request-website-access'));
    const version = WorkflowOrchestrationService.getVersion('wf-website-access');
    const decisionEdges = version.edges
      .filter((edge) => edge.sourceNodeId === 'website-is-manager')
      .map((edge) => ({ outcome: edge.outcome, label: edge.branchLabel }))
      .sort((left, right) => String(left.outcome).localeCompare(String(right.outcome)));
    assert.deepEqual(decisionEdges, [
      { outcome: 'FALSE', label: 'No — manager approval' },
      { outcome: 'TRUE', label: 'Yes — skip self-approval' },
    ], 'the persisted condition has distinct Yes and No execution branches');

    const launched = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-website-access', actor: employee, idempotencyKey: 'website-access-happy-path-001', values: { ...values(), requesterId: outsider.id, departmentId: 'other-department' } });
    assert.equal(launched.instance.requesterId, employee.id, 'manual launch identity is server-derived');
    assert.equal(launched.instance.context.departmentId, employee.departmentId, 'manual launch department is server-derived');
    assert.equal(launched.instance.context.requesterIsDepartmentManager, false);

    let execution = WorkflowRuntimeService.getExecution(launched.instance.id, employee);
    const managerApproval = execution.approvals.find((chain) => chain.title === 'Department Manager Approval')!;
    const managerWork = execution.workItems.find((item) => item.nodeInstanceId === execution.nodes.find((node) => node.approvalChainId === managerApproval.id)!.id)!;
    assert.equal(managerWork.workType, 'APPROVAL_REQUEST');
    assert.equal(managerWork.assigneeId, manager.id);
    assert.throws(() => WorkflowRuntimeService.completeWorkItem(managerWork.id, manager), /approval work items/i);
    assert.equal(ApprovalService.submitDecision({ chainId: managerApproval.id, stepId: managerApproval.steps[0].id, decision: 'APPROVED', user: manager, comments: 'Business purpose confirmed.' }).success, true);

    execution = WorkflowRuntimeService.synchronizeApproval(managerApproval.id, manager);
    assert.equal(execution.workItems.find((item) => item.id === managerWork.id)?.status, 'COMPLETED');
    const infosecApproval = execution.approvals.find((chain) => chain.title === 'InfoSec Approval')!;
    assert.equal(infosecApproval.steps[0].assignedApproverId, infosec.id);
    assert.equal(ApprovalService.submitDecision({ chainId: infosecApproval.id, stepId: infosecApproval.steps[0].id, decision: 'APPROVED', user: infosec, comments: 'Security review approved.' }).success, true);

    execution = WorkflowRuntimeService.synchronizeApproval(infosecApproval.id, infosec);
    const helpdeskTask = execution.workItems.find((item) => item.title === 'Implement Website Access')!;
    assert.equal(helpdeskTask.status, 'OPEN');
    assert.throws(() => WorkflowRuntimeService.completeWorkItem(helpdeskTask.id, helpdesk), /claim this queue ticket/i);
    WorkflowRuntimeService.claimWorkItem(helpdeskTask.id, helpdesk);
    execution = WorkflowRuntimeService.completeWorkItem(helpdeskTask.id, helpdesk, { evidenceReference: 'HD-WEB-001' });
    assert.equal(execution.instance.status, 'COMPLETED');
    assert.ok(execution.events.some((event) => event.type === 'APPROVAL_DECIDED'));
    assert.ok(execution.events.some((event) => event.type === 'WORK_ITEM_COMPLETED' && event.data.workItemId === managerWork.id));
  });

  await t.test('skips manager self-approval and rejects unauthorized or rejected paths without downstream work', () => {
    reset();
    const managerLaunch = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-website-access', actor: manager, idempotencyKey: 'website-access-manager-001', values: values() });
    let execution = WorkflowRuntimeService.getExecution(managerLaunch.instance.id, manager);
    assert.equal(execution.instance.context.requesterIsDepartmentManager, true);
    assert.equal(execution.approvals.some((chain) => chain.title === 'Department Manager Approval'), false);
    const infosecApproval = execution.approvals.find((chain) => chain.title === 'InfoSec Approval')!;
    assert.equal(ApprovalService.submitDecision({ chainId: infosecApproval.id, stepId: infosecApproval.steps[0].id, decision: 'APPROVED', user: outsider, comments: 'Unauthorized.' }).success, false);

    const rejectedLaunch = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-website-access', actor: employee, idempotencyKey: 'website-access-rejected-001', values: values() });
    execution = WorkflowRuntimeService.getExecution(rejectedLaunch.instance.id, employee);
    const managerApproval = execution.approvals.find((chain) => chain.title === 'Department Manager Approval')!;
    assert.equal(ApprovalService.submitDecision({ chainId: managerApproval.id, stepId: managerApproval.steps[0].id, decision: 'REJECTED', user: manager, comments: 'Not required for current duties.' }).success, true);
    execution = WorkflowRuntimeService.synchronizeApproval(managerApproval.id, manager);
    assert.equal(execution.instance.status, 'REJECTED');
    assert.equal(execution.approvals.some((chain) => chain.title === 'InfoSec Approval'), false);
    assert.equal(execution.workItems.some((item) => item.title === 'Implement Website Access'), false);
  });
});
