import type { QueryResultRow } from 'pg';
import { config } from '../config/index.js';
import { pgClient } from '../db/postgres/client.js';
import { errorLogFields, logger } from './logger.service.js';
import { QueueService } from './queue.service.js';
import type { OutboxEvent } from './outbox.service.js';

type OutboxRow = QueryResultRow & { id: string; topic: string; aggregate_type: string; aggregate_id: string; payload: Record<string, unknown>; correlation_id: string | null; occurred_at: Date };

export class OutboxRelayService {
  private static timer: NodeJS.Timeout | undefined;
  private static running = false;

  public static start(): void {
    if (!QueueService.enabled() || this.timer) return;
    const poll = () => void this.relayOnce().catch((error) => logger.error({ ...errorLogFields(error) }, 'Outbox relay cycle failed'));
    poll();
    this.timer = setInterval(poll, config.OUTBOX_RELAY_INTERVAL_MS);
    this.timer.unref?.();
    logger.info({ intervalMs: config.OUTBOX_RELAY_INTERVAL_MS }, 'Transactional outbox relay started');
  }

  public static stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  public static async relayOnce(): Promise<number> {
    if (!QueueService.enabled() || this.running) return 0;
    this.running = true;
    try {
      const rows = await pgClient.transaction(async (client) => {
        const claimed = await client.query<OutboxRow>(`
          WITH candidates AS (
            SELECT id FROM outbox_events
            WHERE (status = 'PENDING' AND available_at <= NOW())
               OR (status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '5 minutes')
            ORDER BY occurred_at
            FOR UPDATE SKIP LOCKED
            LIMIT $1
          )
          UPDATE outbox_events event
          SET status = 'PROCESSING', locked_at = NOW(), attempts = event.attempts + 1
          FROM candidates
          WHERE event.id = candidates.id
          RETURNING event.id, event.topic, event.aggregate_type, event.aggregate_id, event.payload, event.correlation_id, event.occurred_at
        `, [config.OUTBOX_RELAY_BATCH_SIZE]);
        return claimed.rows;
      });
      for (const row of rows) {
        const event: OutboxEvent = { id: row.id, topic: row.topic, aggregateType: row.aggregate_type, aggregateId: row.aggregate_id, payload: row.payload || {}, correlationId: row.correlation_id || undefined, occurredAt: new Date(row.occurred_at).toISOString() };
        try {
          await QueueService.publish(event);
          await pgClient.query("UPDATE outbox_events SET status='PUBLISHED', published_at=NOW(), locked_at=NULL, last_error=NULL WHERE id=$1", [row.id]);
        } catch (error: any) {
          await pgClient.query("UPDATE outbox_events SET status='PENDING', locked_at=NULL, available_at=NOW() + INTERVAL '30 seconds', last_error=$2 WHERE id=$1", [row.id, String(error?.message || error).slice(0, 2000)]);
          throw error;
        }
      }
      return rows.length;
    } finally {
      this.running = false;
    }
  }
}
