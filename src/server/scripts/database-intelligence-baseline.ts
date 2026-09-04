/** Read-only measurements of the actual CMDB API query path. No source payloads or credentials are emitted. */
import { pgClient } from '../db/postgres/client.js';
import { CmdbApiService } from '../services/cmdb-api.service.js';
import type { BankUser } from '../../shared/types/auth.js';
import { writeFile } from 'node:fs/promises';
import { encodeAssetCursor, type AssetCursor } from '../services/cmdb-cursor.js';
import { config } from '../config/index.js';

const report: Record<string, unknown> = { measuredAt: new Date().toISOString(), mode: 'read-only, current local dataset; cache and concurrent load not controlled' };
const originalQuery = pgClient.query.bind(pgClient);
try {
  await pgClient.transaction(async (client) => {
    await client.query('SET TRANSACTION READ ONLY');
    await client.query('SET LOCAL statement_timeout = 20000');
    report.databaseIdentity = (await client.query('SELECT current_database() AS database')).rows[0];
    report.tables = (await client.query(`SELECT relname,n_live_tup,n_dead_tup,seq_scan,idx_scan,n_tup_ins,n_tup_upd,
      pg_total_relation_size(relid) AS total_bytes FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC`)).rows;
    report.indexes = (await client.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`)).rows;
    report.constraints = (await client.query(`SELECT conrelid::regclass::text AS table_name,conname,contype,convalidated,
      pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conrelid::regclass::text,conname`)).rows;
    report.columns = (await client.query(`SELECT table_name,column_name,data_type,is_nullable,column_default
      FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
    report.extensions = (await client.query('SELECT extname FROM pg_extension')).rows;
    report.database = (await client.query(`SELECT blks_hit,blks_read,deadlocks,temp_bytes,stats_reset FROM pg_stat_database WHERE datname=current_database()`)).rows;
    report.migrations = (await client.query('SELECT version,checksum,applied_at FROM schema_migrations ORDER BY version')).rows;
    // Use a real persisted active reader, never a bypassed HTTP login or fabricated identity.
    const reader = (await client.query(`SELECT id,roles,is_active FROM bank_users WHERE is_active AND roles ? 'PLATFORM_ADMIN' LIMIT 1`)).rows[0];
    if (!reader) throw new Error('No active persisted platform administrator available for read-only service measurement.');
    const actor = { id: reader.id, roles: reader.roles, isActive: reader.is_active } as BankUser;
    const scenarios: unknown[] = [];
    const originalClientQuery = client.query.bind(client);
    let initialCursor: string | undefined;
    const exactAsset = (await client.query('SELECT ci_number FROM configuration_items WHERE archived_at IS NULL ORDER BY id LIMIT 1')).rows[0]?.ci_number;
    const exactIp = (await client.query('SELECT host(ip_address) AS value FROM cmdb_ip_addresses WHERE retired_at IS NULL ORDER BY id LIMIT 1')).rows[0]?.value;
    for (const [label, input] of [
      ['inventory-first', { page: 1 }],
      ['inventory-deep', { page: 400 }],
      ['inventory-no-match-search', { search: 'baseline-no-such-host-7fc926' }],
      ['inventory-owner-filter', { ownerUserId: reader.id }],
      ['cursor-first', { pagination: 'cursor' }],
      ['cursor-deep', { pagination: 'cursor', includeTotal: 'false' }],
      ['exact-canonical-positive', { search: exactAsset, searchMode: 'exact' }],
      ['exact-ip-positive', { search: exactIp, searchMode: 'exact' }],
    ] as const) {
      if (label.startsWith('exact-') && !('search' in input && input.search)) continue;
      const query: Record<string, unknown> = { ...input };
      if (label === 'cursor-deep') {
        if (!initialCursor) continue;
        const boundary = (await originalClientQuery(`SELECT id,updated_at::text AS value FROM configuration_items
          WHERE archived_at IS NULL ORDER BY updated_at DESC,id DESC OFFSET 9974 LIMIT 1`)).rows[0];
        if (!boundary) continue;
        // Positioning is benchmark setup only; the measured API performs a true
        // keyset seek at this real row, not 399 preceding HTTP requests.
        const state = JSON.parse(Buffer.from(initialCursor.split('.')[0], 'base64url').toString('utf8')) as AssetCursor;
        query.cursor = encodeAssetCursor({ ...state, boundary }, config.JWT_SECRET);
      }
      const measurements: unknown[] = [];
      // Intercept only this process's read service and explain its real bound SQL.
      pgClient.query = (async (sql: string, params?: any[]) => {
        if (!/^(SELECT|WITH)\b/i.test(sql.trim())) throw new Error('Baseline refused a non-read service query.');
        const plan = await originalClientQuery(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, params);
        measurements.push({ sql, plan: plan.rows[0]['QUERY PLAN'] });
        return originalClientQuery(sql, params);
      }) as typeof pgClient.query;
      await originalClientQuery('SAVEPOINT baseline_scenario');
      const start = performance.now();
      try {
        const result = await CmdbApiService.listAssets(actor, query);
        if (label === 'cursor-first') initialCursor = result.currentCursor;
        scenarios.push({ label, durationIncludingExplainMs: performance.now() - start, returned: result.items.length, total: result.total, measurements });
      } catch (error) {
        await originalClientQuery('ROLLBACK TO SAVEPOINT baseline_scenario');
        scenarios.push({ label, error: error instanceof Error ? error.message : String(error), measurements });
      } finally {
        pgClient.query = originalQuery;
        await originalClientQuery('RELEASE SAVEPOINT baseline_scenario');
      }
    }
    report.scenarios = scenarios;
  });
  if (process.argv[2]) {
    await writeFile(process.argv[2], JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ output: process.argv[2], scenarios: (report.scenarios as any[]).map(({ measurements, ...scenario }) => ({ ...scenario, queries: measurements.map((entry: any) => ({ executionMs: entry.plan[0]['Execution Time'], planRows: entry.plan[0].Plan['Actual Rows'] })) })) }));
  } else console.log(JSON.stringify(report));
} finally {
  pgClient.query = originalQuery;
  await pgClient.close();
}
