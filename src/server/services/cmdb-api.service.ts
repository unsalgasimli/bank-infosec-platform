import { z } from 'zod';
import type { BankUser, CmdbPermission } from '../../shared/types/auth.js';
import { AuthService } from './auth.service.js';
import { AuditService } from './audit.service.js';
import { pgClient } from '../db/postgres/client.js';
import { CmdbFoundationRepository, nonSecretConfigurationSchema } from '../db/postgres/cmdb-foundation-repository.js';
import { VCenterConnectorRepository } from '../db/postgres/vcenter-connector-repository.js';
import { VCenterConnector, VCenterConnectorError, VCenterRestClient } from '../integrations/vcenter/vcenter-connector.js';
import { isPrivateOrLocalAddress, validateVCenterTransport } from '../integrations/vcenter/vcenter-endpoint-policy.js';
import type { VCenterConnectorConfiguration } from '../../shared/types/vcenter.js';
import { VCenterObservabilityService } from './vcenter-observability.service.js';
import { defaultVCenterRuntimeService } from './vcenter-runtime.service.js';
import { VCenterCredentialCryptoService } from './vcenter-credential-crypto.service.js';
import { VCenterInventorySyncService } from './vcenter-inventory-sync.service.js';
import { ActiveDirectoryInventorySyncService } from './active-directory-inventory-sync.service.js';
import { config } from '../config/index.js';

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(255).optional(),
  sortBy: z.enum(['name', 'ciNumber', 'environment', 'lifecycleState', 'criticality', 'lastSeenAt', 'updatedAt']).default('updatedAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  typeId: z.string().trim().max(64).optional(),
  environment: z.string().trim().max(32).optional(),
  lifecycleState: z.string().trim().max(32).optional(),
  lifecycleStatus: z.string().trim().max(32).optional(),
  quality: z.string().trim().max(32).optional(),
  status: z.string().trim().max(32).optional(),
  criticality: z.string().trim().max(32).optional(),
  ownerUserId: z.string().trim().max(64).optional(),
  departmentId: z.string().trim().max(128).optional(),
  supportGroupId: z.string().trim().max(128).optional(),
  businessServiceId: z.string().trim().max(64).optional(),
  sourceConnectorId: z.string().trim().max(64).optional(),
  stale: z.enum(['true', 'false']).optional(),
  missingOwner: z.enum(['true', 'false']).optional(),
  includeArchived: z.enum(['true', 'false']).default('false'),
}).strict();

const connectorCreateSchema = z.object({
  connectionId: z.string().trim().min(1).max(128).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(4000).default(''),
  connectorType: z.string().trim().min(1).max(64),
  environment: z.string().trim().min(1).max(32).default('UNKNOWN'),
  enabled: z.boolean().default(false),
  nonSecretConfiguration: nonSecretConfigurationSchema.default({}),
  username: z.string().trim().min(1).max(512).optional(),
  password: z.string().min(1).max(4096).optional(),
  tlsCaReference: z.string().trim().min(1).max(512).optional(),
  tlsVerifyCertificates: z.boolean().default(true),
  endpointAllowPrivateNetwork: z.boolean().default(false),
  requestTimeoutMs: z.number().int().min(1000).max(120000).default(30000),
  responseSizeLimitBytes: z.number().int().min(65536).max(268435456).default(4194304),
  scheduleMinutes: z.number().int().min(0).max(10080).default(0),
  endpointFqdn: z.string().trim().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  soapEndpointPath: z.string().trim().min(1).max(255).default('/sdk'),
  automationApiBasePath: z.string().trim().min(1).max(255).default('/api'),
  ldapUrl: z.string().trim().max(1024).optional(),
  baseDn: z.string().trim().max(1024).optional(),
  bindUser: z.string().trim().max(512).optional(),
  secretReference: z.string().trim().min(1).max(512).optional(),
}).strict();

const connectorUpdateSchema = connectorCreateSchema.partial().extend({ version: z.number().int().positive() }).strict();
const connectorTypeQuerySchema = z.string().trim().max(64).optional();
const correlationResolutionSchema = z.object({
  action: z.enum(['MATCH_EXISTING', 'CREATE_NEW', 'DISMISS']),
  assetId: z.string().trim().min(1).max(64).optional(),
  note: z.string().trim().max(4000).default(''),
  version: z.number().int().positive().default(1),
}).strict().superRefine((value, context) => {
  if (value.action !== 'DISMISS' && !value.assetId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['assetId'], message: 'assetId is required for this correlation action.' });
});

const sortableColumns: Record<string, string> = {
  name: 'a.name', ciNumber: 'a.ci_number', environment: 'a.environment', lifecycleState: 'a.lifecycle_state',
  criticality: 'a.criticality', lastSeenAt: 'a.last_seen_at', updatedAt: 'a.updated_at',
};

function requirePermission(actor: BankUser | undefined, permission: CmdbPermission): asserts actor is BankUser {
  AuthService.assertCmdbPermission(actor, permission);
}

function mapAsset(row: any): any {
  return {
    id: row.id, ciNumber: row.ci_number, assetKey: row.asset_key, name: row.name, displayName: row.display_name || row.name,
    typeId: row.type_id, assetSubtype: row.asset_subtype || undefined, status: row.status, lifecycleState: row.lifecycle_state,
    lifecycleStatus: row.lifecycle_status, technicalStatus: row.technical_status, environment: row.environment,
    criticality: row.criticality, businessCriticality: row.business_criticality || undefined, description: row.description || undefined,
    ownerUserId: row.owner_user_id || undefined, technicalOwnerUserId: row.technical_owner_user_id || undefined,
    businessOwnerUserId: row.business_owner_user_id || undefined, supportGroupId: row.support_group_id || undefined,
    departmentId: row.department_id || undefined, locationId: row.location_id || undefined, vendor: row.vendor || undefined,
    manufacturer: row.manufacturer || undefined, model: row.model || undefined, serialNumber: row.serial_number || undefined,
    assetTag: row.asset_tag || undefined, hostname: row.hostname || undefined, fqdn: row.fqdn || undefined,
    ipAddress: row.ip_address || undefined, macAddress: row.mac_address || undefined, operatingSystem: row.operating_system || undefined,
    osVersion: row.os_version || undefined, cpuCount: row.cpu_count == null ? undefined : Number(row.cpu_count), memoryBytes: row.memory_bytes == null ? undefined : Number(row.memory_bytes),
    source: row.source, sourceSystem: row.source_system || undefined,
    sourceRecordId: row.source_record_id || undefined, discoveryStatus: row.discovery_status, lastDiscoveredAt: row.last_discovered_at?.toISOString?.() || row.last_discovered_at || undefined,
    lastVerifiedAt: row.last_verified_at?.toISOString?.() || row.last_verified_at || undefined, lastSeenAt: row.last_seen_at?.toISOString?.() || row.last_seen_at || undefined,
    lastSyncAt: row.last_sync_at?.toISOString?.() || row.last_sync_at || undefined, syncStatus: row.sync_status || undefined,
    details: row.details || {}, version: Number(row.version || 1), createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at, archivedAt: row.archived_at?.toISOString?.() || row.archived_at || undefined,
    sourceCount: Number(row.source_count || 0), relationshipCount: Number(row.relationship_count || 0),
  };
}

