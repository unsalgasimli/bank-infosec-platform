import { config } from './config/index.js';
import { db } from './db/database.js';
import { pgClient } from './db/postgres/client.js';
import { runMigrations } from './db/postgres/migrate.js';
import { logger } from './services/logger.service.js';
import { LDAPSchedulerService } from './services/ldap-scheduler.service.js';
import { PlatformSchedulerService } from './services/platform-scheduler.service.js';
import { shutdownTelemetry, startTelemetry } from './services/telemetry.service.js';

async function startScheduler(): Promise<void> {
  if (config.DB_TYPE !== 'postgres') throw new Error('The scheduler requires DB_TYPE=postgres.');
  await startTelemetry('scheduler');
  if (config.RUN_MIGRATIONS) await runMigrations();
  else logger.info('Database migrations are owned by the API role; scheduler startup will not contend for the migration lock.');
  await db.initialize();
  if (config.LDAP_SYNC_AUTO_ENABLED) LDAPSchedulerService.startScheduler();
  PlatformSchedulerService.start();
  logger.info('AegisSec scheduler is ready');
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Stopping AegisSec scheduler');
  LDAPSchedulerService.stopScheduler();
  PlatformSchedulerService.stop();
  await db.flush();
  await pgClient.close();
  await shutdownTelemetry();
  process.exit(0);
}

void startScheduler().catch((error) => {
  logger.fatal({ error }, 'Scheduler startup failed');
  process.exit(1);
});
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
