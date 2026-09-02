import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import type { BankUser } from '../../shared/types/auth.js';
import type { NormalizedDiscoveryDto } from '../../shared/utils/cmdb-discovery-contract.js';
import { CortexClient, CortexConnectorError, type CortexApiKeySecurityLevel, type CortexCapabilities } from '../integrations/cortex/cortex-client.js';
import { pgClient } from '../db/postgres/client.js';
import { resolveSecret } from '../utils/crypto.js';
import { CortexSecurityPostureService } from './cortex-security-posture.service.js';
import { DiscoveryIngestionService, type DiscoveryPayloadMapper } from './discovery-ingestion.service.js';
import { logger } from './logger.service.js';
import { withTelemetrySpan } from './telemetry.service.js';

type CortexRecord = Record<string, unknown>;
const endpointSchema = z.object({ endpoint_id: z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim().min(1).max(512)) }).passthrough();
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim().slice(0, 2048) : typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
const first = (record: CortexRecord, ...keys: string[]) => keys.map((key) => text(record[key])).find(Boolean);
const strings = (value: unknown) => (Array.isArray(value) ? value : value == null ? [] : [value]).map(text).filter((item): item is string => Boolean(item));
const nested = (record: CortexRecord, path: string): unknown => {
  if (path in record) return record[path];
  return path.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' && !Array.isArray(value) ? (value as CortexRecord)[part] : undefined, record);
};
const pick = (record: CortexRecord, ...paths: string[]) => paths.map((path) => nested(record, path)).find((value) => value !== undefined && value !== null && value !== '');
const pickText = (record: CortexRecord, ...paths: string[]) => text(pick(record, ...paths));
const validIps = (value: unknown) => strings(value).filter((item) => isIP(item) !== 0);
const validMacs = (value: unknown) => strings(value).filter((item) => /^[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}$/.test(item));
const epoch = (value: unknown): number | undefined => { const number = Number(value); return Number.isFinite(number) && number > 0 ? (number < 10_000_000_000 ? number * 1000 : number) : undefined; };
const endpointFqdn = (hostname: string | undefined, domain: string | undefined, explicit: string | undefined) => explicit || (hostname && hostname.includes('.') ? hostname : hostname && domain && !/^workgroup$/i.test(domain) ? `${hostname}.${domain}` : undefined);

