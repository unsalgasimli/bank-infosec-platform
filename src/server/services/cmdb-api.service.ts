import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
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
import { CortexInventorySyncService } from './cortex-inventory-sync.service.js';
import { SmbPrinterInventorySyncService } from './smb-printer-inventory-sync.service.js';
import { validateCortexTransport } from '../integrations/cortex/cortex-endpoint-policy.js';
import { config } from '../config/index.js';

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(255).optional(),
  operatingSystem: z.string().trim().max(255).optional(),
  operatingSystems: z.preprocess((value) => Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value, z.array(z.string().trim().min(1).max(255)).max(100).optional()),
  sortBy: z.enum(['name', 'ciNumber', 'environment', 'lifecycleState', 'criticality', 'lastSeenAt', 'updatedAt']).default('updatedAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  typeId: z.string().trim().max(64).optional(),
  typeIds: z.preprocess((value) => Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value, z.array(z.string().trim().min(1).max(64)).max(30).optional()),
  environment: z.string().trim().max(32).optional(),
  lifecycleState: z.string().trim().max(32).optional(),
  lifecycleStatus: z.string().trim().max(32).optional(),
  quality: z.string().trim().max(32).optional(),
  status: z.string().trim().max(32).optional(),
  criticality: z.string().trim().max(32).optional(),
  ownerUserId: z.string().trim().max(64).optional(),
  owner: z.string().trim().max(255).optional(),
  departmentId: z.string().trim().max(128).optional(),
  supportGroupId: z.string().trim().max(128).optional(),
  businessServiceId: z.string().trim().max(64).optional(),
  sourceConnectorId: z.string().trim().max(64).optional(),
  sourceConnectorIds: z.preprocess((value) => Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value, z.array(z.string().trim().min(1).max(64)).max(100).optional()),
  sourceType: z.enum(['VCENTER', 'ACTIVE_DIRECTORY', 'CORTEX', 'SMB_PRINTER']).optional(),
  sourceTypes: z.preprocess((value) => Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value, z.array(z.enum(['VCENTER', 'ACTIVE_DIRECTORY', 'CORTEX', 'SMB_PRINTER'])).max(4).optional()),
  posture: z.enum(['missing-cortex','cortex-offline','partially-protected','vcenter-without-cortex','ad-without-cortex','cortex-only','identity-conflict','stale-assets']).optional(),
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
  smbHost: z.string().trim().max(255).optional(),
}).strict();

const connectorUpdateSchema = connectorCreateSchema.partial().extend({ version: z.number().int().positive() }).strict();
const connectorTypeQuerySchema = z.string().trim().max(64).optional();
const cortexInventoryScopeSchema = z.enum(['ENDPOINTS', 'ASSETS']);
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

const customFieldTypeSchema = z.enum(['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT', 'MULTI_SELECT', 'USER']);
const customFieldKeySchema = z.string().trim().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/, 'Field key must start with a lowercase letter and contain only lowercase letters, numbers and underscores.');
const customFieldDefinitionSchema = z.object({
  key: customFieldKeySchema,
  label: z.string().trim().min(1).max(128),
  type: customFieldTypeSchema,
  options: z.array(z.string().trim().min(1).max(128)).max(100).default([]),
  description: z.string().trim().max(1000).default(''),
  displayOrder: z.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
}).strict();
const customFieldUpdateSchema = customFieldDefinitionSchema.partial().extend({ version: z.number().int().positive() }).strict();
const customFieldValuesSchema = z.object({
  version: z.number().int().positive(),
  values: z.record(z.string().max(64), z.unknown()).default({}),
}).strict();

const effectiveIpSql = `(SELECT host(ip.ip_address) FROM cmdb_ip_addresses ip WHERE ip.asset_id=a.id AND ip.retired_at IS NULL ORDER BY ip.is_primary DESC, ip.last_seen_at DESC, ip.id LIMIT 1)`;
const customEnvironmentSql = `(SELECT val.value #>> '{}' FROM cmdb_custom_field_values val JOIN cmdb_custom_field_definitions def ON def.id=val.field_id WHERE val.asset_id=a.id AND def.field_key='environment' AND def.is_active AND def.deleted_at IS NULL LIMIT 1)`;
const effectiveEnvironmentSql = `COALESCE(NULLIF(${customEnvironmentSql}, ''), NULLIF(a.environment, 'UNKNOWN'), NULLIF(a.source_payload #>> '{environment}', 'UNKNOWN'), NULLIF((SELECT COALESCE(sr.normalized_payload #>> '{classification,environment}', sr.normalized_payload #>> '{sourceSpecificMetadata,environment}', sr.normalized_payload #>> '{sourceSpecificMetadata,environmentName}') FROM cmdb_source_records sr WHERE sr.asset_id=a.id AND sr.status='ACTIVE' ORDER BY sr.last_seen_at DESC, sr.id LIMIT 1), 'UNKNOWN'), 'UNKNOWN')`;
const customFieldsSql = `(SELECT COALESCE(jsonb_object_agg(def.field_key, val.value ORDER BY def.display_order, def.label), '{}'::jsonb) FROM cmdb_custom_field_values val JOIN cmdb_custom_field_definitions def ON def.id=val.field_id WHERE val.asset_id=a.id AND def.is_active AND def.deleted_at IS NULL)`;

function requirePermission(actor: BankUser | undefined, permission: CmdbPermission): asserts actor is BankUser {
  AuthService.assertCmdbPermission(actor, permission);
}

function mapAsset(row: any): any {
  return {
    id: row.id, ciNumber: row.ci_number, assetKey: row.asset_key, name: row.name, displayName: row.display_name || row.name,
    typeId: row.type_id, assetSubtype: row.asset_subtype || undefined, status: row.status, lifecycleState: row.lifecycle_state,
    lifecycleStatus: row.lifecycle_status, technicalStatus: row.technical_status, environment: row.effective_environment || row.environment,
    criticality: row.criticality, businessCriticality: row.business_criticality || undefined, description: row.description || undefined,
    ownerUserId: row.owner_user_id || undefined, technicalOwnerUserId: row.technical_owner_user_id || undefined,
    businessOwnerUserId: row.business_owner_user_id || undefined, supportGroupId: row.support_group_id || undefined,
    ownerName: row.owner_name || undefined, technicalOwnerName: row.technical_owner_name || undefined,
    businessOwnerName: row.business_owner_name || undefined,
    departmentId: row.department_id || undefined, locationId: row.location_id || undefined, vendor: row.vendor || undefined,
    manufacturer: row.manufacturer || undefined, model: row.model || undefined, serialNumber: row.serial_number || undefined,
    assetTag: row.asset_tag || undefined, hostname: row.hostname || undefined, fqdn: row.fqdn || undefined,
    ipAddress: row.ip_address || row.effective_ip_address || undefined, macAddress: row.mac_address || undefined, operatingSystem: row.operating_system || undefined,
    osVersion: row.os_version || undefined, cpuCount: row.cpu_count == null ? undefined : Number(row.cpu_count), memoryBytes: row.memory_bytes == null ? undefined : Number(row.memory_bytes),
    source: row.source, sourceSystem: row.source_system || undefined,
    sourceRecordId: row.source_record_id || undefined, discoveryStatus: row.discovery_status, lastDiscoveredAt: row.last_discovered_at?.toISOString?.() || row.last_discovered_at || undefined,
    lastVerifiedAt: row.last_verified_at?.toISOString?.() || row.last_verified_at || undefined, lastSeenAt: row.last_seen_at?.toISOString?.() || row.last_seen_at || undefined,
    lastSyncAt: row.last_sync_at?.toISOString?.() || row.last_sync_at || undefined, syncStatus: row.sync_status || undefined,
    details: row.details || {}, version: Number(row.version || 1), createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at, archivedAt: row.archived_at?.toISOString?.() || row.archived_at || undefined,
    sourceCount: Number(row.source_count || 0), relationshipCount: Number(row.relationship_count || 0),
    sourceCoverage: Array.isArray(row.source_coverage) ? row.source_coverage : [],
    correlationState: row.correlation_state || undefined,
    correlationConfidence: row.correlation_confidence == null ? undefined : Number(row.correlation_confidence),
    conflictCount: Number(row.conflict_count || 0),
    cortexSecurity: row.cortex_security || undefined,
    openFindingCount: Number(row.open_finding_count || 0),
    discoveredOwnerNames: Array.isArray(row.discovered_owner_names) ? row.discovered_owner_names : [],
    customFields: row.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {},
  };
}

