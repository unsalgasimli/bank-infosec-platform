import { z } from 'zod';
import { pgClient } from './client.js';
import type {
  AssetAttributeProvenanceRecord,
  AssetIdentifierRecord,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetMaterialChangeRecord,
  CanonicalAssetRecord,
  CmdbFoundationIntegrityReport,
  DiscoveryConnectorRecord,
  DiscoverySourceRecord,
  DiscoverySyncRunRecord,
  IpAddressRecord,
  MacAddressRecord,
  NetworkInterfaceRecord,
  StorageDeviceRecord,
} from '../../../shared/types/cmdb-discovery.js';

const identifierTypes = [
  'HOSTNAME',
  'FQDN',
  'SERIAL_NUMBER',
  'BIOS_UUID',
  'VMWARE_INSTANCE_UUID',
  'CLOUD_INSTANCE_ID',
  'MAC_ADDRESS',
  'AGENT_ID',
  'EDR_DEVICE_ID',
  'SCCM_RESOURCE_ID',
  'AD_OBJECT_GUID',
  'OTHER',
] as const;

const lifecycleStates = [
  'DISCOVERED',
  'ACTIVE',
  'STALE',
  'DECOMMISSION_CANDIDATE',
  'RETIRED',
  'ARCHIVED',
] as const;

const forbiddenSecretKeys = new Set([
  'password',
  'passwd',
  'pwd',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'secret',
  'client_secret',
  'private_key',
  'credential',
  'credentials',
  'authorization',
]);

function firstForbiddenSecretPath(value: unknown, path = '$'): string | undefined {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = firstForbiddenSecretPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenSecretKeys.has(key.toLowerCase())) return `${path}.${key}`;
    const found = firstForbiddenSecretPath(child, `${path}.${key}`);
    if (found) return found;
  }
  return undefined;
}

