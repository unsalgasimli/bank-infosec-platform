import assert from 'node:assert';
import test from 'node:test';
import { db } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';
import { TicketLifecycleService } from '../server/services/ticket-lifecycle.service.js';
import { Ticket } from '../shared/types/ticket.js';
import { ApprovalService } from '../server/services/approval.service.js';
import { WorkflowService } from '../server/services/workflow.service.js';
import { TicketsController } from '../server/controllers/tickets.controller.js';
import { BankUser } from '../shared/types/auth.js';
import { SearchService } from '../server/services/search.service.js';

const mockResponse = () => {
  let statusCode = 200;
  let payload: any;
  const response: any = {
    status(code: number) { statusCode = code; return response; },
    json(value: any) { payload = value; return response; },
    getStatus: () => statusCode,
    getPayload: () => payload,
  };
  return response;
};

test('Enterprise ITSM lifecycle invariants', async (t) => {
  const originalDatabase = structuredClone(db.data);
  t.after(() => {
    db.data = originalDatabase;
    db.persist();
  });
  db.reset(structuredClone(originalDatabase));

  const actor = db.data.users.find((user) => user.roles.includes('CISO'))!;
  const baseTicket = db.data.tickets[0];

  await t.test('priority is deterministically derived from impact and urgency', () => {
    assert.strictEqual(TicketLifecycleService.calculatePriority('CATASTROPHIC', 'CRITICAL'), 'P1_URGENT');
    assert.strictEqual(TicketLifecycleService.calculatePriority('SIGNIFICANT', 'HIGH'), 'P2_HIGH');
    assert.strictEqual(TicketLifecycleService.calculatePriority('MODERATE', 'LOW'), 'P3_MEDIUM');
    assert.strictEqual(TicketLifecycleService.calculatePriority('NEGLIGIBLE', 'LOW'), 'P4_LOW');
  });

  await t.test('creation normalization preserves requester semantics and assigns an enterprise request type', () => {
    const input = TicketLifecycleService.validateAndNormalizeCreateInput(
      {
        title: 'Report suspicious phishing email',
        description: 'A suspicious sender requested credentials.',
        category: 'INCIDENT',
        securityDomain: 'SOC',
        technicalSeverity: 'HIGH',
        businessImpact: 'SIGNIFICANT',
      },
      actor
    );
    assert.strictEqual(input.requesterId, actor.id);
    assert.strictEqual(input.type, 'SECURITY_INCIDENT');
    assert.strictEqual(input.assignmentGroupId, 'team-soc');
    assert.strictEqual(input.businessPriority, 'P2_HIGH');
  });

  await t.test('a ticket can be routed to a department queue and claimed only by one of its members', () => {
    const targetDepartment = db.data.departments.find((department) => department.id !== actor.departmentId && department.isActive !== false)!;
    const queueMember: BankUser = {
      ...actor,
      id: 'usr-department-queue-member',
      username: 'department.queue.member',
      email: 'department.queue.member@bank.internal',
      fullName: 'Department Queue Member',
      roles: ['REQUESTER'],
      departmentId: targetDepartment.id,
      teamIds: [],
    };
    const otherDepartmentMember: BankUser = {
      ...queueMember,
      id: 'usr-other-department-member',
      username: 'other.department.member',
      email: 'other.department.member@bank.internal',
      fullName: 'Other Department Member',
      departmentId: actor.departmentId,
    };
    db.data.users.push(queueMember, otherDepartmentMember);

    const createResponse = mockResponse();
    TicketsController.create({
      body: {
        title: 'Department queue claim test',
        description: 'Route this work to a department instead of a named employee.',
        category: 'GENERAL_REQUEST',
        requesterId: actor.id,
        targetDepartmentId: targetDepartment.id,
        routingStrategy: 'TEAM_QUEUE',
      },
      user: actor,
    } as any, createResponse);

    assert.strictEqual(createResponse.getStatus(), 201);
    const queueTicket = createResponse.getPayload().ticket as Ticket;
    assert.strictEqual(queueTicket.targetDepartmentId, targetDepartment.id);
    assert.strictEqual(queueTicket.departmentId, targetDepartment.id);
    assert.strictEqual(queueTicket.assigneeId, undefined);
    assert.strictEqual(queueTicket.assignmentGroupId, undefined);

    const rejectedClaim = mockResponse();
    TicketsController.claim({ params: { id: queueTicket.id }, user: otherDepartmentMember } as any, rejectedClaim);
    assert.strictEqual(rejectedClaim.getStatus(), 403);

    const acceptedClaim = mockResponse();
    TicketsController.claim({ params: { id: queueTicket.id }, user: queueMember } as any, acceptedClaim);
    assert.strictEqual(acceptedClaim.getStatus(), 200);
    assert.strictEqual(queueTicket.assigneeId, queueMember.id);
    assert.ok(queueTicket.assignedAt);

    const competingMember: BankUser = {
      ...queueMember,
      id: 'usr-competing-queue-member',
      username: 'competing.queue.member',
      email: 'competing.queue.member@bank.internal',
      fullName: 'Competing Queue Member',
    };
    db.data.users.push(competingMember);
    const competingClaim = mockResponse();
    TicketsController.claim({ params: { id: queueTicket.id }, user: competingMember } as any, competingClaim);
    assert.strictEqual(competingClaim.getStatus(), 409);
  });

  await t.test('a section route is persisted under its department and only section members can claim it', () => {
    const targetDepartment = db.data.departments.find((department) => department.id !== actor.departmentId && department.isActive !== false)!;
    const targetSection = {
      id: 'section-ticket-intake-test',
      departmentId: targetDepartment.id,
      name: 'Ticket Intake Test Section',
      code: 'TICKET_INTAKE_TEST',
      isActive: true,
      directorySource: 'ACTIVE_DIRECTORY' as const,
    };
    db.data.departmentSections.push(targetSection);
    const sectionMember: BankUser = {
      ...actor,
      id: 'usr-section-queue-member',
      username: 'section.queue.member',
      email: 'section.queue.member@bank.internal',
      fullName: 'Section Queue Member',
      roles: ['REQUESTER'],
      departmentId: targetDepartment.id,
      sectionId: targetSection.id,
      teamIds: [],
    };
    const departmentOnlyMember: BankUser = {
      ...sectionMember,
      id: 'usr-section-other-member',
      username: 'section.other.member',
      email: 'section.other.member@bank.internal',
      fullName: 'Other Section Member',
      sectionId: undefined,
    };
    db.data.users.push(sectionMember, departmentOnlyMember);

    const createResponse = mockResponse();
    TicketsController.create({
      body: {
        title: 'Section queue routing test',
        description: 'Route this work to one AD-confirmed section.',
        category: 'GENERAL_REQUEST',
        requesterId: actor.id,
        targetDepartmentId: targetDepartment.id,
        targetSectionId: targetSection.id,
        routingStrategy: 'TEAM_QUEUE',
      },
      user: actor,
    } as any, createResponse);

    assert.strictEqual(createResponse.getStatus(), 201);
    const sectionTicket = createResponse.getPayload().ticket as Ticket;
    assert.strictEqual(sectionTicket.targetDepartmentId, targetDepartment.id);
    assert.strictEqual(sectionTicket.departmentId, targetDepartment.id);
    assert.strictEqual(sectionTicket.targetSectionId, targetSection.id);

    const rejectedClaim = mockResponse();
    TicketsController.claim({ params: { id: sectionTicket.id }, user: departmentOnlyMember } as any, rejectedClaim);
    assert.strictEqual(rejectedClaim.getStatus(), 403);

    const acceptedClaim = mockResponse();
    TicketsController.claim({ params: { id: sectionTicket.id }, user: sectionMember } as any, acceptedClaim);
    assert.strictEqual(acceptedClaim.getStatus(), 200);
  });

  await t.test('a ticket receives multiple independent SLA clocks', () => {
    db.data.ticketSlaInstances = [];
    const metrics = TicketLifecycleService.initializeSlaMetrics(baseTicket);
    assert.ok(metrics.length >= 5);
    assert.ok(metrics.some((metric) => metric.metric === 'FIRST_RESPONSE'));
    assert.ok(metrics.some((metric) => metric.metric === 'RESOLUTION'));
    assert.ok(metrics.every((metric) => metric.ticketId === baseTicket.id));
  });

  await t.test('task dependencies prevent premature completion', () => {
    const first = TicketLifecycleService.addTask(baseTicket, { title: 'Collect forensic logs' }, actor);
    const second = TicketLifecycleService.addTask(
      baseTicket,
      { title: 'Prepare root cause analysis', dependencyTaskIds: [first.id] },
      actor
    );
    assert.throws(() => TicketLifecycleService.updateTask(baseTicket, second.id, 'DONE', actor), /dependencies/i);
    TicketLifecycleService.updateTask(baseTicket, first.id, 'DONE', actor);
    assert.strictEqual(TicketLifecycleService.updateTask(baseTicket, second.id, 'DONE', actor).status, 'DONE');
  });

  await t.test('approval modes enforce stage order and quorum semantics', () => {
    db.data.approvals.push({
      id: 'approval-any-one-test',
      ticketId: baseTicket.id,
      title: 'Any one security owner',
      mode: 'ANY_ONE',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      steps: [
        { id: 'approval-any-1', stepNumber: 1, name: 'Owner A', status: 'PENDING', isMandatory: true },
        { id: 'approval-any-2', stepNumber: 1, name: 'Owner B', status: 'PENDING', isMandatory: true },
      ],
    });
    const decision = ApprovalService.submitDecision({
      chainId: 'approval-any-one-test',
      stepId: 'approval-any-1',
      decision: 'APPROVED',
      user: actor,
    });
    assert.strictEqual(decision.chain?.status, 'APPROVED');
  });

  await t.test('resolution is mandatory and remains distinct from closed status', () => {
    const ticket: Ticket = {
      ...baseTicket,
      id: 'ticket-resolution-test',
      key: 'SEC-2026-9998',
      statusId: 'UNDER_REVIEW',
      statusName: 'Under Review',
      statusCategory: 'IN_REVIEW',
      workflowId: 'wf-secops-default',
      workflowVersion: 2,
      version: 1,
    };
    db.data.tickets.push(ticket);
    const rejected = WorkflowService.executeTransition({ ticketId: ticket.id, transitionId: 'tr-resolve', user: actor, comment: 'Validated.' });
    assert.strictEqual(rejected.success, false);
    assert.match(rejected.error || '', /resolutionCode/);
    const resolved = WorkflowService.executeTransition({
      ticketId: ticket.id,
      transitionId: 'tr-resolve',
      user: actor,
      comment: 'Validated remediation evidence.',
      requiredFieldUpdates: { resolutionCode: 'MITIGATED', resolutionSummary: 'Control implemented and verified.' },
    });
    assert.strictEqual(resolved.ticket?.statusId, 'RESOLVED');
    assert.strictEqual(resolved.ticket?.closedAt, undefined);
    assert.strictEqual(resolved.ticket?.archivedAt, undefined, 'an intermediate DONE state must remain outside the archive');
    const closed = WorkflowService.executeTransition({ ticketId: ticket.id, transitionId: 'tr-close', user: actor });
    assert.strictEqual(closed.ticket?.statusId, 'CLOSED');
    assert.ok(closed.ticket?.closedAt);
    assert.ok(closed.ticket?.archivedAt, 'the final lifecycle node must enter the archive');
  });

  await t.test('requesters cannot escalate confidentiality or write internal notes', () => {
    const requester: BankUser = {
      ...actor,
      id: 'requester-security-test',
      username: 'requester.test',
      email: 'requester.test@bank.internal',
      fullName: 'Requester Test',
      roles: ['REQUESTER'],
      securityClearance: 'INTERNAL',
    };
    db.data.users.push(requester);
    const ticket: Ticket = {
      ...baseTicket,
      id: 'ticket-requester-policy-test',
      key: 'SEC-2026-9997',
      reporterId: requester.id,
      requesterId: requester.id,
      confidentiality: 'INTERNAL',
      restrictedUserIds: [],
      restrictedTeamIds: [],
      watcherIds: [requester.id],
      version: 1,
    };
    db.data.tickets.push(ticket);
    const updateResponse = mockResponse();
    TicketsController.update({ params: { id: ticket.id }, body: { confidentiality: 'CONFIDENTIAL_SECURITY_ONLY', version: 1 }, user: requester } as any, updateResponse);
    assert.strictEqual(updateResponse.getStatus(), 403);
    const commentResponse = mockResponse();
    TicketsController.addComment({ params: { id: ticket.id }, body: { content: 'Hidden note', visibility: 'SECURITY_TEAM_ONLY' }, user: requester } as any, commentResponse);
    assert.strictEqual(commentResponse.getStatus(), 403);
  });

  await t.test('advanced search supports text, date comparisons, and OR groups', () => {
    const textMatches = SearchService.query(db.data.tickets, 'text ~ "SWIFT"', actor);
    assert.ok(textMatches.length > 0);
    assert.ok(textMatches.every((ticket) => `${ticket.key} ${ticket.title} ${ticket.description} ${ticket.tags.join(' ')}`.toLowerCase().includes('swift')));
    const dateMatches = SearchService.query(db.data.tickets, 'createdAt >= "2020-01-01" AND priority IN (P1_URGENT, P2_HIGH)', actor);
    assert.ok(dateMatches.length > 0);
    const orMatches = SearchService.query(db.data.tickets, 'project = DLP OR project = SOC', actor);
    assert.ok(orMatches.every((ticket) => ticket.projectCode === 'DLP' || ticket.projectCode === 'SOC'));
  });

  await t.test('AI remains advisory until a human explicitly applies a recommendation', () => {
    const ticket: Ticket = {
      ...baseTicket,
      id: 'tick-ai-policy-test',
      key: 'SEC-2026-9999',
      title: 'Suspicious phishing email targeting SWIFT operator',
      description: 'User received a malicious email asking for credentials to Core Banking.',
      category: 'GENERAL_REQUEST',
      type: 'CUSTOM',
      assignmentGroupId: undefined,
      tags: [],
      version: 1,
    };
    db.data.tickets.push(ticket);
    const recommendation = TicketLifecycleService.analyze(ticket);
    assert.strictEqual(ticket.category, 'GENERAL_REQUEST', 'analysis must not mutate the ticket');
    assert.strictEqual(recommendation.requiresHumanConfirmation, true);
    assert.strictEqual(recommendation.status, 'PENDING_REVIEW');
    TicketLifecycleService.applyRecommendation(ticket, recommendation.id, actor);
    assert.strictEqual(ticket.category, 'INCIDENT');
    assert.strictEqual(ticket.assignmentGroupId, 'team-soc');
    assert.strictEqual(recommendation.status, 'APPLIED');
  });
});
