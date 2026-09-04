import { assertDisposableDatabase } from './fixtures/disposable-database.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pgClient } from '../server/db/postgres/client.js';
import { config } from '../server/config/index.js';
import { CmdbApiService } from '../server/services/cmdb-api.service.js';
import type { BankUser } from '../shared/types/auth.js';
import { assetSearchPredicate, isExactAssetIdentifier, escapeSearchLike } from '../server/services/cmdb-search-query.js';

const enabled = process.env.RUN_CMDB_DISCOVERY_INTEGRATION === '1' && process.env.CMDB_DISCOVERY_DISPOSABLE_DATABASE === '1' && /(?:test|integration|e2e)/i.test(config.DB_NAME);

before(async () => { if (enabled) await assertDisposableDatabase(pgClient, config.DB_NAME); });
after(() => pgClient.close());

test('exact search routing distinguishes identifiers from partial text and binds literal LIKE characters', () => {
  for (const value of ['10.0.0.1', '2001:db8::1', 'AA-BB-CC-DD-EE-FF', 'aabb.ccdd.eeff', '12345678-1234-1234-1234-123456789abc', 'CI-123']) assert.equal(isExactAssetIdentifier(value), true);
  for (const value of ['windows', 'host', 'vm-123', 'not-an-ip']) assert.equal(isExactAssetIdentifier(value), false);
  assert.equal(escapeSearchLike('literal%_\\'), '%literal\\%\\_\\\\%');
  const values: unknown[] = [];
  assert.doesNotMatch(assetSearchPredicate('10.0.0.1', 'auto', values), /LIKE/);
  assert.deepEqual(values, ['10.0.0.1']);
});

test('SQL search projection is transactional, incremental, exact, filterable and backfill-compatible', { skip: !enabled }, async () => {
  const rollback = new Error('rollback-search-fixtures');
  const originalQuery = pgClient.query;
  await assert.rejects(pgClient.transaction(async (client) => {
    const suffix = randomUUID(); const firstId = `ci-search-${suffix}`; const secondId = `ci-other-${suffix}`;
    const connectorId = `dconn-search-${suffix}`; const runId = `run-search-${suffix}`; const sourceId = `src-search-${suffix}`;
    await client.query("INSERT INTO cmdb_discovery_connectors(id,name,connector_type_id) VALUES($1,'Search fixture','CORTEX')", [connectorId]);
    await client.query("INSERT INTO cmdb_discovery_sync_runs(id,connector_id,run_type,state) VALUES($1,$2,'FULL','RUNNING')", [runId, connectorId]);
    for (const [id, name] of [[firstId, 'literal%host-search'], [secondId, 'literalXhost-search']]) await client.query(`INSERT INTO configuration_items(id,ci_number,name,type_id,status,lifecycle_status,environment,criticality,source,discovery_status,operating_system,ip_address,mac_address)
      VALUES($1,$1,$2,'virtual_machine','ACTIVE','IN_USE','TEST','MEDIUM','MANUAL','SYNCED','Windows Server 2022',$3,$4)`, [id, name, id === firstId ? '2001:db8::1' : null, id === firstId ? 'AA-BB-CC-DD-EE-FF' : null]);
    const payload = { source: { objectId: 'source-search-object' }, identity: { name: 'source-observation', fqdn: 'searchhost.bank.invalid', identifiers: [{ value: '12345678-1234-1234-1234-123456789abc' }] }, operatingSystem: { reported: 'Windows  Server 2022', configured: 'windows9Server64Guest' }, sourceSpecificMetadata: { cortex: { ownerName: 'Unique Search Owner', ownerCandidates: ['Unique Search Owner', 'owner@example.invalid'], unrelatedTelemetry: 'not-an-owner-search' } } };
    await client.query(`INSERT INTO cmdb_source_records(id,asset_id,connector_id,external_object_type,external_object_id,first_seen_at,last_seen_at,last_sync_run_id,normalized_payload)
      VALUES($1,$2,$3,'ENDPOINT','source-search-object',NOW(),NOW(),$4,$5::jsonb)`, [sourceId, firstId, connectorId, runId, JSON.stringify(payload)]);
    pgClient.query = client.query.bind(client) as typeof pgClient.query;
    const actor = { id: 'test-reader', roles: ['PLATFORM_ADMIN'], isActive: true } as BankUser;
    try {
      const ids = async (query: Record<string, unknown>) => (await CmdbApiService.listAssets(actor, query)).items.map((row) => row.id);
      assert.deepEqual(await ids({ search: 'literal%host-search' }), [firstId]);
      assert.deepEqual(await ids({ search: '2001:0DB8:0:0:0:0:0:1' }), [firstId]);
      assert.deepEqual(await ids({ search: 'aabb.ccdd.eeff' }), [firstId]);
      assert.deepEqual(await ids({ search: '12345678-1234-1234-1234-123456789abc' }), [firstId]);
      assert.deepEqual(await ids({ search: 'source-search-object', searchMode: 'exact' }), [firstId]);
      assert.deepEqual(await ids({ search: 'searchhost', sourceConnectorId: connectorId, typeIds: ['virtual_machine'], operatingSystems: ['windows server 2022'] }), [firstId]);
      assert.deepEqual(await ids({ owner: 'Unique Search Owner', operatingSystem: 'windows9Server', environment: 'TEST' }), [firstId]);
      assert.deepEqual(await ids({ owner: 'not-an-owner-search' }), []);
      assert.deepEqual(await ids({ search: 'normalized_payload' }), []);
      const before = (await client.query('SELECT search_text,search_terms,normalized_at,revision,search_document_version FROM cmdb_source_records WHERE id=$1', [sourceId])).rows[0];
      await client.query('UPDATE cmdb_source_records SET last_seen_at=NOW(),updated_at=NOW() WHERE id=$1', [sourceId]);
      assert.deepEqual((await client.query('SELECT search_text,search_terms,normalized_at,revision,search_document_version FROM cmdb_source_records WHERE id=$1', [sourceId])).rows[0], before);
      // Simulate a row created before the additive migration. The rollout fallback
      // must produce the same results before/after the resumable backfill trigger.
      await client.query('ALTER TABLE cmdb_source_records DISABLE TRIGGER cmdb_refresh_source_search_v1');
      await client.query("UPDATE cmdb_source_records SET search_document_version=0,search_text='',search_terms='{}',search_owner_text='',search_os_names='{}' WHERE id=$1", [sourceId]);
      await client.query('ALTER TABLE cmdb_source_records ENABLE TRIGGER cmdb_refresh_source_search_v1');
      assert.deepEqual(await ids({ search: 'searchhost', owner: 'Unique Search Owner', operatingSystems: ['windows server 2022'] }), [firstId]);
      await client.query('UPDATE cmdb_source_records SET search_document_version=0 WHERE id=$1', [sourceId]);
      assert.equal((await client.query('SELECT search_document_version FROM cmdb_source_records WHERE id=$1', [sourceId])).rows[0].search_document_version, 1);
      await client.query("UPDATE cmdb_source_records SET normalized_payload=jsonb_set(normalized_payload,'{identity,fqdn}','\"changed-host.bank.invalid\"') WHERE id=$1", [sourceId]);
      assert.deepEqual(await ids({ search: 'searchhost' }), []);
      assert.deepEqual(await ids({ search: 'changed-host.bank.invalid' }), [firstId]);
      await assert.rejects(CmdbApiService.listAssets({ ...actor, isActive: false }, { search: 'changed-host' }));
    } finally { pgClient.query = originalQuery; }
    throw rollback;
  }), (error) => error === rollback);
});
