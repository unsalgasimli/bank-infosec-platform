import { assertDisposableDatabase } from './fixtures/disposable-database.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pgClient } from '../server/db/postgres/client.js';
import { config } from '../server/config/index.js';
import { persistManagerLinks } from '../server/db/postgres/projection-manager-links.js';
import { ConnectorScopedLockService } from '../server/services/discovery-lock.service.js';

const enabled = process.env.RUN_CMDB_DISCOVERY_INTEGRATION === '1'
  && process.env.CMDB_DISCOVERY_DISPOSABLE_DATABASE === '1'
  && /(?:test|e2e|integration)/i.test(config.DB_NAME);

before(async () => { if (enabled) await assertDisposableDatabase(pgClient, config.DB_NAME); });
after(() => pgClient.close());

test('manager edge SQL preserves unchanged tuple versions and applies changes/removals atomically', { skip: !enabled }, async () => {
  await pgClient.transaction(async (client) => {
    // Transaction-local shadow tables: no real directory rows are touched.
    await client.query('CREATE TEMP TABLE bank_users(id text PRIMARY KEY,manager_id text REFERENCES bank_users(id),updated_at timestamptz) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE bank_departments(id text PRIMARY KEY,manager_id text REFERENCES bank_users(id),updated_at timestamptz) ON COMMIT DROP');
    await client.query("INSERT INTO bank_users VALUES ('manager',NULL,NOW()),('linked','manager',NOW()),('removed','manager',NOW()),('changed',NULL,NOW())");
    await client.query("INSERT INTO bank_departments VALUES ('dept','manager',NOW()),('dept-removed','manager',NOW())");
    const before = (await client.query('SELECT id,ctid::text,manager_id FROM bank_users ORDER BY id')).rows;
    const users = [{ id: 'manager' }, { id: 'linked', managerId: 'manager' }, { id: 'removed' }, { id: 'changed', managerId: 'manager' }];
    const departments = [{ id: 'dept', managerId: 'manager' }, { id: 'dept-removed' }];
    const writes: number[] = [];
    const instrumented = { query: async (sql: string, values: any[]) => { const result = await client.query(sql, values); writes.push(result.rowCount || 0); return result; } } as any;
    await persistManagerLinks(instrumented, users, departments);
    assert.deepEqual(writes, [2, 1]);
    const updated = (await client.query('SELECT id,ctid::text,manager_id FROM bank_users ORDER BY id')).rows;
    assert.equal(updated.find((row) => row.id === 'linked')?.ctid, before.find((row) => row.id === 'linked')?.ctid);
    assert.equal(updated.find((row) => row.id === 'removed')?.manager_id, null);
    writes.length = 0;
    await persistManagerLinks(instrumented, users, departments);
    assert.deepEqual(writes, [0, 0]);
    assert.deepEqual((await client.query('SELECT id,ctid::text,manager_id FROM bank_users ORDER BY id')).rows, updated);
    console.log('Manager SQL evidence: changed snapshot writes users=2 departments=1; unchanged replay writes=0.');
  });
});

test('connector transaction lock excludes duplicate work and is released on commit and rollback', { skip: !enabled }, async () => {
  const key = 'dataplatform-lock-integration';
  const first = await ConnectorScopedLockService.withLock(key, 'test', async (client) => {
    assert.ok((await client.query('SELECT txid_current() AS id')).rows[0].id);
    assert.deepEqual(await ConnectorScopedLockService.withLock(key, 'test', async () => assert.fail('duplicate callback')), { acquired: false });
    return 'committed';
  });
  assert.deepEqual(first, { acquired: true, value: 'committed' });
  await assert.rejects(ConnectorScopedLockService.withLock(key, 'test', async () => { throw new Error('fixture rollback'); }), /fixture rollback/);
  assert.deepEqual(await ConnectorScopedLockService.withLock(key, 'test', async () => 'released'), { acquired: true, value: 'released' });
});
