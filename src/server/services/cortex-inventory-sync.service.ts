import crypto from 'node:crypto';
import { isIP } from 'node:net';
import fs from 'node:fs/promises';
import { z } from 'zod';
import type { BankUser } from '../../shared/types/auth.js';
import type { NormalizedDiscoveryDto } from '../../shared/utils/cmdb-discovery-contract.js';
import { resolveSecret } from '../utils/crypto.js';
import { CortexClient, CortexConnectorError } from '../integrations/cortex/cortex-client.js';
import { assertCortexResolvedTarget } from '../integrations/cortex/cortex-endpoint-policy.js';
import { pgClient } from '../db/postgres/client.js';
import { DiscoveryIngestionService, type DiscoveryPayloadMapper } from './discovery-ingestion.service.js';
import { logger } from './logger.service.js';
import { withTelemetrySpan } from './telemetry.service.js';

type CortexEndpoint = Record<string, unknown>;
const endpointSchema = z.object({ endpoint_id: z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim().min(1).max(512)) }).passthrough();
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim().slice(0, 2048) : typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
const first = (record: CortexEndpoint, ...keys: string[]) => keys.map((key) => text(record[key])).find(Boolean);
const strings = (value: unknown) => (Array.isArray(value) ? value : value == null ? [] : [value]).map(text).filter((item): item is string => Boolean(item));
const ips = (record: CortexEndpoint) => strings(record.ip_addresses ?? record.ip_address ?? record.ip).filter((value) => isIP(value) !== 0);
const macs = (record: CortexEndpoint) => strings(record.mac_addresses ?? record.mac_address ?? record.mac).filter((value) => /^[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}$/.test(value));
const state = (record: CortexEndpoint) => first(record, 'agent_status', 'endpoint_status', 'status') || 'UNKNOWN';

export const cortexEndpointPayloadMapper: DiscoveryPayloadMapper<CortexEndpoint> = {
  name: 'cortex-xdr-endpoints-v1', normalizedSchemaVersion: 1,
  validateRaw(payload: unknown) { const parsed = endpointSchema.safeParse(payload); if (!parsed.success) throw new Error('Invalid Cortex endpoint record: persistent endpoint_id is required.'); return parsed.data; },
  normalize(record, envelope): NormalizedDiscoveryDto {
    const endpointId = String(record.endpoint_id); const hostname = first(record, 'endpoint_name', 'hostname', 'host_name', 'device_name'); const fqdn = first(record, 'fqdn', 'endpoint_fqdn'); const domain = first(record, 'domain', 'domain_name');
    const display = hostname || fqdn || endpointId; const addressList = ips(record); const macList = macs(record);
    const interfaces = addressList.length || macList.length ? [{ key: `cortex-${endpointId}`, name: 'Cortex endpoint interface', technicalState: 'UNKNOWN', virtual: false, macAddresses: macList, ipAddresses: addressList.map((address, index) => ({ address, role: 'ENDPOINT', primary: index === 0, dynamic: true })) }] : [];
    const identifiers: NormalizedDiscoveryDto['identity']['identifiers'] = [{ type: 'EDR_DEVICE_ID', namespace: envelope.connectorId, value: endpointId, confidence: 100, primary: true }];
    if (fqdn) identifiers.push({ type: 'FQDN', namespace: domain || 'DNS', value: fqdn, confidence: 90, primary: false });
    for (const mac of macList) identifiers.push({ type: 'MAC_ADDRESS', namespace: 'GLOBAL', value: mac, confidence: 80, primary: false });
    const endpointType = first(record, 'endpoint_type', 'device_type', 'type');
    return { schemaVersion: 1, source: { connectorId: envelope.connectorId, objectType: 'CORTEX_ENDPOINT', objectId: endpointId, nativeUuid: endpointId }, identity: { name: display, ...(hostname ? { hostname } : {}), ...(fqdn ? { fqdn } : {}), identifiers }, classification: { type: /laptop|notebook/i.test(endpointType || '') ? 'laptop' : 'workstation', ...(endpointType ? { subtype: endpointType } : {}), environment: 'UNKNOWN' }, compute: {}, network: { interfaces }, storage: { disks: [] }, operatingSystem: { ...(first(record, 'os_type', 'os_name', 'operating_system') ? { reported: first(record, 'os_type', 'os_name', 'operating_system') } : {}), ...(first(record, 'os_version', 'os_build_number', 'os_build') ? { version: first(record, 'os_version', 'os_build_number', 'os_build') } : {}) }, placement: { relationships: [] }, tags: [], technicalState: state(record), sourceSpecificMetadata: { cortex: { endpointId, domain, architecture: first(record, 'architecture', 'os_architecture'), agentVersion: first(record, 'agent_version'), agentStatus: state(record), firstSeen: first(record, 'first_seen', 'first_seen_timestamp'), lastSeen: first(record, 'last_seen', 'last_seen_timestamp'), isolationStatus: first(record, 'is_isolated', 'isolation_status'), deviceGroup: first(record, 'group_name', 'group_id', 'device_group'), securityTelemetry: record } } };
  },
};

