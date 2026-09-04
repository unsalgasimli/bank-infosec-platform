import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pgClient } from '../server/db/postgres/client.js';
import { CmdbApiService } from '../server/services/cmdb-api.service.js';
import type { BankUser } from '../shared/types/auth.js';
import { persistManagerLinks } from '../server/db/postgres/projection-manager-links.js';

after(() => pgClient.close());
const actor = { id: 'test-reader', roles: ['PLATFORM_ADMIN'], isActive: true } as BankUser;

test('combined owner filters bind every owner slot and enrich only the selected page', async () => {
  const original = pgClient.query;
  const calls: Array<{ sql: string; values?: any[] }> = [];
  pgClient.query = (async (sql: string, values?: any[]) => {
    calls.push({ sql, values });
    return { rows: sql.startsWith('SELECT count') ? [{ count: '1' }] : [] };
  }) as typeof pgClient.query;
  try {
    await CmdbApiService.listAssets(actor, { ownerUserId: "owner' OR true --", typeIds: ['virtual_machine'], page: 400 });
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.doesNotMatch(call.sql, /\?/);
      assert.match(call.sql, /a.owner_user_id = \$2 OR a.technical_owner_user_id = \$2 OR a.business_owner_user_id = \$2/);
      assert.equal(call.values?.[1], "owner' OR true --");
      assert.ok(!call.sql.includes("owner' OR true --"));
    }
    assert.match(calls[1].sql, /WITH page_assets AS MATERIALIZED/);
    assert.match(calls[1].sql, /FROM page_assets page JOIN configuration_items a ON a.id=page.id/);
    assert.deepEqual(calls[1].values?.slice(-2), [25, 9975]);
  } finally { pgClient.query = original; }
});

test('reconciliation candidates use one bounded batch and retain grouping and score order', async () => {
  const original = pgClient.query;
  const calls: Array<{ sql: string; values?: any[] }> = [];
  pgClient.query = (async (sql: string, values?: any[]) => {
    calls.push({ sql, values });
    if (sql.startsWith('SELECT c.*')) return { rows: [{ id: 'case-a' }, { id: 'case-b' }, { id: 'case-empty' }] };
    if (sql.startsWith('SELECT count')) return { rows: [{ count: '3' }] };
    return { rows: [{ case_id: 'case-a', asset_id: 'one', score: '100' }, { case_id: 'case-a', asset_id: 'two', score: '80' }, { case_id: 'case-b', asset_id: 'three', score: '90' }] };
  }) as typeof pgClient.query;
  try {
    const result = await CmdbApiService.listCorrelationCases(actor);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[2].values, [['case-a', 'case-b', 'case-empty']]);
    assert.match(calls[2].sql, /ORDER BY cc.case_id,cc.score DESC,cc.asset_id/);
    assert.deepEqual(result.items.map((item: any) => item.candidates.map((candidate: any) => candidate.assetId)), [['one', 'two'], ['three'], []]);
    assert.equal(result.items[0].candidates[0].score, 100);
  } finally { pgClient.query = original; }
});

test('read permissions are checked before any inventory or reconciliation query', async () => {
  const original = pgClient.query;
  pgClient.query = (async () => { assert.fail('unauthorized database query'); }) as typeof pgClient.query;
  try {
    await assert.rejects(CmdbApiService.listAssets(undefined, {}));
    await assert.rejects(CmdbApiService.listCorrelationCases({ ...actor, isActive: false }));
  } finally { pgClient.query = original; }
});

test('zero-result search does not repeat the expensive predicate for an empty data page', async () => {
  const original = pgClient.query;
  let queries = 0;
  pgClient.query = (async () => { queries += 1; return { rows: [{ count: '0' }] }; }) as unknown as typeof pgClient.query;
  try {
    const result = await CmdbApiService.listAssets(actor, { search: 'absent-host' });
    assert.deepEqual(result.items, []);
    assert.equal(result.total, 0);
    assert.equal(queries, 1);
  } finally { pgClient.query = original; }
});

test('manager snapshot batches edges, handles removal/self/unknown IDs, and updates only differing rows', async () => {
  const calls: Array<{ sql: string; values?: any[] }> = [];
  const client = { query: async (sql: string, values?: any[]) => { calls.push({ sql, values }); return { rows: [] }; } } as any;
  const users = [{ id: 'manager' }, { id: 'linked', managerId: 'manager' }, { id: 'removed' }, { id: 'self', managerId: 'self' }, { id: 'unknown', managerId: 'absent' }];
  await persistManagerLinks(client, users, [{ id: 'dept', managerId: 'manager' }, { id: 'dept-removed' }]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].values?.[1], [null, 'manager', null, null, null]);
  assert.deepEqual(calls[1].values?.[1], ['manager', null]);
  assert.ok(calls.every((call) => call.sql.includes('IS DISTINCT FROM incoming.manager_id')));
  calls.length = 0;
  await persistManagerLinks(client, Array.from({ length: 2100 }, (_, index) => ({ id: `user-${index}` })), []);
  assert.deepEqual(calls.map((call) => call.values?.[0].length), [1000, 1000, 100]);
});
