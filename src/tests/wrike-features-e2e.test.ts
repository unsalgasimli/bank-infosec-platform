import test from 'node:test';
import assert from 'node:assert';
import { db } from '../server/db/database.js';
import { WrikeController } from '../server/controllers/wrike.controller.js';
import { TicketsController } from '../server/controllers/tickets.controller.js';
import { ApprovalsController } from '../server/controllers/approvals.controller.js';
import { DashboardsController } from '../server/controllers/dashboards.controller.js';
import { AssetsController, RisksController, KBController } from '../server/controllers/assets.controller.js';
import { AuthController } from '../server/controllers/auth.controller.js';
import { HealthController } from '../server/controllers/health.controller.js';
import { NotificationsController } from '../server/controllers/notifications.controller.js';
import { pgClient } from '../server/db/postgres/client.js';
import { cacheService } from '../server/services/cache.service.js';
import { initialSeedData } from '../server/db/seed.js';

// Mock Express Request & Response helper
function mockReqRes(body: any = {}, params: any = {}, query: any = {}, user: any = null) {
  const defaultUser = user || db.data.users[0]; // CISO user
  const req: any = {
    body,
    params,
    query,
    user: defaultUser,
    headers: { 'user-agent': 'E2E-Test-Agent' },
    ip: '127.0.0.1',
  };

  let statusCode = 200;
  let responseData: any = null;

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    },
    getStatus: () => statusCode,
    getData: () => responseData,
  };

  return { req, res };
}

