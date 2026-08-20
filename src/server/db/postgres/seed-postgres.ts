import { pgClient } from './client.js';
import { logger } from '../../services/logger.service.js';

/**
 * Deliberately does not insert sample identities, incidents, assets or
 * controls. Populate PostgreSQL through approved directory, CMDB, scanner and
 * workflow integrations after running the schema migration.
 */
export async function seedPostgres(): Promise<void> {
  logger.info('PostgreSQL bootstrap completed without demo data.');
}

if (process.argv[1]?.endsWith('seed-postgres.ts') || process.argv[1]?.endsWith('seed-postgres.js')) {
  seedPostgres()
    .then(async () => { await pgClient.close(); })
    .catch(async (error) => { logger.error({ error }, 'PostgreSQL bootstrap failed.'); await pgClient.close(); process.exitCode = 1; });
}
