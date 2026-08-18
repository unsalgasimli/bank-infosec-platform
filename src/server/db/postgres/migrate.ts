import fs from 'fs';
import path from 'path';
import { pgClient } from './client.js';
import { logger } from '../../services/logger.service.js';

export async function runMigrations(): Promise<void> {
  logger.info('🚀 Starting PostgreSQL database migration...');

  try {
    const schemaPath = path.resolve(process.cwd(), 'src', 'server', 'db', 'postgres', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at ${schemaPath}`);
    }

    const ddl = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema DDL
    await pgClient.query(ddl);

    logger.info('✅ PostgreSQL database schema migration completed successfully.');
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
