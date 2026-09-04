import { assertDisposableDatabase } from './fixtures/disposable-database.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { config } from '../server/config/index.js';
import { pgClient } from '../server/db/postgres/client.js';
import { DiscoveryIngestionService, type DiscoveryPayloadMapper } from '../server/services/discovery-ingestion.service.js';
import { normalizedDiscoveryDtoSchema, type NormalizedDiscoveryDto } from '../shared/utils/cmdb-discovery-contract.js';

const enabled = process.env.RUN_CMDB_DISCOVERY_INTEGRATION === '1'
  && process.env.CMDB_DISCOVERY_DISPOSABLE_DATABASE === '1'
  && /(?:test|e2e|integration)/i.test(config.DB_NAME);

before(async () => { if (enabled) await assertDisposableDatabase(pgClient, config.DB_NAME); });
after(() => pgClient.close());

const rawFixtureSchema = z.object({ record: normalizedDiscoveryDtoSchema }).strict();
const fixtureMapper: DiscoveryPayloadMapper<z.infer<typeof rawFixtureSchema>> = {
  name: 'deterministic-cmdb-test-fixture',
  normalizedSchemaVersion: 1,
  validateRaw: (payload) => rawFixtureSchema.parse(payload),
  normalize: (payload) => payload.record,
};

const gib = 1024 ** 3;
const fixtureMac = (value: string) => `02:00:00:00:00:${(value.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0) % 256).toString(16).padStart(2, '0')}`;
const baseDto = (input: {
  connectorId?: string;
  objectId: string;
  name: string;
  hostname?: string;
  biosUuid?: string;
  memoryBytes?: number;
  ip?: string;
  relationshipTarget?: string;
}): NormalizedDiscoveryDto => normalizedDiscoveryDtoSchema.parse({
  schemaVersion: 1,
  source: { connectorId: input.connectorId || 'dconn-test-primary', objectType: 'COMPUTE_INSTANCE', objectId: input.objectId, nativeUuid: input.biosUuid },
  identity: {
    name: input.name,
    hostname: input.hostname,
    identifiers: input.biosUuid ? [{ type: 'BIOS_UUID', namespace: 'GLOBAL', value: input.biosUuid, confidence: 100, primary: true }] : [],
  },
  classification: { type: 'virtual_machine', subtype: 'TEST_FIXTURE', environment: 'TEST' },
  compute: { cpuCount: 4, memoryBytes: input.memoryBytes ?? 16 * gib },
  operatingSystem: { configured: 'Windows Server', reported: 'Windows Server 2022', version: '2022' },
  network: {
    interfaces: [{
      key: 'nic-0', name: 'eth0', technicalState: 'UP', virtual: true,
      macAddresses: [fixtureMac(input.objectId)],
      ipAddresses: input.ip ? [{ address: input.ip, role: 'PRIMARY', primary: true, dynamic: false }] : [],
    }],
  },
  storage: { disks: [{ key: 'disk-0', name: 'System disk', type: 'VIRTUAL_DISK', technicalState: 'ONLINE', capacityBytes: 100 * gib }] },
  placement: {
    relationships: input.relationshipTarget ? [{
      type: 'RUNS_ON',
      target: { objectType: 'HYPERVISOR', objectId: input.relationshipTarget, identifiers: [] },
      confidence: 100,
    }] : [],
  },
  tags: [{ key: 'fixture', value: 'cmdb-engine' }],
  technicalState: 'POWERED_ON',
  sourceSpecificMetadata: { fixture: true, sourceOnlyField: 'never-canonical' },
});

