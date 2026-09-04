import { assertDisposableDatabase } from './fixtures/disposable-database.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pgClient } from '../server/db/postgres/client.js';
import { config } from '../server/config/index.js';
import { CmdbApiService } from '../server/services/cmdb-api.service.js';
import type { BankUser } from '../shared/types/auth.js';

const enabled = process.env.RUN_CMDB_DISCOVERY_INTEGRATION === '1' && process.env.CMDB_DISCOVERY_DISPOSABLE_DATABASE === '1' && /(?:test|integration|e2e)/i.test(config.DB_NAME);

before(async () => { if (enabled) await assertDisposableDatabase(pgClient, config.DB_NAME); });
after(() => pgClient.close());

test('cursor preserves ties/nulls/precision and excludes backdated and in-flight inserts after commit', { skip: !enabled }, async () => {
  const originalQuery = pgClient.query;
  const direct = originalQuery.bind(pgClient);
  const fixtureIds: string[] = [];
  const actor = { id: 'cursor-reader', roles: ['PLATFORM_ADMIN'], isActive: true } as BankUser;
  const insertSql = `INSERT INTO configuration_items(id,ci_number,name,type_id,status,lifecycle_status,environment,criticality,source,discovery_status,created_at,updated_at,last_seen_at,inventory_insert_xid)
    VALUES($1,$1,$2,'virtual_machine','ACTIVE','IN_USE','TEST','MEDIUM','MANUAL','SYNCED','2000-01-01',$3,$4,'0'::xid8)`;
  try {
    for (const [sortBy, column] of [['updatedAt', 'updated_at'], ['lastSeenAt', 'last_seen_at']] as const) {
      for (const sortDirection of ['asc', 'desc'] as const) {
        const label = `cursor-fixture-${randomUUID()}`;
        const caseIds: string[] = [];
        // Commit setup: production readers do not own the inserting transaction.
        await pgClient.transaction(async (client) => {
          for (let index = 0; index < 12; index += 1) {
            const id = `ci-cursor-${randomUUID()}`; caseIds.push(id); fixtureIds.push(id);
            const stamp = `2026-01-01 00:00:00.00000${1 + Math.floor(index / 3)}+00`;
            await client.query(insertSql, [id, label, stamp, index < 4 ? null : stamp]);
          }
        });
        const expected = (await direct(`SELECT id FROM configuration_items WHERE id=ANY($1::text[]) ORDER BY ${column} ${sortDirection},id ${sortDirection}`, [caseIds])).rows.map((row) => row.id);
        const marker = (await direct('SELECT inventory_insert_xid::text AS xid FROM configuration_items WHERE id=$1', [caseIds[0]])).rows[0].xid;
        assert.notEqual(marker, '0', 'INSERT must ignore a caller-supplied legacy marker.');
        const executed: string[] = [];
        pgClient.query = (async (sql: string, values?: any[]) => { executed.push(sql); return direct(sql, values); }) as typeof pgClient.query;
        const query = { pagination: 'cursor', search: label, sortBy, sortDirection, pageSize: 3 };
        const writer = await pgClient.getPool()!.connect();
        let committed = false;
        const pendingId = `ci-cursor-${randomUUID()}`; fixtureIds.push(pendingId);
        let first: Awaited<ReturnType<typeof CmdbApiService.listAssets>>;
        try {
          await writer.query('BEGIN');
          await writer.query('SAVEPOINT nested_insert');
          await writer.query(insertSql, [pendingId, label, '2026-01-01 00:00:00.000002+00', '2026-01-01 00:00:00.000002+00']);
          const pending = (await writer.query('SELECT inventory_insert_xid=pg_current_xact_id() AS top_level FROM configuration_items WHERE id=$1', [pendingId])).rows[0];
          assert.equal(pending.top_level, true, 'Savepoint insert must persist a top-level xid, not a subxid.');
          first = await CmdbApiService.listAssets(actor, query);
          assert.equal(first.total, 12); assert.ok(first.currentCursor); assert.ok(first.nextCursor);
          await writer.query('COMMIT'); committed = true;
        } finally {
          if (!committed) await writer.query('ROLLBACK');
          writer.release();
        }
        const afterId = `ci-cursor-${randomUUID()}`; fixtureIds.push(afterId);
        await direct(insertSql, [afterId, label, '2026-01-01 00:00:00.000002+00', '2026-01-01 00:00:00.000002+00']);
        // Updating row xmin must not change original insertion visibility.
        await direct("UPDATE configuration_items SET description='later material update' WHERE id=$1", [caseIds[0]]);
        assert.equal((await direct('SELECT inventory_insert_xid::text AS xid FROM configuration_items WHERE id=$1', [caseIds[0]])).rows[0].xid, marker);
        await assert.rejects(direct("UPDATE configuration_items SET inventory_insert_xid='0'::xid8 WHERE id=$1", [caseIds[0]]), /immutable/);
        const seen = first.items.map((item) => item.id);
        let cursor: string | undefined = first.nextCursor;
        for (let page = 2; cursor && page < 10; page += 1) {
          const before = executed.length;
          const result = await CmdbApiService.listAssets(actor, { ...query, page, cursor, includeTotal: 'false' });
          assert.equal(executed.length - before, 1); assert.equal(result.total, null);
          seen.push(...result.items.map((item) => item.id)); cursor = result.nextCursor;
        }
        assert.deepEqual(seen, expected); assert.equal(new Set(seen).size, 12);
        const previous = await CmdbApiService.listAssets(actor, { ...query, cursor: first.currentCursor });
        assert.equal(previous.total, 12);
        assert.deepEqual(previous.items.map((item) => item.id), first.items.map((item) => item.id));
        const refreshed = await CmdbApiService.listAssets(actor, { ...query, pageSize: 100 });
        assert.equal(refreshed.total, 14); assert.ok(refreshed.items.some((item) => item.id === pendingId)); assert.ok(refreshed.items.some((item) => item.id === afterId));
        await assert.rejects(CmdbApiService.listAssets(actor, { ...query, environment: 'DEV', cursor: first.nextCursor }), /different filters/);
        await assert.rejects(CmdbApiService.listAssets({ ...actor, id: 'another-reader' }, { ...query, cursor: first.nextCursor }), /different filters/);
        assert.ok(executed.every((sql) => !/\bOFFSET\b/.test(sql)));
        pgClient.query = originalQuery;
      }
    }
  } finally {
    pgClient.query = originalQuery;
    await assertDisposableDatabase(pgClient, config.DB_NAME);
    // Only this test's exact random IDs, on the verified disposable database.
    if (fixtureIds.length) await direct('DELETE FROM configuration_items WHERE id=ANY($1::text[])', [fixtureIds]);
  }
});
