import { config } from '../config/index.js';
import { db } from '../db/database.js';
import { logger } from './logger.service.js';
import { OutboxService } from './outbox.service.js';
import { CortexInventorySchedulerService } from './cortex-inventory-scheduler.service.js';

/** Emits durable schedule ticks; it never executes ticket work in-process. */
export class PlatformSchedulerService {
  private static slaTimer: NodeJS.Timeout | undefined;
  private static slaInFlight = false;

  public static start(): void {
    if (this.slaTimer) return;
    const emit = () => void this.emitPeriodicTicks().catch((error) => logger.error({ error }, 'Platform scheduler tick failed'));
    emit();
    this.slaTimer = setInterval(emit, config.SLA_SCHEDULER_INTERVAL_MS);
    this.slaTimer.unref?.();
    logger.info({ intervalMs: config.SLA_SCHEDULER_INTERVAL_MS }, 'Platform scheduler started');
  }

  public static stop(): void {
    if (this.slaTimer) clearInterval(this.slaTimer);
    this.slaTimer = undefined;
  }

  public static async emitPeriodicTicks(now = new Date()): Promise<void> {
    if (this.slaInFlight) return;
    this.slaInFlight = true;
    try {
      // Bucketting makes an explicit replay easy to audit and keeps multiple
      // scheduler replicas from creating an unbounded number of identical jobs.
      const bucket = now.toISOString().slice(0, 16);
      const scheduledAt = now.toISOString();
      for (const [topic, aggregateType] of [
        ['sla.tick', 'SLA'],
        ['workflow.schedule.tick', 'WORKFLOW_SCHEDULE'],
        ['workflow.runtime.tick', 'WORKFLOW_RUNTIME'],
      ] as const) {
        OutboxService.enqueue({
          topic,
          aggregateType,
          aggregateId: bucket,
          payload: { scheduledAt },
          correlationId: `${topic}:${bucket}`,
        });
      }
      db.persist();
      await db.flush();
      await CortexInventorySchedulerService.enqueueDue(now);
    } finally {
      this.slaInFlight = false;
    }
  }

  /** Backward-compatible explicit SLA tick entry point for operational tools. */
  public static async emitSlaTick(now = new Date()): Promise<void> {
    await this.emitPeriodicTicks(now);
  }
}
