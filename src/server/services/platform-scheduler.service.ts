import { config } from '../config/index.js';
import { db } from '../db/database.js';
import { logger } from './logger.service.js';
import { OutboxService } from './outbox.service.js';

/** Emits durable schedule ticks; it never executes ticket work in-process. */
export class PlatformSchedulerService {
  private static slaTimer: NodeJS.Timeout | undefined;
  private static slaInFlight = false;

  public static start(): void {
    if (this.slaTimer) return;
    const emit = () => void this.emitSlaTick().catch((error) => logger.error({ error }, 'SLA scheduler tick failed'));
    emit();
    this.slaTimer = setInterval(emit, config.SLA_SCHEDULER_INTERVAL_MS);
    this.slaTimer.unref?.();
    logger.info({ intervalMs: config.SLA_SCHEDULER_INTERVAL_MS }, 'Platform SLA scheduler started');
  }

  public static stop(): void {
    if (this.slaTimer) clearInterval(this.slaTimer);
    this.slaTimer = undefined;
  }

  public static async emitSlaTick(now = new Date()): Promise<void> {
    if (this.slaInFlight) return;
    this.slaInFlight = true;
    try {
      await db.initialize();
      // Bucketting makes an explicit replay easy to audit and keeps multiple
      // scheduler replicas from creating an unbounded number of identical jobs.
      const bucket = now.toISOString().slice(0, 16);
      OutboxService.enqueue({
        topic: 'sla.tick',
        aggregateType: 'SLA',
        aggregateId: bucket,
        payload: { scheduledAt: now.toISOString() },
        correlationId: `sla:${bucket}`,
      });
      db.persist();
      await db.flush();
    } finally {
      this.slaInFlight = false;
    }
  }
}
