import { config } from './config/index.js';
import { db } from './db/database.js';
import { pgClient } from './db/postgres/client.js';
import { runMigrations } from './db/postgres/migrate.js';
import { logger } from './services/logger.service.js';
import { OutboxRelayService } from './services/outbox-relay.service.js';
import { DISCOVERY_QUEUE, QueueService } from './services/queue.service.js';
import { WorkerEventService } from './services/worker-event.service.js';
import { shutdownTelemetry, startTelemetry } from './services/telemetry.service.js';

async function startWorker(): Promise<void> {
  if (config.DB_TYPE !== 'postgres') throw new Error('The worker requires DB_TYPE=postgres.');
  if (!QueueService.enabled()) throw new Error('The worker requires RABBITMQ_ENABLED=true.');
  await startTelemetry('worker');
  await runMigrations();
  await db.initialize();
  await QueueService.connect();
  // Keep the service context intact: process() delegates to another static
  // method through `this`, so passing it as an unbound callback breaks every
  // RabbitMQ delivery with "processCommittedEvent" undefined.
  await QueueService.consume(DISCOVERY_QUEUE, (event) => WorkerEventService.process(event));
  await QueueService.consume('aegissec.worker', (event) => WorkerEventService.process(event));
  await WorkerEventService.recoverQueuedDiscoveryRuns();
  OutboxRelayService.start();
  logger.info('AegisSec asynchronous worker is ready');
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Stopping AegisSec worker');
  OutboxRelayService.stop();
  await db.flush();
  await QueueService.close();
  await pgClient.close();
  await shutdownTelemetry();
  process.exit(0);
}

void startWorker().catch((error) => {
  logger.fatal({ error }, 'Worker startup failed');
  process.exit(1);
});
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
