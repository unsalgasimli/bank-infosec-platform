import assert from 'node:assert/strict';
import test from 'node:test';
import { OutboxService } from '../server/services/outbox.service.js';

test('outbox staging keeps events until commit and rolls back only its transaction scope', () => {
  OutboxService.clearForTests();
  const before = OutboxService.checkpoint();
  const event = OutboxService.enqueue({
    topic: 'ticket.created',
    aggregateType: 'TICKET',
    aggregateId: 'tick-001',
    payload: { ticketId: 'tick-001', actorId: 'usr-001' },
  });
  assert.equal(OutboxService.pending().length, 1);
  OutboxService.rollbackTo(before);
  assert.equal(OutboxService.pending().length, 0);

  const committed = OutboxService.enqueue({
    topic: 'ticket.created',
    aggregateType: 'TICKET',
    aggregateId: 'tick-002',
    payload: { ticketId: 'tick-002', actorId: 'usr-001' },
  });
  assert.ok(committed.id.startsWith('out-'));
  OutboxService.markCommitted([committed.id]);
  assert.deepEqual(OutboxService.pending(), []);
  assert.notEqual(event.id, committed.id);
});
