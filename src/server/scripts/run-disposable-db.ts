/** Explicit local fixture runner. Never resets, creates or drops a database. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { config } from '../config/index.js';
import { assertDisposableDatabase } from '../../tests/fixtures/disposable-database.js';

async function main(): Promise<void> {
  const [option, database, mode, ...files] = process.argv.slice(2);
  if (option !== '--database' || !database || !['--migrate', '--test', '--indexes'].includes(mode)) {
    throw new Error('Use --database <existing_local_test_database> --migrate | --indexes | --test <src/tests/*.test.ts ...>.');
  }
  if (!/(?:^|_)(?:test|tests|e2e|integration)(?:_|$)/i.test(database) || !/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('An explicit disposable database name is required.');
  if (mode !== '--test' && files.length) throw new Error('Only --test accepts file arguments.');
  if (mode === '--test' && (!files.length || files.some((file) => !/^src\/tests\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.test\.ts$/.test(file)))) throw new Error('Supply explicit repository test files; no glob or shell arguments.');
  const url = new URL(config.DATABASE_URL || 'postgresql://localhost');
  if (!config.DATABASE_URL) {
    url.hostname = config.DB_HOST; url.port = String(config.DB_PORT);
    url.username = config.DB_USER || ''; url.password = config.DB_PASSWORD || '';
  }
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)) throw new Error('Fixture runner permits only local PostgreSQL hosts.');
  if (url.search) throw new Error('Connection URL query options are not supported by the fixture runner; refusing ambiguous target overrides.');
  url.pathname = `/${database}`;
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url.toString(), DB_TYPE: 'postgres', DB_NAME: database,
    DB_POOL_MIN: '0', DB_POOL_MAX: '3', RUN_CMDB_DISCOVERY_INTEGRATION: '1', CMDB_DISCOVERY_DISPOSABLE_DATABASE: '1' };
  // config already resolved the configured secret file; prevent the child from
  // reloading a conflicting original connection URL via DATABASE_URL_FILE.
  for (const key of Object.keys(env)) if (key.endsWith('_FILE') && env[key.slice(0, -5)]) env[key] = '';
  env.DATABASE_URL_FILE = ''; // An absent variable would be reloaded from .env.
  const probe = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1,
    ssl: config.DB_SSL ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 5000 });
  try { await assertDisposableDatabase(probe, database); }
  finally { await probe.end(); }
  console.log(JSON.stringify({ event: 'disposable_database_verified', database, host: url.hostname, mode }));
  const args = mode === '--migrate' ? ['src/server/db/postgres/migrate.ts']
    : mode === '--indexes' ? ['src/server/scripts/prepare-cmdb-search.ts', '--indexes-only']
    : ['--test', '--test-concurrency=1', ...files];
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', ...args], { cwd: path.resolve('.'), env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject); child.once('exit', (status) => resolve(status ?? 1));
  });
  process.exitCode = code;
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : 'Disposable runner failed.'); process.exitCode = 1; });
