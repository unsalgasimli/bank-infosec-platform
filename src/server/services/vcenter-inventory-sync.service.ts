import crypto from 'node:crypto';
import { isIP } from 'node:net';
import type { BankUser } from '../../shared/types/auth.js';
import type { DiscoveryPayloadMapper } from './discovery-ingestion.service.js';
import { DiscoveryIngestionService } from './discovery-ingestion.service.js';
import { pgClient } from '../db/postgres/client.js';
import { defaultVCenterRuntimeService } from './vcenter-runtime.service.js';
import type { VCenterInventoryObject } from '../integrations/vcenter/vcenter-connector.js';

type RawInventory = VCenterInventoryObject;

// These are the persisted `cmdb_ci_types.id` values from the canonical CMDB
// taxonomy. Never pass display labels or source-specific type names into the
// normalizer: discovery ingestion checks this foreign key transactionally.
const typeMap: Record<RawInventory['objectType'], string> = {
  VirtualMachine: 'virtual_machine',
  HostSystem: 'hypervisor',
  ClusterComputeResource: 'cluster',
  Datacenter: 'datacenter',
  Datastore: 'datastore',
  Network: 'network',
  ResourcePool: 'infrastructure',
  VCenterServer: 'vcenter',
};

function identifiersFor(value: RawInventory, connectorId: string) {
  const payload = value.payload;
  const identifiers: Array<{ type: 'VMWARE_INSTANCE_UUID' | 'BIOS_UUID' | 'SERIAL_NUMBER' | 'FQDN'; namespace: string; value: string; confidence: number; primary: boolean }> = [];
  const vmInstanceUuid = payload.instance_uuid ?? payload.vm_uuid ?? payload.instanceUuid;
  if ((value.objectType === 'VirtualMachine' || value.objectType === 'VCenterServer') && typeof vmInstanceUuid === 'string' && vmInstanceUuid.trim()) {
    identifiers.push({ type: 'VMWARE_INSTANCE_UUID', namespace: connectorId, value: vmInstanceUuid, confidence: 100, primary: true });
  }
  if (typeof payload.bios_uuid === 'string' && payload.bios_uuid.trim()) {
    identifiers.push({ type: 'BIOS_UUID', namespace: 'global', value: payload.bios_uuid, confidence: 100, primary: identifiers.length === 0 });
  }
  if (value.objectType === 'HostSystem' && typeof payload.serial_number === 'string' && payload.serial_number.trim()) {
    identifiers.push({ type: 'SERIAL_NUMBER', namespace: 'global', value: payload.serial_number, confidence: 100, primary: identifiers.length === 0 });
  }
  return identifiers;
}