const hostDto = (objectId: string, uuid: string): NormalizedDiscoveryDto => normalizedDiscoveryDtoSchema.parse({
  schemaVersion: 1,
  source: { connectorId: 'dconn-test-primary', objectType: 'HYPERVISOR', objectId, nativeUuid: uuid },
  identity: { name: objectId, hostname: objectId, identifiers: [{ type: 'BIOS_UUID', namespace: 'GLOBAL', value: uuid, confidence: 100, primary: true }] },
  classification: { type: 'hypervisor', environment: 'TEST' },
  compute: { cpuCount: 32, memoryBytes: 256 * gib },
  network: { interfaces: [] }, storage: { disks: [] }, placement: { relationships: [] }, tags: [],
  operatingSystem: {}, technicalState: 'CONNECTED', sourceSpecificMetadata: { fixture: true },
});

test('generic CMDB discovery engine is deterministic, concurrent-safe and lifecycle-safe', { skip: !enabled }, async () => {
  const observed = (minute: number) => `2026-08-28T08:${String(minute).padStart(2, '0')}:00.000Z`;
  let runCounter = 0;
  const createRun = async (connectorId = 'dconn-test-primary', runType: 'FULL' | 'INCREMENTAL' | 'RECONCILIATION' | 'MANUAL' = 'MANUAL') => {
    runCounter += 1;
    const id = `run-test-${connectorId}-${runCounter}`;
    await pgClient.query(`INSERT INTO cmdb_discovery_sync_runs(id,connector_id,run_type,state,queued_at) VALUES($1,$2,$3,'QUEUED',NOW())`, [id, connectorId, runType]);
    return id;
  };
  const ingest = (runId: string, dto: NormalizedDiscoveryDto, minute: number) => DiscoveryIngestionService.ingestObservation({
    connectorId: dto.source.connectorId,
    syncRunId: runId,
    sourceObjectType: dto.source.objectType,
    sourceObjectId: dto.source.objectId,
    observedAt: observed(minute),
    schemaVersion: 1,
    rawPayload: { record: dto },
  }, fixtureMapper);

  try {
    await pgClient.query("INSERT INTO bank_divisions(id,code,name) VALUES('div-cmdb-test','CMDBTEST','CMDB Test')");
    await pgClient.query("INSERT INTO bank_departments(id,division_id,code,name) VALUES('dept-cmdb-test','div-cmdb-test','CMDBTEST','CMDB Test')");
    await pgClient.query("INSERT INTO bank_users(id,username,email,first_name,last_name,title,department_id,division_id) VALUES('user-cmdb-test','cmdb.test','cmdb.test@example.invalid','CMDB','Test','CMDB Tester','dept-cmdb-test','div-cmdb-test')");
    for (const connector of [
      { connection: 'conn-test-primary', discovery: 'dconn-test-primary', name: 'Cortex fixture source', type: 'CORTEX' },
      { connection: 'conn-test-secondary', discovery: 'dconn-test-secondary', name: 'Active Directory fixture source', type: 'ACTIVE_DIRECTORY' },
      { connection: 'conn-test-vcenter', discovery: 'dconn-test-vcenter', name: 'vCenter fixture source', type: 'VCENTER' },
    ]) {
      await pgClient.query(`INSERT INTO department_connections(id,department_id,name,type,provider,endpoint_url,auth_type,status,sync_frequency_minutes,description,config_summary)
        VALUES($1,'dept-cmdb-test',$2,'CLOUD_INFRA','Test Fixture','https://invalid.example','API_KEY','DISCONNECTED',0,'integration fixture','{}')`, [connector.connection, connector.name]);
      await pgClient.query(`INSERT INTO cmdb_discovery_connectors(id,connection_id,name,description,connector_type_id,environment,enabled,health_status,non_secret_configuration,secret_reference)
        VALUES($1,$2,$3,'CMDB integration fixture',$4,'TEST',TRUE,'HEALTHY','{}','secret-manager://cmdb-test')`, [connector.discovery, connector.connection, connector.name, connector.type]);
      if (connector.type === 'VCENTER') {
        await pgClient.query(`INSERT INTO cmdb_vcenter_connector_profiles(connector_id,endpoint_fqdn,port)
          VALUES($1,'vcenter.fixture.invalid',443)`, [connector.discovery]);
      }
    }

    const run1 = await createRun();
    const vm16 = baseDto({ objectId: 'vm-a', name: 'VM A', hostname: 'shared-host', biosUuid: '11111111-1111-1111-1111-111111111111', memoryBytes: 16 * gib, ip: '10.20.30.40', relationshipTarget: 'host-1' });

    // A/B/I: new asset, unchanged retry and exact concurrent redelivery.
    const [first, duplicate] = await Promise.all([ingest(run1, vm16, 1), ingest(run1, vm16, 1)]);
    assert.ok(first.assetId || duplicate.assetId);
    const vmAssetId = first.assetId || duplicate.assetId!;
    assert.equal(first.assetId, duplicate.assetId);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM configuration_items WHERE id=$1", [vmAssetId])).rows[0].count), 1);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM cmdb_source_records WHERE connector_id='dconn-test-primary' AND external_object_type='COMPUTE_INSTANCE' AND external_object_id='vm-a'")).rows[0].count), 1);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM cmdb_asset_changes WHERE asset_id=$1", [vmAssetId])).rows[0].count), 0);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM cmdb_pending_relationships WHERE source_asset_id=$1 AND status='PENDING'", [vmAssetId])).rows[0].count), 1);

    // Out-of-order target arrival resolves the pending VM -> host relation.
    const host1 = await ingest(run1, hostDto('host-1', '21111111-1111-1111-1111-111111111111'), 2);
    const host2 = await ingest(run1, hostDto('host-2', '31111111-1111-1111-1111-111111111111'), 3);
    assert.ok(host1.assetId && host2.assetId);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM ci_relationships WHERE source_ci_id=$1 AND target_ci_id=$2 AND relationship_type_id='runs_on' AND status='ACTIVE'", [vmAssetId, host1.assetId])).rows[0].count), 1);

    // C: one RAM transition produces exactly one material field change.
    const vm32 = baseDto({ objectId: 'vm-a', name: 'VM A', hostname: 'shared-host', biosUuid: '11111111-1111-1111-1111-111111111111', memoryBytes: 32 * gib, ip: '10.20.30.40', relationshipTarget: 'host-1' });
    const ramChange = await ingest(run1, vm32, 4);
    assert.deepEqual(ramChange.changedFields.filter((field) => field === 'compute.memoryBytes'), ['compute.memoryBytes']);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM cmdb_asset_changes WHERE asset_id=$1 AND field_path='compute.memoryBytes'", [vmAssetId])).rows[0].count), 1);
    await ingest(run1, vm32, 5);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM cmdb_asset_changes WHERE asset_id=$1 AND field_path='compute.memoryBytes'", [vmAssetId])).rows[0].count), 1);

    // D: IP change is normalized and produces one aggregate network change.
    const vmIpChanged = baseDto({ objectId: 'vm-a', name: 'VM A', hostname: 'shared-host', biosUuid: '11111111-1111-1111-1111-111111111111', memoryBytes: 32 * gib, ip: '10.20.30.41', relationshipTarget: 'host-1' });
    await ingest(run1, vmIpChanged, 6);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM cmdb_asset_changes WHERE asset_id=$1 AND field_path='network'", [vmAssetId])).rows[0].count), 1);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM cmdb_ip_addresses WHERE asset_id=$1 AND host(ip_address)='10.20.30.41' AND retired_at IS NULL", [vmAssetId])).rows[0].count), 1);

    // E: relationship movement retires old evidence and activates one new edge.
    const vmMoved = baseDto({ objectId: 'vm-a', name: 'VM A', hostname: 'shared-host', biosUuid: '11111111-1111-1111-1111-111111111111', memoryBytes: 32 * gib, ip: '10.20.30.41', relationshipTarget: 'host-2' });
    await ingest(run1, vmMoved, 7);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM ci_relationships WHERE source_ci_id=$1 AND target_ci_id=$2 AND relationship_type_id='runs_on' AND status='ACTIVE'", [vmAssetId, host2.assetId])).rows[0].count), 1);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM ci_relationships WHERE source_ci_id=$1 AND target_ci_id=$2 AND relationship_type_id='runs_on' AND status='RETIRED'", [vmAssetId, host1.assetId])).rows[0].count), 1);

    // Discovery never owns business governance fields.
    await pgClient.query("UPDATE configuration_items SET owner_user_id='user-cmdb-test',criticality='CRITICAL' WHERE id=$1", [vmAssetId]);
    await ingest(run1, vmMoved, 8);
    const governed = (await pgClient.query('SELECT owner_user_id,criticality FROM configuration_items WHERE id=$1', [vmAssetId])).rows[0];
    assert.equal(governed.owner_user_id, 'user-cmdb-test');
    assert.equal(governed.criticality, 'CRITICAL');

    await DiscoveryIngestionService.reconcileAndCompleteRun(run1);

    // A new run must preserve material payload/revision/normalization time when
    // unchanged, while retaining fresh immutable evidence and last-seen metadata.
    const beforeReplay = (await pgClient.query('SELECT normalized_at,revision FROM cmdb_source_records WHERE asset_id=$1', [vmAssetId])).rows[0];
    const replayHistory = Number((await pgClient.query('SELECT count(*) count FROM cmdb_asset_changes WHERE asset_id=$1', [vmAssetId])).rows[0].count);
    const replayRun = await createRun();
    const replay = await ingest(replayRun, vmMoved, 9);
    assert.equal(replay.unchanged, true);
    assert.deepEqual((await pgClient.query('SELECT normalized_at,revision FROM cmdb_source_records WHERE asset_id=$1', [vmAssetId])).rows[0], beforeReplay);
    assert.equal(Number((await pgClient.query('SELECT count(*) count FROM cmdb_asset_changes WHERE asset_id=$1', [vmAssetId])).rows[0].count), replayHistory);
    assert.equal(Number((await pgClient.query('SELECT count(*) count FROM cmdb_raw_observations WHERE sync_run_id=$1', [replayRun])).rows[0].count), 1);
    await DiscoveryIngestionService.reconcileAndCompleteRun(replayRun);

    // Incomplete snapshots never infer absence or advance the last successful cursor.
    const successfulCheckpoint = JSON.stringify({ cursor: 'last-confirmed' });
    await pgClient.query('UPDATE cmdb_discovery_connectors SET checkpoint=$2 WHERE id=$1', ['dconn-test-primary', successfulCheckpoint]);
    const beforeIncomplete = (await pgClient.query('SELECT id,status,miss_count FROM cmdb_source_records ORDER BY id')).rows;
    const failedFullRun = await createRun('dconn-test-primary', 'FULL');
    await pgClient.query('UPDATE cmdb_discovery_sync_runs SET failed_count=1,checkpoint=$2 WHERE id=$1', [failedFullRun, JSON.stringify({ cursor: 'not-safe' })]);
    assert.deepEqual(await DiscoveryIngestionService.reconcileAndCompleteRun(failedFullRun), { staleCandidates: 0, lifecycleChanges: 0 });
    assert.deepEqual((await pgClient.query('SELECT id,status,miss_count FROM cmdb_source_records ORDER BY id')).rows, beforeIncomplete);
    assert.equal((await pgClient.query('SELECT checkpoint FROM cmdb_discovery_connectors WHERE id=$1', ['dconn-test-primary'])).rows[0].checkpoint, successfulCheckpoint);
    const partialRun = await createRun('dconn-test-primary', 'FULL');
    await DiscoveryIngestionService.completePartialRun(partialRun, { cursor: 'also-not-safe' }, new Error('fixture incomplete read'));
    assert.equal((await pgClient.query('SELECT checkpoint FROM cmdb_discovery_connectors WHERE id=$1', ['dconn-test-primary'])).rows[0].checkpoint, successfulCheckpoint);
    assert.deepEqual((await pgClient.query('SELECT id,status,miss_count FROM cmdb_source_records ORDER BY id')).rows, beforeIncomplete);

    // F: one missed full scan marks stale under test policy, never deletes.
    await pgClient.query(`INSERT INTO cmdb_discovery_lifecycle_policies(scope_key,connector_id,stale_after_missed_runs,decommission_after_missed_runs)
      VALUES('dconn-test-primary','dconn-test-primary',1,2)`);
    const missingRun = await createRun('dconn-test-primary', 'FULL');
    await DiscoveryIngestionService.reconcileAndCompleteRun(missingRun);
    assert.equal((await pgClient.query('SELECT lifecycle_state FROM configuration_items WHERE id=$1', [vmAssetId])).rows[0].lifecycle_state, 'STALE');
    assert.equal(Number((await pgClient.query('SELECT count(*) AS count FROM configuration_items WHERE id=$1', [vmAssetId])).rows[0].count), 1);

    // G: reappearance reuses and reactivates the same canonical asset.
    const reappearanceRun = await createRun('dconn-test-primary', 'FULL');
    const reappeared = await ingest(reappearanceRun, vmMoved, 10);
    assert.equal(reappeared.assetId, vmAssetId);
    assert.equal(reappeared.reactivated, true);
    assert.equal((await pgClient.query('SELECT lifecycle_state FROM configuration_items WHERE id=$1', [vmAssetId])).rows[0].lifecycle_state, 'ACTIVE');
    await DiscoveryIngestionService.reconcileAndCompleteRun(reappearanceRun);

    const run2 = await createRun();
    // H: same hostname with a different strong UUID creates a different asset.
    const differentStrong = await ingest(run2, baseDto({ objectId: 'vm-b', name: 'VM B', hostname: 'shared-host', biosUuid: '99999999-9999-9999-9999-999999999999', ip: '10.20.30.50' }), 11);
    assert.ok(differentStrong.assetId);
    assert.notEqual(differentStrong.assetId, vmAssetId);

    // Same hostname without strong evidence and same-IP-only both require review, never auto-merge.
    const ambiguous = await ingest(run2, baseDto({ objectId: 'vm-ambiguous', name: 'Ambiguous', hostname: 'shared-host', ip: '10.20.30.60' }), 12);
    assert.equal(ambiguous.outcome, 'REVIEW_REQUIRED');
    assert.equal(ambiguous.assetId, undefined);
    assert.ok(ambiguous.correlationCaseId);
    const ipOnly = await ingest(run2, baseDto({ objectId: 'vm-ip-only', name: 'IP only', hostname: 'unique-ip-only', ip: '10.20.30.41' }), 13);
    assert.equal(ipOnly.outcome, 'REVIEW_REQUIRED');
    assert.equal(ipOnly.assetId, undefined);

    // Concurrent identical delivery still creates one source record and one asset.
    const concurrentDto = baseDto({ objectId: 'vm-concurrent', name: 'Concurrent VM', hostname: 'concurrent-vm', biosUuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', ip: '10.20.30.70' });
    const [concurrentA, concurrentB] = await Promise.all([ingest(run2, concurrentDto, 14), ingest(run2, concurrentDto, 14)]);
    assert.equal(concurrentA.assetId, concurrentB.assetId);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM cmdb_source_records WHERE external_object_id='vm-concurrent'")).rows[0].count), 1);
    assert.equal(Number((await pgClient.query('SELECT count(*) AS count FROM configuration_items WHERE id=$1', [concurrentA.assetId])).rows[0].count), 1);
    await DiscoveryIngestionService.reconcileAndCompleteRun(run2);

    // Cortex + Active Directory + vCenter observations for one endpoint keep
    // one canonical asset: AD links to the Cortex-created CI, while vCenter
    // remains source evidence until governed correlation.
    const secondaryRun = await createRun('dconn-test-secondary');
    const secondary = await ingest(secondaryRun, baseDto({ connectorId: 'dconn-test-secondary', objectId: 'foreign-vm-a', name: 'VM A from second source', hostname: 'another-hostname', biosUuid: '11111111-1111-1111-1111-111111111111', ip: '172.16.10.10' }), 15);
    assert.equal(secondary.assetId, vmAssetId);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM cmdb_source_records WHERE asset_id=$1", [vmAssetId])).rows[0].count), 2);
    await DiscoveryIngestionService.reconcileAndCompleteRun(secondaryRun);

    // Two strong identifiers that already belong to different canonical
    // assets are a conflict, never a merge. The source identity stays
    // unmatched and receives a reconciliation case.
    const strongConflict = baseDto({ objectId: 'vm-strong-conflict', name: 'Conflicting VM', hostname: 'conflicting-vm', biosUuid: '11111111-1111-1111-1111-111111111111' });
    strongConflict.identity.identifiers.push({ type: 'BIOS_UUID', namespace: 'GLOBAL', value: '99999999-9999-9999-9999-999999999999', confidence: 100, primary: false });
    const conflictRun = await createRun();
    const conflicted = await ingest(conflictRun, strongConflict, 15);
    assert.equal(conflicted.outcome, 'IDENTITY_CONFLICT');
    assert.equal(conflicted.assetId, undefined);
    assert.ok(conflicted.correlationCaseId);
    await DiscoveryIngestionService.reconcileAndCompleteRun(conflictRun);

    // vCenter evidence is normalized and reconciled before canonical creation;
    // it never bypasses the generic reconciliation decision.
    const assetsBeforeVCenter = Number((await pgClient.query('SELECT count(*) AS count FROM configuration_items')).rows[0].count);
    const vcenterRun = await createRun('dconn-test-vcenter');
    const vcenter = await ingest(vcenterRun, baseDto({ connectorId: 'dconn-test-vcenter', objectId: 'vm-vcenter-only', name: 'vCenter-only VM', hostname: 'vcenter-only-host', biosUuid: 'cccccccc-cccc-cccc-cccc-cccccccccccc', ip: '10.20.30.80' }), 16);
    assert.equal(vcenter.outcome, 'CREATE_NEW');
    assert.equal(vcenter.assetCreated, true);
    assert.ok(vcenter.assetId);
    assert.equal(Number((await pgClient.query('SELECT count(*) AS count FROM configuration_items')).rows[0].count), assetsBeforeVCenter + 1);
    assert.equal(Number((await pgClient.query("SELECT count(*) AS count FROM cmdb_source_records WHERE connector_id='dconn-test-vcenter' AND external_object_id='vm-vcenter-only' AND asset_id=$1", [vcenter.assetId])).rows[0].count), 1);
    assert.equal((await pgClient.query('SELECT processing_status FROM cmdb_raw_observations WHERE id=$1', [vcenter.observationId])).rows[0].processing_status, 'PROCESSED');
    await DiscoveryIngestionService.reconcileAndCompleteRun(vcenterRun);

    // Required acceptance: one server observed by Cortex, AD and vCenter is
    // one canonical asset. Source identities and authoritative attributes stay
    // separately traceable. The link uses exact FQDN + OS/source corroboration
    // and exact FQDN + MAC; hostname/IP alone are never sufficient.
    const tripleFqdn = 'triple-source-01.bank.example';
    const tripleMac = '02:aa:bb:cc:dd:77';
    const cortexTriple = normalizedDiscoveryDtoSchema.parse({
      schemaVersion: 1, source: { connectorId: 'dconn-test-primary', objectType: 'CORTEX_ENDPOINT', objectId: 'cortex-endpoint-triple', nativeUuid: 'cortex-endpoint-triple' },
      identity: { name: 'triple-source-01', hostname: 'triple-source-01', fqdn: tripleFqdn, identifiers: [{ type: 'EDR_DEVICE_ID', namespace: 'dconn-test-primary', value: 'cortex-endpoint-triple', confidence: 100, primary: true }, { type: 'FQDN', namespace: 'DNS', value: tripleFqdn, confidence: 90, primary: false }, { type: 'MAC_ADDRESS', namespace: 'GLOBAL', value: tripleMac, confidence: 80, primary: false }] },
      classification: { type: 'physical_server', subtype: 'SERVER', environment: 'TEST' }, compute: {},
      operatingSystem: { reported: 'Windows Server 2022', version: '2022' }, network: { interfaces: [{ key: 'cortex-nic', technicalState: 'UP', virtual: false, macAddresses: [tripleMac], ipAddresses: [{ address: '10.77.0.10', role: 'ENDPOINT', primary: true, dynamic: true }] }] },
      storage: { disks: [] }, placement: { relationships: [] }, tags: [], technicalState: 'CONNECTED', sourceSpecificMetadata: { cortex: { endpointId: 'cortex-endpoint-triple', agentInstalled: true, agentStatus: 'CONNECTED', agentVersion: '8.7.1', protectionState: 'PROTECTED', contentStatus: 'up_to_date', contentVersion: '9001', firstSeen: '2026-08-01T00:00:00.000Z', lastSeen: '2026-08-28T08:17:00.000Z' } },
    });
    const cortexRun = await createRun('dconn-test-primary');
    const cortexResult = await ingest(cortexRun, cortexTriple, 17);
    assert.ok(cortexResult.assetId);
    await DiscoveryIngestionService.reconcileAndCompleteRun(cortexRun);

    const adTriple = normalizedDiscoveryDtoSchema.parse({
      schemaVersion: 1, source: { connectorId: 'dconn-test-secondary', objectType: 'Computer', objectId: 'ad-object-guid-triple', nativeUuid: 'ad-object-guid-triple' },
      identity: { name: 'TRIPLE-SOURCE-01$', hostname: 'triple-source-01', fqdn: tripleFqdn, identifiers: [{ type: 'AD_OBJECT_GUID', namespace: 'dconn-test-secondary', value: 'ad-object-guid-triple', confidence: 100, primary: true }, { type: 'FQDN', namespace: 'DNS', value: tripleFqdn, confidence: 90, primary: false }] },
      classification: { type: 'physical_server', subtype: 'Computer', environment: 'TEST' }, compute: {}, operatingSystem: { configured: 'Windows Server 2022' }, network: { interfaces: [] }, storage: { disks: [] }, placement: { relationships: [] }, tags: [], technicalState: 'ACTIVE', sourceSpecificMetadata: { distinguishedName: 'CN=TRIPLE-SOURCE-01,OU=Servers,DC=bank,DC=example', accountStatus: { enabled: true } },
    });
    const adRun = await createRun('dconn-test-secondary');
    const adResult = await ingest(adRun, adTriple, 18);
    assert.equal(adResult.outcome, 'AUTO_LINK'); assert.equal(adResult.assetId, cortexResult.assetId);
    await DiscoveryIngestionService.reconcileAndCompleteRun(adRun);

    const vcenterTriple = normalizedDiscoveryDtoSchema.parse({
      schemaVersion: 1, source: { connectorId: 'dconn-test-vcenter', objectType: 'VirtualMachine', objectId: 'vm-triple', nativeUuid: 'bios-triple' },
      identity: { name: 'Triple source VM', hostname: 'triple-source-01', fqdn: tripleFqdn, identifiers: [{ type: 'BIOS_UUID', namespace: 'GLOBAL', value: '77777777-7777-7777-7777-777777777777', confidence: 100, primary: true }, { type: 'FQDN', namespace: 'DNS', value: tripleFqdn, confidence: 90, primary: false }, { type: 'MAC_ADDRESS', namespace: 'GLOBAL', value: tripleMac, confidence: 80, primary: false }] },
      classification: { type: 'virtual_machine', environment: 'TEST' }, compute: { cpuCount: 8, memoryBytes: 32 * gib }, operatingSystem: { configured: 'windows9Server64Guest', reported: 'Windows Server 2022' }, network: { interfaces: [{ key: '4000', technicalState: 'CONNECTED', virtual: true, macAddresses: [tripleMac], ipAddresses: [{ address: '10.77.0.11', role: 'GUEST', primary: true, dynamic: true }] }] }, storage: { disks: [] }, placement: { relationships: [] }, tags: [], technicalState: 'POWERED_ON', sourceSpecificMetadata: { vcenterObjectType: 'VirtualMachine', vcenterObjectId: 'vm-triple' },
    });
    const tripleVcenterRun = await createRun('dconn-test-vcenter');
    const vcenterResult = await ingest(tripleVcenterRun, vcenterTriple, 19);
    assert.equal(vcenterResult.outcome, 'AUTO_LINK'); assert.equal(vcenterResult.assetId, cortexResult.assetId);
    await DiscoveryIngestionService.reconcileAndCompleteRun(tripleVcenterRun);
    const tripleSources = await pgClient.query("SELECT count(*) count,count(DISTINCT asset_id) assets FROM cmdb_source_records WHERE (connector_id,external_object_id) IN (('dconn-test-primary','cortex-endpoint-triple'),('dconn-test-secondary','ad-object-guid-triple'),('dconn-test-vcenter','vm-triple'))");
    assert.equal(Number(tripleSources.rows[0].count), 3); assert.equal(Number(tripleSources.rows[0].assets), 1);
    const traceable = await pgClient.query("SELECT identifier_type_id,connector_id,source_record_id FROM cmdb_asset_identifiers WHERE asset_id=$1 AND identifier_type_id IN ('EDR_DEVICE_ID','AD_OBJECT_GUID','BIOS_UUID') AND retired_at IS NULL", [cortexResult.assetId]);
    assert.deepEqual(new Set(traceable.rows.map((row) => row.identifier_type_id)), new Set(['EDR_DEVICE_ID','AD_OBJECT_GUID','BIOS_UUID']));
    assert.ok(traceable.rows.every((row) => row.connector_id && row.source_record_id));
    const authoritative = await pgClient.query("SELECT attribute_path,connector_id FROM cmdb_asset_attribute_state WHERE asset_id=$1 AND attribute_path IN ('compute.cpuCount','operatingSystem.name')", [cortexResult.assetId]);
    assert.equal(authoritative.rows.find((row) => row.attribute_path === 'compute.cpuCount')?.connector_id, 'dconn-test-vcenter');
    assert.equal(authoritative.rows.find((row) => row.attribute_path === 'operatingSystem.name')?.connector_id, 'dconn-test-primary');

    // The database claim guard is the final integrity boundary: an adapter
    // cannot attach an active strong identifier to a second canonical asset.
    await assert.rejects(
      pgClient.query(`INSERT INTO cmdb_asset_identifiers(id,asset_id,identifier_type_id,namespace,value,normalized_value,source,confidence,is_primary,first_seen_at,last_seen_at)
        VALUES('identifier-conflict-test',$1,'BIOS_UUID','GLOBAL','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','TEST',100,FALSE,NOW(),NOW())`, [differentStrong.assetId]),
      /already claimed|duplicate key/i,
    );

    const counts = (await pgClient.query(`SELECT
      (SELECT count(*) FROM configuration_items) AS assets,
      (SELECT count(*) FROM cmdb_source_records) AS source_records,
      (SELECT count(*) FROM cmdb_correlation_cases WHERE status='OPEN') AS open_cases,
      (SELECT count(*) FROM outbox_events WHERE topic='asset.correlation.required') AS correlation_events`)).rows[0];
    assert.ok(Number(counts.assets) >= 5);
    assert.ok(Number(counts.source_records) >= 8);
    assert.ok(Number(counts.open_cases) >= 2);
    assert.ok(Number(counts.correlation_events) >= 2);
  } finally {
    await pgClient.close();
  }
});