function validateEndpoint(configuration: Record<string, unknown>, allowPrivate: boolean): void {
  const candidate = configuration.endpointUrl || configuration.endpoint || configuration.baseUrl;
  if (candidate === undefined) return;
  if (typeof candidate !== 'string' || candidate.length > 1024) throw new Error('Connector endpoint must be a bounded URL.');
  let url: URL;
  try { url = new URL(candidate); } catch { throw new Error('Connector endpoint must be a valid URL.'); }
  if (!['https:', 'ldaps:'].includes(url.protocol)) throw new Error('Connector endpoint must use HTTPS or LDAPS.');
  const host = url.hostname.toLowerCase();
  const privateHost = host === 'localhost' || host === '::1' || host.endsWith('.local') || /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
  if (privateHost && !allowPrivate) throw new Error('Private connector endpoints require explicit endpointAllowPrivateNetwork approval.');
}

function validateVCenterEndpoint(endpointFqdn: string, port: number, tlsVerifyCertificates = true, soapEndpointPath = '/sdk', automationApiBasePath = '/api'): string {
  return validateVCenterTransport({ endpointFqdn, port, tlsVerifyCertificates, soapEndpointPath, automationApiBasePath });
}

function withoutConnectorSecrets(row: any): any {
  return {
    ...row,
    secret_reference: undefined,
    tls_ca_reference: undefined,
    hasSecretReference: Boolean(row.secret_reference),
    hasTlsCaReference: Boolean(row.tls_ca_reference),
  };
}

function rejectVCenterEndpointOverrides(configuration: Record<string, unknown>): void {
  if (['endpointUrl', 'endpoint', 'baseUrl'].some((key) => Object.prototype.hasOwnProperty.call(configuration, key))) {
    throw Object.assign(new Error('vCenter endpoint is configured only by endpointFqdn and port; arbitrary URL overrides are not allowed.'), { statusCode: 400 });
  }
}

async function verifyVCenterBeforeCreation(configuration: VCenterConnectorConfiguration, username: string, password: string): Promise<Awaited<ReturnType<VCenterConnector['connect']>>> {
  const client = new VCenterRestClient();
  try {
    return await new VCenterConnector(configuration, client).connect({ username, password });
  } catch (error) {
    if (error instanceof VCenterConnectorError) Object.assign(error, { statusCode: 422 });
    else if (error instanceof Error) Object.assign(error, { statusCode: 422, code: (error as any).code || 'VCENTER_CONFIG_INVALID' });
    throw error;
  } finally {
    client.invalidate(configuration.connectorId);
  }
}