export const cortexEndpointPayloadMapper: DiscoveryPayloadMapper<CortexRecord> = {
  name: 'cortex-xdr-endpoints-v2', normalizedSchemaVersion: 1,
  validateRaw(payload: unknown) { const parsed = endpointSchema.safeParse(payload); if (!parsed.success) throw new Error('Invalid Cortex endpoint record: persistent endpoint_id is required.'); return parsed.data; },
  normalize(record, envelope): NormalizedDiscoveryDto {
    const endpointId = String(record.endpoint_id);
    const rawHostname = first(record, 'endpoint_name', 'hostname', 'host_name', 'device_name');
    const domain = first(record, 'domain', 'domain_name');
    const fqdn = endpointFqdn(rawHostname, domain, first(record, 'fqdn', 'endpoint_fqdn'));
    const hostname = rawHostname?.split('.')[0];
    const addressList = [...new Set([...validIps(record.ip), ...validIps(record.ipv6), ...validIps(record.ip_addresses), ...validIps(record.ip_address)])];
    const macList = [...new Set([...validMacs(record.mac_address), ...validMacs(record.mac_addresses), ...validMacs(record.mac)])];
    const interfaces = addressList.length || macList.length ? [{ key: `cortex-${endpointId}`, name: 'Cortex endpoint interface', technicalState: 'UNKNOWN', virtual: false, macAddresses: macList, ipAddresses: addressList.map((address, index) => ({ address, role: 'ENDPOINT', primary: index === 0, dynamic: true })) }] : [];
    const identifiers: NormalizedDiscoveryDto['identity']['identifiers'] = [{ type: 'EDR_DEVICE_ID', namespace: envelope.connectorId, value: endpointId, confidence: 100, primary: true }];
    if (fqdn) identifiers.push({ type: 'FQDN', namespace: 'DNS', value: fqdn, confidence: 90, primary: false });
    for (const mac of macList) identifiers.push({ type: 'MAC_ADDRESS', namespace: 'GLOBAL', value: mac, confidence: 80, primary: false });
    const endpointType = first(record, 'endpoint_type', 'device_type', 'type');
    const agentStatus = first(record, 'endpoint_status', 'agent_status', 'status') || 'UNKNOWN';
    const agentVersion = first(record, 'endpoint_version', 'agent_version');
    const operationalStatus = first(record, 'operational_status');
    return {
      schemaVersion: 1, source: { connectorId: envelope.connectorId, objectType: 'CORTEX_ENDPOINT', objectId: endpointId, nativeUuid: endpointId },
      identity: { name: rawHostname || fqdn || endpointId, ...(hostname ? { hostname } : {}), ...(fqdn ? { fqdn } : {}), identifiers },
      classification: { type: /laptop|notebook/i.test(endpointType || '') ? 'laptop' : /server/i.test(endpointType || '') ? 'physical_server' : 'workstation', ...(endpointType ? { subtype: endpointType } : {}), environment: 'UNKNOWN' },
      compute: {}, network: { interfaces }, storage: { disks: [] },
      operatingSystem: { ...(first(record, 'operating_system', 'os_type', 'os_name') ? { reported: first(record, 'operating_system', 'os_type', 'os_name') } : {}), ...(first(record, 'os_version', 'os_build_number', 'os_build') ? { version: first(record, 'os_version', 'os_build_number', 'os_build') } : {}) },
      placement: { relationships: [] }, tags: [], technicalState: agentStatus,
      sourceSpecificMetadata: { cortex: {
        endpointId, assetId: first(record, 'asset_id'), assetClass: 'Device', assetCategory: endpointType, assetType: endpointType,
        domain, agentInstalled: true, agentVersion, agentStatus, protectionState: operationalStatus, operationalStatus,
        firstSeen: record.first_seen, lastSeen: record.last_seen, isolationStatus: first(record, 'is_isolated', 'isolation_status'),
        contentStatus: first(record, 'content_status'), contentVersion: first(record, 'content_version'),
        assignedPreventionPolicy: first(record, 'assigned_prevention_policy'), assignedExtensionsPolicy: first(record, 'assigned_extensions_policy'),
        operationalStatusDescription: record.operational_status_description, securityTelemetry: record,
      } },
    };
  },
};

const assetIdOf = (record: CortexRecord) => pickText(record, 'xdm.asset.strong_id', 'xdm.asset.id', 'asset_id', 'id', '_id');
const typeForUnifiedAsset = (assetClass?: string, category?: string, assetType?: string): string => {
  const combined = `${assetClass || ''} ${category || ''} ${assetType || ''}`;
  if (/virtual machine|\bvm\b/i.test(combined)) return 'virtual_machine';
  if (/server/i.test(combined)) return 'physical_server';
  if (/laptop|notebook/i.test(combined)) return 'laptop';
  if (/device|endpoint|workstation|desktop/i.test(combined)) return 'workstation';
  if (/network/i.test(combined)) return 'network';
  if (/application|repository|api/i.test(combined)) return 'application';
  return 'infrastructure';
};