function secret(reference: unknown): string {
  const match = /^env:\/\/([A-Z][A-Z0-9_]*)$/.exec(String(reference || ''));
  // Legacy rows can contain a raw/obsolete reference. Always resolve the
  // server-owned standard variable instead of using any stored secret value.
  const environmentKey = match?.[1] || 'CORTEX_API_KEY';
  const value = process.env[environmentKey];
  if (!value) throw new CortexConnectorError('CORTEX_SECRET_UNAVAILABLE', `Cortex API secret ${environmentKey} is unavailable to this server.`);
  return resolveSecret(value);
}
async function configFor(row: any) { const c = row.non_secret_configuration || {}; const apiKeyId = text(c.apiKeyId); const endpointUrl = text(c.endpointUrl); if (!apiKeyId || !endpointUrl) throw new CortexConnectorError('CORTEX_CONFIG_INVALID', 'Cortex endpointUrl and apiKeyId are required.'); const caReference = text(row.tls_ca_reference); const tlsCa = caReference ? await (async () => { if (!caReference.startsWith('file://')) throw new CortexConnectorError('CORTEX_CONFIG_INVALID', 'Custom Cortex CA references must be backend-resolved file:// references.'); return fs.readFile(new URL(caReference), 'utf8'); })() : undefined; return { endpointUrl, apiKeyId, apiKey: secret(row.secret_reference), tlsCa, tlsVerifyCertificates: row.tls_verify_certificates !== false, endpointAllowPrivateNetwork: Boolean(row.endpoint_allow_private_network), requestTimeoutMs: Number(row.request_timeout_ms || 30000), responseSizeLimitBytes: Number(c.responseSizeLimitBytes || 4194304), pageSize: Number(c.pageSize || 100), maxRetries: Number(c.maxRetries ?? 3) }; }

