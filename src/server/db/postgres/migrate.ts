import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pgClient } from './client.js';
import { logger } from '../../services/logger.service.js';

export async function runMigrations(): Promise<void> {
  logger.info('🚀 Starting PostgreSQL database migration...');

  try {
    // `tsx` runs from the source tree, while the production image places this
    // file beside the compiled server. Both modes must start against PostgreSQL.
    const schemaCandidates = [
      path.resolve(process.cwd(), 'src', 'server', 'db', 'postgres', 'schema.sql'),
      path.resolve(process.cwd(), 'dist', 'server', 'db', 'postgres', 'schema.sql'),
    ];
    const schemaPath = schemaCandidates.find((candidate) => fs.existsSync(candidate));
    if (!schemaPath) {
      throw new Error(`Schema file not found. Checked: ${schemaCandidates.join(', ')}`);
    }

    const ddl = fs.readFileSync(schemaPath, 'utf8');

    const version = '001_initial_schema';
    const checksum = crypto.createHash('sha256').update(ddl).digest('hex');

    await pgClient.transaction(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(128) PRIMARY KEY,
          checksum CHAR(64) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('aegissec:schema-migrations', 0))");

      const current = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE version = $1',
        [version]
      );
      if (current.rows[0]?.checksum === checksum) {
        logger.info({ version }, 'PostgreSQL schema is already up to date.');
        return;
      }

      await client.query(ddl);
      await client.query(
        `INSERT INTO schema_migrations(version, checksum)
         VALUES ($1, $2)
         ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = NOW()`,
        [version, checksum]
      );
      logger.info({ version }, 'PostgreSQL schema migration applied successfully.');
    });
  } catch (error) {
    logger.error({ error }, '❌ Database migration failed.');
    throw error;
  }
}

// Allow direct execution via CLI `npm run db:migrate`
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(async () => {
      await pgClient.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await pgClient.close();
      process.exit(1);
    });
}