test('🛡️ WRIKE PRODUCTION BACKEND COMPREHENSIVE E2E VERIFICATION', async (t) => {
  const originalDatabase = structuredClone(db.data);
  t.after(async () => {
    db.data = originalDatabase;
    db.persist();
    await Promise.all([pgClient.close(), cacheService.close()]);
  });
  const cisoUser = db.data.users.find((u) => u.roles.includes('CISO')) || db.data.users[0];
  const socLead = db.data.users.find((u) => u.roles.includes('TEAM_LEAD')) || db.data.users[1] || cisoUser;

  // ----------------------------------------------------
  // 1. Health & Observability
  // ----------------------------------------------------
  await t.test('1. Health Checks & Observability Endpoints', async () => {
    const { req, res } = mockReqRes();
    HealthController.getLiveness(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.strictEqual(res.getData().status, 'UP');

    const readyReqRes = mockReqRes();
    await HealthController.getReadiness(readyReqRes.req, readyReqRes.res);
    assert.ok(readyReqRes.res.getStatus() === 200 || readyReqRes.res.getStatus() === 503);
    assert.ok(readyReqRes.res.getData().status);
  });

  // ----------------------------------------------------
  // 2. Wrike Ideate & Brainstorming Canvas
  // ----------------------------------------------------
  let createdIdeaId = '';
  let convertedTicketKey = '';

  await t.test('2.1. Ideate Canvas: List Idea Nodes', async () => {
    const { req, res } = mockReqRes();
    await WrikeController.listIdeas(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(res.getData().success);
    assert.ok(Array.isArray(res.getData().ideas));
    assert.ok(res.getData().ideas.length > 0);
  });

  await t.test('2.2. Ideate Canvas: Create New Sticky Note (Persisted)', async () => {
    const { req, res } = mockReqRes(
      {
        title: 'Zero Trust Micro-segmentation on Core Payment Gateways',
        description: 'Deploy eBPF security policies between SWIFT gateway and Oracle DB.',
        category: 'ZERO_TRUST',
        color: 'blue',
        x: 250,
        y: 180,
        priority: 'P1_URGENT',
        tags: ['ZERO_TRUST', 'SWIFT', 'E2E_TEST'],
      },
      {},
      {},
      cisoUser
    );

    await WrikeController.createIdea(req, res);
    assert.strictEqual(res.getStatus(), 201);
    assert.ok(res.getData().success);
    assert.strictEqual(res.getData().idea.title, 'Zero Trust Micro-segmentation on Core Payment Gateways');
    createdIdeaId = res.getData().idea.id;

    // Verify persisted in db
    const found = db.data.ideas.find((i) => i.id === createdIdeaId);
    assert.ok(found);
    assert.strictEqual(found?.status, 'IDEA');
  });

  await t.test('2.3. Ideate Canvas: 1-Click Convert Idea to Real Ticket', async () => {
    const { req, res } = mockReqRes({}, { id: createdIdeaId }, {}, cisoUser);
    await WrikeController.convertIdeaToTask(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(res.getData().success);
    assert.ok(res.getData().ticket);
    assert.strictEqual(res.getData().idea.status, 'CONVERTED');

    convertedTicketKey = res.getData().ticket.key;
    assert.ok(convertedTicketKey.startsWith('SEC-'));

    // Verify ticket exists in tickets list and audit log exists
    const ticketInDb = db.data.tickets.find((t) => t.key === convertedTicketKey);
    assert.ok(ticketInDb);
    assert.strictEqual(ticketInDb?.title, 'Zero Trust Micro-segmentation on Core Payment Gateways');
  });

  // ----------------------------------------------------
  // 3. Wrike Gantt Chart & Schedule
  // ----------------------------------------------------
  await t.test('3.1. Gantt Chart: Schedule & Critical Path Calculation', async () => {
    const { req, res } = mockReqRes();
    await WrikeController.getGanttSchedule(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(res.getData().success);
    assert.ok(Array.isArray(res.getData().tasks));
    assert.ok(Array.isArray(res.getData().criticalPathTaskIds));
    assert.ok(res.getData().criticalPathTaskIds.length > 0);
  });

  await t.test('3.2. Gantt Chart: Add Task Dependency Link', async () => {
    const { req, res } = mockReqRes({
      fromTaskId: 'tick-soc-101',
      toTaskId: 'tick-appsec-102',
      type: 'FINISH_TO_START',
    });
    await WrikeController.addGanttDependency(req, res);
    assert.strictEqual(res.getStatus(), 201);
    assert.ok(res.getData().success);
    assert.strictEqual(res.getData().dependency.fromTaskId, 'tick-soc-101');
  });

  // ----------------------------------------------------
  // 4. Wrike Workload & Resource Capacity
  // ----------------------------------------------------
  await t.test('4.1. Workload: Dynamic Calculation of Team Hours', async () => {
    const { req, res } = mockReqRes();
    await WrikeController.getWorkload(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(res.getData().success);
    assert.ok(Array.isArray(res.getData().members));
    assert.ok(res.getData().totalTeamCapacityHours > 0);
  });

  await t.test('4.2. Workload: 1-Click Task Rebalancing', async () => {
    const ticket = db.data.tickets[0];
    const { req, res } = mockReqRes(
      {
        fromUserId: cisoUser.id,
        toUserId: socLead.id,
        ticketId: ticket.id,
      },
      {},
      {},
      cisoUser
    );

    await WrikeController.rebalanceWorkload(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(res.getData().success);
    assert.strictEqual(res.getData().ticket.assigneeId, socLead.id);
  });

  // ----------------------------------------------------
  // 5. Wrike Dynamic Request Forms & Intake
  // ----------------------------------------------------
  await t.test('5.1. Request Forms: List Available Form Definitions', async () => {
    const { req, res } = mockReqRes();
    await WrikeController.listRequestForms(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(res.getData().success);
    assert.ok(Array.isArray(res.getData().forms));
    assert.ok(res.getData().forms.length >= 4);
  });

  await t.test('5.2. Request Forms: Submit Form & Auto-Create Ticket', async () => {
    const { req, res } = mockReqRes(
      {
        values: {
          title: 'Emergency Port 443 Firewall Whitelist for Central Bank API',
          targetSystem: 'Perimeter DC1 Gateway Firewall',
          urgency: 'EMERGENCY',
          durationDays: '7',
          justification: 'Mandatory Central Bank audit connectivity requirement.',
        },
      },
      { id: 'form-exception' },
      {},
      socLead
    );

    await WrikeController.submitRequestForm(req, res);
    assert.strictEqual(res.getStatus(), 201);
    assert.ok(res.getData().success);
    assert.ok(res.getData().ticket);
    assert.strictEqual(res.getData().ticket.technicalSeverity, 'CRITICAL');
    assert.strictEqual(res.getData().ticket.businessPriority, 'P1_URGENT');
  });

  // ----------------------------------------------------
  // 6. Wrike Automations & Blueprints
  // ----------------------------------------------------
  await t.test('6.1. Automations: List Active Rules', async () => {
    const { req, res } = mockReqRes();
    await WrikeController.listAutomations(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(res.getData().success);
    assert.ok(Array.isArray(res.getData().rules));
    assert.ok(res.getData().rules.length >= 4);
  });

  await t.test('6.2. Blueprints: Launch Turnkey Project Blueprint', async () => {
    const { req, res } = mockReqRes(
      { parameters: { subject: 'SWIFT 2026.08 production release' }, idempotencyKey: 'wrike-e2e-swift-launch-0001' },
      { id: 'bp-cross-swift' },
      {},
      cisoUser
    );
    await WrikeController.launchBlueprint(req, res);
    assert.strictEqual(res.getStatus(), 201);
    assert.ok(res.getData().success);
    assert.ok(Array.isArray(res.getData().createdTickets));
    assert.ok(res.getData().createdTickets.length >= 3);
  });

  // ----------------------------------------------------
  // 7. Wrike Collaborate & Proofing
  // ----------------------------------------------------
  await t.test('7.1. Proofing: List Documents & Annotations', async () => {
    const { req, res } = mockReqRes();
    await WrikeController.listProofingDocuments(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(res.getData().success);
    assert.ok(Array.isArray(res.getData().documents));
    assert.ok(res.getData().documents.length > 0);
  });

  await t.test('7.2. Proofing: Add Pin Annotation to Coordinates', async () => {
    const docId = db.data.proofingDocuments[0].id;
    const { req, res } = mockReqRes(
      {
        x: 52,
        y: 48,
        comment: 'Verify IPS sensor inline inspection mode on SWIFT subnet.',
      },
      { id: docId },
      {},
      cisoUser
    );

    await WrikeController.addProofingAnnotation(req, res);
    assert.strictEqual(res.getStatus(), 201);
    assert.ok(res.getData().success);
    assert.strictEqual(res.getData().annotation.comment, 'Verify IPS sensor inline inspection mode on SWIFT subnet.');
  });

  await t.test('7.3. Proofing: CISO Cryptographic SHA-256 Sign-off', async () => {
    const docId = db.data.proofingDocuments[0].id;
    const { req, res } = mockReqRes({}, { id: docId }, {}, cisoUser);
    await WrikeController.signOffProofingDocument(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(res.getData().success);
    assert.ok(res.getData().signatureHash);
    assert.strictEqual(res.getData().document.isSignedOff, true);
  });

  // ----------------------------------------------------
  // 9. Real Notification Service & Controller
  // ----------------------------------------------------
  let createdNotifId = '';
  await t.test('9.1. Notifications: List Real User Notifications', () => {
    const { req, res } = mockReqRes({}, {}, {}, cisoUser);
    NotificationsController.list(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(res.getData().success);
    assert.ok(Array.isArray(res.getData().notifications));
    assert.ok(res.getData().notifications.length > 0);
    createdNotifId = res.getData().notifications[0].id;
  });

  await t.test('9.2. Notifications: Mark Single Notification As Read (DB Persisted)', () => {
    const { req, res } = mockReqRes({}, { id: createdNotifId }, {}, cisoUser);
    NotificationsController.markAsRead(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.strictEqual(res.getData().success, true);

    const updatedNotif = db.data.notifications.find((n) => n.id === createdNotifId);
    assert.ok(updatedNotif);
    assert.strictEqual(updatedNotif?.isRead, true);
  });

  await t.test('9.3. Notifications: Mark All Notifications As Read', () => {
    const { req, res } = mockReqRes({}, {}, {}, cisoUser);
    NotificationsController.markAllAsRead(req, res);
    assert.strictEqual(res.getStatus(), 200);
    assert.ok(res.getData().success);

    const unreadCount = db.data.notifications.filter((n) => n.userId === cisoUser.id && !n.isRead).length;
    assert.strictEqual(unreadCount, 0);
  });

  // ----------------------------------------------------
  // 10. Multi-Department Workflow & Task Graph Fanout
  // ----------------------------------------------------
  await t.test('10. Multi-Department Workflow: Fanout to HR, IT, DevSecOps & CISO with Dependencies', () => {
    const { req, res } = mockReqRes(
      {
        templateTitle: 'New Employee Onboarding: Aysel Aliyeva (Senior Payments Engineer)',
        description: 'Multi-department onboarding & clearance pipeline.',
        tasks: [
          {
            title: 'Step 1: HR Background & KYC Verification',
            targetDepartment: 'HR_LEGAL',
            assigneeId: cisoUser.id,
            technicalSeverity: 'MEDIUM',
            businessPriority: 'P2_HIGH',
            slaHours: 24,
            category: 'SECURITY_REVIEW',
            dependsOnIndex: null,
          },
          {
            title: 'Step 2: IT Active Directory & YubiKey Provisioning',
            targetDepartment: 'IT_OPERATIONS',
            assigneeId: socLead.id,
            technicalSeverity: 'HIGH',
            businessPriority: 'P2_HIGH',
            slaHours: 12,
            category: 'SECURITY_REVIEW',
            dependsOnIndex: 0,
          },
          {
            title: 'Step 3: CISO Security Policy Attestation',
            targetDepartment: 'CISO_EXECUTIVE',
            assigneeId: cisoUser.id,
            technicalSeverity: 'CRITICAL',
            businessPriority: 'P1_URGENT',
            slaHours: 4,
            category: 'SECURITY_REVIEW',
            dependsOnIndex: 1,
          },
        ],
      },
      {},
      {},
      cisoUser
    );

    TicketsController.createMultiTaskWorkflow(req, res);
    assert.strictEqual(res.getStatus(), 201);
    assert.ok(res.getData().success);
    assert.strictEqual(res.getData().tickets.length, 3);
    assert.strictEqual(res.getData().dependencies.length, 2);

    // Verify tasks are persisted in DB
    const step1 = db.data.tickets.find((t) => t.id === res.getData().tickets[0].id);
    const step2 = db.data.tickets.find((t) => t.id === res.getData().tickets[1].id);
    const step3 = db.data.tickets.find((t) => t.id === res.getData().tickets[2].id);
    assert.ok(step1 && step2 && step3);

    // Verify dependencies are in db.data.ganttDependencies
    const dep1 = db.data.ganttDependencies.find((d) => d.fromTaskId === step1.id && d.toTaskId === step2.id);
    const dep2 = db.data.ganttDependencies.find((d) => d.fromTaskId === step2.id && d.toTaskId === step3.id);
    assert.ok(dep1);
    assert.ok(dep2);
  });
});