export const cortexUnifiedAssetPayloadMapper: DiscoveryPayloadMapper<CortexRecord> = {
  name: 'cortex-xdr-unified-assets-v1', normalizedSchemaVersion: 1,
  validateRaw(payload: unknown) { const record = payload as CortexRecord; if (!record || typeof record !== 'object' || !assetIdOf(record)) throw new Error('Invalid Cortex unified asset record: persistent asset ID is required.'); return record; },
  normalize(record, envelope): NormalizedDiscoveryDto {
    const assetId = assetIdOf(record)!;
    const assetClass = pickText(record, 'xdm.asset.type.class', 'asset_class', 'class');
    const assetCategory = pickText(record, 'xdm.asset.type.category', 'asset_category', 'category');
    const assetType = pickText(record, 'xdm.asset.type.type', 'xdm.asset.type', 'asset_type', 'type');
    const name = pickText(record, 'xdm.asset.name', 'name', 'hostname') || assetId;
    const rawFqdn = pickText(record, 'xdm.host.fqdn', 'xdm.asset.fqdn', 'fqdn');
    const rawHostname = pickText(record, 'xdm.host.hostname', 'hostname', 'host_name') || (/^[^.]+(?:\..+)?$/.test(name) ? name : undefined);
    const domain = pickText(record, 'xdm.host.domain', 'domain');
    const fqdn = endpointFqdn(rawHostname, domain, rawFqdn);
    const hostname = rawHostname?.split('.')[0];
    const macList = [...new Set(validMacs(pick(record, 'xdm.host.mac_addresses', 'mac_addresses', 'mac_address')))];
    const addressList = [...new Set([...validIps(pick(record, 'xdm.host.ipv4_addresses', 'ipv4_addresses', 'ip_addresses', 'ips')), ...validIps(pick(record, 'xdm.host.ipv6_addresses', 'ipv6_addresses'))])];
    const serialNumber = pickText(record, 'xdm.host.serial_number', 'serial_number', 'serial');
    const biosUuid = pickText(record, 'xdm.host.bios_uuid', 'bios_uuid');
    const cloudInstanceId = pickText(record, 'xdm.asset.cloud.instance_id', 'cloud_instance_id', 'instance_id');
    const endpointId = pickText(record, 'xdm.endpoint.endpoint_id', 'xdm.agent.endpoint_id', 'endpoint_id', 'agent_id');
    const identifiers: NormalizedDiscoveryDto['identity']['identifiers'] = [{ type: 'CORTEX_ASSET_ID', namespace: envelope.connectorId, value: assetId, confidence: 100, primary: true }];
    if (endpointId) identifiers.push({ type: 'EDR_DEVICE_ID', namespace: envelope.connectorId, value: endpointId, confidence: 100, primary: false });
    if (biosUuid) identifiers.push({ type: 'BIOS_UUID', namespace: 'GLOBAL', value: biosUuid, confidence: 100, primary: false });
    if (serialNumber) identifiers.push({ type: 'SERIAL_NUMBER', namespace: 'GLOBAL', value: serialNumber, confidence: 95, primary: false });
    if (cloudInstanceId) identifiers.push({ type: 'CLOUD_INSTANCE_ID', namespace: pickText(record, 'xdm.asset.cloud.provider', 'cloud_provider') || 'GLOBAL', value: cloudInstanceId, confidence: 100, primary: false });
    if (fqdn) identifiers.push({ type: 'FQDN', namespace: 'DNS', value: fqdn, confidence: 90, primary: false });
    for (const mac of macList) identifiers.push({ type: 'MAC_ADDRESS', namespace: 'GLOBAL', value: mac, confidence: 80, primary: false });
    const firstSeen = pick(record, 'xdm.asset.first_observed', 'first_observed', 'first_seen');
    const lastSeen = pick(record, 'xdm.asset.last_observed', 'last_observed', 'last_seen');
    const agentVersion = pickText(record, 'xdm.endpoint.agent_version', 'endpoint_version', 'agent_version');
    const agentStatus = pickText(record, 'xdm.endpoint.status', 'endpoint_status', 'agent_status', 'status') || 'UNKNOWN';
    const protectionState = pickText(record, 'xdm.endpoint.operational_status', 'operational_status', 'protection_state');
    return {
      schemaVersion: 1, source: { connectorId: envelope.connectorId, objectType: 'CORTEX_ASSET', objectId: assetId, nativeUuid: assetId },
      identity: { name, ...(hostname ? { hostname } : {}), ...(fqdn ? { fqdn } : {}), ...(serialNumber ? { serialNumber } : {}), identifiers },
      classification: { type: typeForUnifiedAsset(assetClass, assetCategory, assetType), ...(assetType || assetCategory ? { subtype: assetType || assetCategory } : {}), environment: 'UNKNOWN' },
      compute: {}, network: { interfaces: addressList.length || macList.length ? [{ key: `cortex-asset-${assetId}`, name: 'Cortex unified asset interface', technicalState: 'UNKNOWN', virtual: false, macAddresses: macList, ipAddresses: addressList.map((address, index) => ({ address, role: 'DISCOVERED', primary: index === 0, dynamic: true })) }] : [] }, storage: { disks: [] },
      operatingSystem: { ...(pickText(record, 'xdm.host.os.name', 'operating_system', 'os_name') ? { reported: pickText(record, 'xdm.host.os.name', 'operating_system', 'os_name') } : {}), ...(pickText(record, 'xdm.host.os.version', 'os_version') ? { version: pickText(record, 'xdm.host.os.version', 'os_version') } : {}) },
      placement: { relationships: [] }, tags: [], technicalState: agentStatus,
      sourceSpecificMetadata: { cortex: {
        assetId, endpointId, assetClass, assetCategory, assetType, agentInstalled: Boolean(endpointId || agentVersion), agentVersion, agentStatus,
        protectionState, firstSeen, lastSeen, isolationStatus: pickText(record, 'xdm.endpoint.isolation_status', 'is_isolated', 'isolation_status'),
        contentStatus: pickText(record, 'xdm.endpoint.content_status', 'content_status'), contentVersion: pickText(record, 'xdm.endpoint.content_version', 'content_version'),
        securityPolicies: strings(pick(record, 'xdm.endpoint.assigned_security_policies', 'security_policies', 'assigned_security_policy')),
        securityTelemetry: record,
      } },
    };
  },
};