export class CortexInventorySyncService {
  public static async enqueue(connectorId: string, actor: BankUser, runType: 'FULL' | 'INCREMENTAL' = 'FULL', context: { correlationId?: string } = {}) {
    const runId = `dsrun-${crypto.randomUUID()}`;
    try { await pgClient.transaction(async (client) => { const connector = await client.query("SELECT id FROM cmdb_discovery_connectors WHERE id=$1 AND connector_type_id='CORTEX' AND enabled AND deleted_at IS NULL FOR UPDATE", [connectorId]); if (!connector.rows[0]) throw Object.assign(new Error('Enabled Cortex connector was not found.'), { statusCode: 404, code: 'DISCOVERY_CONNECTOR_NOT_FOUND' }); await client.query("INSERT INTO cmdb_discovery_sync_runs(id,connector_id,run_type,state,requested_by_user_id,correlation_id,queued_at) VALUES($1,$2,$3,'QUEUED',$4,$5,NOW())", [runId, connectorId, runType, actor.id, context.correlationId || null]); await client.query("INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload,correlation_id,occurred_at) VALUES($1,'cmdb.discovery.sync.requested','DISCOVERY_SYNC_RUN',$2,$3::jsonb,$4,NOW())", [`out-${crypto.randomUUID()}`, runId, JSON.stringify({ runId, connectorId, connectorType: 'CORTEX', actorId: actor.id, runType }), context.correlationId || `cmdb.discovery.sync:${runId}`]); }); } catch (error: any) { if (error?.code === '23505') throw Object.assign(new Error('Another sync is already running for this Cortex connector.'), { statusCode: 409, code: 'CONNECTOR_SYNC_LOCKED' }); throw error; }
    return { runId, state: 'QUEUED' as const, runType };
  }
  public static async testConnection(connectorId: string, correlationId = `cortex.test:${crypto.randomUUID()}`) {
    const row = await pgClient.query("SELECT non_secret_configuration,secret_reference,tls_ca_reference,tls_verify_certificates,endpoint_allow_private_network,request_timeout_ms FROM cmdb_discovery_connectors WHERE id=$1 AND connector_type_id='CORTEX' AND deleted_at IS NULL", [connectorId]); if (!row.rows[0]) throw new CortexConnectorError('DISCOVERY_CONNECTOR_NOT_FOUND', 'Cortex connector was not found.'); const configuration = await configFor(row.rows[0]); const result = await new CortexClient(configuration).page(0, correlationId); return { connectorId, endpointRecordsVisible: result.endpoints.length, totalCount: result.totalCount, transport: 'HTTPS', tlsVerification: 'ENABLED' };
  }
  public static async runQueued(runId: string, context: { correlationId?: string; signal?: AbortSignal } = {}): Promise<{ runId: string; discovered: number; failed: number; state: string }> {
    return withTelemetrySpan('cmdb.cortex.discovery.sync', { 'cmdb.discovery.source': 'CORTEX', 'cmdb.discovery.run_id': runId }, async () => this.runQueuedInternal(runId, context));
  }
  private static async runQueuedInternal(runId: string, context: { correlationId?: string; signal?: AbortSignal } = {}): Promise<{ runId: string; discovered: number; failed: number; state: string }> {
    const run = await pgClient.transaction(async (client) => { const result = await client.query<any>("SELECT r.*,c.non_secret_configuration,c.secret_reference,c.tls_ca_reference,c.tls_verify_certificates,c.endpoint_allow_private_network,c.request_timeout_ms FROM cmdb_discovery_sync_runs r JOIN cmdb_discovery_connectors c ON c.id=r.connector_id WHERE r.id=$1 AND c.connector_type_id='CORTEX' FOR UPDATE", [runId]); const row = result.rows[0]; if (!row) throw new CortexConnectorError('DISCOVERY_RUN_NOT_FOUND', 'Cortex discovery run was not found.'); if (['SUCCEEDED','PARTIAL','FAILED','CANCELLED'].includes(row.state)) return row; await client.query("UPDATE cmdb_discovery_sync_runs SET state='RUNNING',started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=$1", [runId]); return row; });
    if (['SUCCEEDED','PARTIAL','FAILED','CANCELLED'].includes(run.state)) return { runId, discovered: 0, failed: 0, state: run.state };
    let requested = 0; let received = 0; let succeeded = 0; let failed = 0; let offset = 0; const outcomes: string[] = [];
    try { const configuration = await configFor(run); const client = new CortexClient(configuration); const correlationId = context.correlationId || run.correlation_id || `cmdb.discovery.sync:${runId}`;
      for (;;) { requested += Math.min(100, Math.max(1, configuration.pageSize || 100)); const page = await client.page(offset, correlationId, context.signal); received += page.endpoints.length; const observedAt = new Date().toISOString(); const batch = await DiscoveryIngestionService.ingestBatch(page.endpoints.map((rawPayload) => ({ connectorId: run.connector_id, syncRunId: runId, sourceObjectType: 'CORTEX_ENDPOINT', sourceObjectId: String(rawPayload.endpoint_id || 'INVALID'), observedAt, rawPayload })), cortexEndpointPayloadMapper); outcomes.push(...batch.succeeded.map((item) => item.outcome)); succeeded += batch.succeeded.length; failed += batch.failed.length; offset += page.endpoints.length; await pgClient.query("UPDATE cmdb_discovery_sync_runs SET requested_count=$2,received_count=$3,checkpoint=$4,updated_at=NOW() WHERE id=$1", [runId, requested, received, JSON.stringify({ source: 'CORTEX', offset, totalCount: page.totalCount ?? null })]); if (page.endpoints.length === 0 || page.endpoints.length < Math.min(100, Math.max(1, configuration.pageSize || 100)) || (page.totalCount !== undefined && offset >= page.totalCount)) break; }
      if (failed) await DiscoveryIngestionService.completePartialRun(runId, { source: 'CORTEX', offset, requested, received, reason: 'INVALID_RECORDS' }); else await DiscoveryIngestionService.reconcileAndCompleteRun(runId);
      logger.info({ connectorId: run.connector_id, runId, correlationId, requested, received, processed: succeeded + failed, autoLinks: outcomes.filter((value) => value === 'AUTO_LINK').length, ambiguous: outcomes.filter((value) => value === 'REVIEW_REQUIRED').length, conflicts: outcomes.filter((value) => value === 'IDENTITY_CONFLICT').length, created: outcomes.filter((value) => value === 'CREATE_NEW').length, failed }, 'Cortex discovery sync completed'); return { runId, discovered: succeeded, failed, state: failed ? 'PARTIAL' : 'SUCCEEDED' };
    } catch (error: any) { const checkpoint = { source: 'CORTEX', offset, requested, received }; if (received > 0 || succeeded > 0) { await DiscoveryIngestionService.completePartialRun(runId, checkpoint, error); logger.warn({ connectorId: run.connector_id, runId, correlationId: context.correlationId, code: error?.code, requested, received }, 'Cortex discovery sync completed partially'); return { runId, discovered: succeeded, failed: failed + 1, state: 'PARTIAL' }; } await DiscoveryIngestionService.failRun(runId, error); throw error; }
  }
}
