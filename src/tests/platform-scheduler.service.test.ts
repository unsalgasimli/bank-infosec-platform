import assert from 'node:assert/strict';
import test from 'node:test';
import { OutboxService } from '../server/services/outbox.service.js';
import { PlatformSchedulerService } from '../server/services/platform-scheduler.service.js';

test('scheduler stages durable SLA and workflow ticks with a common minute bucket', async () => {
  OutboxService.clearForTests();
  await PlatformSchedulerService.emitPeriodicTicks(new Date('2026-08-26T10:15:35.000Z'));

  const events = OutboxService.pending();
  assert.deepEqual(events.map((event) => event.topic).sort(), [
    'sla.tick',
    'workflow.runtime.tick',
    'workflow.schedule.tick',
  ]);
  assert.deepEqual(new Set(events.map((event) => event.aggregateId)), new Set(['2026-08-26T10:15']));
  assert.equal(new Set(events.map((event) => event.correlationId)).size, 3);
  OutboxService.clearForTests();
});