function secret(reference: unknown): string {
  const match = /^env:\/\/([A-Z][A-Z0-9_]*)$/.exec(String(reference || ''));
  const environmentKey = match?.[1] || 'CORTEX_API_KEY';
  const value = process.env[environmentKey];
  if (!value) throw new CortexConnectorError('CORTEX_SECRET_UNAVAILABLE', `Cortex API secret ${environmentKey} is unavailable to this server.`);
  return resolveSecret(value);
}
const apiKeySecurityLevel = (value: unknown): CortexApiKeySecurityLevel => {
  const normalized = String(value || 'STANDARD').trim().toUpperCase();
  if (normalized === 'STANDARD' || normalized === 'ADVANCED') return normalized;
  throw new CortexConnectorError('CORTEX_CONFIG_INVALID', 'Cortex API key security level must be STANDARD or ADVANCED.');
};
async function configFor(row: any) {
  const c = row.non_secret_configuration || {}; const apiKeyId = text(c.apiKeyId); const endpointUrl = text(c.endpointUrl);
  if (!apiKeyId || !endpointUrl) throw new CortexConnectorError('CORTEX_CONFIG_INVALID', 'Cortex endpointUrl and apiKeyId are required.');
  const caReference = text(row.tls_ca_reference);
  const tlsCa = caReference ? await (async () => { if (!caReference.startsWith('file://')) throw new CortexConnectorError('CORTEX_CONFIG_INVALID', 'Custom Cortex CA references must be backend-resolved file:// references.'); return fs.readFile(new URL(caReference), 'utf8'); })() : undefined;
  return { endpointUrl, apiKeyId, apiKey: secret(row.secret_reference), apiKeySecurityLevel: apiKeySecurityLevel(c.apiKeySecurityLevel ?? process.env.CORTEX_API_KEY_SECURITY_LEVEL), tlsCa, tlsVerifyCertificates: row.tls_verify_certificates !== false, endpointAllowPrivateNetwork: Boolean(row.endpoint_allow_private_network), requestTimeoutMs: Number(row.request_timeout_ms || 30000), responseSizeLimitBytes: Number(c.responseSizeLimitBytes || 4194304), pageSize: Number(c.pageSize || 100), maxRetries: Number(c.maxRetries ?? 3) };
}
const checkpointOf = (value: unknown): Record<string, unknown> => { try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}; } catch { return {}; } };

