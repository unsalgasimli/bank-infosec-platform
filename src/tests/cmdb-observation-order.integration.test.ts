import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assertDisposableDatabase } from './fixtures/disposable-database.js';
import { pgClient } from '../server/db/postgres/client.js';
import { config } from '../server/config/index.js';
import { DiscoveryIngestionService, type DiscoveryPayloadMapper } from '../server/services/discovery-ingestion.service.js';
import { normalizedDiscoveryDtoSchema } from '../shared/utils/cmdb-discovery-contract.js';

const enabled = process.env.RUN_CMDB_DISCOVERY_INTEGRATION === '1' && process.env.CMDB_DISCOVERY_DISPOSABLE_DATABASE === '1' && /(?:test|integration|e2e)/i.test(config.DB_NAME);
before(async () => { if (enabled) await assertDisposableDatabase(pgClient, config.DB_NAME); });
after(() => pgClient.close());

test('older or equal-version conflicting observations retain evidence without regressing current source or canonical state', { skip: !enabled }, async () => {
  const suffix = randomUUID(); const connectorId = `dconn-order-${suffix}`; const secondaryId = `dconn-second-${suffix}`; const biosUuid = randomUUID();
  const mapper: DiscoveryPayloadMapper = { name: 'order-fixture', normalizedSchemaVersion: 1, validateRaw: (value) => value,
    normalize: (value) => normalizedDiscoveryDtoSchema.parse(value) };
  for (const id of [connectorId, secondaryId]) await pgClient.query("INSERT INTO cmdb_discovery_connectors(id,name,connector_type_id,enabled) VALUES($1,'Observation order fixture','CORTEX',FALSE)", [id]);
  const previousRuns = new Map<string, string>();
  const run = async (connector = connectorId) => {
    const previous = previousRuns.get(connector);
    if (previous) await DiscoveryIngestionService.reconcileAndCompleteRun(previous);
    const id = `run-order-${randomUUID()}`;
    await pgClient.query("INSERT INTO cmdb_discovery_sync_runs(id,connector_id,run_type,state) VALUES($1,$2,'FULL','RUNNING')", [id, connector]);
    previousRuns.set(connector, id);
    return id;
  };
  const input = (runId: string, observedAt: string, cpuCount: number, connector = connectorId) => ({
    connectorId: connector, syncRunId: runId, sourceObjectType: 'COMPUTE_INSTANCE', sourceObjectId: 'order-object', schemaVersion: 1, observedAt,
    rawPayload: { schemaVersion: 1, source: { connectorId: connector, objectType: 'COMPUTE_INSTANCE', objectId: 'order-object' },
      identity: { name: `order-${suffix}`, identifiers: [{ type: 'BIOS_UUID', namespace: 'GLOBAL', value: biosUuid, confidence: 100, primary: true }] },
      classification: { type: 'virtual_machine', environment: 'TEST' }, compute: { cpuCount } },
  });
  const initial = await DiscoveryIngestionService.ingestObservation(input(await run(), '2026-09-01T00:00:00.000Z', 2), mapper);
  await DiscoveryIngestionService.ingestObservation(input(await run(), '2026-09-01T00:02:00.000Z', 4), mapper);
  const sourceSnapshot = async () => (await pgClient.query(`SELECT asset_id,revision,normalized_payload_hash,normalized_at,last_seen_at,last_sync_run_id,status,search_text
    FROM cmdb_source_records WHERE id=$1`, [initial.sourceRecordId])).rows[0];
  const canonicalSnapshot = async () => (await pgClient.query('SELECT cpu_count,version,lifecycle_state,last_seen_at,last_sync_at,last_discovered_at FROM configuration_items WHERE id=$1', [initial.assetId])).rows[0];
  const currentSource = await sourceSnapshot(); const currentAsset = await canonicalSnapshot();
  const staleRun = await run(); const staleInput = input(staleRun, '2026-09-01T00:01:00.000Z', 9);
  for (let attempt = 0; attempt < 2; attempt += 1) await assert.rejects(DiscoveryIngestionService.ingestObservation(staleInput, mapper), (error: any) => error.code === 'STALE_OBSERVATION');
  assert.deepEqual(await sourceSnapshot(), currentSource); assert.deepEqual(await canonicalSnapshot(), currentAsset);
  const staleEvidence = (await pgClient.query('SELECT processing_status,processing_error_code,raw_payload,processing_attempts FROM cmdb_raw_observations WHERE sync_run_id=$1', [staleRun])).rows;
  assert.equal(staleEvidence.length, 1); assert.equal(staleEvidence[0].processing_error_code, 'STALE_OBSERVATION');
  assert.equal(staleEvidence[0].processing_status, 'FAILED'); assert.equal(staleEvidence[0].raw_payload.compute.cpuCount, 9);
  assert.equal(Number((await pgClient.query('SELECT failed_count FROM cmdb_discovery_sync_runs WHERE id=$1', [staleRun])).rows[0].failed_count), 1);
  const conflictRun = await run();
  await assert.rejects(DiscoveryIngestionService.ingestObservation(input(conflictRun, '2026-09-01T00:02:00.000Z', 8), mapper), (error: any) => error.code === 'CONFLICTING_OBSERVATION_VERSION');
  assert.deepEqual(await sourceSnapshot(), currentSource); assert.deepEqual(await canonicalSnapshot(), currentAsset);
  await DiscoveryIngestionService.reconcileAndCompleteRun(staleRun);
  assert.equal((await pgClient.query('SELECT state FROM cmdb_discovery_sync_runs WHERE id=$1', [staleRun])).rows[0].state, 'PARTIAL');
  assert.deepEqual(await canonicalSnapshot(), currentAsset);
  const unchanged = await DiscoveryIngestionService.ingestObservation(input(await run(), '2026-09-01T00:03:00.000Z', 4), mapper);
  assert.equal(unchanged.unchanged, true);
  const newestAsset = await canonicalSnapshot();
  const secondary = await DiscoveryIngestionService.ingestObservation(input(await run(secondaryId), '2026-09-01T00:00:00.000Z', 4, secondaryId), mapper);
  assert.equal(secondary.assetId, initial.assetId);
  const afterSecondary = await canonicalSnapshot();
  for (const key of ['last_seen_at', 'last_discovered_at', 'last_sync_at']) assert.deepEqual(afterSecondary[key], newestAsset[key]);
  // Retain append-only fixture evidence in the verified disposable DB.
});
