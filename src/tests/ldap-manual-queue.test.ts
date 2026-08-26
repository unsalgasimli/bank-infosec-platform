import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthController } from '../server/controllers/auth.controller.js';
import { OutboxService } from '../server/services/outbox.service.js';

test('manual LDAP sync returns 202 and stages a worker job', async () => {
  OutboxService.clearForTests();
  const response: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };

  await AuthController.triggerLdapSync({ user: { id: 'usr-admin', username: 'admin' } } as any, response);

  assert.equal(response.statusCode, 202);
  assert.equal(response.body.success, true);
  assert.equal(response.body.queued, true);
  const [event] = OutboxService.pending();
  assert.equal(event.topic, 'ldap.sync.requested');
  assert.equal(event.payload.trigger, 'MANUAL_TRIGGER');
  assert.equal(event.payload.actorId, 'usr-admin');
  OutboxService.clearForTests();
});
