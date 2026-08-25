import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminController } from '../server/controllers/assets.controller.js';
import { db } from '../server/db/database.js';

function mockReqRes(body: any = {}, params: any = {}) {
  const req: any = {
    body,
    params,
    user: db.data.users[0],
    ip: '127.0.0.1',
    correlationId: 'req-sla-test',
    get: () => 'sla-policy-test',
  };
  let statusCode = 200;
  let responseData: any;
  const res: any = {
    status(code: number) { statusCode = code; return res; },
    json(data: any) { responseData = data; return res; },
    getStatus: () => statusCode,
    getData: () => responseData,
  };
  return { req, res };
}

const thresholds = Object.fromEntries(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'].map((severity) => [severity, {
  acknowledgmentMinutes: 15,
  firstResponseMinutes: 30,
  remediationMinutes: 120,
  resolutionMinutes: 240,
}])) as Record<string, Record<string, number>>;

test('admin SLA policy CRUD validates, persists in the runtime projection, and archives safely', () => {
  const originalPolicies = db.data.slaPolicies;
  const originalAuditEvents = db.data.auditEvents;
  try {
    const create = mockReqRes({
      name: 'CRUD Smoke SLA',
      description: 'Temporary policy used by the controller contract test.',
      isActive: true,
      isDefault: false,
      businessHoursOnly: true,
      businessStartTime: '09:00',
      businessEndTime: '18:00',
      timezone: 'Asia/Baku',
      excludeWeekends: true,
      excludeHolidays: true,
      thresholds,
    });
    AdminController.createSlaPolicy(create.req, create.res);
    assert.equal(create.res.getStatus(), 201);
    const created = create.res.getData().policy;
    assert.equal(created.name, 'CRUD Smoke SLA');
    assert.ok(db.data.slaPolicies.some((policy) => policy.id === created.id));

    const update = mockReqRes({ ...created, name: 'CRUD Smoke SLA Updated', description: 'Updated.' }, { id: created.id });
    AdminController.updateSlaPolicy(update.req, update.res);
    assert.equal(update.res.getStatus(), 200);
    assert.equal(update.res.getData().policy.name, 'CRUD Smoke SLA Updated');

    const remove = mockReqRes({}, { id: created.id });
    AdminController.deleteSlaPolicy(remove.req, remove.res);
    assert.equal(remove.res.getStatus(), 200);
    assert.equal(remove.res.getData().policy.isActive, false);

    const invalid = mockReqRes({ name: 'Invalid SLA', timezone: 'Asia/Baku', thresholds: {} });
    AdminController.createSlaPolicy(invalid.req, invalid.res);
    assert.equal(invalid.res.getStatus(), 400);
  } finally {
    db.data.slaPolicies = originalPolicies;
    db.data.auditEvents = originalAuditEvents;
  }
});
