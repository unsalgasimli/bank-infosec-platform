import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';
import { OrchestrationController } from '../server/controllers/orchestration.controller.js';
import { ApprovalService } from '../server/services/approval.service.js';
import { WorkflowOrchestrationService } from '../server/services/workflow-orchestration.service.js';
import { WorkflowRuntimeService } from '../server/services/workflow-runtime.service.js';
import { WorkflowTriggerService } from '../server/services/workflow-trigger.service.js';
import type { BankUser } from '../shared/types/auth.js';
import type { TicketApprovalChain } from '../shared/types/approval.js';


const pristine = structuredClone(db.data);
const reset = () => db.reset(JSON.parse(JSON.stringify(pristine)));
const admin = () => db.data.users.find((user) => user.roles.includes('CISO')) || db.data.users[0];
const addIndependentApprover = (): BankUser => {
  const source = admin();
  const user: BankUser = { ...JSON.parse(JSON.stringify(source)), id: 'usr-independent-approver', username: 'independent.approver', email: 'independent.approver@example.test', fullName: 'Independent Approval Test User', roles: ['INFOSEC_MANAGER', 'APPROVER'], teamIds: ['team-appsec'], isActive: true };
  db.data.users.push(user);
  return user;
};

const completeNextOpenWork = (instanceId: string, actor: BankUser) => {
  const execution = WorkflowRuntimeService.getExecution(instanceId, actor);
  const item = execution.workItems.find((workItem) => workItem.status !== 'COMPLETED' && workItem.status !== 'CANCELLED');
  if (!item) return false;
  WorkflowRuntimeService.completeWorkItem(item.id, actor, { completedByTest: true });
  return true;
};

