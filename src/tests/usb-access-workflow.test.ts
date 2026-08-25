import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';
import { ApprovalService } from '../server/services/approval.service.js';
import { WorkflowOrchestrationService } from '../server/services/workflow-orchestration.service.js';
import { WorkflowRuntimeService } from '../server/services/workflow-runtime.service.js';
import type { BankDepartment, BankUser } from '../shared/types/auth.js';

const user = (id: string, roles: BankUser['roles'], managerId?: string): BankUser => ({
  id,
  username: id,
  email: `${id}@example.test`,
  fullName: id.replaceAll('-', ' '),
  title: roles.includes('DEPARTMENT_MANAGER') ? 'Department Manager' : roles.includes('SECURITY_ANALYST') ? 'Security Analyst' : roles.includes('IT_ADMIN') ? 'Help Desk Analyst' : 'Bank Employee',
  divisionId: 'div-bank',
  departmentId: roles.includes('SECURITY_ANALYST') ? 'dept-secops' : roles.includes('IT_ADMIN') ? 'dept-it' : 'dept-retail',
  teamIds: roles.includes('SECURITY_ANALYST') ? ['team-soc'] : roles.includes('IT_ADMIN') ? ['team-it-infra'] : ['team-retail'],
  roles,
  securityClearance: 'INTERNAL',
  managerId,
  ownedApplicationIds: [],
  ownedAssetIds: [],
  ownedRiskIds: [],
  isActive: true,
  distinguishedName: `CN=${id},OU=People,DC=example,DC=test`,
  directorySource: 'ACTIVE_DIRECTORY',
});