function mapCustomField(row: any): any {
  return {
    id: row.id, key: row.field_key, label: row.label, type: row.data_type,
    options: Array.isArray(row.options) ? row.options : [], description: row.description || '',
    displayOrder: Number(row.display_order || 0), isActive: Boolean(row.is_active), isSystem: Boolean(row.is_system),
    version: Number(row.version || 1), createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

function validateCustomFieldValue(field: any, value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  switch (field.data_type) {
    case 'TEXT':
      return z.string().trim().max(4000).parse(value) || null;
    case 'NUMBER':
      return z.number().finite().parse(value);
    case 'BOOLEAN':
      return z.boolean().parse(value);
    case 'DATE':
      return z.string().date().parse(value);
    case 'USER':
      return z.string().trim().min(1).max(64).parse(value);
    case 'SELECT': {
      const selected = z.string().trim().min(1).max(128).parse(value);
      if (!field.options.includes(selected)) throw Object.assign(new Error(`Value is not valid for custom field "${field.label}".`), { statusCode: 400 });
      return selected;
    }
    case 'MULTI_SELECT': {
      const selected = z.array(z.string().trim().min(1).max(128)).max(100).parse(value);
      if (selected.some((item) => !field.options.includes(item))) throw Object.assign(new Error(`One or more values are not valid for custom field "${field.label}".`), { statusCode: 400 });
      return [...new Set(selected)];
    }
    default:
      throw Object.assign(new Error('Unsupported custom field type.'), { statusCode: 400 });
  }
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

const VCENTER_CREATE_VALIDATION_TIMEOUT_MS = 35_000;

async function verifyVCenterBeforeCreation(configuration: VCenterConnectorConfiguration, username: string, password: string): Promise<Awaited<ReturnType<VCenterConnector['connect']>>> {
  const client = new VCenterRestClient();
  let timeout: NodeJS.Timeout | undefined;
  try {
    const validation = new VCenterConnector(configuration, client).connect({ username, password });
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(Object.assign(new Error('vCenter validation did not finish within 35 seconds. Verify reachability, TLS and the service-account permissions, then try again.'), { statusCode: 504, code: 'VCENTER_CONNECT_TIMEOUT' })), VCENTER_CREATE_VALIDATION_TIMEOUT_MS);
    });
    return await Promise.race([validation, deadline]);
  } catch (error) {
    if (error instanceof VCenterConnectorError) Object.assign(error, { statusCode: 422 });
    else if (error instanceof Error) Object.assign(error, { statusCode: Number((error as any).statusCode) || 422, code: (error as any).code || 'VCENTER_CONFIG_INVALID' });
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
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
    if (query.typeIds?.length) add('a.type_id = ANY(?::text[])', query.typeIds);
    if (query.environment) { params.push(query.environment); where.push(`${effectiveEnvironmentSql} = $${params.length}`); }
    if (query.operatingSystem) {
      params.push(`%${query.operatingSystem.toLowerCase()}%`);
      const p = `$${params.length}`;
      where.push(`(
        lower(COALESCE(a.operating_system,'')) LIKE ${p}
        OR lower(COALESCE(a.os_version,'')) LIKE ${p}
        OR EXISTS (SELECT 1 FROM cmdb_source_records os_source WHERE os_source.asset_id=a.id AND lower(COALESCE(os_source.normalized_payload #>> '{operatingSystem,reported}', os_source.normalized_payload #>> '{operatingSystem,configured}', os_source.normalized_payload #>> '{operatingSystem,name}', os_source.normalized_payload #>> '{operatingSystem,version}', '')) LIKE ${p})
      )`);
    }
    if (query.operatingSystems?.length) {
      params.push(query.operatingSystems.map((value) => value.trim().toLowerCase().replace(/\s+/g, ' ')));
      const p = `$${params.length}`;
      where.push(`(
        lower(regexp_replace(btrim(COALESCE(a.operating_system,'')), '\\s+', ' ', 'g')) = ANY(${p}::text[])
        OR lower(regexp_replace(btrim(COALESCE(a.os_version,'')), '\\s+', ' ', 'g')) = ANY(${p}::text[])
        OR EXISTS (
          SELECT 1
            FROM (VALUES
              (a.source_payload #>> '{operatingSystem,reported}'),
              (a.source_payload #>> '{operatingSystem,configured}'),
              (a.source_payload #>> '{operatingSystem,name}')
            ) AS asset_os(value)
           WHERE lower(regexp_replace(btrim(COALESCE(asset_os.value,'')), '\\s+', ' ', 'g')) = ANY(${p}::text[])
        )
        OR EXISTS (
          SELECT 1
            FROM cmdb_source_records os_source
            CROSS JOIN LATERAL (VALUES
              (os_source.normalized_payload #>> '{operatingSystem,reported}'),
              (os_source.normalized_payload #>> '{operatingSystem,configured}'),
              (os_source.normalized_payload #>> '{operatingSystem,name}')
            ) AS source_os(value)
           WHERE os_source.asset_id=a.id
             AND lower(regexp_replace(btrim(COALESCE(source_os.value,'')), '\\s+', ' ', 'g')) = ANY(${p}::text[])
        )
      )`);
    }
    if (query.lifecycleState || query.lifecycleStatus) add('a.lifecycle_state = ?', query.lifecycleState || query.lifecycleStatus);
    if (query.quality) add('a.discovery_status = ?', query.quality);
    if (query.status) add('a.status = ?', query.status);
    if (query.criticality) add('a.criticality = ?', query.criticality);
    if (query.ownerUserId) add('(a.owner_user_id = ? OR a.technical_owner_user_id = ? OR a.business_owner_user_id = ?)', query.ownerUserId);
    if (query.owner) {
      params.push(`%${query.owner.toLowerCase()}%`);
      const p = `$${params.length}`;
      where.push(`(
        EXISTS (SELECT 1 FROM bank_users owner_filter WHERE owner_filter.id IN (a.owner_user_id,a.technical_owner_user_id,a.business_owner_user_id) AND lower(owner_filter.full_name) LIKE ${p})
        OR (a.type_id='directory_user' AND (lower(a.name) LIKE ${p} OR lower(COALESCE(a.display_name,'')) LIKE ${p}))
        OR EXISTS (SELECT 1 FROM cmdb_source_records owner_source WHERE owner_source.asset_id=a.id AND lower(COALESCE(owner_source.normalized_payload::text,'')) LIKE ${p})
      )`);
    }
    if (query.departmentId) add('a.department_id = ?', query.departmentId);
    if (query.supportGroupId) add('a.support_group_id = ?', query.supportGroupId);
    if (query.sourceConnectorId) add('EXISTS (SELECT 1 FROM cmdb_source_records sr_filter WHERE sr_filter.asset_id=a.id AND sr_filter.connector_id = ?)', query.sourceConnectorId);
    if (query.sourceConnectorIds?.length) add('EXISTS (SELECT 1 FROM cmdb_source_records sr_filter WHERE sr_filter.asset_id=a.id AND sr_filter.connector_id = ANY(?::text[]))', query.sourceConnectorIds);
    if (query.sourceType) add("EXISTS (SELECT 1 FROM cmdb_source_records sr_filter JOIN cmdb_discovery_connectors c_filter ON c_filter.id=sr_filter.connector_id WHERE sr_filter.asset_id=a.id AND sr_filter.status='ACTIVE' AND c_filter.connector_type_id = ?)", query.sourceType);
    if (query.sourceTypes?.length) add("EXISTS (SELECT 1 FROM cmdb_source_records sr_filter JOIN cmdb_discovery_connectors c_filter ON c_filter.id=sr_filter.connector_id WHERE sr_filter.asset_id=a.id AND sr_filter.status='ACTIVE' AND c_filter.connector_type_id = ANY(?::text[]))", query.sourceTypes);
    if (query.businessServiceId) add('EXISTS (SELECT 1 FROM ci_relationships r_bs WHERE r_bs.source_ci_id=a.id AND r_bs.target_ci_id = ? AND r_bs.status=\'ACTIVE\' AND r_bs.archived_at IS NULL)', query.businessServiceId);
    if (query.stale === 'true') where.push("a.lifecycle_state IN ('STALE','DECOMMISSION_CANDIDATE')");
    if (query.missingOwner === 'true') where.push('a.owner_user_id IS NULL AND a.technical_owner_user_id IS NULL AND a.business_owner_user_id IS NULL');
    if (query.posture === 'missing-cortex') where.push("EXISTS (SELECT 1 FROM cmdb_source_records sr JOIN cmdb_discovery_connectors c ON c.id=sr.connector_id WHERE sr.asset_id=a.id AND sr.status='ACTIVE' AND c.connector_type_id IN ('VCENTER','ACTIVE_DIRECTORY')) AND NOT EXISTS (SELECT 1 FROM cmdb_source_records sr JOIN cmdb_discovery_connectors c ON c.id=sr.connector_id WHERE sr.asset_id=a.id AND sr.status='ACTIVE' AND c.connector_type_id='CORTEX')");
    if (query.posture === 'cortex-offline') where.push("EXISTS (SELECT 1 FROM cmdb_security_findings f WHERE f.asset_id=a.id AND f.state='OPEN' AND f.finding_type='CORTEX_OFFLINE')");
    if (query.posture === 'partially-protected') where.push("EXISTS (SELECT 1 FROM cmdb_cortex_security_posture p WHERE p.asset_id=a.id AND p.protection_state='PARTIALLY_PROTECTED')");
    if (query.posture === 'vcenter-without-cortex') where.push("EXISTS (SELECT 1 FROM cmdb_security_findings f WHERE f.asset_id=a.id AND f.state='OPEN' AND f.finding_type IN ('VCENTER_WITHOUT_CORTEX','CORTEX_MISSING'))");
    if (query.posture === 'ad-without-cortex') where.push("EXISTS (SELECT 1 FROM cmdb_security_findings f WHERE f.asset_id=a.id AND f.state='OPEN' AND f.finding_type IN ('AD_WITHOUT_CORTEX','CORTEX_MISSING'))");
    if (query.posture === 'cortex-only') where.push("EXISTS (SELECT 1 FROM cmdb_security_findings f WHERE f.asset_id=a.id AND f.state='OPEN' AND f.finding_type='CORTEX_ONLY')");
    if (query.posture === 'identity-conflict') where.push("EXISTS (SELECT 1 FROM cmdb_security_findings f WHERE f.asset_id=a.id AND f.state='OPEN' AND f.finding_type='IDENTITY_CONFLICT')");
    if (query.posture === 'stale-assets') where.push("(a.lifecycle_state IN ('STALE','DECOMMISSION_CANDIDATE') OR EXISTS (SELECT 1 FROM cmdb_source_records sr WHERE sr.asset_id=a.id AND sr.status IN ('MISSING','STALE')))");
    if (query.search) {
      params.push(`%${query.search.toLowerCase()}%`);
      const p = `$${params.length}`;
      where.push(`(lower(a.name) LIKE ${p} OR lower(COALESCE(a.display_name,'')) LIKE ${p} OR lower(COALESCE(a.hostname,'')) LIKE ${p} OR lower(COALESCE(a.fqdn,'')) LIKE ${p} OR lower(COALESCE(a.serial_number,'')) LIKE ${p} OR lower(COALESCE(a.asset_tag,'')) LIKE ${p} OR lower(COALESCE(a.ip_address,'')) LIKE ${p} OR lower(COALESCE(a.mac_address,'')) LIKE ${p} OR lower(COALESCE(a.operating_system,'')) LIKE ${p} OR lower(COALESCE(a.os_version,'')) LIKE ${p} OR lower(COALESCE(a.vendor,'')) LIKE ${p} OR lower(COALESCE(a.manufacturer,'')) LIKE ${p} OR lower(COALESCE(a.model,'')) LIKE ${p} OR lower(COALESCE(a.description,'')) LIKE ${p} OR lower(COALESCE(a.details::text,'')) LIKE ${p} OR lower(a.ci_number) LIKE ${p} OR EXISTS (SELECT 1 FROM bank_users owner_search WHERE owner_search.id IN (a.owner_user_id,a.technical_owner_user_id,a.business_owner_user_id) AND lower(owner_search.full_name) LIKE ${p}) OR EXISTS (SELECT 1 FROM cmdb_asset_identifiers ai_s WHERE ai_s.asset_id=a.id AND ai_s.retired_at IS NULL AND lower(ai_s.normalized_value) LIKE ${p}) OR EXISTS (SELECT 1 FROM cmdb_source_records sr_s WHERE sr_s.asset_id=a.id AND (lower(sr_s.external_object_id) LIKE ${p} OR lower(COALESCE(sr_s.source_name,'')) LIKE ${p} OR lower(COALESCE(sr_s.normalized_payload::text,'')) LIKE ${p})) OR EXISTS (SELECT 1 FROM cmdb_network_interfaces ni_s JOIN cmdb_mac_addresses ma_s ON ma_s.interface_id=ni_s.id WHERE ni_s.asset_id=a.id AND ma_s.retired_at IS NULL AND lower(ma_s.normalized_mac) LIKE ${p}) OR EXISTS (SELECT 1 FROM cmdb_ip_addresses ip_s WHERE ip_s.asset_id=a.id AND ip_s.retired_at IS NULL AND host(ip_s.ip_address) LIKE ${p}))`);
    }
    const base = `FROM configuration_items a WHERE ${where.join(' AND ')}`;
    const count = await pgClient.query<{ count: string }>(`SELECT count(*) AS count ${base}`, params as any[]);
    const sort = sortableColumns[query.sortBy] || sortableColumns.updatedAt;
    const direction = query.sortDirection === 'asc' ? 'ASC' : 'DESC';
    const offset = (query.page - 1) * query.pageSize;
    const dataParams = [...params, query.pageSize, offset];
    const result = await pgClient.query(`SELECT a.*, ${effectiveIpSql} AS effective_ip_address, ${effectiveEnvironmentSql} AS effective_environment, ${customFieldsSql} AS custom_fields,
      (SELECT count(*) FROM cmdb_source_records sr WHERE sr.asset_id=a.id) AS source_count,
      ARRAY(SELECT DISTINCT c.connector_type_id FROM cmdb_source_records sr JOIN cmdb_discovery_connectors c ON c.id=sr.connector_id WHERE sr.asset_id=a.id ORDER BY c.connector_type_id) AS source_coverage,
      (SELECT to_jsonb(p)-'asset_id' FROM cmdb_cortex_security_posture p WHERE p.asset_id=a.id) AS cortex_security,
      (SELECT count(*) FROM cmdb_security_findings f WHERE f.asset_id=a.id AND f.state='OPEN') AS open_finding_count,
      (SELECT CASE
        WHEN EXISTS (SELECT 1 FROM cmdb_correlation_cases c JOIN cmdb_correlation_candidates cc ON cc.case_id=c.id WHERE cc.asset_id=a.id AND c.status='OPEN' AND c.outcome='IDENTITY_CONFLICT') THEN 'CONFLICT'
        WHEN EXISTS (SELECT 1 FROM cmdb_correlation_cases c JOIN cmdb_correlation_candidates cc ON cc.case_id=c.id WHERE cc.asset_id=a.id AND c.status='OPEN' AND c.outcome='REVIEW_REQUIRED') THEN 'NEEDS_REVIEW'
        WHEN EXISTS (SELECT 1 FROM cmdb_source_records sr WHERE sr.asset_id=a.id AND sr.last_correlation_outcome='AUTO_LINK') THEN 'AUTO_CORRELATED'
        WHEN EXISTS (SELECT 1 FROM cmdb_source_records sr WHERE sr.asset_id=a.id AND sr.last_correlation_outcome='CREATE_NEW') THEN 'VERIFIED'
        WHEN EXISTS (SELECT 1 FROM cmdb_source_records sr WHERE sr.asset_id=a.id) THEN 'VERIFIED'
        ELSE 'MANUAL'
      END) AS correlation_state,
      (SELECT COALESCE(MAX(cc.score), MAX(cd.confidence)) FROM cmdb_source_records sr
        LEFT JOIN cmdb_correlation_cases c ON c.source_record_id=sr.id
        LEFT JOIN cmdb_correlation_candidates cc ON cc.case_id=c.id AND cc.asset_id=a.id
        LEFT JOIN cmdb_correlation_decisions cd ON cd.source_record_id=sr.id AND cd.selected_asset_id=a.id
        WHERE sr.asset_id=a.id OR cd.selected_asset_id=a.id) AS correlation_confidence,
      (SELECT count(DISTINCT c.id) FROM cmdb_correlation_cases c JOIN cmdb_correlation_candidates cc ON cc.case_id=c.id WHERE cc.asset_id=a.id AND c.status='OPEN' AND c.outcome='IDENTITY_CONFLICT') AS conflict_count,
      (SELECT full_name FROM bank_users u WHERE u.id=a.owner_user_id) AS owner_name,
      (SELECT full_name FROM bank_users u WHERE u.id=a.technical_owner_user_id) AS technical_owner_name,
      (SELECT full_name FROM bank_users u WHERE u.id=a.business_owner_user_id) AS business_owner_name,
      ARRAY(SELECT DISTINCT owner_name FROM (
        SELECT NULLIF(COALESCE(sr.normalized_payload #>> '{sourceSpecificMetadata,cortex,ownerName}', sr.normalized_payload #>> '{sourceSpecificMetadata,cortex,owner}', sr.normalized_payload #>> '{sourceSpecificMetadata,cortex,securityTelemetry,user_name}', sr.normalized_payload #>> '{sourceSpecificMetadata,cortex,securityTelemetry,username}', sr.normalized_payload #>> '{sourceSpecificMetadata,cortex,ownerCandidates,0}'), '') AS owner_name
        FROM cmdb_source_records sr WHERE sr.asset_id=a.id
      ) discovered_owners WHERE owner_name IS NOT NULL ORDER BY owner_name) AS discovered_owner_names,
      (SELECT count(*) FROM ci_relationships rr WHERE (rr.source_ci_id=a.id OR rr.target_ci_id=a.id) AND rr.status='ACTIVE' AND rr.archived_at IS NULL) AS relationship_count ${base} ORDER BY ${sort} ${direction}, a.id LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`, dataParams as any[]);
    return { items: result.rows.map(mapAsset), total: Number(count.rows[0]?.count || 0), page: query.page, pageSize: query.pageSize };
  }

  public static async getAsset(actor: BankUser | undefined, id: string): Promise<any> {
    requirePermission(actor, 'assets.read');
    z.string().trim().min(1).max(64).parse(id);
    const result = await pgClient.query(`SELECT a.*, ${effectiveIpSql} AS effective_ip_address, ${effectiveEnvironmentSql} AS effective_environment, ${customFieldsSql} AS custom_fields, (SELECT count(*) FROM cmdb_source_records sr WHERE sr.asset_id=a.id) AS source_count,
      ARRAY(SELECT DISTINCT c.connector_type_id FROM cmdb_source_records sr JOIN cmdb_discovery_connectors c ON c.id=sr.connector_id WHERE sr.asset_id=a.id ORDER BY c.connector_type_id) AS source_coverage,
      (SELECT to_jsonb(p)-'asset_id' FROM cmdb_cortex_security_posture p WHERE p.asset_id=a.id) AS cortex_security,
      (SELECT count(*) FROM cmdb_security_findings f WHERE f.asset_id=a.id AND f.state='OPEN') AS open_finding_count,
      (SELECT CASE
        WHEN EXISTS (SELECT 1 FROM cmdb_correlation_cases c JOIN cmdb_correlation_candidates cc ON cc.case_id=c.id WHERE cc.asset_id=a.id AND c.status='OPEN' AND c.outcome='IDENTITY_CONFLICT') THEN 'CONFLICT'
        WHEN EXISTS (SELECT 1 FROM cmdb_correlation_cases c JOIN cmdb_correlation_candidates cc ON cc.case_id=c.id WHERE cc.asset_id=a.id AND c.status='OPEN' AND c.outcome='REVIEW_REQUIRED') THEN 'NEEDS_REVIEW'
        WHEN EXISTS (SELECT 1 FROM cmdb_source_records sr WHERE sr.asset_id=a.id AND sr.last_correlation_outcome='AUTO_LINK') THEN 'AUTO_CORRELATED'
        WHEN EXISTS (SELECT 1 FROM cmdb_source_records sr WHERE sr.asset_id=a.id AND sr.last_correlation_outcome='CREATE_NEW') THEN 'VERIFIED'
        WHEN EXISTS (SELECT 1 FROM cmdb_source_records sr WHERE sr.asset_id=a.id) THEN 'VERIFIED'
        ELSE 'MANUAL'
      END) AS correlation_state,
      (SELECT COALESCE(MAX(cc.score), MAX(cd.confidence)) FROM cmdb_source_records sr
        LEFT JOIN cmdb_correlation_cases c ON c.source_record_id=sr.id
        LEFT JOIN cmdb_correlation_candidates cc ON cc.case_id=c.id AND cc.asset_id=a.id
        LEFT JOIN cmdb_correlation_decisions cd ON cd.source_record_id=sr.id AND cd.selected_asset_id=a.id
        WHERE sr.asset_id=a.id OR cd.selected_asset_id=a.id) AS correlation_confidence,
      (SELECT count(DISTINCT c.id) FROM cmdb_correlation_cases c JOIN cmdb_correlation_candidates cc ON cc.case_id=c.id WHERE cc.asset_id=a.id AND c.status='OPEN' AND c.outcome='IDENTITY_CONFLICT') AS conflict_count,
      (SELECT full_name FROM bank_users u WHERE u.id=a.owner_user_id) AS owner_name,
      (SELECT full_name FROM bank_users u WHERE u.id=a.technical_owner_user_id) AS technical_owner_name,
      (SELECT full_name FROM bank_users u WHERE u.id=a.business_owner_user_id) AS business_owner_name,
      ARRAY(SELECT DISTINCT owner_name FROM (
        SELECT NULLIF(COALESCE(sr.normalized_payload #>> '{sourceSpecificMetadata,cortex,ownerName}', sr.normalized_payload #>> '{sourceSpecificMetadata,cortex,owner}', sr.normalized_payload #>> '{sourceSpecificMetadata,cortex,securityTelemetry,user_name}', sr.normalized_payload #>> '{sourceSpecificMetadata,cortex,securityTelemetry,username}', sr.normalized_payload #>> '{sourceSpecificMetadata,cortex,ownerCandidates,0}'), '') AS owner_name
        FROM cmdb_source_records sr WHERE sr.asset_id=a.id
      ) discovered_owners WHERE owner_name IS NOT NULL ORDER BY owner_name) AS discovered_owner_names,
      (SELECT count(*) FROM ci_relationships rr WHERE (rr.source_ci_id=a.id OR rr.target_ci_id=a.id) AND rr.status='ACTIVE' AND rr.archived_at IS NULL) AS relationship_count FROM configuration_items a WHERE a.id=$1`, [id]);
    if (!result.rows[0]) throw Object.assign(new Error('Configuration item not found.'), { statusCode: 404 });
    return mapAsset(result.rows[0]);
  }

  public static async listCustomFields(actor: BankUser | undefined): Promise<any[]> {
    requirePermission(actor, 'assets.read');
    const result = await pgClient.query(`SELECT * FROM cmdb_custom_field_definitions WHERE deleted_at IS NULL AND is_active ORDER BY display_order, label, id`);
    return result.rows.map(mapCustomField);
  }

  public static async listOperatingSystems(actor: BankUser | undefined): Promise<any[]> {
    requirePermission(actor, 'assets.read');
    await pgClient.query(`
      WITH observed(name) AS (
        SELECT NULLIF(BTRIM(operating_system), '') FROM configuration_items
        UNION ALL SELECT NULLIF(BTRIM(os_version), '') FROM configuration_items
        UNION ALL SELECT NULLIF(BTRIM(normalized_payload #>> '{operatingSystem,reported}'), '') FROM cmdb_source_records
        UNION ALL SELECT NULLIF(BTRIM(normalized_payload #>> '{operatingSystem,configured}'), '') FROM cmdb_source_records
        UNION ALL SELECT NULLIF(BTRIM(normalized_payload #>> '{operatingSystem,name}'), '') FROM cmdb_source_records
      ), normalized AS (
        SELECT MIN(name) AS name, LOWER(REGEXP_REPLACE(BTRIM(name), '\\s+', ' ', 'g')) AS normalized_name
          FROM observed
         WHERE name IS NOT NULL
         GROUP BY LOWER(REGEXP_REPLACE(BTRIM(name), '\\s+', ' ', 'g'))
      )
      INSERT INTO cmdb_operating_systems (id, name, normalized_name)
      SELECT 'cmdb-os-' || MD5(normalized_name), name, normalized_name FROM normalized
      ON CONFLICT (normalized_name) DO UPDATE SET last_seen_at=NOW(), updated_at=NOW(), is_active=TRUE
    `);
    const result = await pgClient.query(`SELECT id, name, normalized_name AS "normalizedName" FROM cmdb_operating_systems WHERE is_active ORDER BY LOWER(name), id`);
    return result.rows;
  }

  public static async createCustomField(actor: BankUser | undefined, raw: unknown, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'assets.update');
    const input = customFieldDefinitionSchema.parse(raw);
    if (!['SELECT', 'MULTI_SELECT'].includes(input.type) && input.options.length) throw Object.assign(new Error('Options are only supported for select custom fields.'), { statusCode: 400 });
    const id = `cmdb-cf-${uuidv4()}`;
    try {
      return await pgClient.transaction(async (client) => {
        const result = await client.query(`INSERT INTO cmdb_custom_field_definitions(id,field_key,label,data_type,options,description,display_order,is_active,created_by_user_id,updated_by_user_id) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$9) RETURNING *`, [id, input.key, input.label, input.type, JSON.stringify(input.options), input.description, input.displayOrder, input.isActive, actor.id]);
        await AuditService.logPostgres(client, { actor, action: 'CMDB_CUSTOM_FIELD_CREATED', entityType: 'CMDB_CUSTOM_FIELD', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, after: { ...input, id } });
        return mapCustomField(result.rows[0]);
      });
    } catch (error: any) {
      if (error?.code === '23505') throw Object.assign(new Error('A custom field with that key already exists.'), { statusCode: 409, code: 'CMDB_CUSTOM_FIELD_KEY_EXISTS' });
      throw error;
    }
  }

  public static async updateCustomField(actor: BankUser | undefined, id: string, raw: unknown, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'assets.update');
    z.string().trim().min(1).max(64).parse(id);
    const input = customFieldUpdateSchema.parse(raw);
    if (input.type && !['SELECT', 'MULTI_SELECT'].includes(input.type) && input.options?.length) throw Object.assign(new Error('Options are only supported for select custom fields.'), { statusCode: 400 });
    return pgClient.transaction(async (client) => {
      const current = await client.query('SELECT * FROM cmdb_custom_field_definitions WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!current.rows[0]) throw Object.assign(new Error('Custom field not found.'), { statusCode: 404 });
      const before = current.rows[0];
      if (before.is_system) throw Object.assign(new Error('System custom fields cannot be reconfigured.'), { statusCode: 400 });
      const next = { key: input.key ?? before.field_key, label: input.label ?? before.label, type: input.type ?? before.data_type, options: input.options ?? (Array.isArray(before.options) ? before.options : []), description: input.description ?? before.description, displayOrder: input.displayOrder ?? before.display_order, isActive: input.isActive ?? before.is_active };
      if (!['SELECT', 'MULTI_SELECT'].includes(next.type) && next.options.length) throw Object.assign(new Error('Options are only supported for select custom fields.'), { statusCode: 400 });
      const updated = await client.query(`UPDATE cmdb_custom_field_definitions SET field_key=$2,label=$3,data_type=$4,options=$5::jsonb,description=$6,display_order=$7,is_active=$8,updated_by_user_id=$9,updated_at=NOW(),version=version+1 WHERE id=$1 AND version=$10 AND deleted_at IS NULL RETURNING *`, [id, next.key, next.label, next.type, JSON.stringify(next.options), next.description, next.displayOrder, next.isActive, actor.id, input.version]);
      if (!updated.rows[0]) throw Object.assign(new Error('This custom field was changed by another user. Refresh before saving.'), { statusCode: 409 });
      await AuditService.logPostgres(client, { actor, action: 'CMDB_CUSTOM_FIELD_UPDATED', entityType: 'CMDB_CUSTOM_FIELD', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, before, after: updated.rows[0] });
      return mapCustomField(updated.rows[0]);
    }).catch((error: any) => { if (error?.code === '23505') throw Object.assign(new Error('A custom field with that key already exists.'), { statusCode: 409, code: 'CMDB_CUSTOM_FIELD_KEY_EXISTS' }); throw error; });
  }

  public static async deleteCustomField(actor: BankUser | undefined, id: string, raw: unknown, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<{ id: string; deleted: true }> {
    requirePermission(actor, 'assets.update');
    const input = z.object({ version: z.number().int().positive() }).strict().parse(raw || {});
    return pgClient.transaction(async (client) => {
      const current = await client.query('SELECT * FROM cmdb_custom_field_definitions WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!current.rows[0]) throw Object.assign(new Error('Custom field not found.'), { statusCode: 404 });
      if (current.rows[0].is_system) throw Object.assign(new Error('System custom fields cannot be removed.'), { statusCode: 400 });
      const deleted = await client.query('UPDATE cmdb_custom_field_definitions SET is_active=FALSE,deleted_at=NOW(),updated_by_user_id=$2,updated_at=NOW(),version=version+1 WHERE id=$1 AND version=$3 AND deleted_at IS NULL RETURNING id', [id, actor.id, input.version]);
      if (!deleted.rows[0]) throw Object.assign(new Error('This custom field was changed by another user. Refresh before deleting.'), { statusCode: 409 });
      await AuditService.logPostgres(client, { actor, action: 'CMDB_CUSTOM_FIELD_DELETED', entityType: 'CMDB_CUSTOM_FIELD', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, before: current.rows[0], after: { deleted: true } });
      return { id, deleted: true as const };
    });
  }

  public static async updateAssetCustomFields(actor: BankUser | undefined, assetId: string, raw: unknown, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'assets.update');
    z.string().trim().min(1).max(64).parse(assetId);
    const input = customFieldValuesSchema.parse(raw);
    return pgClient.transaction(async (client) => {
      const asset = await client.query('SELECT id,version FROM configuration_items WHERE id=$1 AND archived_at IS NULL FOR UPDATE', [assetId]);
      if (!asset.rows[0]) throw Object.assign(new Error('Configuration item not found.'), { statusCode: 404 });
      if (Number(asset.rows[0].version) !== input.version) throw Object.assign(new Error('This asset was changed by another user. Refresh before saving.'), { statusCode: 409 });
      const keys = Object.keys(input.values);
      const fields = keys.length ? await client.query('SELECT * FROM cmdb_custom_field_definitions WHERE field_key=ANY($1::text[]) AND deleted_at IS NULL AND is_active', [keys]) : { rows: [] } as any;
      const byKey = new Map<string, any>(fields.rows.map((field: any) => [String(field.field_key), field] as [string, any]));
      const unknown = keys.find((key) => !byKey.has(key));
      if (unknown) throw Object.assign(new Error(`Custom field "${unknown}" is not active or does not exist.`), { statusCode: 400 });
      const previous = await client.query(`SELECT def.field_key,val.value FROM cmdb_custom_field_values val JOIN cmdb_custom_field_definitions def ON def.id=val.field_id WHERE val.asset_id=$1 AND def.deleted_at IS NULL`, [assetId]);
      const before = Object.fromEntries(previous.rows.map((row: any) => [row.field_key, row.value]));
      const after = { ...before } as Record<string, unknown>;
      for (const [key, rawValue] of Object.entries(input.values)) {
        const field = byKey.get(key)!;
        const normalized = validateCustomFieldValue(field, rawValue);
        if (normalized === null) {
          await client.query('DELETE FROM cmdb_custom_field_values WHERE asset_id=$1 AND field_id=$2', [assetId, field.id]);
          delete after[key];
        } else {
          await client.query(`INSERT INTO cmdb_custom_field_values(id,asset_id,field_id,value,created_by_user_id,updated_by_user_id) VALUES($1,$2,$3,$4::jsonb,$5,$5) ON CONFLICT(asset_id,field_id) DO UPDATE SET value=EXCLUDED.value,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=NOW(),version=cmdb_custom_field_values.version+1`, [`cmdb-cfv-${uuidv4()}`, assetId, field.id, JSON.stringify(normalized), actor.id]);
          after[key] = normalized;
        }
      }
      const updatedAsset = await client.query('UPDATE configuration_items SET version=version+1,updated_at=NOW(),updated_by=$2 WHERE id=$1 AND version=$3 RETURNING version', [assetId, actor.id, input.version]);
      if (!updatedAsset.rows[0]) throw Object.assign(new Error('This asset was changed by another user. Refresh before saving.'), { statusCode: 409 });
      await AuditService.logPostgres(client, { actor, action: 'CMDB_ASSET_CUSTOM_FIELDS_UPDATED', entityType: 'CONFIGURATION_ITEM', entityId: assetId, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, before, after });
      return { assetId, version: Number(updatedAsset.rows[0].version), customFields: after };
    });
  }

  public static async listAssetSubresources(actor: BankUser | undefined, assetId: string): Promise<any> {
    requirePermission(actor, 'assets.read');
    await this.getAsset(actor, assetId);
    const [identifiers, sources, network, storage, changes, provenance, posture, findings, conflicts] = await Promise.all([
      CmdbFoundationRepository.listAssetIdentifiers(assetId), CmdbFoundationRepository.listSourceRecords(assetId), CmdbFoundationRepository.listNetwork(assetId),
      CmdbFoundationRepository.listStorage(assetId), CmdbFoundationRepository.listMaterialChanges(assetId), CmdbFoundationRepository.listProvenance(assetId),
      pgClient.query('SELECT * FROM cmdb_cortex_security_posture WHERE asset_id=$1', [assetId]),
      pgClient.query("SELECT * FROM cmdb_security_findings WHERE asset_id=$1 ORDER BY (state='OPEN') DESC,last_observed_at DESC", [assetId]),
      pgClient.query(`SELECT c.*,cc.score,cc.evidence FROM cmdb_correlation_cases c JOIN cmdb_correlation_candidates cc ON cc.case_id=c.id WHERE cc.asset_id=$1 ORDER BY c.opened_at DESC`, [assetId]),
    ]);
    const relationships = await this.listAssetRelationships(actor, assetId);
    return { identifiers, sources: sources.map((source) => ({ ...source, secretReference: undefined })), network, storage, history: changes, provenance, relationships, cortexSecurity: posture.rows[0] || null, findings: findings.rows, conflicts: conflicts.rows };
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
    const metrics = connector.connectorType === 'VCENTER'
      ? VCenterObservabilityService.snapshot(id)
      : {
        connectorType: connector.connectorType,
        healthStatus: connector.healthStatus,
        lastSyncAt: connector.lastSyncAt,
        lastSuccessfulSyncAt: connector.lastSuccessfulSyncAt,
        lastFailureAt: connector.lastFailureAt,
        lastFailureCode: connector.lastFailureCode,
        lastFailureMessage: connector.lastFailureMessage,
        consecutiveFailures: connector.consecutiveFailures,
        latestRun: connector.latestRun,
      };
    return {
      connector,
      metrics,
      checkedAt: new Date().toISOString(),
      liveProbe: false,
      note: 'This is a persisted health snapshot. Use Test Connection for a live connector probe.',
    };
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
        WHERE c.connector_type_id IN ('VCENTER','ACTIVE_DIRECTORY','CORTEX','SMB_PRINTER') AND c.deleted_at IS NULL ORDER BY s.last_seen_at DESC,s.id LIMIT $1 OFFSET $2`, [safeSize, (safePage - 1) * safeSize]),
      pgClient.query(`SELECT count(*)::int count FROM cmdb_source_records s JOIN cmdb_discovery_connectors c ON c.id=s.connector_id WHERE c.connector_type_id IN ('VCENTER','ACTIVE_DIRECTORY','CORTEX','SMB_PRINTER') AND c.deleted_at IS NULL`),
    ]);
    return { items: items.rows.map((row) => ({ id: row.id, connectorId: row.connector_id, connectorName: row.connector_name, connectorType: row.connector_type_id, objectType: row.external_object_type, objectId: row.external_object_id, name: row.source_name, status: row.status, lastSeenAt: row.last_seen_at, lastSyncRunId: row.last_sync_run_id, correlationOutcome: row.last_correlation_outcome })), total: Number(count.rows[0]?.count || 0), page: safePage, pageSize: safeSize };
  }

  /** Server-computed multi-source posture; never derived from a browser page. */
  public static async discoveryCoverage(actor: BankUser | undefined): Promise<any> {
    requirePermission(actor, 'asset_discovery.read');
    const result = await pgClient.query(`WITH assets AS (SELECT id FROM configuration_items WHERE archived_at IS NULL), source_flags AS (
      SELECT sr.asset_id, bool_or(c.connector_type_id='CORTEX' AND sr.status='ACTIVE') cortex,
             bool_or(c.connector_type_id='CORTEX' AND sr.status IN ('MISSING','STALE')) cortex_stale,
             bool_or(c.connector_type_id='ACTIVE_DIRECTORY' AND sr.status='ACTIVE') ad,
             bool_or(c.connector_type_id='VCENTER' AND sr.status='ACTIVE' AND sr.external_object_type='VirtualMachine') vcenter_vm
      FROM cmdb_source_records sr JOIN cmdb_discovery_connectors c ON c.id=sr.connector_id
      GROUP BY sr.asset_id
    ), counts AS (SELECT count(*) total, count(*) FILTER (WHERE f.cortex) cortex_managed,
      count(*) FILTER (WHERE NOT COALESCE(f.cortex,false)) cortex_missing,
      count(*) FILTER (WHERE f.cortex_stale) cortex_stale,
      count(*) FILTER (WHERE f.cortex AND f.ad AND f.vcenter_vm) fully_correlated,
      count(*) FILTER (WHERE f.ad AND NOT COALESCE(f.cortex,false)) ad_without_cortex,
      count(*) FILTER (WHERE f.cortex AND NOT COALESCE(f.ad,false)) cortex_without_ad,
      count(*) FILTER (WHERE f.vcenter_vm AND NOT COALESCE(f.cortex,false)) vcenter_vms_without_cortex
      FROM assets a LEFT JOIN source_flags f ON f.asset_id=a.id)
      SELECT counts.*, (SELECT count(*) FROM cmdb_correlation_cases WHERE status='OPEN' AND outcome='IDENTITY_CONFLICT') identity_conflicts,
      (SELECT count(*) FROM configuration_items a WHERE a.archived_at IS NULL AND (a.lifecycle_state IN ('STALE','DECOMMISSION_CANDIDATE') OR EXISTS (SELECT 1 FROM cmdb_source_records sr WHERE sr.asset_id=a.id AND sr.status IN ('MISSING','STALE')))) stale_or_unseen,
      (SELECT count(*) FROM cmdb_correlation_cases WHERE status='OPEN' AND outcome='REVIEW_REQUIRED') reconciliation_required FROM counts`);
    const row = result.rows[0] || {}; const total = Number(row.total || 0); const number = (key: string) => Number(row[key] || 0);
    return { totalCanonicalAssets: total, cortexManaged: number('cortex_managed'), cortexMissing: number('cortex_missing'), cortexStale: number('cortex_stale'), fullyCorrelatedVcenterAdCortex: number('fully_correlated'), adWithoutCortex: number('ad_without_cortex'), cortexWithoutAd: number('cortex_without_ad'), vcenterVmsWithoutCortex: number('vcenter_vms_without_cortex'), identityConflicts: number('identity_conflicts'), reconciliationRequired: number('reconciliation_required'), staleOrUnseen: number('stale_or_unseen'), cortexCoveragePercent: total ? Math.round(number('cortex_managed') / total * 100) : 0, generatedAt: new Date().toISOString() };
  }

  public static async testConnector(actor: BankUser | undefined, id: string, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'asset_discovery.test');
    z.string().trim().min(1).max(64).parse(id);
    const connector = await this.getConnector(actor, id);
    if (connector.connectorType === 'ACTIVE_DIRECTORY') {
      await pgClient.transaction(async (client) => AuditService.logPostgres(client, { actor, action: 'CMDB_CONNECTOR_TESTED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, metadata: { connectorType: 'ACTIVE_DIRECTORY', status: 'STARTED' } }));
      try {
        const result = await ActiveDirectoryInventorySyncService.testConnection(id);
        await pgClient.transaction(async (client) => AuditService.logPostgres(client, { actor, action: 'CMDB_CONNECTOR_TESTED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, metadata: { connectorType: 'ACTIVE_DIRECTORY', status: 'SUCCEEDED' } }));
        return result;
      } catch (error: any) {
        await pgClient.transaction(async (client) => AuditService.logPostgres(client, { actor, action: 'CMDB_CONNECTOR_TESTED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, metadata: { connectorType: 'ACTIVE_DIRECTORY', status: 'FAILED', errorCode: String(error?.code || 'AD_CONNECTION_TEST_FAILED') } })).catch(() => undefined);
        throw error;
      }
    }
    if (connector.connectorType === 'CORTEX') {
      await pgClient.transaction(async (client) => AuditService.logPostgres(client, { actor, action: 'CMDB_CONNECTOR_TESTED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, metadata: { connectorType: 'CORTEX', status: 'STARTED' } }));
      try { const result = await CortexInventorySyncService.testConnection(id, request.correlationId); await pgClient.transaction(async (client) => AuditService.logPostgres(client, { actor, action: 'CMDB_CONNECTOR_TESTED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, metadata: { connectorType: 'CORTEX', status: 'SUCCEEDED' } })); return result; }
      catch (error: any) { await pgClient.transaction(async (client) => AuditService.logPostgres(client, { actor, action: 'CMDB_CONNECTOR_TESTED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, metadata: { connectorType: 'CORTEX', status: 'FAILED', errorCode: String(error?.code || 'CORTEX_INTERNAL_ERROR') } })).catch(() => undefined); throw error; }
    }
    if (connector.connectorType === 'SMB_PRINTER') {
      await pgClient.transaction(async (client) => AuditService.logPostgres(client, { actor, action: 'CMDB_CONNECTOR_TESTED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, metadata: { connectorType: 'SMB_PRINTER', accessMode: 'READ_ONLY', status: 'STARTED' } }));
      try { const result = await SmbPrinterInventorySyncService.testConnection(id); await pgClient.transaction(async (client) => AuditService.logPostgres(client, { actor, action: 'CMDB_CONNECTOR_TESTED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, metadata: { connectorType: 'SMB_PRINTER', accessMode: 'READ_ONLY', status: 'SUCCEEDED' } })); return result; }
      catch (error: any) { await pgClient.transaction(async (client) => AuditService.logPostgres(client, { actor, action: 'CMDB_CONNECTOR_TESTED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, metadata: { connectorType: 'SMB_PRINTER', accessMode: 'READ_ONLY', status: 'FAILED', errorCode: String(error?.code || 'SMB_PRINTER_CONNECTION_TEST_FAILED') } })).catch(() => undefined); throw error; }
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

  public static async triggerConnectorSync(actor: BankUser | undefined, id: string, syncType: unknown = 'FULL', inventoryScope: unknown = undefined, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'asset_discovery.run');
    z.string().trim().min(1).max(64).parse(id);
    const runType = z.enum(['FULL', 'INCREMENTAL']).parse(syncType);
    const connector = await this.getConnector(actor, id);
    const cortexInventoryScope = connector.connectorType === 'CORTEX'
      ? cortexInventoryScopeSchema.default('ENDPOINTS').parse(inventoryScope)
      : undefined;
    const result = connector.connectorType === 'ACTIVE_DIRECTORY'
      ? await ActiveDirectoryInventorySyncService.enqueue(id, actor!, runType, { correlationId: request.correlationId })
      : connector.connectorType === 'CORTEX'
        ? await CortexInventorySyncService.enqueue(id, actor!, runType, cortexInventoryScope!, { correlationId: request.correlationId })
        : connector.connectorType === 'SMB_PRINTER'
          ? await SmbPrinterInventorySyncService.enqueue(id, actor!, runType, { correlationId: request.correlationId })
        : await VCenterInventorySyncService.enqueue(id, actor!, runType, { correlationId: request.correlationId });
    await pgClient.transaction(async (client) => AuditService.logPostgres(client, { actor: actor!, action: 'CMDB_SYNC_TRIGGERED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, metadata: { status: result.state, runId: result.runId, runType, inventoryScope: cortexInventoryScope } }));
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
    if (input.connectorType === 'SMB_PRINTER') {
      const host = input.smbHost || String(input.nonSecretConfiguration.host || '');
      if (!/^(?:[a-z0-9][a-z0-9.-]{0,252}|(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})$/i.test(host)) throw Object.assign(new Error('SMB printer discovery requires a valid printer-server hostname or IPv4 address.'), { statusCode: 400, code: 'SMB_PRINTER_HOST_INVALID' });
      if (input.secretReference || input.username || input.password) throw Object.assign(new Error('SMB printer discovery does not accept credentials. It uses the Windows worker identity for read-only SMB enumeration.'), { statusCode: 400, code: 'SMB_PRINTER_CREDENTIALS_FORBIDDEN' });
    }
    const effectiveSecretReference = input.connectorType === 'CORTEX' && !input.secretReference && process.env.CORTEX_API_KEY ? 'env://CORTEX_API_KEY' : input.secretReference;
    if (input.connectorType === 'CORTEX') {
      const endpointUrl = String(input.nonSecretConfiguration.endpointUrl || ''); const apiKeyId = String(input.nonSecretConfiguration.apiKeyId || '');
      if (!endpointUrl || !apiKeyId || !effectiveSecretReference) throw Object.assign(new Error('Cortex requires endpointUrl and API key ID. Configure CORTEX_API_KEY on the server.'), { statusCode: 400 });
      if (!/^env:\/\/[A-Z][A-Z0-9_]*$/.test(effectiveSecretReference)) throw Object.assign(new Error('Cortex API secret must be a server-side env:// reference.'), { statusCode: 400 });
      if (!['STANDARD','ADVANCED'].includes(String(input.nonSecretConfiguration.apiKeySecurityLevel || 'STANDARD').toUpperCase())) throw Object.assign(new Error('Cortex API key security level must be STANDARD or ADVANCED.'), { statusCode: 400 });
      validateCortexTransport({ endpointUrl, endpointAllowPrivateNetwork: input.endpointAllowPrivateNetwork, tlsVerifyCertificates: input.tlsVerifyCertificates, requestTimeoutMs: input.requestTimeoutMs, responseSizeLimitBytes: input.responseSizeLimitBytes });
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
       const adConfiguration = input.connectorType === 'ACTIVE_DIRECTORY' ? { ...input.nonSecretConfiguration, url: input.ldapUrl || input.nonSecretConfiguration.url, baseDn: input.baseDn || input.nonSecretConfiguration.baseDn, bindUser: input.bindUser || input.nonSecretConfiguration.bindUser, accessMode: 'READ_ONLY', incrementalStrategy: 'usnChanged-or-whenChanged' } : input.connectorType === 'SMB_PRINTER' ? { host: input.smbHost || input.nonSecretConfiguration.host, transport: 'SMB', accessMode: 'READ_ONLY', discoveryOperation: 'net view', writeOperations: 'BLOCKED' } : input.connectorType === 'CORTEX' ? { ...input.nonSecretConfiguration, responseSizeLimitBytes: input.responseSizeLimitBytes } : input.nonSecretConfiguration;
       const inserted = await client.query(`INSERT INTO cmdb_discovery_connectors(id,connection_id,name,description,connector_type_id,environment,enabled,health_status,operational_state,configuration_status,connection_status,discovery_status,non_secret_configuration,secret_reference,tls_ca_reference,tls_verify_certificates,endpoint_allow_private_network,request_timeout_ms,schedule_minutes,created_by_user_id,updated_by_user_id) VALUES($1,$2,$3,$4,$5::varchar,$6,$7,CASE WHEN $7 THEN 'UNKNOWN' ELSE 'DISABLED' END,CASE WHEN $7 THEN 'IDLE' ELSE 'DISABLED' END,CASE WHEN $5::varchar IN ('VCENTER','ACTIVE_DIRECTORY','CORTEX','SMB_PRINTER') THEN 'VALID' ELSE 'UNKNOWN' END,'UNKNOWN','UNKNOWN',$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING *`, [id, input.connectionId || null, input.name || `CMDB connector ${id}`, input.description, input.connectorType, input.environment, input.enabled, JSON.stringify(adConfiguration), ['ACTIVE_DIRECTORY','CORTEX'].includes(input.connectorType) ? effectiveSecretReference : null, input.tlsCaReference || null, input.tlsVerifyCertificates, input.endpointAllowPrivateNetwork, input.requestTimeoutMs, input.scheduleMinutes, actor.id]);
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

    // Reuse the exact server-side source used by USER SYNC. LDAP_ENABLED is a
    // scheduler switch, not a second CMDB connection, and some deployments
    // expose the existing bind secret as AD_PASS (the sync scripts support
    // that name as well). Never copy the secret into the connector payload.
    const bindSecretReference = process.env.LDAP_BIND_PASSWORD
      ? 'env://LDAP_BIND_PASSWORD'
      : process.env.AD_PASS
        ? 'env://AD_PASS'
        : undefined;
    if (!config.LDAP_URL.startsWith('ldaps://') || !config.LDAP_BASE_DN || !config.LDAP_BIND_USER || !bindSecretReference) {
      throw Object.assign(new Error('The existing USER SYNC Active Directory source is not available to CMDB. Verify its server-side LDAPS URL, base DN, read-only bind user and secret.'), { statusCode: 422, code: 'AD_SERVER_CONFIGURATION_INCOMPLETE' });
    }
    const connector = await this.createConnector(actor, {
      name: config.LDAP_DOMAIN ? `Active Directory (${config.LDAP_DOMAIN})` : 'Active Directory', connectorType: 'ACTIVE_DIRECTORY', environment: 'PRODUCTION', enabled: true,
      ldapUrl: config.LDAP_URL, baseDn: config.LDAP_BASE_DN, bindUser: config.LDAP_BIND_USER, secretReference: bindSecretReference, tlsVerifyCertificates: config.LDAP_TLS_REJECT_UNAUTHORIZED !== false, endpointAllowPrivateNetwork: true, requestTimeoutMs: 30000, scheduleMinutes: 0,
    }, request);
    return { connector, created: true };
  }

  public static async updateConnector(actor: BankUser | undefined, id: string, raw: unknown, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    requirePermission(actor, 'asset_discovery.manage');
    z.string().trim().min(1).max(64).parse(id);
      const input = connectorUpdateSchema.parse(raw);
    if (('username' in input) !== ('password' in input)) throw Object.assign(new Error('vCenter username and password must be changed together.'), { statusCode: 400 });
    if (input.nonSecretConfiguration) validateEndpoint(input.nonSecretConfiguration, input.endpointAllowPrivateNetwork ?? false);
    await pgClient.transaction(async (client) => {
      const current = await client.query('SELECT * FROM cmdb_discovery_connectors WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!current.rows[0]) throw Object.assign(new Error('Discovery connector not found.'), { statusCode: 404 });
      if (Number(current.rows[0].version) !== input.version) throw Object.assign(new Error('Connector was changed by another user.'), { statusCode: 409 });
      const currentType = String(current.rows[0].connector_type_id);
      const nextType = input.connectorType || currentType;
      if (currentType !== nextType) throw Object.assign(new Error('Connector type is immutable after creation.'), { statusCode: 409 });
      const currentConfiguration = current.rows[0].non_secret_configuration || {};
      const nextConfiguration = { ...currentConfiguration, ...(input.nonSecretConfiguration || {}) } as Record<string, unknown>;
      if (nextType === 'ACTIVE_DIRECTORY') {
        if ('ldapUrl' in input) nextConfiguration.url = input.ldapUrl;
        if ('baseDn' in input) nextConfiguration.baseDn = input.baseDn;
        if ('bindUser' in input) nextConfiguration.bindUser = input.bindUser;
        const nextSecretReference = 'secretReference' in input ? input.secretReference : current.rows[0].secret_reference;
        if (!String(nextConfiguration.url || '').startsWith('ldaps://') || !nextConfiguration.baseDn || !nextConfiguration.bindUser || !/^env:\/\/[A-Z][A-Z0-9_]*$/.test(String(nextSecretReference || ''))) throw Object.assign(new Error('Active Directory requires LDAPS URL, base DN, dedicated read-only bind identity, and a server-side env:// secret reference.'), { statusCode: 400, code: 'AD_CONNECTOR_CONFIG_INVALID' });
        if (input.tlsVerifyCertificates === false) throw Object.assign(new Error('TLS certificate verification must remain enabled for Active Directory connectors.'), { statusCode: 400 });
      }
      let currentProfile: any;
      if (nextType === 'VCENTER') {
        if (input.nonSecretConfiguration) rejectVCenterEndpointOverrides(input.nonSecretConfiguration);
        if (input.tlsVerifyCertificates === false) throw Object.assign(new Error('TLS certificate verification must remain enabled for vCenter connectors.'), { statusCode: 400 });
        if (input.soapEndpointPath && input.soapEndpointPath !== '/sdk') throw Object.assign(new Error('vCenter SOAP path is fixed to /sdk.'), { statusCode: 400 });
        if (input.automationApiBasePath && input.automationApiBasePath !== '/api') throw Object.assign(new Error('vCenter Automation API path is fixed to /api.'), { statusCode: 400 });
        if (input.endpointFqdn && input.port) validateVCenterEndpoint(input.endpointFqdn, input.port, input.tlsVerifyCertificates ?? Boolean(current.rows[0].tls_verify_certificates), input.soapEndpointPath || '/sdk', input.automationApiBasePath || '/api');
      }
      if (nextType === 'CORTEX') {
        if (input.tlsVerifyCertificates === false) throw Object.assign(new Error('TLS certificate verification must remain enabled for Cortex connectors.'), { statusCode: 400 });
        validateCortexTransport({ endpointUrl: String(nextConfiguration.endpointUrl || ''), endpointAllowPrivateNetwork: input.endpointAllowPrivateNetwork ?? Boolean(current.rows[0].endpoint_allow_private_network), tlsVerifyCertificates: input.tlsVerifyCertificates ?? Boolean(current.rows[0].tls_verify_certificates), requestTimeoutMs: input.requestTimeoutMs ?? Number(current.rows[0].request_timeout_ms), responseSizeLimitBytes: Number(nextConfiguration.responseSizeLimitBytes || input.responseSizeLimitBytes || 4194304) });
        if ('secretReference' in input && !/^env:\/\/[A-Z][A-Z0-9_]*$/.test(String(input.secretReference))) throw Object.assign(new Error('Cortex API secret must be a server-side env:// reference.'), { statusCode: 400 });
      }
      if (nextType === 'SMB_PRINTER') {
        if ('smbHost' in input) nextConfiguration.host = input.smbHost;
        if (!/^(?:[a-z0-9][a-z0-9.-]{0,252}|(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})$/i.test(String(nextConfiguration.host || ''))) throw Object.assign(new Error('SMB printer discovery requires a valid printer-server hostname or IPv4 address.'), { statusCode: 400, code: 'SMB_PRINTER_HOST_INVALID' });
        if ('secretReference' in input || 'username' in input || 'password' in input) throw Object.assign(new Error('SMB printer discovery does not accept credentials.'), { statusCode: 400, code: 'SMB_PRINTER_CREDENTIALS_FORBIDDEN' });
        Object.assign(nextConfiguration, { transport: 'SMB', accessMode: 'READ_ONLY', discoveryOperation: 'net view', writeOperations: 'BLOCKED' });
      }
      const fields: string[] = []; const values: unknown[] = [];
      const set = (column: string, value: unknown) => { values.push(value); fields.push(`${column}=$${values.length}`); };
      for (const [key, column] of Object.entries({ connectorType: 'connector_type_id', environment: 'environment', enabled: 'enabled', tlsCaReference: 'tls_ca_reference', tlsVerifyCertificates: 'tls_verify_certificates', endpointAllowPrivateNetwork: 'endpoint_allow_private_network', requestTimeoutMs: 'request_timeout_ms', scheduleMinutes: 'schedule_minutes', secretReference: 'secret_reference' })) if (key in input) set(column, (input as any)[key]);
       if ('name' in input) set('name', input.name);
       if ('description' in input) set('description', input.description);
      if (input.nonSecretConfiguration || nextType === 'ACTIVE_DIRECTORY' && ('ldapUrl' in input || 'baseDn' in input || 'bindUser' in input) || nextType === 'SMB_PRINTER' && 'smbHost' in input) set('non_secret_configuration', JSON.stringify(nextConfiguration));
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
    // vCenter profile values live in a separate table. Return the canonical
    // projection after commit so callers receive the persisted endpoint too.
    return this.getConnector(actor, id);
  }

  /** Soft-delete preserves discovery evidence and the audit trail. A connector
   * with queued or running work must be stopped through its run lifecycle first. */
  public static async deleteConnector(actor: BankUser | undefined, id: string, raw: unknown, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<{ id: string; deleted: true }> {
    requirePermission(actor, 'asset_discovery.manage');
    z.string().trim().min(1).max(64).parse(id);
    const { version } = z.object({ version: z.number().int().positive() }).strict().parse(raw);
    return pgClient.transaction(async (client) => {
      const current = await client.query('SELECT * FROM cmdb_discovery_connectors WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!current.rows[0]) throw Object.assign(new Error('Discovery connector not found.'), { statusCode: 404 });
      if (Number(current.rows[0].version) !== version) throw Object.assign(new Error('Connector was changed by another user.'), { statusCode: 409 });
      const activeRuns = await client.query("SELECT id FROM cmdb_discovery_sync_runs WHERE connector_id=$1 AND state IN ('QUEUED','RUNNING') LIMIT 1 FOR UPDATE", [id]);
      if (activeRuns.rows[0]) throw Object.assign(new Error('Stop or complete the active discovery run before deleting this connector.'), { statusCode: 409, code: 'CONNECTOR_RUN_ACTIVE' });
      const deleted = await client.query("UPDATE cmdb_discovery_connectors SET enabled=FALSE,health_status='DISABLED',operational_state='DISABLED',deleted_at=NOW(),updated_at=NOW(),updated_by_user_id=$2,version=version+1 WHERE id=$1 AND version=$3 RETURNING *", [id, actor.id, version]);
      if (!deleted.rows[0]) throw Object.assign(new Error('Connector delete lost a concurrent write.'), { statusCode: 409 });
      // Preserve the profile for audit/history while releasing the endpoint
      // namespace for a future connector after this soft deletion.
      await client.query('UPDATE cmdb_vcenter_connector_profiles SET deleted_at=$2,updated_at=NOW() WHERE connector_id=$1', [id, deleted.rows[0].deleted_at]);
      await AuditService.logPostgres(client, { actor, action: 'CMDB_CONNECTOR_DELETED', entityType: 'DISCOVERY_CONNECTOR', entityId: id, correlationId: request.correlationId, ipAddress: request.ip, userAgent: request.userAgent, before: { ...current.rows[0], secret_reference: undefined, tls_ca_reference: undefined }, after: { deleted: true } });
      return { id, deleted: true as const };
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
