import assert from 'node:assert/strict';
import test from 'node:test';
import { OutboxService } from '../server/services/outbox.service.js';
import { PlatformSchedulerService } from '../server/services/platform-scheduler.service.js';
import { CortexInventorySchedulerService } from '../server/services/cortex-inventory-scheduler.service.js';

test('scheduler stages durable SLA, threat-governance and workflow ticks with a common minute bucket', async (t) => {
  // This is an outbox staging unit test; connector scheduling has separate DB tests.
  const cortex = t.mock.method(CortexInventorySchedulerService,'enqueueDue',async () => 0);
  OutboxService.clearForTests();
  await PlatformSchedulerService.emitPeriodicTicks(new Date('2026-08-26T10:15:35.000Z'));

  const events = OutboxService.pending();
  assert.deepEqual(events.map((event) => event.topic).sort(), [
    'sla.tick',
    'threat-governance.tick',
    'workflow.runtime.tick',
    'workflow.schedule.tick',
  ]);
  assert.deepEqual(new Set(events.map((event) => event.aggregateId)), new Set(['2026-08-26T10:15']));
  assert.equal(new Set(events.map((event) => event.correlationId)).size, 4);
  assert.equal(cortex.mock.callCount(),1);
  OutboxService.clearForTests();
});
