import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { db } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';
import { WorkflowTemplateService } from '../server/services/workflow-template.service.js';

test('Backend-owned workflow templates', async (t) => {
  const databasePath = path.resolve(process.cwd(), 'data/database.json');
  const originalDatabase = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
  t.after(() => { db.data = originalDatabase; db.persist(); });
  db.reset(JSON.parse(JSON.stringify(initialSeedData)));
  const actor = db.data.users.find((user) => user.roles.includes('CISO'))!;

  await t.test('catalog and create-work metadata come from persisted backend configuration', () => {
    const templates = WorkflowTemplateService.list();
    const metadata = WorkflowTemplateService.metadata();
    assert.strictEqual(templates.length, db.data.blueprints.filter((item) => item.isActive !== false).length);
    assert.deepStrictEqual(
      metadata.departments.map((item) => item.id),
      db.data.departments.filter((item) => item.isActive !== false && item.directorySource === 'ACTIVE_DIRECTORY').map((item) => item.id)
    );
    assert.deepStrictEqual(metadata.slaPolicies.map((item) => item.id), db.data.slaPolicies.map((item) => item.id));
    assert.ok(templates.every((item) => item.defaultTasks.every((task: any) => task.departmentName)));
  });

  await t.test('preview resolves configured assignees and validates routing without writes', () => {
    const template = db.data.blueprints.find((item) => item.id === 'bp-cross-onboarding')!;
    const before = db.data.tickets.length;
    const preview = WorkflowTemplateService.preview(template);
    assert.strictEqual(preview.tasks.length, template.defaultTasks.length);
    assert.strictEqual(preview.tasks[0].assigneeId, 'usr-ciso');
    assert.strictEqual(preview.tasks[1].dependsOnTaskId, template.defaultTasks[0].id);
    assert.strictEqual(db.data.tickets.length, before);
  });

  await t.test('launch creates an auditable run, tickets, SLA metrics and dependency edges atomically', () => {
    const template = db.data.blueprints.find((item) => item.id === 'bp-cross-onboarding')!;
    const beforeTickets = db.data.tickets.length;
    const beforeDependencies = db.data.ganttDependencies.length;
    const result = WorkflowTemplateService.launchStored(template.id, { parameters: { subject: 'Aysel Mammadova — Treasury Analyst' }, idempotencyKey: 'workflow-test-idempotency-key' }, actor);
    assert.strictEqual(result.tickets.length, template.defaultTasks.length);
    assert.strictEqual(db.data.tickets.length, beforeTickets + template.defaultTasks.length);
    assert.strictEqual(db.data.ganttDependencies.length, beforeDependencies + template.defaultTasks.length - 1);
    assert.deepStrictEqual(result.tickets.map((ticket) => ticket.assigneeId), template.defaultTasks.map((task) => task.assigneeId));
    assert.ok(db.data.workflowRuns.some((run) => run.id === result.run.id && run.createdTicketIds.length === template.defaultTasks.length));
    assert.ok(result.tickets.every((ticket) => db.data.ticketSlaInstances.some((metric) => metric.ticketId === ticket.id)));
    assert.ok(WorkflowTemplateService.listRuns(actor).some((run) => run.id === result.run.id && run.tickets.length === template.defaultTasks.length));

    const replay = WorkflowTemplateService.launchStored(template.id, { parameters: { subject: 'Aysel Mammadova — Treasury Analyst' }, idempotencyKey: 'workflow-test-idempotency-key' }, actor);
    assert.strictEqual(replay.replayed, true);
    assert.strictEqual(db.data.tickets.length, beforeTickets + template.defaultTasks.length);
  });

  await t.test('invalid references and dependency cycles fail before partial writes', () => {
    const beforeTickets = db.data.tickets.length;
    assert.throws(() => WorkflowTemplateService.launchCustom({
      title: 'Cyclic security change', description: 'Must never create partial tasks.',
      tasks: [
        { id: 'one', title: 'First controlled step', description: 'First', targetDepartment: 'dept-secops', assigneeId: 'usr-ciso', technicalSeverity: 'HIGH', businessPriority: 'P2_HIGH', category: 'SECURITY_REVIEW', durationDays: 1, offsetDays: 0, dependsOnTaskId: 'two', tags: [] },
        { id: 'two', title: 'Second controlled step', description: 'Second', targetDepartment: 'dept-secops', assigneeId: 'usr-ciso', technicalSeverity: 'HIGH', businessPriority: 'P2_HIGH', category: 'SECURITY_REVIEW', durationDays: 1, offsetDays: 0, dependsOnTaskId: 'one', tags: [] },
      ],
    }, actor), /cycle/i);
    assert.strictEqual(db.data.tickets.length, beforeTickets);

    assert.throws(() => WorkflowTemplateService.launchCustom({
      title: 'Wrong department routing', description: 'Must reject an invalid assignee.',
      tasks: [{ id: 'one', title: 'Department controlled step', description: 'Validation', targetDepartment: 'dept-hr', assigneeId: 'usr-nonexistent-999', technicalSeverity: 'HIGH', businessPriority: 'P2_HIGH', category: 'SECURITY_REVIEW', durationDays: 1, offsetDays: 0, tags: [] }],
    }, actor), /assignee|inactive|missing/i);
    assert.strictEqual(db.data.tickets.length, beforeTickets);
  });

  await t.test('template scopes and role-based creation permissions', () => {
    const regularUser: any = {
      id: 'usr-guest-user',
      username: 'guest.user',
      sAMAccountName: 'guest.user',
      email: 'guest.user@expressbank.az',
      fullName: 'Guest Analyst',
      roles: ['REQUESTER'],
      departmentId: 'dept-secops',
      divisionId: 'div-sec',
      teamIds: [],
      securityClearance: 'INTERNAL',
      ownedApplicationIds: [],
      ownedAssetIds: [],
      ownedRiskIds: [],
      distributionGroups: [],
      isActive: true,
    };
    const adminUser = db.data.users.find((user) => user.roles.includes('CISO')) || actor;

    // 1. Verify scopes on seeded templates
    const allTemplates = WorkflowTemplateService.list(adminUser);
    const companyTemplates = allTemplates.filter((item) => item.scope === 'COMPANY');
    const deptTemplates = allTemplates.filter((item) => item.scope === 'DEPARTMENT');
    const personalTemplates = allTemplates.filter((item) => item.scope === 'PERSONAL');

    assert.ok(companyTemplates.length >= 2, 'Should have at least 2 company templates');
    assert.ok(deptTemplates.length >= 2, 'Should have at least 2 department templates');
    assert.ok(personalTemplates.length >= 2, 'Should have at least 2 personal templates');

    // 2. Non-admin cannot create Company template
    assert.throws(() => {
      WorkflowTemplateService.create({
        title: 'Unauthorized Enterprise Workflow',
        scope: 'COMPANY',
        description: 'Should fail due to missing role',
        defaultTasks: [{
          title: 'Step 1',
          description: 'Step 1',
          targetDepartment: 'dept-secops',
          assigneeId: 'usr-ciso',
          technicalSeverity: 'HIGH',
          businessPriority: 'P2_HIGH',
          category: 'SECURITY_REVIEW',
          durationDays: 1,
          offsetDays: 0,
          tags: [],
        }],
      }, regularUser);
    }, /Company template creation requires Platform Admin/i);

    // 3. Non-admin cannot create Department template
    assert.throws(() => {
      WorkflowTemplateService.create({
        title: 'Unauthorized Department Workflow',
        scope: 'DEPARTMENT',
        description: 'Should fail due to missing role',
        departmentId: 'dept-secops',
        defaultTasks: [{
          title: 'Step 1',
          description: 'Step 1',
          targetDepartment: 'dept-secops',
          assigneeId: 'usr-ciso',
          technicalSeverity: 'HIGH',
          businessPriority: 'P2_HIGH',
          category: 'SECURITY_REVIEW',
          durationDays: 1,
          offsetDays: 0,
          tags: [],
        }],
      }, regularUser);
    }, /Department template creation requires Department Admin/i);

    // 4. Any authenticated user can create a Personal template
    const createdPersonal = WorkflowTemplateService.create({
      title: 'AppSec Quick Triage Checklist',
      shortName: 'AppSec Quick Triage',
      scope: 'PERSONAL',
      domain: 'Application Security',
      description: 'Personal rapid review template',
      iconName: 'Zap',
      defaultTasks: [{
        title: 'Review Container Vulnerability Scan',
        description: 'Check CVE reports in Harbor register',
        targetDepartment: 'dept-secops',
        assigneeId: 'usr-ciso',
        technicalSeverity: 'HIGH',
        businessPriority: 'P2_HIGH',
        category: 'VULNERABILITY',
        durationDays: 1,
        offsetDays: 0,
        tags: ['PERSONAL', 'APPSEC'],
      }],
    }, regularUser);

    assert.strictEqual(createdPersonal.scope, 'PERSONAL');
    assert.strictEqual(createdPersonal.ownerId, regularUser.id);
    assert.strictEqual(createdPersonal.taskCount, 1);

    // 5. Admin can create a Company template
    const createdCompany = WorkflowTemplateService.create({
      title: 'Executive Board Security Review Pipeline',
      shortName: 'Board Security Review',
      scope: 'COMPANY',
      domain: 'Governance',
      description: 'Company-wide quarterly review',
      iconName: 'Building2',
      defaultTasks: [{
        title: 'Compile CISO Quarterly Deck',
        description: 'Generate risk heatmaps and KPI metrics',
        targetDepartment: 'dept-secops',
        assigneeId: 'usr-ciso',
        technicalSeverity: 'MEDIUM',
        businessPriority: 'P2_HIGH',
        category: 'SECURITY_REVIEW',
        durationDays: 3,
        offsetDays: 0,
        tags: ['EXECUTIVE', 'BOARD'],
      }],
    }, adminUser);

    assert.strictEqual(createdCompany.scope, 'COMPANY');
    assert.strictEqual(createdCompany.isCrossDepartment, true);
  });

  await t.test('unassigned template tasks route to department queue with undefined assignee and are claimable by department members', () => {
    const unassignedTemplate = WorkflowTemplateService.create({
      title: 'Department Queue Operational Review',
      shortName: 'Dept Queue Review',
      scope: 'PERSONAL',
      domain: 'Operational Security',
      description: 'Review template without explicit assignee',
      iconName: 'Workflow',
      defaultTasks: [{
        id: 'step-queue-1',
        title: 'Unassigned Internal Audit Step',
        description: 'Members of Internal Audit can claim this task',
        targetDepartment: 'dept-secops',
        technicalSeverity: 'MEDIUM',
        businessPriority: 'P2_HIGH',
        category: 'SECURITY_REVIEW',
        durationDays: 2,
        offsetDays: 0,
        tags: ['QUEUE_CLAIM'],
      }],
    }, actor);

    const preview = WorkflowTemplateService.preview(unassignedTemplate);
    assert.strictEqual(preview.tasks[0].assigneeId, undefined);
    assert.ok(preview.tasks[0].assigneeName.includes('növbəsi'));

    const launchResult = WorkflowTemplateService.launchStored(unassignedTemplate.id, { parameters: {} }, actor);
    assert.strictEqual(launchResult.tickets.length, 1);
    const createdTicket = launchResult.tickets[0];
    assert.strictEqual(createdTicket.assigneeId, undefined);
    assert.strictEqual(createdTicket.targetDepartmentId, 'dept-secops');
  });
});