export class CmdbApiService {
  public static async listAssets(actor: BankUser | undefined, rawQuery: unknown): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
    requirePermission(actor, 'assets.read');
    const query = pageSchema.parse(rawQuery || {});
    const where: string[] = [query.includeArchived === 'true' ? 'TRUE' : 'a.archived_at IS NULL'];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
    if (query.typeId) add('a.type_id = ?', query.typeId);
    if (query.environment) add('a.environment = ?', query.environment);
    if (query.lifecycleState || query.lifecycleStatus) add('a.lifecycle_state = ?', query.lifecycleState || query.lifecycleStatus);
    if (query.quality) add('a.discovery_status = ?', query.quality);
    if (query.status) add('a.status = ?', query.status);
    if (query.criticality) add('a.criticality = ?', query.criticality);
    if (query.ownerUserId) add('(a.owner_user_id = ? OR a.technical_owner_user_id = ? OR a.business_owner_user_id = ?)', query.ownerUserId);
    if (query.departmentId) add('a.department_id = ?', query.departmentId);
    if (query.supportGroupId) add('a.support_group_id = ?', query.supportGroupId);
    if (query.sourceConnectorId) add('EXISTS (SELECT 1 FROM cmdb_source_records sr_filter WHERE sr_filter.asset_id=a.id AND sr_filter.connector_id = ?)', query.sourceConnectorId);
    if (query.businessServiceId) add('EXISTS (SELECT 1 FROM ci_relationships r_bs WHERE r_bs.source_ci_id=a.id AND r_bs.target_ci_id = ? AND r_bs.status=\'ACTIVE\' AND r_bs.archived_at IS NULL)', query.businessServiceId);
    if (query.stale === 'true') where.push("a.lifecycle_state IN ('STALE','DECOMMISSION_CANDIDATE')");
    if (query.missingOwner === 'true') where.push('a.owner_user_id IS NULL AND a.technical_owner_user_id IS NULL AND a.business_owner_user_id IS NULL');
    if (query.search) {
      params.push(`%${query.search.toLowerCase()}%`);
      const p = `$${params.length}`;
      where.push(`(lower(a.name) LIKE ${p} OR lower(COALESCE(a.display_name,'')) LIKE ${p} OR lower(COALESCE(a.hostname,'')) LIKE ${p} OR lower(COALESCE(a.fqdn,'')) LIKE ${p} OR lower(COALESCE(a.serial_number,'')) LIKE ${p} OR lower(COALESCE(a.ip_address,'')) LIKE ${p} OR lower(COALESCE(a.mac_address,'')) LIKE ${p} OR lower(a.ci_number) LIKE ${p} OR EXISTS (SELECT 1 FROM cmdb_asset_identifiers ai_s WHERE ai_s.asset_id=a.id AND ai_s.retired_at IS NULL AND lower(ai_s.normalized_value) LIKE ${p}) OR EXISTS (SELECT 1 FROM cmdb_source_records sr_s WHERE sr_s.asset_id=a.id AND lower(sr_s.external_object_id) LIKE ${p}) OR EXISTS (SELECT 1 FROM cmdb_network_interfaces ni_s JOIN cmdb_mac_addresses ma_s ON ma_s.interface_id=ni_s.id WHERE ni_s.asset_id=a.id AND ma_s.retired_at IS NULL AND lower(ma_s.normalized_mac) LIKE ${p}) OR EXISTS (SELECT 1 FROM cmdb_ip_addresses ip_s WHERE ip_s.asset_id=a.id AND ip_s.retired_at IS NULL AND host(ip_s.ip_address) LIKE ${p}))`);
    }
    const base = `FROM configuration_items a WHERE ${where.join(' AND ')}`;
    const count = await pgClient.query<{ count: string }>(`SELECT count(*) AS count ${base}`, params as any[]);
    const sort = sortableColumns[query.sortBy] || sortableColumns.updatedAt;
    const direction = query.sortDirection === 'asc' ? 'ASC' : 'DESC';
    const offset = (query.page - 1) * query.pageSize;
    const dataParams = [...params, query.pageSize, offset];
    const result = await pgClient.query(`SELECT a.*, (SELECT count(*) FROM cmdb_source_records sr WHERE sr.asset_id=a.id) AS source_count, (SELECT count(*) FROM ci_relationships rr WHERE (rr.source_ci_id=a.id OR rr.target_ci_id=a.id) AND rr.status='ACTIVE' AND rr.archived_at IS NULL) AS relationship_count ${base} ORDER BY ${sort} ${direction}, a.id LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`, dataParams as any[]);
    return { items: result.rows.map(mapAsset), total: Number(count.rows[0]?.count || 0), page: query.page, pageSize: query.pageSize };
  }

  public static async getAsset(actor: BankUser | undefined, id: string): Promise<any> {
    requirePermission(actor, 'assets.read');
    z.string().trim().min(1).max(64).parse(id);
    const result = await pgClient.query(`SELECT a.*, (SELECT count(*) FROM cmdb_source_records sr WHERE sr.asset_id=a.id) AS source_count, (SELECT count(*) FROM ci_relationships rr WHERE (rr.source_ci_id=a.id OR rr.target_ci_id=a.id) AND rr.status='ACTIVE' AND rr.archived_at IS NULL) AS relationship_count FROM configuration_items a WHERE a.id=$1`, [id]);
    if (!result.rows[0]) throw Object.assign(new Error('Configuration item not found.'), { statusCode: 404 });
    return mapAsset(result.rows[0]);
  }

  public static async listAssetSubresources(actor: BankUser | undefined, assetId: string): Promise<any> {
    requirePermission(actor, 'assets.read');
    await this.getAsset(actor, assetId);
    const [identifiers, sources, network, storage, changes, provenance] = await Promise.all([
      CmdbFoundationRepository.listAssetIdentifiers(assetId), CmdbFoundationRepository.listSourceRecords(assetId), CmdbFoundationRepository.listNetwork(assetId),
      CmdbFoundationRepository.listStorage(assetId), CmdbFoundationRepository.listMaterialChanges(assetId), CmdbFoundationRepository.listProvenance(assetId),
    ]);
    const relationships = await this.listAssetRelationships(actor, assetId);
    return { identifiers, sources: sources.map((source) => ({ ...source, secretReference: undefined })), network, storage, history: changes, provenance, relationships };
  }

  public static async listAssetRelationships(actor: BankUser | undefined, assetId: string): Promise<any> {
    requirePermission(actor, 'asset_relationships.read');
    z.string().trim().min(1).max(64).parse(assetId);
    const result = await pgClient.query(`SELECT r.id,r.source_ci_id,r.target_ci_id,r.relationship_type_id,r.status,r.confidence,r.created_at,
      s.ci_number AS source_ci_number,s.name AS source_name,t.ci_number AS target_ci_number,t.name AS target_name
      FROM ci_relationships r JOIN configuration_items s ON s.id=r.source_ci_id JOIN configuration_items t ON t.id=r.target_ci_id
      WHERE (r.source_ci_id=$1 OR r.target_ci_id=$1) AND r.status='ACTIVE' AND r.archived_at IS NULL ORDER BY r.created_at DESC,r.id`, [assetId]);
    return { upstream: result.rows.filter((row) => row.target_ci_id === assetId).map((row) => ({ ...row, sourceCiId: row.source_ci_id, targetCiId: row.target_ci_id, relationshipTypeId: row.relationship_type_id, source: { id: row.source_ci_id, ciNumber: row.source_ci_number, name: row.source_name }, target: { id: row.target_ci_id, ciNumber: row.target_ci_number, name: row.target_name } })), downstream: result.rows.filter((row) => row.source_ci_id === assetId).map((row) => ({ ...row, sourceCiId: row.source_ci_id, targetCiId: row.target_ci_id, relationshipTypeId: row.relationship_type_id, source: { id: row.source_ci_id, ciNumber: row.source_ci_number, name: row.source_name }, target: { id: row.target_ci_id, ciNumber: row.target_ci_number, name: row.target_name } })) };
  }

  public static async getSyncRun(actor: BankUser | undefined, connectorId: string, runId: string): Promise<any> {
    requirePermission(actor, 'asset_discovery.runs');
    z.string().trim().min(1).max(64).parse(connectorId); z.string().trim().min(1).max(64).parse(runId);
    const result = await pgClient.query('SELECT * FROM cmdb_discovery_sync_runs WHERE id=$1 AND connector_id=$2', [runId, connectorId]);
    if (!result.rows[0]) throw Object.assign(new Error('Discovery run not found.'), { statusCode: 404 });
    const row = result.rows[0]; const errors = Array.isArray(row.error_summary) ? row.error_summary.slice(0, 100) : [];
    return { run: { ...row, errors } };
  }

  public static async listConnectors(actor: BankUser | undefined, requestedType?: unknown): Promise<any[]> {
    requirePermission(actor, 'asset_discovery.read');
    const connectorType = connectorTypeQuerySchema.parse(requestedType);
    const connectors = await CmdbFoundationRepository.listDiscoveryConnectors(connectorType);
    return connectors.map((connector) => ({ ...connector, secretReference: undefined, tlsCaReference: undefined, hasSecretReference: Boolean(connector.secretReference), hasTlsCaReference: Boolean(connector.tlsCaReference) }));
  }

  public static async getConnector(actor: BankUser | undefined, id: string): Promise<any> {
    requirePermission(actor, 'asset_discovery.read');
    z.string().trim().min(1).max(64).parse(id);
    const connector = (await this.listConnectors(actor)).find((item) => item.id === id);
    if (!connector) throw Object.assign(new Error('Discovery connector not found.'), { statusCode: 404, code: 'DISCOVERY_CONNECTOR_NOT_FOUND' });
    return connector;
  }

  public static async getConnectorHealth(actor: BankUser | undefined, id: string): Promise<any> {
    requirePermission(actor, 'asset_discovery.health');
    const connector = await this.getConnector(actor, id);
    return { connector, metrics: connector.connectorType === 'VCENTER' ? VCenterObservabilityService.snapshot(id) : { connectorType: connector.connectorType, lastSyncAt: connector.lastSyncAt, lastSuccessfulSyncAt: connector.lastSuccessfulSyncAt, consecutiveFailures: connector.consecutiveFailures } };
  }

  public static async listConnectorRuns(actor: BankUser | undefined, id: string, limit = 100): Promise<any[]> {
    requirePermission(actor, 'asset_discovery.runs');
    z.string().trim().min(1).max(64).parse(id);
    const connector = await this.getConnector(actor, id);
    if (!connector) throw Object.assign(new Error('Discovery connector not found.'), { statusCode: 404 });
    const boundedLimit = z.number().int().min(1).max(500).parse(limit);
    return CmdbFoundationRepository.listSyncRuns(id, boundedLimit);
  }

  /** Read-only evidence inventory. VMware objects stay source records until governed correlation. */
  public static async listDiscoveryEvidence(actor: BankUser | undefined, page = 1, pageSize = 25): Promise<any> {
    requirePermission(actor, 'asset_discovery.read');
    const safePage = z.number().int().min(1).max(100000).parse(page); const safeSize = z.number().int().min(1).max(100).parse(pageSize);
    const [items, count] = await Promise.all([
      pgClient.query(`SELECT s.id,s.connector_id,s.external_object_type,s.external_object_id,s.source_name,s.status,s.last_seen_at,s.last_sync_run_id,s.last_correlation_outcome,COALESCE(c.name,dc.name) connector_name,c.connector_type_id
        FROM cmdb_source_records s JOIN cmdb_discovery_connectors c ON c.id=s.connector_id LEFT JOIN department_connections dc ON dc.id=c.connection_id
        WHERE c.connector_type_id IN ('VCENTER','ACTIVE_DIRECTORY') AND c.deleted_at IS NULL ORDER BY s.last_seen_at DESC,s.id LIMIT $1 OFFSET $2`, [safeSize, (safePage - 1) * safeSize]),
      pgClient.query(`SELECT count(*)::int count FROM cmdb_source_records s JOIN cmdb_discovery_connectors c ON c.id=s.connector_id WHERE c.connector_type_id IN ('VCENTER','ACTIVE_DIRECTORY') AND c.deleted_at IS NULL`),
    ]);
    return { items: items.rows.map((row) => ({ id: row.id, connectorId: row.connector_id, connectorName: row.connector_name, connectorType: row.connector_type_id, objectType: row.external_object_type, objectId: row.external_object_id, name: row.source_name, status: row.status, lastSeenAt: row.last_seen_at, lastSyncRunId: row.last_sync_run_id, correlationOutcome: row.last_correlation_outcome })), total: Number(count.rows[0]?.count || 0), page: safePage, pageSize: safeSize };
  }

  public static async testConnector(actor: BankUser | undefined, id: string, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'asset_discovery.test');
    z.string().trim().min(1).max(64).parse(id);
    const connector = await this.getConnector(actor, id);
    if (connector.connectorType === 'ACTIVE_DIRECTORY') {
      // A test must be non-mutating. AD inventory itself runs only through the
      // durable sync command, never from this management endpoint.
      const source = connector.nonSecretConfiguration || {};
      const secret = await pgClient.query<{ secret_reference: string | null }>('SELECT secret_reference FROM cmdb_discovery_connectors WHERE id=$1 AND deleted_at IS NULL', [id]);
      const ready = String(source.url || config.LDAP_URL || '').startsWith('ldaps://') && Boolean(source.baseDn || config.LDAP_BASE_DN) && Boolean(source.bindUser || config.LDAP_BIND_USER) && /^env:\/\/[A-Z][A-Z0-9_]*$/.test(String(secret.rows[0]?.secret_reference || ''));
      if (!ready) throw Object.assign(new Error('Active Directory connector is missing LDAPS, base DN, read-only bind user, or a server-side secret.'), { statusCode: 422, code: 'AD_CONNECTOR_CONFIG_INVALID' });
      return { connectorId: id, snapshot: { testResult: { status: 'READY_FOR_READ_ONLY_SYNC', transport: 'LDAPS', credentials: 'SERVER_SIDE_SECRET_REFERENCE', writeOperations: 'BLOCKED' } } };
    }
    await pgClient.transaction(async (client) => AuditService.logPostgres(client, {
      actor, action: 'VCENTER_CONNECTION_TEST_STARTED', entityType: 'DISCOVERY_CONNECTOR', entityId: id,
      correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent,
      metadata: { connectorType: 'VCENTER' },
    }));
    try {
      const result = await defaultVCenterRuntimeService.connectAndPersist(id, { correlationId: request.correlationId });
      await pgClient.transaction(async (client) => AuditService.logPostgres(client, {
        actor, action: 'VCENTER_CONNECTION_TEST_SUCCEEDED', entityType: 'DISCOVERY_CONNECTOR', entityId: id,
        correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent,
        metadata: { status: 'SUCCEEDED', connectorType: 'VCENTER' },
      }).then(async () => {
        await AuditService.logPostgres(client, { actor, action: 'VCENTER_SERVER_IDENTITY_DETECTED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, metadata: { instanceUuidDetected: Boolean(result.snapshot.server.instanceUuid) } });
        await AuditService.logPostgres(client, { actor, action: 'VCENTER_CAPABILITIES_UPDATED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, metadata: { supportsRestApi: result.snapshot.capabilities.supportsRestApi, supportsVmInventory: result.snapshot.capabilities.supportsVmInventory, supportsHostInventory: result.snapshot.capabilities.supportsHostInventory, supportsClusterInventory: result.snapshot.capabilities.supportsClusterInventory, supportsDatacenterInventory: result.snapshot.capabilities.supportsDatacenterInventory, supportsTagging: result.snapshot.capabilities.supportsTagging } });
      }));
      return result;
    } catch (error: any) {
      await pgClient.transaction(async (client) => AuditService.logPostgres(client, {
        actor, action: 'VCENTER_CONNECTION_TEST_FAILED', entityType: 'DISCOVERY_CONNECTOR', entityId: id,
        correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent,
        metadata: { status: 'FAILED', connectorType: 'VCENTER', errorCode: typeof error?.code === 'string' ? error.code : 'VCENTER_INTERNAL_ERROR' },
      })).catch(() => undefined);
      throw error;
    }
  }

  public static async triggerConnectorSync(actor: BankUser | undefined, id: string, syncType: unknown = 'FULL', request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'asset_discovery.run');
    z.string().trim().min(1).max(64).parse(id);
    const runType = z.enum(['FULL', 'INCREMENTAL']).parse(syncType);
    const connector = await this.getConnector(actor, id);
    const result = connector.connectorType === 'ACTIVE_DIRECTORY'
      ? await ActiveDirectoryInventorySyncService.enqueue(id, actor!, runType, { correlationId: request.correlationId })
      : await VCenterInventorySyncService.enqueue(id, actor!, runType, { correlationId: request.correlationId });
    await pgClient.transaction(async (client) => AuditService.logPostgres(client, { actor: actor!, action: 'CMDB_SYNC_TRIGGERED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, metadata: { status: result.state, runId: result.runId, runType } }));
    return result;
  }

  /**
   * Queue the AD inventory projection from the same operator action that
   * queues the human directory sync. The connector is bootstrapped from the
   * server-owned LDAP configuration when it has not been registered yet.
   */
  public static async triggerActiveDirectoryInventorySync(actor: BankUser | undefined, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'asset_discovery.run');
    const existing = await pgClient.query<{ id: string; enabled: boolean }>(
      "SELECT id,enabled FROM cmdb_discovery_connectors WHERE connector_type_id='ACTIVE_DIRECTORY' AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
    );
    let connectorId = existing.rows[0]?.id;
    if (!connectorId) {
      const bootstrapped = await this.bootstrapActiveDirectoryConnector(actor, request);
      connectorId = bootstrapped.connector.id;
    } else if (!existing.rows[0].enabled) {
      throw Object.assign(new Error('The Active Directory inventory connector is disabled. Enable it from Inventory Sync Runs first.'), { statusCode: 409, code: 'DISCOVERY_CONNECTOR_DISABLED' });
    }
    return ActiveDirectoryInventorySyncService.enqueue(connectorId, actor!, 'FULL', { correlationId: request.correlationId });
  }

  public static async createConnector(actor: BankUser | undefined, raw: unknown, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'asset_discovery.manage');
    const input = connectorCreateSchema.parse(raw);
    if (input.connectorType === 'VCENTER' && (!input.username || !input.password)) throw Object.assign(new Error('vCenter service-account username and password are required.'), { statusCode: 400 });
    if (input.connectorType === 'ACTIVE_DIRECTORY') {
      const ldapUrl = input.ldapUrl || String(input.nonSecretConfiguration.url || '');
      const baseDn = input.baseDn || String(input.nonSecretConfiguration.baseDn || '');
      const bindUser = input.bindUser || String(input.nonSecretConfiguration.bindUser || '');
      if (!ldapUrl.startsWith('ldaps://') || !baseDn || !bindUser || !input.secretReference) throw Object.assign(new Error('Active Directory requires LDAPS URL, base DN, dedicated read-only bind identity, and a vault/secret reference.'), { statusCode: 400 });
    }
    validateEndpoint(input.nonSecretConfiguration, input.endpointAllowPrivateNetwork);
    if (input.connectorType === 'VCENTER') rejectVCenterEndpointOverrides(input.nonSecretConfiguration);
    if (input.connectorType === 'VCENTER' && !input.endpointFqdn) throw Object.assign(new Error('endpointFqdn is required for a vCenter connector.'), { statusCode: 400 });
    if (input.connectorType !== 'VCENTER' && (input.endpointFqdn || input.port !== undefined)) throw Object.assign(new Error('vCenter endpoint fields are only valid for a VCENTER connector.'), { statusCode: 400 });
    const vcenterEndpoint = input.connectorType === 'VCENTER' ? validateVCenterEndpoint(input.endpointFqdn!, input.port || 443, input.tlsVerifyCertificates, input.soapEndpointPath, input.automationApiBasePath) : undefined;
    if (vcenterEndpoint && !input.endpointAllowPrivateNetwork && (vcenterEndpoint === 'localhost' || vcenterEndpoint.endsWith('.local') || isPrivateOrLocalAddress(vcenterEndpoint))) throw Object.assign(new Error('Private or local vCenter targets require explicit endpointAllowPrivateNetwork approval.'), { statusCode: 400 });
    const id = `dconn-${cryptoRandom()}`;
    const connectionSnapshot = vcenterEndpoint ? await verifyVCenterBeforeCreation({ connectorId: id, endpointFqdn: vcenterEndpoint, port: input.port || 443, soapEndpointPath: input.soapEndpointPath, automationApiBasePath: input.automationApiBasePath, tlsVerifyCertificates: input.tlsVerifyCertificates, tlsCaReference: input.tlsCaReference, requestTimeoutMs: input.requestTimeoutMs, responseSizeLimitBytes: input.responseSizeLimitBytes, endpointAllowPrivateNetwork: input.endpointAllowPrivateNetwork, accessMode: 'READ_ONLY' }, input.username!, input.password!) : undefined;
    return pgClient.transaction(async (client) => {
       if (vcenterEndpoint) {
        const duplicate = await client.query(`
           SELECT c.id, COALESCE(c.name, dc.name) AS name
          FROM cmdb_vcenter_connector_profiles v
          JOIN cmdb_discovery_connectors c ON c.id=v.connector_id
           LEFT JOIN department_connections dc ON dc.id=c.connection_id
          WHERE c.connector_type_id='VCENTER' AND c.deleted_at IS NULL AND dc.deleted_at IS NULL
            AND lower(v.endpoint_fqdn)=lower($1) AND v.port=$2
          LIMIT 1`, [vcenterEndpoint, input.port || 443]);
        if (duplicate.rows[0]) throw Object.assign(new Error(`A vCenter connector already targets ${vcenterEndpoint}:${input.port || 443} (${duplicate.rows[0].name}).`), { statusCode: 409, code: 'VCENTER_DUPLICATE_TARGET' });
      }
       const adConfiguration = input.connectorType === 'ACTIVE_DIRECTORY' ? { ...input.nonSecretConfiguration, url: input.ldapUrl || input.nonSecretConfiguration.url, baseDn: input.baseDn || input.nonSecretConfiguration.baseDn, bindUser: input.bindUser || input.nonSecretConfiguration.bindUser, accessMode: 'READ_ONLY', incrementalStrategy: 'usnChanged-or-whenChanged' } : input.nonSecretConfiguration;
       const inserted = await client.query(`INSERT INTO cmdb_discovery_connectors(id,connection_id,name,description,connector_type_id,environment,enabled,health_status,operational_state,configuration_status,connection_status,discovery_status,non_secret_configuration,secret_reference,tls_ca_reference,tls_verify_certificates,endpoint_allow_private_network,request_timeout_ms,schedule_minutes,created_by_user_id,updated_by_user_id) VALUES($1,$2,$3,$4,$5::varchar,$6,$7,CASE WHEN $7 THEN 'UNKNOWN' ELSE 'DISABLED' END,CASE WHEN $7 THEN 'IDLE' ELSE 'DISABLED' END,CASE WHEN $5::varchar IN ('VCENTER','ACTIVE_DIRECTORY') THEN 'VALID' ELSE 'UNKNOWN' END,'UNKNOWN','UNKNOWN',$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING *`, [id, input.connectionId || null, input.name || `CMDB connector ${id}`, input.description, input.connectorType, input.environment, input.enabled, JSON.stringify(adConfiguration), input.connectorType === 'ACTIVE_DIRECTORY' ? input.secretReference : null, input.tlsCaReference || null, input.tlsVerifyCertificates, input.endpointAllowPrivateNetwork, input.requestTimeoutMs, input.scheduleMinutes, actor.id]);
      if (vcenterEndpoint) {
        await VCenterConnectorRepository.createProfile(client, {
          connectorId: id,
          endpointFqdn: vcenterEndpoint,
          port: input.port || 443,
          soapEndpointPath: input.soapEndpointPath,
          automationApiBasePath: input.automationApiBasePath,
          responseSizeLimitBytes: input.responseSizeLimitBytes,
        });
        await VCenterConnectorRepository.upsertCredential(client, id, VCenterCredentialCryptoService.encrypt({ username: input.username!, password: input.password! }));
        await VCenterConnectorRepository.recordConnectionSuccessInTransaction(client, id, connectionSnapshot!);
      }
      await AuditService.logPostgres(client, { actor, action: 'CMDB_CONNECTOR_CREATED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, after: { ...input, username: input.username ? '[CONFIGURED]' : undefined, password: input.password ? '[REDACTED]' : undefined, tlsCaReference: input.tlsCaReference ? '[CONFIGURED]' : undefined, connectionTest: vcenterEndpoint ? 'PASSED' : 'NOT_REQUIRED' } });
      return withoutConnectorSecrets(inserted.rows[0]);
    });
  }

  /** Register the already-configured, read-only directory connection as a CMDB source without exposing its password. */
  public static async bootstrapActiveDirectoryConnector(actor: BankUser | undefined, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'asset_discovery.manage');
    // User synchronization and CMDB discovery share the same AD source. If
    // the source has already been registered (for example through the AD
    // connector form), use that persisted configuration instead of requiring
    // the legacy process-level LDAP_* variables again.
    const existing = await pgClient.query<{ id: string }>("SELECT id FROM cmdb_discovery_connectors WHERE connector_type_id='ACTIVE_DIRECTORY' AND deleted_at IS NULL ORDER BY created_at LIMIT 1");
    if (existing.rows[0]) return { connector: await this.getConnector(actor, existing.rows[0].id), created: false };

    if (!config.LDAP_ENABLED || !config.LDAP_URL.startsWith('ldaps://') || !config.LDAP_BASE_DN || !config.LDAP_BIND_USER || !config.LDAP_BIND_PASSWORD) {
      throw Object.assign(new Error('Server Active Directory configuration is incomplete. Configure LDAPS URL, base DN, dedicated read-only bind user and LDAP_BIND_PASSWORD first.'), { statusCode: 422, code: 'AD_SERVER_CONFIGURATION_INCOMPLETE' });
    }
    const connector = await this.createConnector(actor, {
      name: config.LDAP_DOMAIN ? `Active Directory (${config.LDAP_DOMAIN})` : 'Active Directory', connectorType: 'ACTIVE_DIRECTORY', environment: 'PRODUCTION', enabled: true,
      ldapUrl: config.LDAP_URL, baseDn: config.LDAP_BASE_DN, bindUser: config.LDAP_BIND_USER, secretReference: 'env://LDAP_BIND_PASSWORD', tlsVerifyCertificates: config.LDAP_TLS_REJECT_UNAUTHORIZED !== false, endpointAllowPrivateNetwork: true, requestTimeoutMs: 30000, scheduleMinutes: 0,
    }, request);
    return { connector, created: true };
  }

  public static async updateConnector(actor: BankUser | undefined, id: string, raw: unknown, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'asset_discovery.manage');
    z.string().trim().min(1).max(64).parse(id);
      const input = connectorUpdateSchema.parse(raw);
    if (('username' in input) !== ('password' in input)) throw Object.assign(new Error('vCenter username and password must be changed together.'), { statusCode: 400 });
    if (input.nonSecretConfiguration) validateEndpoint(input.nonSecretConfiguration, input.endpointAllowPrivateNetwork ?? false);
    return pgClient.transaction(async (client) => {
      const current = await client.query('SELECT * FROM cmdb_discovery_connectors WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!current.rows[0]) throw Object.assign(new Error('Discovery connector not found.'), { statusCode: 404 });
      if (Number(current.rows[0].version) !== input.version) throw Object.assign(new Error('Connector was changed by another user.'), { statusCode: 409 });
      const currentType = String(current.rows[0].connector_type_id);
      const nextType = input.connectorType || currentType;
      if (currentType === 'VCENTER' && nextType !== 'VCENTER') throw Object.assign(new Error('A vCenter connector type is immutable after creation.'), { statusCode: 409 });
      let currentProfile: any;
      if (nextType === 'VCENTER') {
        if (input.nonSecretConfiguration) rejectVCenterEndpointOverrides(input.nonSecretConfiguration);
        if (input.tlsVerifyCertificates === false) throw Object.assign(new Error('TLS certificate verification must remain enabled for vCenter connectors.'), { statusCode: 400 });
        if (input.soapEndpointPath && input.soapEndpointPath !== '/sdk') throw Object.assign(new Error('vCenter SOAP path is fixed to /sdk.'), { statusCode: 400 });
        if (input.automationApiBasePath && input.automationApiBasePath !== '/api') throw Object.assign(new Error('vCenter Automation API path is fixed to /api.'), { statusCode: 400 });
        if (input.endpointFqdn && input.port) validateVCenterEndpoint(input.endpointFqdn, input.port, input.tlsVerifyCertificates ?? Boolean(current.rows[0].tls_verify_certificates), input.soapEndpointPath || '/sdk', input.automationApiBasePath || '/api');
      }
      const fields: string[] = []; const values: unknown[] = [];
      const set = (column: string, value: unknown) => { values.push(value); fields.push(`${column}=$${values.length}`); };
      for (const [key, column] of Object.entries({ connectorType: 'connector_type_id', environment: 'environment', enabled: 'enabled', tlsCaReference: 'tls_ca_reference', tlsVerifyCertificates: 'tls_verify_certificates', endpointAllowPrivateNetwork: 'endpoint_allow_private_network', requestTimeoutMs: 'request_timeout_ms', scheduleMinutes: 'schedule_minutes' })) if (key in input) set(column, (input as any)[key]);
       if ('name' in input) set('name', input.name);
       if ('description' in input) set('description', input.description);
      if (input.nonSecretConfiguration) set('non_secret_configuration', JSON.stringify(input.nonSecretConfiguration));
      const nextEnabled = 'enabled' in input ? Boolean(input.enabled) : Boolean(current.rows[0].enabled);
      values.push(nextEnabled);
      const enabledParam = `$${values.length}`;
      fields.push(`health_status=CASE WHEN ${enabledParam} THEN health_status ELSE 'DISABLED' END`, `operational_state=CASE WHEN ${enabledParam} THEN CASE WHEN operational_state='DISABLED' THEN 'IDLE' ELSE operational_state END ELSE 'DISABLED' END`, 'version=version+1', 'updated_by_user_id=' + `$${values.push(actor.id)}`, 'updated_at=NOW()');
      values.push(id, input.version);
      const updated = await client.query(`UPDATE cmdb_discovery_connectors SET ${fields.join(',')} WHERE id=$${values.length - 1} AND version=$${values.length} RETURNING *`, values as any[]);
      if (!updated.rows[0]) throw Object.assign(new Error('Connector update lost a concurrent write.'), { statusCode: 409 });
      if (nextType === 'VCENTER') {
        const profile = await client.query('SELECT endpoint_fqdn,port,soap_endpoint_path,automation_api_base_path,response_size_limit_bytes FROM cmdb_vcenter_connector_profiles WHERE connector_id=$1', [id]);
        currentProfile = profile.rows[0];
        const endpointFqdn = input.endpointFqdn || currentProfile?.endpoint_fqdn;
        const port = input.port || Number(currentProfile?.port || 443);
        if (!endpointFqdn) throw Object.assign(new Error('endpointFqdn is required for a vCenter connector.'), { statusCode: 400 });
        const normalizedEndpoint = validateVCenterEndpoint(endpointFqdn, port, Boolean(updated.rows[0].tls_verify_certificates), input.soapEndpointPath || currentProfile?.soap_endpoint_path || '/sdk', input.automationApiBasePath || currentProfile?.automation_api_base_path || '/api');
        const duplicate = await client.query(`
          SELECT c.id, dc.name
          FROM cmdb_vcenter_connector_profiles v
          JOIN cmdb_discovery_connectors c ON c.id=v.connector_id
           LEFT JOIN department_connections dc ON dc.id=c.connection_id
           WHERE c.connector_type_id='VCENTER' AND c.deleted_at IS NULL AND (dc.deleted_at IS NULL OR c.connection_id IS NULL)
            AND c.id<>$1 AND lower(v.endpoint_fqdn)=lower($2) AND v.port=$3
          LIMIT 1`, [id, normalizedEndpoint, port]);
        if (duplicate.rows[0]) throw Object.assign(new Error(`A vCenter connector already targets ${normalizedEndpoint}:${port} (${duplicate.rows[0].name}).`), { statusCode: 409, code: 'VCENTER_DUPLICATE_TARGET' });
        await VCenterConnectorRepository.updateProfile(client, {
          connectorId: id,
          endpointFqdn: normalizedEndpoint,
          port,
          soapEndpointPath: input.soapEndpointPath || currentProfile?.soap_endpoint_path || '/sdk',
          automationApiBasePath: input.automationApiBasePath || currentProfile?.automation_api_base_path || '/api',
          responseSizeLimitBytes: input.responseSizeLimitBytes || Number(currentProfile?.response_size_limit_bytes || 4194304),
        });
        if (input.username && input.password) await VCenterConnectorRepository.upsertCredential(client, id, VCenterCredentialCryptoService.encrypt({ username: input.username, password: input.password }));
      }
      await AuditService.logPostgres(client, { actor, action: 'CMDB_CONNECTOR_UPDATED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, before: { ...current.rows[0], secret_reference: undefined, tls_ca_reference: undefined }, after: { ...updated.rows[0], secret_reference: undefined, tls_ca_reference: undefined } });
      const before = current.rows[0];
      const after = updated.rows[0];
      const auditChanges: Array<{ action: 'CMDB_CONNECTOR_ENDPOINT_CHANGED' | 'CMDB_CONNECTOR_CREDENTIAL_CHANGED' | 'CMDB_CONNECTOR_CA_CHANGED' | 'CMDB_CONNECTOR_TLS_POLICY_CHANGED'; field: string; oldValue: unknown; newValue: unknown }> = [];
      if (currentProfile && (input.endpointFqdn || input.port !== undefined) && (currentProfile.endpoint_fqdn !== (input.endpointFqdn || currentProfile.endpoint_fqdn) || Number(currentProfile.port) !== (input.port || Number(currentProfile.port)))) auditChanges.push({ action: 'CMDB_CONNECTOR_ENDPOINT_CHANGED', field: 'endpoint', oldValue: `${currentProfile.endpoint_fqdn}:${currentProfile.port}`, newValue: `${input.endpointFqdn || currentProfile.endpoint_fqdn}:${input.port || Number(currentProfile.port)}` });
      if ('username' in input) auditChanges.push({ action: 'CMDB_CONNECTOR_CREDENTIAL_CHANGED', field: 'encryptedServiceCredential', oldValue: '[REDACTED]', newValue: '[ROTATED]' });
      if ('tlsCaReference' in input && before.tls_ca_reference !== after.tls_ca_reference) auditChanges.push({ action: 'CMDB_CONNECTOR_CA_CHANGED', field: 'tlsCaReference', oldValue: Boolean(before.tls_ca_reference), newValue: Boolean(after.tls_ca_reference) });
      if ('tlsVerifyCertificates' in input && Boolean(before.tls_verify_certificates) !== Boolean(after.tls_verify_certificates)) auditChanges.push({ action: 'CMDB_CONNECTOR_TLS_POLICY_CHANGED', field: 'tlsVerifyCertificates', oldValue: Boolean(before.tls_verify_certificates), newValue: Boolean(after.tls_verify_certificates) });
      for (const change of auditChanges) await AuditService.logPostgres(client, { actor, action: change.action, entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, fieldChanges: [{ field: change.field, oldValue: change.oldValue, newValue: change.newValue }] });
      return withoutConnectorSecrets(updated.rows[0]);
    });
  }

  public static async setConnectorEnabled(actor: BankUser | undefined, id: string, enabled: boolean, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'asset_discovery.enable');
    z.string().trim().min(1).max(64).parse(id); z.boolean().parse(enabled);
    return pgClient.transaction(async (client) => {
      const result = await client.query(`UPDATE cmdb_discovery_connectors SET enabled=$2,health_status=CASE WHEN $2 THEN 'UNKNOWN' ELSE 'DISABLED' END,operational_state=CASE WHEN $2 THEN 'IDLE' ELSE 'DISABLED' END,version=version+1,updated_by_user_id=$3,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING *`, [id, enabled, actor.id]);
      if (!result.rows[0]) throw Object.assign(new Error('Discovery connector not found.'), { statusCode: 404 });
      await AuditService.logPostgres(client, { actor, action: enabled ? 'CMDB_CONNECTOR_ENABLED' : 'CMDB_CONNECTOR_DISABLED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, after: { enabled } });
      return { ...result.rows[0], secret_reference: undefined, tls_ca_reference: undefined, hasSecretReference: Boolean(result.rows[0].secret_reference), hasTlsCaReference: Boolean(result.rows[0].tls_ca_reference) };
    });
  }

  public static async listCorrelationCases(actor: BankUser | undefined, page = 1, pageSize = 25): Promise<any> {
    requirePermission(actor, 'asset_correlation.read');
    const parsedPage = z.number().int().min(1).max(100000).parse(page); const parsedSize = z.number().int().min(1).max(100).parse(pageSize);
    const params = [parsedSize, (parsedPage - 1) * parsedSize];
    const result = await pgClient.query(`SELECT c.*,sr.external_object_type,sr.external_object_id,sr.connector_id FROM cmdb_correlation_cases c JOIN cmdb_source_records sr ON sr.id=c.source_record_id WHERE c.status='OPEN' ORDER BY c.opened_at ASC,c.id LIMIT $1 OFFSET $2`, params);
    const count = await pgClient.query("SELECT count(*) AS count FROM cmdb_correlation_cases WHERE status='OPEN'");
    const cases = [];
    for (const row of result.rows) {
      const candidates = await pgClient.query('SELECT cc.*,a.ci_number,a.name,a.hostname FROM cmdb_correlation_candidates cc JOIN configuration_items a ON a.id=cc.asset_id WHERE cc.case_id=$1 ORDER BY cc.score DESC,cc.asset_id', [row.id]);
      cases.push({ id: row.id, sourceRecordId: row.source_record_id, outcome: row.outcome, status: row.status, summary: row.summary, openedAt: row.opened_at, sourceObjectType: row.external_object_type, sourceObjectId: row.external_object_id, connectorId: row.connector_id, candidates: candidates.rows.map((candidate) => ({ assetId: candidate.asset_id, ciNumber: candidate.ci_number, name: candidate.name, hostname: candidate.hostname, score: Number(candidate.score), evidence: candidate.evidence })) });
    }
    return { items: cases, total: Number(count.rows[0]?.count || 0), page: parsedPage, pageSize: parsedSize };
  }

  public static async resolveCorrelation(actor: BankUser | undefined, caseId: string, raw: unknown, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'asset_correlation.resolve');
    const input = correlationResolutionSchema.parse(raw); z.string().trim().min(1).max(64).parse(caseId);
    return pgClient.transaction(async (client) => {
      const current = await client.query('SELECT * FROM cmdb_correlation_cases WHERE id=$1 AND status=\'OPEN\' FOR UPDATE', [caseId]);
      if (!current.rows[0]) throw Object.assign(new Error('Open correlation case not found.'), { statusCode: 404 });
      if (input.action === 'MATCH_EXISTING' && input.assetId) {
        const asset = await client.query('SELECT id FROM configuration_items WHERE id=$1 AND archived_at IS NULL', [input.assetId]);
        if (!asset.rows[0]) throw Object.assign(new Error('Selected canonical asset does not exist.'), { statusCode: 400 });
      }
      const status = input.action === 'MATCH_EXISTING' ? 'RESOLVED_MATCH' : input.action === 'CREATE_NEW' ? 'RESOLVED_NEW_ASSET' : 'DISMISSED';
      await client.query('INSERT INTO cmdb_correlation_overrides(source_record_id,asset_id,resolution_action,resolution_note,decided_by_user_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_record_id) DO UPDATE SET asset_id=EXCLUDED.asset_id,resolution_action=EXCLUDED.resolution_action,resolution_note=EXCLUDED.resolution_note,decided_by_user_id=EXCLUDED.decided_by_user_id,decided_at=NOW(),active=TRUE,version=cmdb_correlation_overrides.version+1', [current.rows[0].source_record_id, input.assetId || null, input.action, input.note, actor.id]);
      const updated = await client.query('UPDATE cmdb_correlation_cases SET status=$2,resolved_at=NOW(),resolved_by_user_id=$3,resolved_asset_id=$4,resolution_note=$5 WHERE id=$1 AND status=\'OPEN\' RETURNING *', [caseId, status, actor.id, input.assetId || null, input.note]);
      await AuditService.logPostgres(client, { actor, action: 'CMDB_CORRELATION_RESOLVED', entityType: 'CORRELATION_CASE', entityId: caseId, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, before: current.rows[0], after: { status, assetId: input.assetId || null, note: input.note } });
      return updated.rows[0];
    });
  }
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
}
