import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';
import { GraphOrchestratorService } from '../server/services/graph-orchestrator.service.js';
import { SLAService } from '../server/services/sla.service.js';
import { ApprovalService } from '../server/services/approval.service.js';
import { WorkflowTemplateService } from '../server/services/workflow-template.service.js';
import { TicketLifecycleService } from '../server/services/ticket-lifecycle.service.js';
import { calculatePriorityFromImpactUrgency } from '../shared/types/ticket.js';

test('Enterprise Work & Workflow Orchestration Engine', async (t) => {
  const resetDb = () => db.reset(JSON.parse(JSON.stringify(initialSeedData)));
  const adminActor = db.data.users.find((u) => u.roles.includes('CISO')) || db.data.users[0];
  const regularActor = db.data.users.find((u) => u.id === 'usr-appsec-spec') || db.data.users[1] || adminActor;

  await t.test('1. Graph Pre-Flight Validation & Cycle Detection', () => {
    resetDb();

    // Valid linear graph
    const validGraph = GraphOrchestratorService.validateGraph([
      { id: 'step-1', type: 'TASK', title: 'Code Review', targetDepartment: 'dept-secops', technicalSeverity: 'HIGH' },
      { id: 'step-2', type: 'TASK', title: 'Dynamic Scan', targetDepartment: 'dept-secops', technicalSeverity: 'HIGH', dependsOnTaskId: 'step-1' },
      { id: 'step-3', type: 'TASK', title: 'Production Cutover', targetDepartment: 'dept-secops', technicalSeverity: 'HIGH', dependsOnTaskId: 'step-2' },
    ]);
    assert.strictEqual(validGraph.isValid, true);
    assert.strictEqual(validGraph.errors.length, 0);
    assert.strictEqual(validGraph.nodeCount, 3);
    assert.strictEqual(validGraph.edgeCount, 2);

    // Cyclic graph detection (step-1 -> step-2 -> step-3 -> step-1)
    const cyclicGraph = GraphOrchestratorService.validateGraph([
      { id: 'step-1', type: 'TASK', title: 'Step 1', targetDepartment: 'dept-secops', dependsOnTaskId: 'step-3' },
      { id: 'step-2', type: 'TASK', title: 'Step 2', targetDepartment: 'dept-secops', dependsOnTaskId: 'step-1' },
      { id: 'step-3', type: 'TASK', title: 'Step 3', targetDepartment: 'dept-secops', dependsOnTaskId: 'step-2' },
    ]);
    assert.strictEqual(cyclicGraph.isValid, false);
    assert.ok(cyclicGraph.errors.some((err) => /cycle/i.test(err)));

    // Broken reference detection
    const brokenGraph = GraphOrchestratorService.validateGraph([
      { id: 'step-1', type: 'TASK', title: 'Step 1', targetDepartment: 'dept-secops', dependsOnTaskId: 'ghost-node' },
    ]);
    assert.strictEqual(brokenGraph.isValid, false);
    assert.ok(brokenGraph.errors.some((err) => /non-existent/i.test(err)));
  });

  await t.test('2. Multi-Node Graph Orchestration & Launch', () => {
    resetDb();
    const beforeTicketCount = db.data.tickets.length;

    const result = GraphOrchestratorService.launchGraph({
      title: 'SWIFT Core Payment Gateway Upgrade',
      description: 'End-to-end multi-department banking upgrade with approval gates and parallel fanout.',
      nodes: [
        {
          id: 'node-sec-review',
          type: 'TASK',
          title: 'AppSec SAST & DAST Code Review',
          targetDepartment: 'dept-secops',
          technicalSeverity: 'HIGH',
          businessPriority: 'P2_HIGH',
          category: 'SECURITY_REVIEW',
          durationDays: 2,
        },
        {
          id: 'node-infra-build',
          type: 'TASK',
          title: 'Deploy High-Availability K8s Cluster',
          targetDepartment: 'dept-it',
          teamId: 'team-it-infra',
          technicalSeverity: 'HIGH',
          businessPriority: 'P2_HIGH',
          category: 'GENERAL_REQUEST',
          durationDays: 3,
        },
        {
          id: 'node-ciso-approval',
          type: 'APPROVAL',
          title: 'CISO Dual-Control Production Sign-off Gate',
          targetDepartment: 'dept-secops',
          technicalSeverity: 'CRITICAL',
          businessPriority: 'P1_URGENT',
          category: 'SECURITY_EXCEPTION',
          approvalMode: 'ANY_ONE',
          durationDays: 1,
        },
      ],
      edges: [
        {
          id: 'edge-1',
          fromNodeId: 'node-sec-review',
          toNodeId: 'node-ciso-approval',
          type: 'FINISH_TO_START',
          lagDays: 0,
        },
        {
          id: 'edge-2',
          fromNodeId: 'node-infra-build',
          toNodeId: 'node-ciso-approval',
          type: 'FINISH_TO_START',
          lagDays: 0,
        },
      ],
      actor: adminActor,
      projectCode: 'SEC',
    });

    assert.strictEqual(result.replayed, false);
    assert.strictEqual(result.tickets.length, 3);
    assert.strictEqual(result.approvals.length, 1);
    assert.strictEqual(result.dependencies.length, 2);
    assert.strictEqual(db.data.tickets.length, beforeTicketCount + 3);

    // Verify approval gate record
    const gateApproval = result.approvals[0];
    assert.ok(gateApproval.id.startsWith('appr-'));
    assert.strictEqual(gateApproval.status, 'PENDING');
    assert.strictEqual(gateApproval.steps.length, 1);
  });

  await t.test('3. Deterministic Priority Matrix (Impact + Urgency -> Priority)', () => {
    assert.strictEqual(calculatePriorityFromImpactUrgency('CATASTROPHIC', 'CRITICAL'), 'P1_URGENT');
    assert.strictEqual(calculatePriorityFromImpactUrgency('CATASTROPHIC', 'HIGH'), 'P1_URGENT');
    assert.strictEqual(calculatePriorityFromImpactUrgency('SIGNIFICANT', 'HIGH'), 'P2_HIGH');
    assert.strictEqual(calculatePriorityFromImpactUrgency('SIGNIFICANT', 'MEDIUM'), 'P2_HIGH');
    assert.strictEqual(calculatePriorityFromImpactUrgency('MODERATE', 'MEDIUM'), 'P3_MEDIUM');
    assert.strictEqual(calculatePriorityFromImpactUrgency('MINOR', 'LOW'), 'P4_LOW');
    assert.strictEqual(calculatePriorityFromImpactUrgency('NEGLIGIBLE', 'LOW'), 'P4_LOW');
  });

  await t.test('4. Business Calendar SLA Calculations (8x5 vs 24x7)', () => {
    const calendar8x5 = SLAService.defaultBusinessCalendar;

    // Monday 10:00 UTC + 120 min => Monday 12:00 UTC
    const mondayMorning = new Date('2026-08-24T10:00:00.000Z');
    const deadline1 = SLAService.calculateBusinessDeadline(mondayMorning, 120, calendar8x5);
    assert.strictEqual(deadline1.toISOString(), '2026-08-24T12:00:00.000Z');

    // Friday 17:00 UTC + 120 min (only 1 hr left on Friday) => skips weekend => Monday 10:00 UTC
    const fridayEvening = new Date('2026-08-28T17:00:00.000Z');
    const deadline2 = SLAService.calculateBusinessDeadline(fridayEvening, 120, calendar8x5);
    assert.strictEqual(deadline2.toISOString(), '2026-08-31T10:00:00.000Z');
  });

  await t.test('5. Dynamic Approver Resolution & Quorum Modes', () => {
    resetDb();
    const testTicket = db.data.tickets[0];

    // Resolver: REQUESTER_MANAGER
    const managers = ApprovalService.resolveApprovers('REQUESTER_MANAGER', testTicket);
    assert.ok(managers.length >= 1, 'Must resolve at least one manager');

    // Resolver: CAB_BOARD
    const cab = ApprovalService.resolveApprovers('CAB_BOARD', testTicket);
    assert.ok(cab.some((u) => u.roles.includes('CISO') || u.roles.includes('PLATFORM_ADMIN')), 'CAB must include CISO/Admin');
  });

  await t.test('6. Template Cloning & Version Management', () => {
    resetDb();
    const allTemplates = WorkflowTemplateService.list(adminActor);
    assert.ok(allTemplates.length > 0);

    const source = allTemplates[0];
    const cloned = WorkflowTemplateService.clone(source.id, regularActor);

    assert.strictEqual(cloned.scope, 'PERSONAL');
    assert.strictEqual(cloned.status, 'DRAFT');
    assert.strictEqual(cloned.ownerId, regularActor.id);
    assert.ok(cloned.title.includes('(Copy)'));
  });
});
