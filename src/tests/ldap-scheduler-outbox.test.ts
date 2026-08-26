import assert from 'node:assert/strict';
import test from 'node:test';
import { OutboxService } from '../server/services/outbox.service.js';
import { LDAPSchedulerService } from '../server/services/ldap-scheduler.service.js';

test('LDAP scheduler stages a durable command instead of performing LDAP I/O', async () => {
  OutboxService.clearForTests();
  await LDAPSchedulerService.enqueueSync('SCHEDULED_DAILY_CHECK');
  const [event] = OutboxService.pending();
  assert.equal(event.topic, 'ldap.sync.requested');
  assert.equal(event.payload.trigger, 'SCHEDULED_DAILY_CHECK');
  assert.match(event.correlationId || '', /^ldap:SCHEDULED_DAILY_CHECK:\d{4}-\d{2}-\d{2}$/);
  OutboxService.clearForTests();
});