function stringRef(payload: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const records = (payload: Record<string, unknown>, key: string): Record<string, unknown>[] => Array.isArray(payload[key]) ? payload[key].map(record).filter((value) => Object.keys(value).length > 0) : [];
const finiteInteger = (value: unknown): number | undefined => { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined; };

function networkFor(payload: Record<string, unknown>) {
  const guest = record(payload.guest);
  const guestIp = stringRef(guest, 'ip_address', 'ipAddress');
  const guestHostname = stringRef(guest, 'host_name', 'hostname');
  const guestAddress = guestIp && isIP(guestIp) ? { address: guestIp, role: 'GUEST' as const, ...(guestHostname ? { dnsName: guestHostname } : {}), primary: true, dynamic: true } : undefined;
  const interfaces = records(payload, 'nics').flatMap((nic, index) => {
    const key = stringRef(nic, 'nic', 'id', 'key'); if (!key) return [];
    const mac = stringRef(nic, 'mac_address', 'macAddress');
    return [{ key, ...(stringRef(nic, 'label', 'name') ? { name: stringRef(nic, 'label', 'name') } : {}), ...(stringRef(nic, 'type') ? { type: stringRef(nic, 'type') } : {}), technicalState: stringRef(nic, 'state') || 'UNKNOWN', virtual: true, macAddresses: mac ? [mac] : [], ipAddresses: index === 0 && guestAddress ? [guestAddress] : [] }];
  });
  if (interfaces.length === 0 && guestAddress) interfaces.push({ key: 'guest-identity', name: 'Guest identity', type: 'VMWARE_GUEST', technicalState: 'UNKNOWN', virtual: true, macAddresses: [], ipAddresses: [guestAddress] });
  return { interfaces };
}

function storageFor(payload: Record<string, unknown>) {
  return { disks: records(payload, 'disks').flatMap((disk) => {
    const key = stringRef(disk, 'disk', 'id', 'key'); if (!key) return [];
    const backing = record(disk.backing); const capacityBytes = finiteInteger(disk.capacity);
    return [{ key, name: stringRef(disk, 'label', 'name') || `Disk ${key}`, type: stringRef(disk, 'type') || 'UNKNOWN', technicalState: 'CONNECTED', ...(capacityBytes !== undefined ? { capacityBytes } : {}), ...(stringRef(backing, 'vmdk_file') ? { mountPath: stringRef(backing, 'vmdk_file') } : {}) }];
  }) };
}

/**
 * Emit source-scoped relationship evidence only when vCenter provides a
 * stable MoRef. The ingestion engine resolves these after both records are
 * seen, so inventory collection order cannot create a frontend-only graph.
 */
function relationshipsFor(value: RawInventory) {
  const host = stringRef(value.payload, 'host');
  const cluster = stringRef(value.payload, 'cluster');
  const datacenter = stringRef(value.payload, 'datacenter');
  const relationships: Array<{ type: 'RUNS_ON' | 'MEMBER_OF' | 'LOCATED_IN' | 'CONNECTED_TO' | 'STORED_ON' | 'MANAGED_BY'; target: { objectType: string; objectId: string; identifiers: [] }; confidence: number }> = [];
  if (value.objectType === 'VirtualMachine' && host) relationships.push({ type: 'RUNS_ON', target: { objectType: 'HostSystem', objectId: host, identifiers: [] }, confidence: 100 });
  if (value.objectType === 'HostSystem' && cluster) relationships.push({ type: 'MEMBER_OF', target: { objectType: 'ClusterComputeResource', objectId: cluster, identifiers: [] }, confidence: 100 });
  if (datacenter && value.objectType !== 'Datacenter') relationships.push({ type: 'LOCATED_IN', target: { objectType: 'Datacenter', objectId: datacenter, identifiers: [] }, confidence: 100 });
  const vcenter = stringRef(value.payload, 'vcenter');
  if (vcenter && value.objectType !== 'VCenterServer') relationships.push({ type: 'MANAGED_BY', target: { objectType: 'VCenterServer', objectId: vcenter, identifiers: [] }, confidence: 100 });
  if (value.objectType === 'VirtualMachine') {
    for (const nic of records(value.payload, 'nics')) {
      const network = stringRef(record(nic.backing), 'network');
      if (network) relationships.push({ type: 'CONNECTED_TO', target: { objectType: 'Network', objectId: network, identifiers: [] }, confidence: 100 });
    }
    for (const disk of records(value.payload, 'disks')) {
      const datastore = stringRef(record(disk.backing), 'datastore');
      if (datastore) relationships.push({ type: 'STORED_ON', target: { objectType: 'Datastore', objectId: datastore, identifiers: [] }, confidence: 100 });
    }
  }
  return relationships;
}

export const vCenterInventoryPayloadMapper: DiscoveryPayloadMapper<RawInventory> = {
  name: 'vcenter-rest-inventory-v1', normalizedSchemaVersion: 1,
  validateRaw(payload: unknown): RawInventory { const value = payload as RawInventory; if (!value || !typeMap[value.objectType] || !value.objectId || !value.name || !value.payload) throw new Error('Invalid vCenter inventory object.'); return value; },
  normalize(value, envelope) {
    const p = value.payload; const cpu = finiteInteger(p.cpu_count) ?? finiteInteger(record(p.cpu).count); const memoryMiB = finiteInteger(p.memory_size_MiB) ?? finiteInteger(record(p.memory).size_MiB);
    const identifiers = identifiersFor(value, envelope.connectorId);
    const guest = record(p.guest); const configuredOs = stringRef(p, 'guest_os', 'guestOs'); const reportedOs = stringRef(guest, 'name', 'full_name') || configuredOs;
    const guestName = stringRef(guest, 'host_name', 'hostname'); const guestFqdn = guestName?.includes('.') ? guestName : undefined; const guestHostname = guestName;
    if (guestFqdn) identifiers.push({ type: 'FQDN', namespace: 'DNS', value: guestFqdn, confidence: 90, primary: false });
    return { schemaVersion: 1 as const, source: { connectorId: envelope.connectorId, objectType: value.objectType, objectId: value.objectId, ...(typeof p.bios_uuid === 'string' ? { nativeUuid: p.bios_uuid } : {}) }, identity: { name: value.name, ...(guestHostname ? { hostname: guestHostname } : {}), ...(guestFqdn ? { fqdn: guestFqdn } : {}), identifiers }, classification: { type: typeMap[value.objectType], environment: 'UNKNOWN' as const }, compute: { ...(cpu !== undefined ? { cpuCount: cpu } : {}), ...(memoryMiB !== undefined ? { memoryBytes: memoryMiB * 1024 * 1024 } : {}) }, operatingSystem: { ...(configuredOs ? { configured: configuredOs } : {}), ...(reportedOs ? { reported: reportedOs } : {}) }, network: networkFor(p), storage: storageFor(p), placement: { relationships: relationshipsFor(value) }, tags: [], technicalState: String(p.power_state || p.connection_state || 'UNKNOWN').slice(0, 64), sourceSpecificMetadata: { vcenterObjectType: value.objectType, vcenterObjectId: value.objectId, inventorySummary: p } };
  },
};

export class VCenterInventorySyncService {
  /**
   * Persist the command before it reaches RabbitMQ. The request path performs
   * no vCenter network I/O and a broker outage leaves the command durable in
   * the transactional outbox instead of losing a user-requested sync.
   */
  public static async enqueue(connectorId: string, actor: BankUser, runType: 'FULL' | 'INCREMENTAL' = 'FULL', context: { correlationId?: string } = {}): Promise<{ runId: string; state: 'QUEUED'; runType: 'FULL' | 'INCREMENTAL' }> {
    const runId = `dsrun-${crypto.randomUUID()}`;
    try {
      await pgClient.transaction(async (client) => {
        const connector = await client.query('SELECT id FROM cmdb_discovery_connectors WHERE id=$1 AND connector_type_id=$2 AND enabled AND deleted_at IS NULL FOR UPDATE', [connectorId, 'VCENTER']);
        if (!connector.rows[0]) throw Object.assign(new Error('Enabled vCenter connector was not found.'), { statusCode: 404, code: 'DISCOVERY_CONNECTOR_NOT_FOUND' });
        await client.query(`INSERT INTO cmdb_discovery_sync_runs(id,connector_id,run_type,state,requested_by_user_id,correlation_id,queued_at) VALUES($1,$2,$3,'QUEUED',$4,$5,NOW())`, [runId, connectorId, runType, actor.id, context.correlationId || null]);
        await client.query(`INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload,correlation_id,occurred_at)
          VALUES($1,'cmdb.discovery.sync.requested','DISCOVERY_SYNC_RUN',$2,$3::jsonb,$4,NOW())`, [
          `out-${crypto.randomUUID()}`, runId,
          JSON.stringify({ runId, connectorId, actorId: actor.id, runType }), context.correlationId || `cmdb.discovery.sync:${runId}`,
        ]);
      });
    } catch (error: any) {
      if (error?.code === '23505' && error?.constraint === 'uq_cmdb_discovery_connector_active_run') {
        throw Object.assign(new Error('Another inventory sync is already running for this vCenter connector.'), { statusCode: 409, code: 'CONNECTOR_SYNC_LOCKED' });
      }
      throw error;
    }
    return { runId, state: 'QUEUED', runType };
  }

  /** Called only by the durable outbox worker for the run created by enqueue(). */
  public static async runQueued(runId: string, context: { correlationId?: string } = {}): Promise<{ runId: string; discovered: number; failed: number; state: string }> {
    const run = await pgClient.transaction(async (client) => {
      const result = await client.query<{ connector_id: string; state: string; run_type: 'FULL' | 'INCREMENTAL' }>('SELECT connector_id,state,run_type FROM cmdb_discovery_sync_runs WHERE id=$1 FOR UPDATE', [runId]);
      const row = result.rows[0];
      if (!row) throw Object.assign(new Error('Discovery sync run was not found.'), { code: 'DISCOVERY_RUN_NOT_FOUND' });
      if (['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(row.state)) return row;
      await client.query("UPDATE cmdb_discovery_sync_runs SET state='RUNNING',started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=$1", [runId]);
      return row;
    });
    if (['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(run.state)) return { runId, discovered: 0, failed: 0, state: run.state };
    try {
      const connector = await pgClient.query<{ name: string; detected_instance_uuid: string | null; detected_product: string | null; detected_version: string | null; detected_build: string | null }>(`SELECT name,detected_instance_uuid,detected_product,detected_version,detected_build FROM cmdb_discovery_connectors WHERE id=$1 AND connector_type_id='VCENTER' AND deleted_at IS NULL`, [run.connector_id]);
      if (!connector.rows[0]) throw Object.assign(new Error('vCenter connector was not found.'), { code: 'DISCOVERY_CONNECTOR_NOT_FOUND' });
      const source = connector.rows[0];
      await pgClient.query("UPDATE cmdb_discovery_sync_runs SET discovered_count=1,checkpoint='Collecting vCenter inventory',updated_at=NOW() WHERE id=$1 AND state='RUNNING'", [runId]);
      const inventory = await defaultVCenterRuntimeService.discoverInventory(run.connector_id, context, async (progress) => {
        await pgClient.query("UPDATE cmdb_discovery_sync_runs SET discovered_count=$2,checkpoint=$3,updated_at=NOW() WHERE id=$1 AND state='RUNNING'", [runId, progress.discovered + 1, `${progress.phase === 'LISTED' ? 'Listing' : 'Collected'} ${progress.objectType} inventory`]);
      });
      const objects: VCenterInventoryObject[] = [{ objectType: 'VCenterServer', objectId: run.connector_id, name: source.name, payload: { vcenter: run.connector_id, ...(source.detected_instance_uuid ? { instance_uuid: source.detected_instance_uuid } : {}), ...(source.detected_product ? { product: source.detected_product } : {}), ...(source.detected_version ? { version: source.detected_version } : {}), ...(source.detected_build ? { build: source.detected_build } : {}) } }, ...inventory.map((object) => ({ ...object, payload: { ...object.payload, vcenter: run.connector_id } }))];
      const observedAt = new Date().toISOString();
      const batch = await DiscoveryIngestionService.ingestBatch(objects.map((rawPayload) => ({ connectorId: run.connector_id, syncRunId: runId, sourceObjectType: rawPayload.objectType, sourceObjectId: rawPayload.objectId, observedAt, rawPayload })), vCenterInventoryPayloadMapper);
      // reconcileAndCompleteRun explicitly performs absence handling only for
      // FULL/RECONCILIATION runs. Incremental runs complete and update their
      // checkpoint/health without inferring that unseen assets disappeared.
      if (batch.failed.length) await DiscoveryIngestionService.completePartialRun(runId, { reason: 'INVALID_RECORDS', failedRecords: batch.failed.length });
      else await DiscoveryIngestionService.reconcileAndCompleteRun(runId);
      return { runId, discovered: batch.succeeded.length, failed: batch.failed.length, state: batch.failed.length ? 'PARTIAL' : 'SUCCEEDED' };
    } catch (error: any) {
      // Preserve the authoritative run for bounded broker retry. A transient
      // source failure must never be recorded as a completed/failed scan and
      // must never trigger absence reconciliation.
      if (error?.retryable === true) {
        await pgClient.query(`UPDATE cmdb_discovery_sync_runs SET state='QUEUED',updated_at=NOW(),
          error_summary=error_summary || jsonb_build_array(jsonb_build_object('message',$2,'at',NOW(),'retryable',true))
          WHERE id=$1 AND state='RUNNING'`, [runId, String(error?.message || error).slice(0, 4000)]);
        throw error;
      }
      await DiscoveryIngestionService.failRun(runId, error); throw error;
    }
  }
}
