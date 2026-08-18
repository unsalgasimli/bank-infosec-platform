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
    assert.deepStrictEqual(metadata.departments.map((item) => item.id), db.data.departments.filter((item) => item.isActive !== false).map((item) => item.id));
    assert.deepStrictEqual(metadata.slaPolicies.map((item) => item.id), db.data.slaPolicies.map((item) => item.id));
    assert.ok(templates.every((item) => item.defaultTasks.every((task: any) => task.departmentName)));
  });

  await t.test('preview resolves configured assignees and validates routing without writes', () => {
    const template = db.data.blueprints.find((item) => item.id === 'bp-cross-onboarding')!;
    const before = db.data.tickets.length;
    const preview = WorkflowTemplateService.preview(template);
    assert.strictEqual(preview.tasks.length, template.defaultTasks.length);
    assert.strictEqual(preview.tasks[0].assigneeId, 'usr-hr-lead');
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
        { id: 'one', title: 'First controlled step', description: 'First', targetDepartment: 'dept-secops', assigneeId: 'usr-soc-lead', technicalSeverity: 'HIGH', businessPriority: 'P2_HIGH', category: 'SECURITY_REVIEW', durationDays: 1, offsetDays: 0, dependsOnTaskId: 'two', tags: [] },
        { id: 'two', title: 'Second controlled step', description: 'Second', targetDepartment: 'dept-secops', assigneeId: 'usr-appsec-spec', technicalSeverity: 'HIGH', businessPriority: 'P2_HIGH', category: 'SECURITY_REVIEW', durationDays: 1, offsetDays: 0, dependsOnTaskId: 'one', tags: [] },
      ],
    }, actor), /cycle/i);
    assert.strictEqual(db.data.tickets.length, beforeTickets);

    assert.throws(() => WorkflowTemplateService.launchCustom({
      title: 'Wrong department routing', description: 'Must reject an assignee outside the target department.',
      tasks: [{ id: 'one', title: 'Department controlled step', description: 'Validation', targetDepartment: 'dept-hr', assigneeId: 'usr-appsec-spec', technicalSeverity: 'HIGH', businessPriority: 'P2_HIGH', category: 'SECURITY_REVIEW', durationDays: 1, offsetDays: 0, tags: [] }],
    }, actor), /explicit assignee/i);
    assert.strictEqual(db.data.tickets.length, beforeTickets);
  });
});
