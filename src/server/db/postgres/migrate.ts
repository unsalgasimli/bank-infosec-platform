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
    const migrationsDirectoryCandidates = [
      path.resolve(process.cwd(), 'src', 'server', 'db', 'postgres', 'migrations'),
      path.resolve(process.cwd(), 'dist', 'server', 'db', 'postgres', 'migrations'),
    ];
    const migrationsDirectory = migrationsDirectoryCandidates.find((candidate) => fs.existsSync(candidate));
    const numberedMigrations = migrationsDirectory
      ? fs.readdirSync(migrationsDirectory)
        .filter((name) => /^\d+_.+\.sql$/i.test(name))
        .sort()
        .map((name) => ({ version: path.basename(name, '.sql'), sql: fs.readFileSync(path.join(migrationsDirectory, name), 'utf8') }))
      : [];
    const migrations = [{ version: '001_initial_schema', sql: ddl }, ...numberedMigrations];

    await pgClient.transaction(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(128) PRIMARY KEY,
          checksum CHAR(64) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('aegissec:schema-migrations', 0))");

      for (const migration of migrations) {
        const checksum = crypto.createHash('sha256').update(migration.sql).digest('hex');
        const current = await client.query<{ checksum: string }>(
          'SELECT checksum FROM schema_migrations WHERE version = $1',
          [migration.version]
        );
        if (current.rows[0]) {
          if (current.rows[0].checksum !== checksum) {
            throw new Error(
              `Migration ${migration.version} checksum differs from its applied record. ` +
              'Do not rewrite an applied migration; add a new numbered SQL migration instead.'
            );
          }
          continue;
        }

        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)',
          [migration.version, checksum]
        );
        logger.info({ version: migration.version }, 'PostgreSQL schema migration applied successfully.');
      }
      logger.info({ migrationCount: migrations.length, latestVersion: migrations.at(-1)?.version }, 'PostgreSQL schema is up to date.');
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