test('Universal Enterprise Work Orchestration Platform', async (t) => {
  await t.test('Express can invoke orchestration handlers without a bound class receiver', () => {
    reset();
    let statusCode = 200;
    let body: any;
    const response = {
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { body = value; return this; },
    };
    const detachedCatalogHandler = OrchestrationController.catalog;
    detachedCatalogHandler({ user: admin(), query: {} } as any, response as any);
    assert.equal(statusCode, 200);
    assert.equal(body.success, true);
    assert.ok(body.templates.length >= 18);
  });

  await t.test('catalog is useful and domain forms do not leak technical fields into HR', () => {
    reset();
    const payload = WorkflowOrchestrationService.catalogPayload(admin());
    assert.ok(payload.templates.length >= 18);
    assert.ok(payload.templates.some((item) => item.title === 'Software Feature Delivery'));
    assert.ok(payload.templates.some((item) => item.title === 'Employee Offboarding'));
    const onboarding = WorkflowOrchestrationService.getFormForRequestType('request-onboard-employee');
    const keys = onboarding.version.sections.flatMap((section) => section.fields.map((field) => field.key));
    assert.ok(keys.includes('employeeId'));
    assert.ok(keys.includes('startDate'));
    assert.ok(!keys.includes('cvss'));
    assert.ok(!keys.includes('severity'));
    assert.ok(onboarding.version.sections.length >= 3);
    const standard = WorkflowOrchestrationService.resolveVisibleFields('request-standard-task', {}, admin());
    assert.ok(standard.sections.flatMap((section) => section.fields).some((formField) => formField.key === 'requesterId'));
  });

  await t.test('department-scoped approval routing resolves only active members of the configured branch', () => {
    reset();
    const actor = admin();
    const departmentId = db.data.departments.find((department) => department.id !== actor.departmentId)?.id || actor.departmentId;
    const node: any = {
      id: 'department-approval', key: 'department-approval', type: 'APPROVAL', title: 'Department approval', position: { x: 0, y: 0 },
      approval: { approverSource: 'DEPARTMENT_MEMBERS', departmentId, approvalMode: 'ANY_ONE', preventSelfApproval: false },
    };
    const resolved = WorkflowOrchestrationService.resolveApprovers(node, { requesterId: actor.id }, actor.id);
    const expectedIds = db.data.users.filter((user) => user.isActive && user.departmentId === departmentId).map((user) => user.id).sort();
    assert.deepEqual(resolved.map((user) => user.id).sort(), expectedIds);
  });

  await t.test('human-work routing exposes AD sections and never derives a selected person route from their first group', () => {
    reset();
    const actor = admin();
    const department = db.data.departments.find((item) => item.id === actor.departmentId) || db.data.departments[0];
    const section = {
      id: 'section-workflow-routing-test',
      departmentId: department.id,
      name: 'Technical Support',
      code: 'SEC_TECHNICAL_SUPPORT',
      managerId: 'usr-section-routing-member',
      isActive: true,
      directorySource: 'ACTIVE_DIRECTORY' as const,
    };
    const sectionMember: BankUser = {
      ...structuredClone(actor),
      id: 'usr-section-routing-member',
      username: 'section.routing.member',
      email: 'section.routing.member@example.test',
      fullName: 'Section Routing Member',
      roles: ['REQUESTER'],
      departmentId: department.id,
      sectionId: section.id,
      // Deliberately ordered so a first-group fallback would be observable.
      teamIds: ['team-unrelated', 'team-technical-support'],
      isActive: true,
      directorySource: 'ACTIVE_DIRECTORY',
    };
    db.data.departmentSections.push(section);
    db.data.users.push(sectionMember);

    const directory = WorkflowOrchestrationService.directoryOptions(actor);
    assert.ok(directory.sections.some((item) => item.id === section.id && item.departmentId === department.id));

    const node: any = { id: 'section-task', key: 'section-task', type: 'TASK', title: 'Support task', position: { x: 0, y: 0 } };
    const fixed = WorkflowOrchestrationService.resolveAssignment({
      strategy: 'FIXED_PERSON', departmentId: department.id, sectionId: section.id, assigneeId: sectionMember.id,
    }, {}, node, actor.id);
    assert.equal(fixed.assigneeId, sectionMember.id);
    assert.equal(fixed.groupId, department.id);
    assert.match(fixed.explanation, /Technical Support/);

    const queue = WorkflowOrchestrationService.resolveAssignment({
      strategy: 'UNASSIGNED_TEAM_QUEUE', departmentId: department.id, sectionId: section.id,
    }, {}, node, actor.id);
    assert.equal(queue.groupId, department.id);
    assert.match(queue.explanation, /Technical Support/);

    const launched = WorkflowRuntimeService.launchQuickWork({
      requestTypeId: 'request-standard-task',
      actor,
      idempotencyKey: 'section-queue-routing-001',
      values: {
        summary: 'Section queue routing',
        description: 'The selected section must remain the queue destination.',
        requesterId: actor.id,
        departmentId: department.id,
        targetDepartmentId: department.id,
        targetSectionId: section.id,
        routingStrategy: 'TEAM_QUEUE',
      },
    });
    const workItem = launched.execution.workItems[0];
    assert.equal(workItem.targetDepartmentId, department.id);
    assert.equal(workItem.targetSectionId, section.id);
    const routedNode = launched.execution.nodes.find((item) => item.workItemId === workItem.id);
    assert.match(routedNode?.routingExplanation || '', /Technical Support/);

    const departmentOnlyMember: BankUser = {
      ...structuredClone(sectionMember),
      id: 'usr-department-only-member',
      username: 'department.only.member',
      email: 'department.only.member@example.test',
      fullName: 'Department Only Member',
      sectionId: undefined,
      teamIds: [],
    };
    db.data.users.push(departmentOnlyMember);
    assert.throws(() => WorkflowRuntimeService.claimWorkItem(workItem.id, departmentOnlyMember), /not authorized/i);
    assert.equal(WorkflowRuntimeService.claimWorkItem(workItem.id, sectionMember).nodes.some((item) => item.workItemId === workItem.id && item.assigneeId === sectionMember.id), true);
  });

  await t.test('dynamic department approval never permits a saved specific user to override runtime routing', () => {
    reset();
    const actor = admin();
    const dynamicDepartmentId = actor.departmentId;
    const fixedUser = db.data.users.find((user) => user.isActive && user.departmentId !== dynamicDepartmentId)!;
    const node: any = {
      id: 'dynamic-department-approval', key: 'dynamic-department-approval', type: 'APPROVAL', title: 'Dynamic department approval', position: { x: 0, y: 0 },
      approval: { approverSource: 'SPECIFIC_USER', departmentSource: 'REQUESTER_DEPARTMENT', specificUserIds: [fixedUser.id], approvalMode: 'ANY_ONE', preventSelfApproval: false },
    };
    const resolved = WorkflowOrchestrationService.resolveApprovers(node, { requesterId: actor.id }, actor.id);
    const expectedIds = db.data.users.filter((user) => user.isActive && user.departmentId === dynamicDepartmentId).map((user) => user.id).sort();
    assert.deepEqual(resolved.map((user) => user.id).sort(), expectedIds);

    const source = WorkflowOrchestrationService.getTemplate('template-standard-task');
    const draft = WorkflowOrchestrationService.saveDraft({
      workflowDefinitionId: source.definition.id,
      version: { ...structuredClone(source.version), status: 'DRAFT', nodes: [{ ...node }], changeLog: 'Normalize dynamic department approval.' },
    }, actor);
    assert.equal(draft.version.nodes[0].approval?.approverSource, 'DEPARTMENT_MEMBERS');
    assert.equal(draft.version.nodes[0].approval?.specificUserIds, undefined);
  });

  await t.test('dynamic intake resolves dependent options, calculated values, reusable groups, and protected fields', () => {
    reset();
    const actor = admin();
    const onboarding = WorkflowOrchestrationService.resolveVisibleFields('request-onboard-employee', { location: 'REMOTE_AZ' }, actor);
    const hardware = onboarding.sections.flatMap((section) => section.fields).find((formField) => formField.key === 'hardwareProfile')!;
    assert.deepEqual(hardware.options?.map((option) => option.value), ['REMOTE_KIT']);
    const deployment = WorkflowOrchestrationService.prepareSubmission('request-production-deployment', { summary: 'Calculated change', serviceId: 'app-mobile', version: '9.0.0', environment: 'PRODUCTION', changeType: 'NORMAL', implementationPlan: 'Canary', testingEvidence: ['report'], rollbackPlan: 'Rollback', requestedWindow: new Date().toISOString(), blastRadius: 'HIGH' }, actor);
    assert.equal(deployment.valid, true);
    assert.equal(deployment.values.risk, 'HIGH');
    const procurementValues = { summary: 'Protected procurement', items: [{ sku: 'SECURE' }], amount: 1000, costCenter: 'CC-01', businessReason: 'Required service', confidentialVendorReference: 'bank-account-reference' };
    const protectedSubmission = WorkflowOrchestrationService.prepareSubmission('request-procurement', procurementValues, actor);
    assert.equal(protectedSubmission.valid, true);
    assert.equal((protectedSubmission.values.confidentialVendorReference as any).protected, true);
    assert.ok(!(JSON.stringify(protectedSubmission.values.confidentialVendorReference).includes('bank-account-reference')));
    const requester: BankUser = { ...structuredClone(actor), id: 'requester-field-acl', username: 'requester.field', email: 'requester.field@example.test', fullName: 'Requester Field ACL', roles: ['REQUESTER'], isActive: true };
    db.data.users.push(requester);
    const unauthorized = WorkflowOrchestrationService.prepareSubmission('request-procurement', procurementValues, requester);
    assert.equal(unauthorized.valid, false);
    assert.ok(unauthorized.errors.some((error) => error.fieldKey === 'confidentialVendorReference'));
  });

  await t.test('event triggers are persisted, matched, and idempotent', () => {
    reset();
    const actor = admin();
    const input = {
      idempotencyKey: 'hr-event-onboarding-001',
      triggerType: 'HR_EVENT' as const,
      eventName: 'employee.hired',
      recordType: 'employee',
      source: 'test-hris',
      context: { summary: 'Event-driven onboarding', employeeId: 'employee-event', managerId: actor.id, startDate: new Date(Date.now() + 7 * 86_400_000).toISOString(), employmentType: 'EMPLOYEE', remote: false, requesterId: actor.id },
    };
    const first = WorkflowTriggerService.emit(input, actor);
    assert.equal(first.replayed, false);
    assert.equal(first.instances.length, 1);
    assert.equal(first.instances[0]?.workflowDefinitionId, 'wf-employee-onboarding');
    assert.equal(first.instances[0]?.triggerType, 'HR_EVENT');
    const replay = WorkflowTriggerService.emit(input, actor);
    assert.equal(replay.replayed, true);
    assert.equal(replay.instances[0]?.id, first.instances[0]?.id);
    assert.equal(db.data.triggerReceipts.length, 1);
    assert.ok(db.data.executionEvents.some((event) => event.workflowInstanceId === first.instances[0]?.id && event.type === 'TRIGGER_MATCHED'));
  });

  await t.test('template versions compare, clone, publish, and explicitly migrate compatible active runs', () => {
    reset();
    const actor = admin();
    const source = WorkflowOrchestrationService.getTemplate('template-standard-task');
    const running = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-standard-task', values: { summary: 'Pinned migration test', description: 'Keep active work stable.', requesterId: actor.id }, actor, idempotencyKey: 'migration-source-001' });
    const nextNodes = structuredClone(source.version.nodes);
    nextNodes.find((node) => node.type === 'TASK')!.description = 'Version two governed instructions.';
    const draft = WorkflowOrchestrationService.saveDraft({ workflowDefinitionId: source.definition.id, version: { ...structuredClone(source.version), status: 'DRAFT', nodes: nextNodes, changeLog: 'Add governed work instructions.' } }, actor);
    const comparison = WorkflowOrchestrationService.compareVersions(source.definition.id, 1, draft.version.version, actor);
    assert.equal(comparison.changes.changedNodes.length, 1);
    WorkflowOrchestrationService.publish(source.definition.id, draft.version.version, actor);
    const migrated = WorkflowRuntimeService.migrateInstance(running.instance.id, draft.version.version, actor);
    assert.equal(migrated.pinnedVersion.workflow, draft.version.version);
    assert.ok(migrated.events.some((event) => event.type === 'INSTANCE_MIGRATED'));
    const cloned = WorkflowOrchestrationService.cloneTemplate(source.template.id, actor, 'CLONE');
    assert.equal(cloned.definition.lifecycle, 'DRAFT');
    assert.equal(cloned.sourceWorkflowDefinitionId, source.definition.id);
    assert.notEqual(cloned.definition.id, source.definition.id);
  });

  await t.test('runtime exposes multiple clocks, deduplicated notifications, and cross-record relations', () => {
    reset();
    const actor = admin();
    const launched = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-standard-task', values: { summary: 'Governed runtime evidence', description: 'Verify clocks and traceability.', requesterId: actor.id }, actor, idempotencyKey: 'governance-runtime-001' });
    let execution = WorkflowRuntimeService.getExecution(launched.instance.id, actor);
    assert.deepEqual(execution.slaClocks.map((clock) => clock.clockType).sort(), ['ASSIGNMENT', 'FIRST_RESPONSE', 'RESOLUTION']);
    assert.ok(execution.notifications.some((delivery) => delivery.eventType === 'WORK_ITEM_CREATED' && delivery.status === 'SENT'));
    const related = WorkflowRuntimeService.addRelation(launched.instance.id, { targetType: 'APPLICATION', targetId: 'app-mobile', relationType: 'IMPLEMENTS', metadata: { reason: 'Runtime traceability test' } }, actor);
    execution = related.execution;
    assert.equal(execution.relations.length, 1);
    assert.equal(execution.relations[0].relationType, 'IMPLEMENTS');
    assert.ok(execution.events.some((event) => event.type === 'RELATION_CREATED'));
  });

  await t.test('Quick Work Item is a one-work-node workflow with immutable pinned versions', () => {
    reset();
    const actor = admin();
    const first = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-standard-task', values: { summary: 'Review architecture decision', description: 'Confirm the migration boundary.', requesterId: actor.id }, actor, idempotencyKey: 'quick-work-idempotency-001' });
    assert.equal(first.instance.workflowDefinitionId, 'wf-standard-task');
    assert.equal(first.instance.workflowVersion, 1);
    assert.equal(first.execution.workItems.length, 1);
    assert.equal(first.instance.status, 'WAITING');
    const replay = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-standard-task', values: { summary: 'Review architecture decision', description: 'Confirm the migration boundary.', requesterId: actor.id }, actor, idempotencyKey: 'quick-work-idempotency-001' });
    assert.equal(replay.replayed, true);
    assert.equal(replay.instance.id, first.instance.id);
    const completed = WorkflowRuntimeService.completeWorkItem(first.execution.workItems[0].id, actor, { accepted: true });
    assert.equal(completed.instance.status, 'COMPLETED');
    assert.deepEqual(completed.pinnedVersion, { workflow: 1, form: 1, policy: 1 });
    assert.ok(completed.events.every((event, index) => index === 0 || event.previousHash === completed.events[index - 1].hash));
  });

  await t.test('feature delivery waits for QA and Security, then requires independent high-risk approval', () => {
    reset();
    const actor = admin();
    const approver = addIndependentApprover();
    const launched = WorkflowRuntimeService.launch({ workflowDefinitionId: 'wf-software-feature-delivery', context: { summary: 'Payments reconciliation feature', description: 'Deliver safely.', requesterId: actor.id, change: { risk: 'HIGH' } }, actor, idempotencyKey: 'feature-delivery-001' });
    for (let guard = 0; guard < 10; guard += 1) {
      const execution = WorkflowRuntimeService.getExecution(launched.instance.id, actor);
      if (execution.pendingApprovals) break;
      if (!completeNextOpenWork(launched.instance.id, actor)) break;
    }
    let execution = WorkflowRuntimeService.getExecution(launched.instance.id, actor);
    const join = execution.nodes.find((node) => node.nodeKey === 'feature-join');
    const qa = execution.nodes.find((node) => node.nodeKey === 'feature-qa');
    const security = execution.nodes.find((node) => node.nodeKey === 'feature-security');
    assert.equal(qa?.status, 'COMPLETED');
    assert.equal(security?.status, 'COMPLETED');
    assert.equal(join?.status, 'COMPLETED');
    assert.equal(execution.pendingApprovals, 1);
    const approvalNode = execution.nodes.find((node) => node.approvalChainId)!;
    const chain = db.data.approvals.find((item) => item.id === approvalNode.approvalChainId)!;
    assert.ok(chain.steps.every((step) => step.assignedApproverId !== actor.id));
    const decision = ApprovalService.submitDecision({ chainId: chain.id, stepId: chain.steps[0].id, decision: 'APPROVED', user: approver, comments: 'Independent authorization granted.' });
    assert.equal(decision.success, true);
    execution = WorkflowRuntimeService.synchronizeApproval(chain.id, approver);
    assert.equal(execution.instance.status, 'COMPLETED');
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'feature-deploy')?.outcome, 'SUCCEEDED');
  });

  await t.test('deployment failure retries safely after reload and follows rollback plus incident path once', () => {
    reset();
    const actor = admin();
    const launched = WorkflowRuntimeService.launch({
      workflowDefinitionId: 'wf-production-deployment', actor, idempotencyKey: 'deployment-failure-001',
      context: { summary: 'Deploy payments v8', requesterId: actor.id, serviceId: 'app-mobile', version: '8.0.0', environment: 'NON_PRODUCTION', changeType: 'STANDARD', implementationPlan: 'Deploy canary.', testingEvidence: ['test-report'], rollbackPlan: 'Restore v7.', requestedWindow: new Date(Date.now() - 60_000).toISOString(), blastRadius: 'LOW', __testFailures: { DEPLOY: 2 } },
    });
    let execution = WorkflowRuntimeService.getExecution(launched.instance.id, actor);
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'change-deploy')?.status, 'WAITING_RETRY');
    db.persist();
    db.reload();
    WorkflowRuntimeService.advance(launched.instance.id, new Date(Date.now() + 10 * 60_000), actor);
    execution = WorkflowRuntimeService.getExecution(launched.instance.id, actor);
    const deployNodeId = execution.nodes.find((node) => node.nodeKey === 'change-deploy')?.id;
    const deployAttempts = db.data.nodeAttempts.filter((attempt) => attempt.nodeInstanceId === deployNodeId && !attempt.idempotencyKey.includes(':compensation:'));
    assert.equal(deployAttempts.length, 2);
    assert.equal(new Set(deployAttempts.map((attempt) => attempt.idempotencyKey)).size, 1);
    assert.equal(db.data.nodeAttempts.filter((attempt) => attempt.nodeInstanceId === deployNodeId && attempt.idempotencyKey.includes(':compensation:') && attempt.status === 'SUCCEEDED').length, 1);
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'change-rollback')?.status, 'COMPLETED');
    assert.equal(db.data.nodeAttempts.filter((attempt) => attempt.nodeInstanceId === execution.nodes.find((node) => node.nodeKey === 'change-incident')?.id && attempt.status === 'SUCCEEDED').length, 1);
    const incidentAttempt = db.data.nodeAttempts.find((attempt) => attempt.nodeInstanceId === execution.nodes.find((node) => node.nodeKey === 'change-incident')?.id && attempt.status === 'SUCCEEDED')!;
    const incidentTicketId = String(incidentAttempt.output?.recordId);
    const incidentTicket = db.data.tickets.find((ticket) => ticket.id === incidentTicketId);
    assert.equal(incidentTicket?.category, 'INCIDENT');
    assert.equal(incidentTicket?.intakeChannel, 'AUTOMATION');
    assert.ok(execution.relations.some((relation) => relation.targetType === 'TICKET' && relation.targetId === incidentTicketId));
    assert.ok(completeNextOpenWork(launched.instance.id, actor));
    execution = WorkflowRuntimeService.getExecution(launched.instance.id, actor);
    assert.equal(execution.instance.status, 'FAILED');
    assert.equal(execution.deadLetters.filter((entry) => entry.status === 'OPEN').length, 1);
    assert.throws(() => WorkflowRuntimeService.requeueDeadLetter(launched.instance.id, execution.deadLetters[0].id, actor), /downstream effects/);
  });

  await t.test('exhausted automation enters a dead-letter queue and can be safely requeued before downstream effects', () => {
    reset();
    const actor = admin();
    const source = WorkflowOrchestrationService.getTemplate('template-standard-task');
    const staged = WorkflowOrchestrationService.saveDraft({
      workflowDefinitionId: source.definition.id,
      version: {
        ...structuredClone(source.version),
        status: 'DRAFT',
        nodes: [
          { id: 'dlq-start', key: 'dlq-start', type: 'START', title: 'Start', stageId: 'dlq-stage', position: { x: 100, y: 100 } },
          { id: 'dlq-action', key: 'dlq-action', type: 'SYSTEM_ACTION', title: 'Recoverable action', stageId: 'dlq-stage', position: { x: 350, y: 100 }, action: { actionKey: 'TEST_DLQ_ACTION' }, retryPolicy: { maxAttempts: 1, initialBackoffSeconds: 1, multiplier: 1, maxBackoffSeconds: 1 } },
          { id: 'dlq-end', key: 'dlq-end', type: 'SUCCESS_END', title: 'Complete', stageId: 'dlq-stage', position: { x: 600, y: 100 } },
        ],
        edges: [
          { id: 'dlq-edge-1', sourceNodeId: 'dlq-start', destinationNodeId: 'dlq-action' },
          { id: 'dlq-edge-2', sourceNodeId: 'dlq-action', destinationNodeId: 'dlq-end', outcome: 'SUCCEEDED' },
        ],
        stages: [{ id: 'dlq-stage', key: 'dlq-stage', title: 'Recovery', order: 1, trigger: 'IMMEDIATE', nodeIds: ['dlq-start', 'dlq-action', 'dlq-end'] }],
        changeLog: 'Dead-letter recovery validation.',
      },
    }, actor);
    WorkflowOrchestrationService.publish(source.definition.id, staged.version.version, actor);
    const launched = WorkflowRuntimeService.launch({ workflowDefinitionId: source.definition.id, workflowVersion: staged.version.version, context: { summary: 'DLQ recovery', requesterId: actor.id, __testFailures: { TEST_DLQ_ACTION: 'FAIL' } }, actor, idempotencyKey: 'dead-letter-recovery-001' });
    let execution = WorkflowRuntimeService.getExecution(launched.instance.id, actor);
    assert.equal(execution.instance.status, 'FAILED');
    assert.equal(execution.deadLetters[0].status, 'OPEN');
    const persisted = db.data.workflowInstances.find((entry) => entry.id === launched.instance.id)!;
    persisted.context.__testFailures = {};
    execution = WorkflowRuntimeService.requeueDeadLetter(launched.instance.id, execution.deadLetters[0].id, actor);
    assert.equal(execution.instance.status, 'COMPLETED');
    assert.equal(execution.deadLetters[0].status, 'RESOLVED');
    assert.ok(execution.events.some((event) => event.type === 'DEAD_LETTER_REQUEUED'));
  });

  await t.test('onboarding launches parallel preboarding and holds Day One until start date', () => {
    reset();
    const actor = admin();
    const approver = addIndependentApprover();
    const startDate = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
    const launched = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-onboard-employee', actor, idempotencyKey: 'onboarding-001', values: { summary: 'Onboard test employee', employeeId: 'employee-test', legalEntity: 'Bank', departmentId: 'dept-core', managerId: actor.id, jobTitle: 'Payments Engineer', employmentType: 'EMPLOYEE', location: 'Baku HQ', startDate, costCenter: 'CC-100', hardwareProfile: 'ENGINEERING', accessProfile: 'PAYMENTS_ENGINEER', remote: false, privilegedRole: true } });
    for (let guard = 0; guard < 12; guard += 1) {
      let execution = WorkflowRuntimeService.getExecution(launched.instance.id, actor);
      const approvalNode = execution.nodes.find((node) => node.approvalChainId && db.data.approvals.find((chain) => chain.id === node.approvalChainId)?.status === 'PENDING');
      if (approvalNode) {
        const chain = db.data.approvals.find((item) => item.id === approvalNode.approvalChainId)!;
        ApprovalService.submitDecision({ chainId: chain.id, stepId: chain.steps[0].id, decision: 'APPROVED', user: approver, comments: 'Approved for test.' });
        WorkflowRuntimeService.synchronizeApproval(chain.id, approver);
        continue;
      }
      if (!completeNextOpenWork(launched.instance.id, actor)) break;
    }
    const execution = WorkflowRuntimeService.getExecution(launched.instance.id, actor);
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'onboard-identity')?.status, 'COMPLETED');
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'onboard-laptop')?.status, 'COMPLETED');
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'onboard-facilities')?.status, 'COMPLETED');
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'onboard-dayone-wait')?.status, 'WAITING');
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'onboard-activate')?.status, 'PENDING');
    assert.equal(execution.currentStage?.title, 'Day One');
  });

  await t.test('remote onboarding launches a traced equipment subworkflow and contractors require authorization first', () => {
    reset();
    const actor = admin();
    const startDate = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const base = { summary: 'Remote onboarding branch', employeeId: 'employee-remote', legalEntity: 'Bank', departmentId: 'dept-core', managerId: actor.id, jobTitle: 'Remote Engineer', location: 'Remote', startDate, costCenter: 'CC-REMOTE', hardwareProfile: 'ENGINEERING', accessProfile: 'ENGINEERING', privilegedRole: false };
    const remote = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-onboard-employee', actor, idempotencyKey: 'onboarding-remote-001', values: { ...base, employmentType: 'EMPLOYEE', remote: true } });
    assert.ok(completeNextOpenWork(remote.instance.id, actor));
    assert.ok(completeNextOpenWork(remote.instance.id, actor));
    let execution = WorkflowRuntimeService.getExecution(remote.instance.id, actor);
    const remoteNode = execution.nodes.find((node) => node.nodeKey === 'onboard-remote-equipment');
    assert.equal(remoteNode?.status, 'WAITING');
    assert.ok(remoteNode?.childWorkflowInstanceId);
    assert.ok(execution.relations.some((relation) => relation.relationType === 'PARENT' && relation.targetId === remoteNode?.childWorkflowInstanceId));

    const contractor = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-onboard-employee', actor, idempotencyKey: 'onboarding-contractor-001', values: { ...base, employeeId: 'employee-contractor', employmentType: 'CONTRACTOR', remote: false } });
    assert.ok(completeNextOpenWork(contractor.instance.id, actor));
    assert.ok(completeNextOpenWork(contractor.instance.id, actor));
    execution = WorkflowRuntimeService.getExecution(contractor.instance.id, actor);
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'onboard-contractor-approval')?.status, 'WAITING');
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'onboard-remote')?.status, 'PENDING');
  });

  await t.test('offboarding waits for scheduled termination, emergency bypasses wait, and legal hold blocks cleanup', () => {
    reset();
    const actor = admin();
    const scheduledAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const scheduled = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-offboard-employee', actor, idempotencyKey: 'offboarding-scheduled-001', values: { summary: 'Scheduled offboarding', employeeId: 'employee-test', managerId: actor.id, lastWorkingDate: scheduledAt, terminationType: 'VOLUNTARY', emergency: false, legalHold: false } });
    assert.ok(completeNextOpenWork(scheduled.instance.id, actor));
    let execution = WorkflowRuntimeService.getExecution(scheduled.instance.id, actor);
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'offboard-wait')?.status, 'WAITING');
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'offboard-identity')?.status, 'PENDING');

    const emergency = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-offboard-employee', actor, idempotencyKey: 'offboarding-emergency-001', values: { summary: 'Emergency offboarding', employeeId: 'employee-emergency', managerId: actor.id, lastWorkingDate: scheduledAt, terminationType: 'INVOLUNTARY', emergency: true, legalHold: true, activeAccessCount: 0 } });
    execution = WorkflowRuntimeService.getExecution(emergency.instance.id, actor);
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'offboard-wait')?.status, 'SKIPPED');
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'offboard-identity')?.status, 'COMPLETED');
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'offboard-cleanup')?.status, 'SKIPPED');
    assert.ok(completeNextOpenWork(emergency.instance.id, actor));
    execution = WorkflowRuntimeService.getExecution(emergency.instance.id, actor);
    assert.equal(execution.instance.status, 'COMPLETED');
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'offboard-verify')?.output?.machineVerified, true);

    const blocked = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-offboard-employee', actor, idempotencyKey: 'offboarding-active-access-001', values: { summary: 'Offboarding with active access', employeeId: 'employee-active', managerId: actor.id, lastWorkingDate: scheduledAt, terminationType: 'INVOLUNTARY', emergency: true, legalHold: true, activeAccessCount: 2 } });
    assert.ok(completeNextOpenWork(blocked.instance.id, actor));
    execution = WorkflowRuntimeService.getExecution(blocked.instance.id, actor);
    assert.equal(execution.nodes.find((node) => node.nodeKey === 'offboard-verify')?.output?.allAccessRevoked, false);
    assert.equal(execution.instance.status, 'FAILED');
    assert.notEqual(execution.instance.status, 'COMPLETED');
  });

  await t.test('approval ALL, ANY, N-of-M, rejection comments, delegation audit, and timeout escalation are enforced', () => {
    reset();
    const actor = admin();
    const approvers = ['one', 'two', 'three'].map((suffix, index) => {
      const user: BankUser = { ...structuredClone(actor), id: `approval-${suffix}`, username: `approval.${suffix}`, email: `approval.${suffix}@example.test`, fullName: `Approval ${suffix}`, roles: ['APPROVER', ...(index === 0 ? ['INFOSEC_MANAGER' as const] : [])], isActive: true };
      db.data.users.push(user);
      return user;
    });
    const chain = (id: string, mode: TicketApprovalChain['mode'], quorumCount?: number, allowDelegation = false): TicketApprovalChain => {
      const value: TicketApprovalChain = { id, ticketId: `ticket-${id}`, title: id, status: 'PENDING', createdAt: new Date().toISOString(), mode, quorumCount, requesterId: actor.id, preventSelfApproval: true, commentsMandatoryOnReject: true, allowDelegation, steps: approvers.map((user, index) => ({ id: `${id}-step-${index + 1}`, stepNumber: index + 1, name: `Step ${index + 1}`, assignedApproverId: user.id, assignedApproverName: user.fullName, status: 'PENDING', isMandatory: true })) };
      db.data.approvals.push(value);
      return value;
    };
    const all = chain('approval-all', 'ALL');
    ApprovalService.submitDecision({ chainId: all.id, stepId: all.steps[0].id, decision: 'APPROVED', user: approvers[0] });
    assert.equal(all.status, 'PENDING');
    ApprovalService.submitDecision({ chainId: all.id, stepId: all.steps[1].id, decision: 'APPROVED', user: approvers[1] });
    ApprovalService.submitDecision({ chainId: all.id, stepId: all.steps[2].id, decision: 'APPROVED', user: approvers[2] });
    assert.equal(all.status, 'APPROVED');

    const any = chain('approval-any', 'ANY_ONE');
    ApprovalService.submitDecision({ chainId: any.id, stepId: any.steps[1].id, decision: 'APPROVED', user: approvers[1] });
    assert.equal(any.status, 'APPROVED');

    const quorum = chain('approval-quorum', 'N_OF_M', 2);
    ApprovalService.submitDecision({ chainId: quorum.id, stepId: quorum.steps[0].id, decision: 'APPROVED', user: approvers[0] });
    assert.equal(quorum.status, 'PENDING');
    ApprovalService.submitDecision({ chainId: quorum.id, stepId: quorum.steps[2].id, decision: 'APPROVED', user: approvers[2] });
    assert.equal(quorum.status, 'APPROVED');

    const rejected = chain('approval-rejected', 'ALL');
    assert.equal(ApprovalService.submitDecision({ chainId: rejected.id, stepId: rejected.steps[0].id, decision: 'REJECTED', user: approvers[0] }).success, false);
    assert.equal(ApprovalService.submitDecision({ chainId: rejected.id, stepId: rejected.steps[0].id, decision: 'REJECTED', user: approvers[0], comments: 'Required control evidence is missing.' }).success, true);
    assert.equal(rejected.status, 'REJECTED');

    const delegated = chain('approval-delegated', 'ANY_ONE', undefined, true);
    ApprovalService.submitDecision({ chainId: delegated.id, stepId: delegated.steps[0].id, decision: 'DELEGATED', user: approvers[0], delegatedToUserId: approvers[1].id, comments: 'Coverage delegation.' });
    assert.equal(delegated.steps[0].delegationHistory?.length, 1);
    ApprovalService.submitDecision({ chainId: delegated.id, stepId: delegated.steps[0].id, decision: 'APPROVED', user: approvers[1], comments: 'Reviewed after delegation.' });
    assert.equal(delegated.status, 'APPROVED');
    assert.ok(delegated.steps[0].immutableSignatureHash?.startsWith('sha256-'));

    actor.managerId = approvers[0].id;
    const access = WorkflowRuntimeService.launchQuickWork({ requestTypeId: 'request-application-access', actor, idempotencyKey: 'approval-rejection-path-001', values: { summary: 'Access rejection path', employeeId: actor.id, applicationId: 'app-mobile', role: 'Production reader', businessReason: 'Operational support', privileged: false, requesterId: actor.id } });
    assert.ok(completeNextOpenWork(access.instance.id, actor));
    let accessExecution = WorkflowRuntimeService.getExecution(access.instance.id, actor);
    const accessApprovalNode = accessExecution.nodes.find((node) => node.approvalChainId)!;
    const accessChain = db.data.approvals.find((candidate) => candidate.id === accessApprovalNode.approvalChainId)!;
    const accessApprover = db.data.users.find((user) => user.id === accessChain.steps[0].assignedApproverId) || approvers[0];
    ApprovalService.submitDecision({ chainId: accessChain.id, stepId: accessChain.steps[0].id, decision: 'REJECTED', user: accessApprover, comments: 'Business justification is insufficient.' });
    accessExecution = WorkflowRuntimeService.synchronizeApproval(accessChain.id, accessApprover);
    assert.equal(accessExecution.instance.status, 'REJECTED');
    assert.equal(accessExecution.nodes.find((node) => node.nodeKey === 'wf-access-request-rejected')?.status, 'COMPLETED');

    const feature = WorkflowRuntimeService.launch({ workflowDefinitionId: 'wf-software-feature-delivery', context: { summary: 'Approval timeout escalation', description: 'Exercise escalation.', requesterId: actor.id, change: { risk: 'HIGH' } }, actor, idempotencyKey: 'approval-timeout-escalation-001' });
    for (let guard = 0; guard < 12; guard += 1) {
      const execution = WorkflowRuntimeService.getExecution(feature.instance.id, actor);
      if (execution.pendingApprovals) break;
      if (!completeNextOpenWork(feature.instance.id, actor)) break;
    }
    const before = WorkflowRuntimeService.getExecution(feature.instance.id, actor);
    const approvalNode = before.nodes.find((node) => node.approvalChainId)!;
    WorkflowRuntimeService.advance(feature.instance.id, new Date(new Date(approvalNode.waitingUntil!).getTime() + 1), actor);
    const after = WorkflowRuntimeService.getExecution(feature.instance.id, actor);
    assert.ok(after.events.some((event) => event.type === 'APPROVAL_CREATED' && event.data.escalation === true));
    assert.ok(after.notifications.some((delivery) => delivery.eventType === 'APPROVAL_REMINDER'));
  });

  await t.test('simulation resolves branches, assignments, approvals, schedules, and dry-run actions without mutations', () => {
    reset();
    const actor = admin();
    addIndependentApprover();
    const beforeInstances = db.data.workflowInstances.length;
    const beforeAttempts = db.data.nodeAttempts.length;
    const simulation = WorkflowOrchestrationService.simulate('wf-production-deployment', 1, { requesterId: actor.id, risk: 'HIGH', requestedWindow: '2026-09-01T08:00:00.000Z' }, actor);
    assert.equal(simulation.dryRun, true);
    assert.equal(simulation.preflight.valid, true);
    assert.ok(simulation.approvals.length > 0);
    assert.ok(simulation.actions.every((action) => action.executed === false));
    assert.equal(db.data.workflowInstances.length, beforeInstances);
    assert.equal(db.data.nodeAttempts.length, beforeAttempts);
  });

  reset();
});