export const nonSecretConfigurationSchema = z.record(z.unknown()).superRefine((value, context) => {
  const forbiddenPath = firstForbiddenSecretPath(value);
  if (forbiddenPath) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Secret-bearing key is not allowed in non-secret configuration: ${forbiddenPath}`,
    });
  }
});

export const discoveryConnectorProfileSchema = z.object({
  id: z.string().trim().min(1).max(64),
  connectionId: z.string().trim().min(1).max(128),
  connectorType: z.string().trim().min(1).max(64),
  environment: z.string().trim().min(1).max(32).default('UNKNOWN'),
  enabled: z.boolean().default(false),
  nonSecretConfiguration: nonSecretConfigurationSchema.default({}),
  secretReference: z.string().trim().min(1).max(512).optional(),
  tlsCaReference: z.string().trim().min(1).max(512).optional(),
  scheduleMinutes: z.number().int().min(0).max(10080).default(0),
}).strict();

export const assetIdentifierSchema = z.object({
  id: z.string().trim().min(1).max(64),
  assetId: z.string().trim().min(1).max(64),
  identifierType: z.enum(identifierTypes),
  namespace: z.string().trim().min(1).max(255).default('GLOBAL'),
  value: z.string().trim().min(1).max(2048),
  source: z.string().trim().min(1).max(64),
  connectorId: z.string().trim().min(1).max(64).optional(),
  sourceRecordId: z.string().trim().min(1).max(64).optional(),
  confidence: z.number().min(0).max(100).default(100),
  isPrimary: z.boolean().default(false),
  firstSeenAt: z.string().datetime({ offset: true }),
  lastSeenAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.lastSeenAt) < Date.parse(value.firstSeenAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lastSeenAt'], message: 'lastSeenAt must not precede firstSeenAt.' });
  }
});

export const discoverySyncRunSchema = z.object({
  id: z.string().trim().min(1).max(64),
  connectorId: z.string().trim().min(1).max(64),
  runType: z.enum(['FULL', 'INCREMENTAL', 'RECONCILIATION', 'MANUAL']),
  state: z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED']),
  requestedByUserId: z.string().trim().min(1).max(64).optional(),
  correlationId: z.string().trim().min(1).max(128).optional(),
  queuedAt: z.string().datetime({ offset: true }),
  startedAt: z.string().datetime({ offset: true }).optional(),
  completedAt: z.string().datetime({ offset: true }).optional(),
  checkpoint: z.string().optional(),
  cursor: z.string().optional(),
}).strict().superRefine((value, context) => {
  const terminal = ['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(value.state);
  if (terminal && !value.completedAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['completedAt'], message: 'A terminal run requires completedAt.' });
  }
  if (value.startedAt && Date.parse(value.startedAt) < Date.parse(value.queuedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['startedAt'], message: 'startedAt must not precede queuedAt.' });
  }
  if (value.completedAt && (!value.startedAt || Date.parse(value.completedAt) < Date.parse(value.startedAt))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['completedAt'], message: 'completedAt requires startedAt and must not precede it.' });
  }
});

export const sourceRecordSchema = z.object({
  id: z.string().trim().min(1).max(64),
  assetId: z.string().trim().min(1).max(64).optional(),
  connectorId: z.string().trim().min(1).max(64),
  externalObjectType: z.string().trim().min(1).max(128),
  externalObjectId: z.string().trim().min(1).max(512),
  nativeUuid: z.string().trim().min(1).max(255).optional(),
  sourceName: z.string().trim().min(1).max(512).optional(),
  sourcePath: z.string().trim().min(1).optional(),
  firstSeenAt: z.string().datetime({ offset: true }),
  lastSeenAt: z.string().datetime({ offset: true }),
  lastSyncRunId: z.string().trim().min(1).max(64),
  status: z.enum(['ACTIVE', 'UNMATCHED', 'MISSING', 'STALE', 'RETIRED', 'ERROR']),
}).strict().superRefine((value, context) => {
  if (value.status === 'UNMATCHED' && value.assetId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['assetId'], message: 'An unmatched source record cannot already reference a canonical asset.' });
  }
  if (Date.parse(value.lastSeenAt) < Date.parse(value.firstSeenAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lastSeenAt'], message: 'lastSeenAt must not precede firstSeenAt.' });
  }
});

const lifecycleTransitions: Record<AssetLifecycleState, readonly AssetLifecycleState[]> = {
  DISCOVERED: ['ACTIVE', 'STALE', 'DECOMMISSION_CANDIDATE', 'ARCHIVED'],
  ACTIVE: ['STALE', 'DECOMMISSION_CANDIDATE', 'RETIRED', 'ARCHIVED'],
  STALE: ['ACTIVE', 'DECOMMISSION_CANDIDATE', 'RETIRED', 'ARCHIVED'],
  DECOMMISSION_CANDIDATE: ['ACTIVE', 'STALE', 'RETIRED', 'ARCHIVED'],
  RETIRED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

export function assertAssetLifecycleTransition(from: AssetLifecycleState, to: AssetLifecycleState): void {
  z.enum(lifecycleStates).parse(from);
  z.enum(lifecycleStates).parse(to);
  if (from === to) return;
  if (!lifecycleTransitions[from].includes(to)) {
    throw new Error(`Invalid canonical asset lifecycle transition: ${from} -> ${to}`);
  }
}

export function normalizeAssetIdentifier(type: AssetIdentifierType, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Identifier value is required.');
  switch (type) {
    case 'HOSTNAME':
      return trimmed.toLowerCase();
    case 'FQDN':
      return trimmed.replace(/\.+$/, '').toLowerCase();
    case 'MAC_ADDRESS': {
      const normalized = trimmed.replace(/[^0-9a-f]/gi, '').toLowerCase();
      if (!/^[0-9a-f]{12}([0-9a-f]{4})?$/.test(normalized)) throw new Error('MAC address must be an EUI-48 or EUI-64 value.');
      return normalized;
    }
    case 'BIOS_UUID':
    case 'VMWARE_INSTANCE_UUID':
    case 'AD_OBJECT_GUID':
      return trimmed.replace(/[{}]/g, '').toLowerCase();
    case 'SERIAL_NUMBER':
      return trimmed.toLowerCase();
    default:
      return trimmed;
  }
}

export function isStrongAssetIdentifier(type: AssetIdentifierType): boolean {
  return ['SERIAL_NUMBER', 'BIOS_UUID', 'VMWARE_INSTANCE_UUID', 'CLOUD_INSTANCE_ID', 'AGENT_ID', 'EDR_DEVICE_ID', 'SCCM_RESOURCE_ID', 'AD_OBJECT_GUID'].includes(type);
}

const optionalText = (value: unknown): string | undefined => value === null || value === undefined || value === '' ? undefined : String(value);
const iso = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);
const number = (value: unknown): number => Number(value || 0);

export class CmdbFoundationRepository {
  public static async findAsset(assetId: string): Promise<CanonicalAssetRecord | undefined> {
    const result = await pgClient.query(`
      SELECT id, asset_key, ci_number, name, display_name, type_id, asset_subtype,
             lifecycle_state, technical_status, environment, criticality,
             business_criticality, owner_user_id, technical_owner_user_id,
             business_owner_user_id, support_group_id, department_id,
             first_seen_at, last_seen_at, stale_since, retired_at, reactivated_at,
             created_at, updated_at, version
      FROM configuration_items WHERE id=$1`, [assetId]);
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      assetKey: row.asset_key,
      ciNumber: row.ci_number,
      name: row.name,
      displayName: optionalText(row.display_name),
      assetType: row.type_id,
      assetSubtype: optionalText(row.asset_subtype),
      lifecycleState: row.lifecycle_state,
      technicalStatus: row.technical_status,
      environment: row.environment,
      criticality: row.criticality,
      businessCriticality: optionalText(row.business_criticality),
      ownerUserId: optionalText(row.owner_user_id),
      technicalOwnerUserId: optionalText(row.technical_owner_user_id),
      businessOwnerUserId: optionalText(row.business_owner_user_id),
      supportGroupId: optionalText(row.support_group_id),
      departmentId: optionalText(row.department_id),
      firstSeenAt: iso(row.first_seen_at),
      lastSeenAt: row.last_seen_at ? iso(row.last_seen_at) : undefined,
      staleSince: row.stale_since ? iso(row.stale_since) : undefined,
      retiredAt: row.retired_at ? iso(row.retired_at) : undefined,
      reactivatedAt: row.reactivated_at ? iso(row.reactivated_at) : undefined,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      version: number(row.version),
    };
  }

  public static async listAssetIdentifiers(assetId: string): Promise<AssetIdentifierRecord[]> {
    const result = await pgClient.query(`
      SELECT id, asset_id, identifier_type_id, namespace, value, normalized_value,
             source, connector_id, source_record_id, confidence, is_primary,
             first_seen_at, last_seen_at, retired_at, created_at, updated_at
      FROM cmdb_asset_identifiers
      WHERE asset_id=$1 ORDER BY is_primary DESC, identifier_type_id, normalized_value`, [assetId]);
    return result.rows.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      identifierType: row.identifier_type_id,
      namespace: row.namespace,
      value: row.value,
      normalizedValue: row.normalized_value,
      source: row.source,
      connectorId: optionalText(row.connector_id),
      sourceRecordId: optionalText(row.source_record_id),
      confidence: number(row.confidence),
      isPrimary: Boolean(row.is_primary),
      firstSeenAt: iso(row.first_seen_at),
      lastSeenAt: iso(row.last_seen_at),
      retiredAt: row.retired_at ? iso(row.retired_at) : undefined,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }));
  }

  public static async listDiscoveryConnectors(connectorType?: string): Promise<DiscoveryConnectorRecord[]> {
    const result = await pgClient.query(`
       SELECT c.id, c.connection_id, COALESCE(c.name, dc.name) AS name, COALESCE(c.description, dc.description, '') AS description, c.connector_type_id, c.environment,
             c.enabled, c.health_status, c.non_secret_configuration,
             c.secret_reference, c.tls_ca_reference, c.schedule_minutes,
             c.endpoint_allow_private_network,
             c.last_sync_at, c.last_successful_sync_at, c.last_failure_at,
             c.last_failure_code, c.last_failure_message, c.consecutive_failures,
             c.checkpoint, c.created_at, c.updated_at, c.deleted_at,
             c.operational_state, c.detected_product, c.detected_version,
             c.detected_build, c.detected_api_version, c.detected_instance_uuid,
             c.capabilities_json, c.last_connection_test_at,
             c.last_successful_connection_at, c.last_full_sync_at,
             c.last_incremental_at, c.last_reconciliation_at,
             c.configuration_status, c.connection_status, c.discovery_status,
             c.last_connection_attempt_at, c.last_auth_success_at, c.retry_attempt,
             c.next_retry_at, v.endpoint_fqdn, v.port, v.soap_endpoint_path,
             v.automation_api_base_path, v.response_size_limit_bytes, v.access_mode,
             v.certificate_metadata,
             duplicate.id AS duplicate_connector_id,
             duplicate.name AS duplicate_connector_name
      FROM cmdb_discovery_connectors c
       LEFT JOIN department_connections dc ON dc.id=c.connection_id
      LEFT JOIN cmdb_vcenter_connector_profiles v ON v.connector_id=c.id
      LEFT JOIN LATERAL (
        SELECT other.id, otherDc.name
        FROM cmdb_discovery_connectors other
         LEFT JOIN department_connections otherDc ON otherDc.id=other.connection_id
        WHERE other.connector_type_id='VCENTER'
           AND other.deleted_at IS NULL AND (otherDc.deleted_at IS NULL OR other.connection_id IS NULL)
          AND other.enabled = TRUE
          AND other.id <> c.id
          AND c.connector_type_id='VCENTER'
          AND c.detected_instance_uuid IS NOT NULL
          AND other.detected_instance_uuid=c.detected_instance_uuid
        ORDER BY other.id
        LIMIT 1
      ) duplicate ON TRUE
       WHERE c.deleted_at IS NULL AND (dc.deleted_at IS NULL OR c.connection_id IS NULL)
        AND ($1::text IS NULL OR c.connector_type_id=$1)
       ORDER BY COALESCE(c.name, dc.name), c.id`, [connectorType || null]);
    return result.rows.map((row) => ({
      id: row.id,
      connectionId: row.connection_id,
      name: row.name,
      description: row.description || undefined,
      connectorType: row.connector_type_id,
      environment: row.environment,
      enabled: Boolean(row.enabled),
      healthStatus: row.health_status,
      nonSecretConfiguration: row.non_secret_configuration || {},
      secretReference: optionalText(row.secret_reference),
      tlsCaReference: optionalText(row.tls_ca_reference),
      scheduleMinutes: number(row.schedule_minutes),
      lastSyncAt: row.last_sync_at ? iso(row.last_sync_at) : undefined,
      lastSuccessfulSyncAt: row.last_successful_sync_at ? iso(row.last_successful_sync_at) : undefined,
      lastFailureAt: row.last_failure_at ? iso(row.last_failure_at) : undefined,
      lastFailureCode: optionalText(row.last_failure_code),
      lastFailureMessage: optionalText(row.last_failure_message),
      consecutiveFailures: number(row.consecutive_failures),
      checkpoint: optionalText(row.checkpoint),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      deletedAt: row.deleted_at ? iso(row.deleted_at) : undefined,
      ...(row.connector_type_id === 'VCENTER' && row.endpoint_fqdn ? {
        vcenter: {
          endpointFqdn: row.endpoint_fqdn,
          port: number(row.port),
          soapEndpointPath: row.soap_endpoint_path,
          automationApiBasePath: row.automation_api_base_path,
          responseSizeLimitBytes: number(row.response_size_limit_bytes),
          endpointAllowPrivateNetwork: Boolean(row.endpoint_allow_private_network),
          accessMode: row.access_mode || 'READ_ONLY',
          operationalState: row.operational_state || (row.enabled ? 'IDLE' : 'DISABLED'),
          configurationStatus: row.configuration_status || 'UNKNOWN',
          connectionStatus: row.connection_status || 'UNKNOWN',
          discoveryStatus: row.discovery_status || 'UNKNOWN',
          detectedProduct: optionalText(row.detected_product),
          detectedVersion: optionalText(row.detected_version),
          detectedBuild: optionalText(row.detected_build),
          detectedApiVersion: optionalText(row.detected_api_version),
          detectedInstanceUuid: optionalText(row.detected_instance_uuid),
          capabilities: row.capabilities_json || {},
          certificate: row.certificate_metadata || undefined,
          lastConnectionTestAt: row.last_connection_test_at ? iso(row.last_connection_test_at) : undefined,
          lastSuccessfulConnectionAt: row.last_successful_connection_at ? iso(row.last_successful_connection_at) : undefined,
          lastFullSyncAt: row.last_full_sync_at ? iso(row.last_full_sync_at) : undefined,
          lastIncrementalAt: row.last_incremental_at ? iso(row.last_incremental_at) : undefined,
          lastReconciliationAt: row.last_reconciliation_at ? iso(row.last_reconciliation_at) : undefined,
          lastConnectionAttemptAt: row.last_connection_attempt_at ? iso(row.last_connection_attempt_at) : undefined,
          lastAuthSuccessAt: row.last_auth_success_at ? iso(row.last_auth_success_at) : undefined,
          retryAttempt: number(row.retry_attempt),
          nextRetryAt: row.next_retry_at ? iso(row.next_retry_at) : undefined,
          ...(row.duplicate_connector_id ? {
            possibleDuplicate: {
              connectorId: row.duplicate_connector_id,
              connectorName: row.duplicate_connector_name,
              reason: 'INSTANCE_UUID_MATCH' as const,
              warning: 'POSSIBLE_DUPLICATE_VCENTER' as const,
            },
          } : {}),
        },
      } : {}),
    }));
  }

  public static async listSourceRecords(assetId: string): Promise<DiscoverySourceRecord[]> {
    const result = await pgClient.query(`
      SELECT id, asset_id, connector_id, external_object_type, external_object_id,
             native_uuid, source_name, source_path, first_seen_at, last_seen_at,
             last_sync_run_id, current_observation_hash, normalized_payload_hash,
             revision, status, missing_since, retired_at, created_at, updated_at
      FROM cmdb_source_records WHERE asset_id=$1 ORDER BY last_seen_at DESC, id`, [assetId]);
    return result.rows.map((row) => ({
      id: row.id,
      assetId: optionalText(row.asset_id),
      connectorId: row.connector_id,
      externalObjectType: row.external_object_type,
      externalObjectId: row.external_object_id,
      nativeUuid: optionalText(row.native_uuid),
      sourceName: optionalText(row.source_name),
      sourcePath: optionalText(row.source_path),
      firstSeenAt: iso(row.first_seen_at),
      lastSeenAt: iso(row.last_seen_at),
      lastSyncRunId: row.last_sync_run_id,
      currentObservationHash: optionalText(row.current_observation_hash),
      normalizedPayloadHash: optionalText(row.normalized_payload_hash),
      revision: number(row.revision),
      status: row.status,
      missingSince: row.missing_since ? iso(row.missing_since) : undefined,
      retiredAt: row.retired_at ? iso(row.retired_at) : undefined,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }));
  }

  public static async listSyncRuns(connectorId: string, limit = 100): Promise<DiscoverySyncRunRecord[]> {
    const result = await pgClient.query(`
      SELECT id, connector_id, run_type, state, requested_by_user_id,
             correlation_id, queued_at, started_at, completed_at, checkpoint,
             cursor_value, discovered_count, created_count, updated_count,
             unchanged_count, failed_count, unmatched_count,
             stale_candidate_count, error_summary, created_at, updated_at
      FROM cmdb_discovery_sync_runs WHERE connector_id=$1
      ORDER BY queued_at DESC LIMIT $2`, [connectorId, Math.min(500, Math.max(1, Math.floor(limit)))]);
    return result.rows.map((row) => ({
      id: row.id,
      connectorId: row.connector_id,
      runType: row.run_type,
      state: row.state,
      requestedByUserId: optionalText(row.requested_by_user_id),
      correlationId: optionalText(row.correlation_id),
      queuedAt: iso(row.queued_at),
      startedAt: row.started_at ? iso(row.started_at) : undefined,
      completedAt: row.completed_at ? iso(row.completed_at) : undefined,
      checkpoint: optionalText(row.checkpoint),
      cursor: optionalText(row.cursor_value),
      discoveredCount: number(row.discovered_count),
      createdCount: number(row.created_count),
      updatedCount: number(row.updated_count),
      unchangedCount: number(row.unchanged_count),
      failedCount: number(row.failed_count),
      unmatchedCount: number(row.unmatched_count),
      staleCandidateCount: number(row.stale_candidate_count),
      errors: Array.isArray(row.error_summary) ? row.error_summary : [],
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }));
  }

  public static async listNetwork(assetId: string): Promise<{
    interfaces: NetworkInterfaceRecord[];
    macAddresses: MacAddressRecord[];
    ipAddresses: IpAddressRecord[];
  }> {
    const [interfaces, macs, ips] = await Promise.all([
      pgClient.query(`SELECT * FROM cmdb_network_interfaces WHERE asset_id=$1 ORDER BY name NULLS LAST, interface_key`, [assetId]),
      pgClient.query(`SELECT m.* FROM cmdb_mac_addresses m JOIN cmdb_network_interfaces i ON i.id=m.interface_id WHERE i.asset_id=$1 ORDER BY m.is_primary DESC, m.normalized_mac`, [assetId]),
      pgClient.query(`SELECT * FROM cmdb_ip_addresses WHERE asset_id=$1 ORDER BY is_primary DESC, ip_address`, [assetId]),
    ]);
    return {
      interfaces: interfaces.rows.map((row) => ({
        id: row.id, assetId: row.asset_id, connectorId: optionalText(row.connector_id), sourceRecordId: optionalText(row.source_record_id),
        interfaceKey: row.interface_key, name: optionalText(row.name), description: optionalText(row.description), interfaceType: optionalText(row.interface_type),
        technicalStatus: row.technical_status, mtu: row.mtu === null ? undefined : number(row.mtu), speedBps: optionalText(row.speed_bps), isVirtual: Boolean(row.is_virtual),
        firstSeenAt: iso(row.first_seen_at), lastSeenAt: iso(row.last_seen_at), retiredAt: row.retired_at ? iso(row.retired_at) : undefined,
      })),
      macAddresses: macs.rows.map((row) => ({
        id: row.id, interfaceId: row.interface_id, normalizedMac: row.normalized_mac, displayMac: row.display_mac, addressType: row.address_type,
        isPrimary: Boolean(row.is_primary), firstSeenAt: iso(row.first_seen_at), lastSeenAt: iso(row.last_seen_at), retiredAt: row.retired_at ? iso(row.retired_at) : undefined,
      })),
      ipAddresses: ips.rows.map((row) => ({
        id: row.id, assetId: row.asset_id, interfaceId: optionalText(row.interface_id), ipAddress: row.ip_address, addressRole: row.address_role,
        dnsName: optionalText(row.dns_name), isPrimary: Boolean(row.is_primary), isDynamic: Boolean(row.is_dynamic), firstSeenAt: iso(row.first_seen_at),
        lastSeenAt: iso(row.last_seen_at), retiredAt: row.retired_at ? iso(row.retired_at) : undefined,
      })),
    };
  }

  public static async listStorage(assetId: string): Promise<StorageDeviceRecord[]> {
    const result = await pgClient.query(`SELECT * FROM cmdb_storage_devices WHERE asset_id=$1 ORDER BY name, device_key`, [assetId]);
    return result.rows.map((row) => ({
      id: row.id, assetId: row.asset_id, storageAssetId: optionalText(row.storage_asset_id), connectorId: optionalText(row.connector_id),
      sourceRecordId: optionalText(row.source_record_id), deviceKey: row.device_key, name: row.name, storageType: row.storage_type,
      technicalStatus: row.technical_status, vendor: optionalText(row.vendor), model: optionalText(row.model), serialNumber: optionalText(row.serial_number),
      capacityBytes: optionalText(row.capacity_bytes), usedBytes: optionalText(row.used_bytes), freeBytes: optionalText(row.free_bytes), filesystem: optionalText(row.filesystem),
      mountPath: optionalText(row.mount_path), firstSeenAt: iso(row.first_seen_at), lastSeenAt: iso(row.last_seen_at), retiredAt: row.retired_at ? iso(row.retired_at) : undefined,
    }));
  }

  public static async listProvenance(assetId: string): Promise<AssetAttributeProvenanceRecord[]> {
    const result = await pgClient.query(`SELECT * FROM cmdb_asset_attribute_state WHERE asset_id=$1 ORDER BY attribute_path`, [assetId]);
    return result.rows.map((row) => ({
      assetId: row.asset_id, attributePath: row.attribute_path, effectiveValue: row.effective_value, source: row.source,
      connectorId: optionalText(row.connector_id), sourceRecordId: optionalText(row.source_record_id), precedence: number(row.precedence),
      confidence: number(row.confidence), manuallyManaged: Boolean(row.manually_managed), manualLock: Boolean(row.manual_lock),
      observedAt: iso(row.observed_at), updatedAt: iso(row.updated_at),
    }));
  }

  public static async listMaterialChanges(assetId: string, limit = 100): Promise<AssetMaterialChangeRecord[]> {
    const result = await pgClient.query(`SELECT * FROM cmdb_asset_changes WHERE asset_id=$1 ORDER BY detected_at DESC, id DESC LIMIT $2`, [assetId, Math.min(500, Math.max(1, Math.floor(limit)))]);
    return result.rows.map((row) => ({
      id: String(row.id), assetId: row.asset_id, changeType: row.change_type, fieldPath: row.field_path,
      beforeValue: row.before_value, afterValue: row.after_value, source: row.source, connectorId: optionalText(row.connector_id),
      sourceRecordId: optionalText(row.source_record_id), sourceRecordRevision: row.source_record_revision === null ? undefined : number(row.source_record_revision),
      syncRunId: optionalText(row.sync_run_id), detectionHash: row.detection_hash, detectedAt: iso(row.detected_at), createdAt: iso(row.created_at),
    }));
  }

  public static async validateIntegrity(): Promise<CmdbFoundationIntegrityReport> {
    const result = await pgClient.query(`
      SELECT
        (SELECT count(*) FROM configuration_items) AS assets,
        (SELECT count(*) FROM cmdb_asset_identifiers) AS identifiers,
        (SELECT count(*) FROM cmdb_discovery_connectors WHERE deleted_at IS NULL) AS discovery_connectors,
        (SELECT count(*) FROM cmdb_source_records) AS source_records,
        (SELECT count(*) FROM cmdb_raw_observations) AS raw_observations,
        (SELECT count(*) FROM cmdb_asset_changes) AS material_changes,
        (SELECT count(*) FROM bank_assets) AS legacy_assets,
        (SELECT count(*) FROM bank_applications) AS legacy_applications,
        (SELECT count(*) FROM cmdb_legacy_asset_map WHERE legacy_record_type='BANK_ASSET') AS mapped_legacy_assets,
        (SELECT count(*) FROM cmdb_legacy_asset_map WHERE legacy_record_type='BANK_APPLICATION') AS mapped_legacy_applications,
        (SELECT count(*) FROM cmdb_unresolved_legacy_references WHERE resolved_at IS NULL) AS unresolved_legacy_references,
        (SELECT count(*) FROM configuration_items
          WHERE asset_key IS NULL OR first_seen_at IS NULL
             OR lifecycle_state NOT IN ('DISCOVERED','ACTIVE','STALE','DECOMMISSION_CANDIDATE','RETIRED','ARCHIVED')
             OR (lifecycle_state='STALE' AND stale_since IS NULL)
             OR (lifecycle_state IN ('RETIRED','ARCHIVED') AND retired_at IS NULL AND archived_at IS NULL)
        ) AS invalid_lifecycle_rows,
        (
          SELECT COALESCE(sum(orphan_count), 0) FROM (
            SELECT count(*) AS orphan_count FROM cmdb_asset_identifiers x WHERE NOT EXISTS (SELECT 1 FROM configuration_items a WHERE a.id=x.asset_id)
            UNION ALL SELECT count(*) FROM cmdb_source_records x WHERE x.asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM configuration_items a WHERE a.id=x.asset_id)
            UNION ALL SELECT count(*) FROM cmdb_raw_observations x WHERE NOT EXISTS (SELECT 1 FROM cmdb_discovery_sync_runs r WHERE r.id=x.sync_run_id)
            UNION ALL SELECT count(*) FROM cmdb_network_interfaces x WHERE NOT EXISTS (SELECT 1 FROM configuration_items a WHERE a.id=x.asset_id)
            UNION ALL SELECT count(*) FROM cmdb_ip_addresses x WHERE NOT EXISTS (SELECT 1 FROM configuration_items a WHERE a.id=x.asset_id)
            UNION ALL SELECT count(*) FROM cmdb_storage_devices x WHERE NOT EXISTS (SELECT 1 FROM configuration_items a WHERE a.id=x.asset_id)
            UNION ALL SELECT count(*) FROM cmdb_asset_changes x WHERE NOT EXISTS (SELECT 1 FROM configuration_items a WHERE a.id=x.asset_id)
          ) orphan_checks
        ) AS orphaned_foundation_references,
        (
          (SELECT count(*) FROM department_connections WHERE cmdb_jsonb_contains_secret_key(config_summary))
          + (SELECT count(*) FROM cmdb_discovery_connectors WHERE cmdb_jsonb_contains_secret_key(non_secret_configuration))
        ) AS forbidden_secret_configurations
    `);
    const row = result.rows[0];
    return {
      assets: number(row.assets),
      identifiers: number(row.identifiers),
      discoveryConnectors: number(row.discovery_connectors),
      sourceRecords: number(row.source_records),
      rawObservations: number(row.raw_observations),
      materialChanges: number(row.material_changes),
      legacyAssets: number(row.legacy_assets),
      legacyApplications: number(row.legacy_applications),
      mappedLegacyAssets: number(row.mapped_legacy_assets),
      mappedLegacyApplications: number(row.mapped_legacy_applications),
      unresolvedLegacyReferences: number(row.unresolved_legacy_references),
      invalidLifecycleRows: number(row.invalid_lifecycle_rows),
      orphanedFoundationReferences: number(row.orphaned_foundation_references),
      forbiddenSecretConfigurations: number(row.forbidden_secret_configurations),
    };
  }
}