export class CortexInventorySyncService {
  public static async enqueue(connectorId: string, actor: BankUser, runType: 'FULL' | 'INCREMENTAL' = 'FULL', context: { correlationId?: string } = {}) {
    const runId = `dsrun-${crypto.randomUUID()}`;
    try { await pgClient.transaction(async (client) => { const connector = await client.query("SELECT id FROM cmdb_discovery_connectors WHERE id=$1 AND connector_type_id='CORTEX' AND enabled AND deleted_at IS NULL FOR UPDATE", [connectorId]); if (!connector.rows[0]) throw Object.assign(new Error('Enabled Cortex connector was not found.'), { statusCode: 404, code: 'DISCOVERY_CONNECTOR_NOT_FOUND' }); await client.query("INSERT INTO cmdb_discovery_sync_runs(id,connector_id,run_type,state,requested_by_user_id,correlation_id,queued_at) VALUES($1,$2,$3,'QUEUED',$4,$5,NOW())", [runId, connectorId, runType, actor.id, context.correlationId || null]); await client.query("INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload,correlation_id,occurred_at) VALUES($1,'cmdb.discovery.sync.requested','DISCOVERY_SYNC_RUN',$2,$3::jsonb,$4,NOW())", [`out-${crypto.randomUUID()}`, runId, JSON.stringify({ runId, connectorId, connectorType: 'CORTEX', actorId: actor.id, runType }), context.correlationId || `cmdb.discovery.sync:${runId}`]); }); } catch (error: any) { if (error?.code === '23505') throw Object.assign(new Error('Another sync is already running for this Cortex connector.'), { statusCode: 409, code: 'CONNECTOR_SYNC_LOCKED' }); throw error; }
    return { runId, state: 'QUEUED' as const, runType };
  }

  public static async testConnection(connectorId: string, correlationId = `cortex.test:${crypto.randomUUID()}`) {
    const row = await pgClient.query("SELECT non_secret_configuration,secret_reference,tls_ca_reference,tls_verify_certificates,endpoint_allow_private_network,request_timeout_ms FROM cmdb_discovery_connectors WHERE id=$1 AND connector_type_id='CORTEX' AND deleted_at IS NULL", [connectorId]);
    if (!row.rows[0]) throw new CortexConnectorError('DISCOVERY_CONNECTOR_NOT_FOUND', 'Cortex connector was not found.');
    const configuration = await configFor(row.rows[0]); const capabilities = await new CortexClient(configuration).detectCapabilities(correlationId);
    if (!capabilities.endpointInventory.available && !capabilities.unifiedAssetInventory.available) throw new CortexConnectorError('CORTEX_NO_INVENTORY_CAPABILITY', 'The API key or tenant exposes neither Endpoint nor Unified Asset Inventory APIs.');
    await this.persistCapabilities(connectorId, capabilities);
    return { connectorId, capabilities, transport: 'HTTPS', tlsVerification: 'ENABLED' };
  }

  public static async runQueued(runId: string, context: { correlationId?: string; signal?: AbortSignal } = {}): Promise<{ runId: string; discovered: number; failed: number; state: string }> {
    return withTelemetrySpan('cmdb.cortex.discovery.sync', { 'cmdb.discovery.source': 'CORTEX', 'cmdb.discovery.run_id': runId }, async () => this.runQueuedInternal(runId, context));
  }

