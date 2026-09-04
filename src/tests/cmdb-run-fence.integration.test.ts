import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assertDisposableDatabase } from './fixtures/disposable-database.js';
import { pgClient } from '../server/db/postgres/client.js';
import { config } from '../server/config/index.js';
import { DiscoveryIngestionService as ingestion, type DiscoveryPayloadMapper } from '../server/services/discovery-ingestion.service.js';
import { normalizedDiscoveryDtoSchema } from '../shared/utils/cmdb-discovery-contract.js';

const enabled = process.env.RUN_CMDB_DISCOVERY_INTEGRATION === '1' && process.env.CMDB_DISCOVERY_DISPOSABLE_DATABASE === '1';
before(async () => { if (enabled) await assertDisposableDatabase(pgClient, config.DB_NAME); });
after(() => pgClient.close());

test('run completion fences pending work, terminal workers and duplicate failure while successful retries repair accounting', { skip: !enabled }, async () => {
  const connectorId = `dconn-fence-${randomUUID()}`; const biosUuid = randomUUID();
  await pgClient.query("INSERT INTO cmdb_discovery_connectors(id,name,connector_type_id,enabled,checkpoint) VALUES($1,'Run fence fixture','CORTEX',FALSE,'{\"position\":0}')", [connectorId]);
  const mapper: DiscoveryPayloadMapper = { name: 'fence-fixture', normalizedSchemaVersion: 1, validateRaw: (value) => value,
    normalize: (value) => normalizedDiscoveryDtoSchema.parse(value) };
  const makeRun = async (position: number) => {
    const id = `run-fence-${randomUUID()}`;
    await pgClient.query("INSERT INTO cmdb_discovery_sync_runs(id,connector_id,run_type,state,checkpoint) VALUES($1,$2,'FULL','RUNNING',$3)", [id, connectorId, JSON.stringify({ position })]);
    return id;
  };
  const input = (syncRunId: string, minute: number) => ({ connectorId, syncRunId, sourceObjectType: 'COMPUTE_INSTANCE', sourceObjectId: 'fence-object',
    schemaVersion: 1, observedAt: `2026-09-01T00:0${minute}:00.000Z`, rawPayload: { schemaVersion: 1,
      source: { connectorId, objectType: 'COMPUTE_INSTANCE', objectId: 'fence-object' },
      identity: { name: `fence-${biosUuid}`, identifiers: [{ type: 'BIOS_UUID', namespace: 'GLOBAL', value: biosUuid, confidence: 100, primary: true }] },
      classification: { type: 'virtual_machine', environment: 'TEST' }, compute: { cpuCount: minute + 1 } } });
  const gate = (fail = false) => {
    let release!: () => void; let entered!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const delayed: DiscoveryPayloadMapper = { ...mapper, normalize: async (value) => {
      entered(); await wait;
      if (fail) throw new Error('controlled normalization failure');
      return normalizedDiscoveryDtoSchema.parse(value);
    } };
    return { release, ready, mapper: delayed };
  };
  const runState = async (id: string) => {
    const row = (await pgClient.query('SELECT state,failed_count,processed_count FROM cmdb_discovery_sync_runs WHERE id=$1', [id])).rows[0];
    return { ...row, failed_count: Number(row.failed_count), processed_count: Number(row.processed_count) };
  };
  const connectorState = async () => (await pgClient.query('SELECT checkpoint,last_successful_sync_at,last_full_sync_at FROM cmdb_discovery_connectors WHERE id=$1', [connectorId])).rows[0];
  const initialRun = await makeRun(1);
  const first = await ingestion.ingestObservation(input(initialRun, 0), mapper);
  await ingestion.reconcileAndCompleteRun(initialRun);
  const initialConnector = await connectorState();

  const pendingRun = await makeRun(2); const pendingGate = gate();
  const pending = ingestion.ingestObservation(input(pendingRun, 1), pendingGate.mapper);
  try {
    await pendingGate.ready;
    for (const status of ['RECEIVED', 'VALIDATED', 'NORMALIZED']) {
      await pgClient.query('UPDATE cmdb_raw_observations SET processing_status=$2 WHERE sync_run_id=$1', [pendingRun, status]);
      await assert.rejects(ingestion.reconcileAndCompleteRun(pendingRun), (error: any) => error.code === 'RUN_OBSERVATIONS_PENDING' && error.retryable);
    }
    assert.equal((await runState(pendingRun)).state, 'RUNNING');
    assert.deepEqual(await connectorState(), initialConnector);
    assert.equal((await pgClient.query('SELECT miss_count FROM cmdb_source_records WHERE id=$1', [first.sourceRecordId])).rows[0].miss_count, 0);
  } finally { pendingGate.release(); await pending; }
  await ingestion.reconcileAndCompleteRun(pendingRun);
  assert.equal((await runState(pendingRun)).state, 'SUCCEEDED');
  assert.deepEqual(JSON.parse((await connectorState()).checkpoint), { position: 2 });

  const duplicateRun = await makeRun(3); const badGate = gate(true);
  const lateFailure = assert.rejects(ingestion.ingestObservation(input(duplicateRun, 2), badGate.mapper), /controlled normalization failure/);
  try {
    await badGate.ready;
    const success = await ingestion.ingestObservation(input(duplicateRun, 2), mapper);
    badGate.release(); await lateFailure;
    const raw = (await pgClient.query('SELECT processing_status,processing_error_code FROM cmdb_raw_observations WHERE id=$1', [success.observationId])).rows[0];
    assert.equal(raw.processing_status, 'PROCESSED'); assert.equal(raw.processing_error_code, null);
    assert.equal((await runState(duplicateRun)).failed_count, 0);
    assert.equal((await runState(duplicateRun)).processed_count, 1);
  } finally { badGate.release(); await lateFailure; }
  await ingestion.reconcileAndCompleteRun(duplicateRun);

  const retryRun = await makeRun(4);
  await assert.rejects(ingestion.ingestObservation(input(retryRun, 3), { ...mapper, normalize: () => { throw new Error('recoverable mapper failure'); } }), /recoverable mapper failure/);
  assert.equal((await runState(retryRun)).failed_count, 1);
  const recovered = await ingestion.ingestObservation(input(retryRun, 3), mapper);
  assert.equal((await runState(retryRun)).failed_count, 0);
  assert.equal((await runState(retryRun)).processed_count, 1);
  assert.equal((await pgClient.query('SELECT processing_error_code FROM cmdb_raw_observations WHERE id=$1', [recovered.observationId])).rows[0].processing_error_code, null);
  await ingestion.reconcileAndCompleteRun(retryRun);
  assert.equal((await runState(retryRun)).state, 'SUCCEEDED');

  const stoppedRun = await makeRun(5); const stoppedGate = gate();
  const stopped = assert.rejects(ingestion.ingestObservation(input(stoppedRun, 4), stoppedGate.mapper), (error: any) => error.code === 'RUN_NOT_ACTIVE');
  const beforeStop = (await pgClient.query('SELECT cpu_count,last_seen_at,version FROM configuration_items WHERE id=$1', [first.assetId])).rows[0];
  const checkpointBeforeStop = await connectorState();
  try {
    await stoppedGate.ready;
    await ingestion.failRun(stoppedRun, new Error('controlled cancellation'));
  } finally { stoppedGate.release(); await stopped; }
  assert.equal((await runState(stoppedRun)).state, 'FAILED');
  assert.deepEqual((await pgClient.query('SELECT cpu_count,last_seen_at,version FROM configuration_items WHERE id=$1', [first.assetId])).rows[0], beforeStop);
  assert.deepEqual(await connectorState(), checkpointBeforeStop);
});