test('USB Access company workflow', async (t) => {
  const manager = user('usr-usb-manager', ['DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER']);
  const requester = user('usr-usb-requester', ['REQUESTER'], manager.id);
  const infosec = user('usr-usb-infosec', ['SECURITY_ANALYST', 'APPROVER', 'REQUESTER']);
  const helpDesk = user('usr-usb-helpdesk', ['IT_ADMIN', 'APPROVER', 'REQUESTER']);
  const outsider = user('usr-usb-outsider', ['REQUESTER']);
  const department: BankDepartment = { id: 'dept-retail', divisionId: 'div-bank', name: 'Retail', code: 'RETAIL', managerId: manager.id, isActive: true, directorySource: 'ACTIVE_DIRECTORY' };

  t.after(() => {
    db.data = structuredClone(initialSeedData);
  });

  const reset = () => {
    db.reset(structuredClone(initialSeedData));
    db.data.users.push(requester, manager, infosec, helpDesk, outsider);
    db.data.departments.push(department);
    db.persist();
  };

  await t.test('installs in Company Templates and runs manager → InfoSec → Help Desk with participant updates', () => {
    reset();
    const catalog = WorkflowOrchestrationService.catalogPayload(requester);
    assert.deepEqual(catalog.sections.map((section) => section.name), ['Company Templates', 'Department / Branch Templates', 'User Templates']);
    assert.ok(catalog.sections[0].templates.some((template) => template.id === 'template-usb-access'));
    assert.ok(catalog.requestTypes.some((requestType) => requestType.id === 'request-usb-access'));

    const launched = WorkflowRuntimeService.launchQuickWork({
      requestTypeId: 'request-usb-access',
      actor: requester,
      idempotencyKey: 'usb-access-happy-path-001',
      values: {
        summary: 'Encrypted USB for regulator evidence',
        businessJustification: 'Provide approved evidence during an offline regulator review.',
        deviceSerial: 'USB-ASSET-001',
        accessScope: 'READ_ONLY',
        requestedUntil: '2026-09-30',
        dataClassification: 'RESTRICTED',
        requesterId: outsider.id,
        departmentId: outsider.departmentId,
        encryptedDevice: true,
      },
    });
    assert.equal(launched.instance.requesterId, requester.id, 'manual launch cannot impersonate another requester');
    assert.equal(launched.instance.context.departmentId, requester.departmentId, 'department routing is session-derived');

    let execution = WorkflowRuntimeService.getExecution(launched.instance.id, requester);
    const managerChain = execution.approvals.find((chain) => chain.title === 'Manager approval')!;
    assert.deepEqual(managerChain.steps.map((step) => step.assignedApproverId), [manager.id]);
    assert.ok(WorkflowRuntimeService.listInstances(manager).some((instance) => instance.id === launched.instance.id));
    assert.throws(() => WorkflowRuntimeService.getExecution(launched.instance.id, outsider), /not authorized/i);

    assert.equal(ApprovalService.submitDecision({ chainId: managerChain.id, stepId: managerChain.steps[0].id, decision: 'APPROVED', user: manager, comments: 'Business need confirmed.' }).success, true);
    execution = WorkflowRuntimeService.synchronizeApproval(managerChain.id, manager);
    const infoSecTicket = execution.workItems.find((item) => item.title.includes('InfoSec USB access review'))!;
    assert.equal(infoSecTicket.status, 'OPEN');
    assert.throws(() => WorkflowRuntimeService.completeWorkItem(infoSecTicket.id, infosec), /Claim this queue ticket/i);

    execution = WorkflowRuntimeService.claimWorkItem(infoSecTicket.id, infosec);
    execution = WorkflowRuntimeService.addComment(launched.instance.id, infosec, 'Device and business purpose validated; approving read-only access.');
    assert.equal(execution.comments.at(-1)?.authorId, infosec.id);
    execution = WorkflowRuntimeService.completeWorkItem(infoSecTicket.id, infosec, { review: 'CONTROLLED_READ_ONLY' });
    const infoSecChain = execution.approvals.find((chain) => chain.title === 'InfoSec decision')!;
    assert.deepEqual(infoSecChain.steps.map((step) => step.assignedApproverId), [infosec.id]);

    assert.equal(ApprovalService.submitDecision({ chainId: infoSecChain.id, stepId: infoSecChain.steps[0].id, decision: 'APPROVED', user: infosec, comments: 'Security controls accepted.' }).success, true);
    execution = WorkflowRuntimeService.synchronizeApproval(infoSecChain.id, infosec);
    const helpDeskTicket = execution.workItems.find((item) => item.title.includes('Help Desk USB access fulfilment'))!;
    assert.equal(helpDeskTicket.status, 'OPEN');
    WorkflowRuntimeService.claimWorkItem(helpDeskTicket.id, helpDesk);
    execution = WorkflowRuntimeService.completeWorkItem(helpDeskTicket.id, helpDesk, { evidenceReference: 'HD-EVIDENCE-001' });
    assert.equal(execution.instance.status, 'COMPLETED');
    assert.ok(execution.participants.some((participant) => participant.id === requester.id));
    assert.ok(execution.participants.some((participant) => participant.id === manager.id));
    assert.ok(execution.participants.some((participant) => participant.id === infosec.id));
    assert.ok(execution.participants.some((participant) => participant.id === helpDesk.id));
    assert.ok(db.data.notifications.some((notification) => notification.userId === requester.id && notification.ticketId === launched.instance.id));
    assert.ok(db.data.notifications.some((notification) => notification.actionUrl?.includes(launched.instance.id)));
  });

  await t.test('fails closed when LDAP has no exact requester manager', () => {
    reset();
    requester.managerId = undefined;
    department.managerId = undefined;
    WorkflowOrchestrationService.catalogPayload(requester);
    db.data.users.find((candidate) => candidate.id === requester.id)!.managerId = undefined;
    db.data.departments.find((candidate) => candidate.id === department.id)!.managerId = undefined;
    const before = db.data.workflowInstances.length;
    assert.throws(() => WorkflowRuntimeService.launchQuickWork({
      requestTypeId: 'request-usb-access',
      actor: requester,
      idempotencyKey: 'usb-access-no-manager-001',
      values: {
        summary: 'USB request without manager',
        businessJustification: 'This must never route to an unrelated manager.',
        deviceSerial: 'USB-ASSET-002',
        accessScope: 'READ_ONLY',
        requestedUntil: '2026-09-30',
        dataClassification: 'INTERNAL',
        requesterId: requester.id,
        departmentId: requester.departmentId,
        encryptedDevice: true,
      },
    }), /no exact manager relationship/i);
    assert.equal(db.data.workflowInstances.length, before);
  });
});