  private static async runQueuedInternal(runId: string, context: { correlationId?: string; signal?: AbortSignal } = {}): Promise<{ runId: string; discovered: number; failed: number; state: string }> {
    const run = await pgClient.transaction(async (client) => {
      const result = await client.query<any>("SELECT r.*,c.non_secret_configuration,c.secret_reference,c.tls_ca_reference,c.tls_verify_certificates,c.endpoint_allow_private_network,c.request_timeout_ms,c.checkpoint connector_checkpoint FROM cmdb_discovery_sync_runs r JOIN cmdb_discovery_connectors c ON c.id=r.connector_id WHERE r.id=$1 AND c.connector_type_id='CORTEX' FOR UPDATE", [runId]);
      const row = result.rows[0];
      if (!row) throw new CortexConnectorError('DISCOVERY_RUN_NOT_FOUND', 'Cortex discovery run was not found.');
      if (['SUCCEEDED','PARTIAL','FAILED','CANCELLED'].includes(row.state)) return row;
      // RabbitMQ redelivery, the legacy catch-all queue and startup recovery can
      // all observe the same durable run. Only QUEUED (or a stale RUNNING lease)
      // may claim execution; a fresh RUNNING row is already owned elsewhere.
      const updatedAt = new Date(row.updated_at || row.started_at || row.queued_at || 0).getTime();
      if (row.state === 'RUNNING' && Number.isFinite(updatedAt) && updatedAt > Date.now() - 5 * 60_000) return { ...row, alreadyRunning: true };
      await client.query("UPDATE cmdb_discovery_sync_runs SET state='RUNNING',started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=$1", [runId]);
      return row;
    });
    if (['SUCCEEDED','PARTIAL','FAILED','CANCELLED'].includes(run.state)) return { runId, discovered: 0, failed: 0, state: run.state };
    if (run.alreadyRunning) return { runId, discovered: Number(run.discovered_count || 0), failed: Number(run.failed_count || 0), state: 'RUNNING' };
    let requested = 0; let received = 0; let succeeded = 0; let failed = 0; const outcomes: string[] = [];
    const checkpoint = checkpointOf(run.connector_checkpoint);
    // Connector checkpoints outlive individual runs. Carry only durable
    // incremental watermarks; page offsets, failure reasons and capability
    // state belong exclusively to the run that produced them.
    const nextCheckpoint: Record<string, unknown> = {
      source: 'CORTEX',
      ...(Number(checkpoint.endpointLastSeen) ? { endpointLastSeen: Number(checkpoint.endpointLastSeen) } : {}),
      ...(Number(checkpoint.assetLastObserved) ? { assetLastObserved: Number(checkpoint.assetLastObserved) } : {}),
    };
    try {
      const configuration = await configFor(run); const client = new CortexClient(configuration); const correlationId = context.correlationId || run.correlation_id || `cmdb.discovery.sync:${runId}`;
      const capabilities = await client.detectCapabilities(correlationId, context.signal);
      if (!capabilities.endpointInventory.available && !capabilities.unifiedAssetInventory.available) throw new CortexConnectorError('CORTEX_NO_INVENTORY_CAPABILITY', 'The Cortex tenant exposes no supported inventory API to this key.');
      await this.persistCapabilities(run.connector_id, capabilities);

      const ingestPages = async (kind: 'ENDPOINT' | 'ASSET') => {
        let offset = 0; const pageSize = kind === 'ENDPOINT' ? Math.min(100, Math.max(1, configuration.pageSize || 100)) : Math.min(1000, Math.max(1, configuration.pageSize || 100));
        const checkpointKey = kind === 'ENDPOINT' ? 'endpointInventory' : 'unifiedAssetInventory';
        for (;;) {
          requested += pageSize;
          nextCheckpoint.currentCapability = kind;
          nextCheckpoint[checkpointKey] = { offset, requestedTo: offset + pageSize, state: 'REQUESTING' };
          const incremental = run.run_type === 'INCREMENTAL';
          const page = kind === 'ENDPOINT'
            ? await client.endpointPage(offset, correlationId, { ...(incremental && Number(checkpoint.endpointLastSeen) ? { lastSeenAfter: Number(checkpoint.endpointLastSeen) } : {}), signal: context.signal })
            : await client.assetPage(offset, correlationId, { ...(incremental && Number(checkpoint.assetLastObserved) ? { lastObservedAfter: Number(checkpoint.assetLastObserved) } : {}), signal: context.signal });
          received += page.records.length;
          const observedAt = new Date().toISOString();
          const mapper = kind === 'ENDPOINT' ? cortexEndpointPayloadMapper : cortexUnifiedAssetPayloadMapper;
          const batch = await DiscoveryIngestionService.ingestBatch(page.records.map((rawPayload) => ({ connectorId: run.connector_id, syncRunId: runId, sourceObjectType: kind === 'ENDPOINT' ? 'CORTEX_ENDPOINT' : 'CORTEX_ASSET', sourceObjectId: kind === 'ENDPOINT' ? String(rawPayload.endpoint_id || 'INVALID') : String(assetIdOf(rawPayload) || 'INVALID'), observedAt, rawPayload })), mapper);
          outcomes.push(...batch.succeeded.map((item) => item.outcome)); succeeded += batch.succeeded.length; failed += batch.failed.length;
          if (kind === 'ENDPOINT') { const max = Math.max(Number(nextCheckpoint.endpointLastSeen || 0), ...page.records.map((record) => epoch(record.last_seen) || 0)); if (max) nextCheckpoint.endpointLastSeen = max; }
          else { const max = Math.max(Number(nextCheckpoint.assetLastObserved || 0), ...page.records.map((record) => epoch(pick(record, 'xdm.asset.last_observed', 'last_observed', 'last_seen')) || 0)); if (max) nextCheckpoint.assetLastObserved = max; }
          const previousOffset = offset;
          offset += page.records.length;
          const completed = page.records.length === 0 || (page.totalCount !== undefined && offset >= page.totalCount);
          nextCheckpoint[checkpointKey] = { offset, requestedTo: previousOffset + pageSize, totalCount: page.totalCount ?? null, resultCount: page.resultCount ?? page.records.length, state: completed ? 'COMPLETED' : 'PAGING' };
          await pgClient.query("UPDATE cmdb_discovery_sync_runs SET requested_count=$2,received_count=$3,checkpoint=$4,updated_at=NOW() WHERE id=$1", [runId, requested, received, JSON.stringify(nextCheckpoint)]);
          // A short non-empty page is not end-of-data. total_count is the
          // authoritative completion signal; when it is omitted we continue
          // until Cortex returns an empty page.
          if (completed) break;
          if (offset <= previousOffset) throw new CortexConnectorError('CORTEX_PAGINATION_STALLED', `Cortex ${kind.toLowerCase()} pagination made no forward progress.`);
        }
      };
      if (capabilities.endpointInventory.available) await ingestPages('ENDPOINT');
      if (capabilities.unifiedAssetInventory.available) await ingestPages('ASSET');
      if (failed) await DiscoveryIngestionService.completePartialRun(runId, { ...nextCheckpoint, requested, received, reason: 'INVALID_RECORDS' });
      else await DiscoveryIngestionService.reconcileAndCompleteRun(runId);
      const security = await CortexSecurityPostureService.reconcileConnector(run.connector_id);
      logger.info({ connectorId: run.connector_id, runId, correlationId, capabilities, requested, received, processed: succeeded + failed, autoLinks: outcomes.filter((value) => value === 'AUTO_LINK').length, ambiguous: outcomes.filter((value) => value === 'REVIEW_REQUIRED').length, conflicts: outcomes.filter((value) => value === 'IDENTITY_CONFLICT').length, created: outcomes.filter((value) => value === 'CREATE_NEW').length, failed, security }, 'Cortex discovery sync completed');
      return { runId, discovered: succeeded, failed, state: failed ? 'PARTIAL' : 'SUCCEEDED' };
    } catch (error: any) {
      const partialCheckpoint = { ...nextCheckpoint, requested, received, failureCode: String(error?.code || 'CORTEX_SYNC_FAILED'), failureCapability: nextCheckpoint.currentCapability || null };
      if (received > 0 || succeeded > 0) { await DiscoveryIngestionService.completePartialRun(runId, partialCheckpoint, error); await CortexSecurityPostureService.reconcileConnector(run.connector_id).catch(() => undefined); logger.warn({ connectorId: run.connector_id, runId, correlationId: context.correlationId, code: error?.code, requested, received }, 'Cortex discovery sync completed partially'); return { runId, discovered: succeeded, failed: failed + 1, state: 'PARTIAL' }; }
      await DiscoveryIngestionService.failRun(runId, error); throw error;
    }
  }

  private static async persistCapabilities(connectorId: string, capabilities: CortexCapabilities): Promise<void> {
    await pgClient.query(`UPDATE cmdb_discovery_connectors SET capabilities_json=$2::jsonb,detected_product='Cortex XDR',detected_api_version='5.x',connection_status='CONNECTED',configuration_status='VALID',last_connection_test_at=NOW(),updated_at=NOW() WHERE id=$1`, [connectorId, JSON.stringify({ cortex: { ...capabilities, detectedAt: new Date().toISOString() } })]);
  }
}
