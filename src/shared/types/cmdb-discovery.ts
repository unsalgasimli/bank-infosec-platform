import type { VCenterCertificateMetadata, VCenterConfigurationStatus, VCenterConnectionStatus, VCenterConnectorConfiguration, VCenterCapabilities, VCenterDiscoveryStatus, VCenterOperationalState } from './vcenter.js';

/**
 * Generic CMDB discovery domain contracts.
 *
 * These types describe persisted foundation records only. Connector adapters,
 * normalization, correlation, reconciliation and lifecycle automation belong
 * to later phases and deliberately do not live in this module.
 */

export type CanonicalAssetType =
  | 'virtual_machine'
  | 'physical_server'
  | 'hypervisor'
  | 'cluster'
  | 'datacenter'
  | 'network'
  | 'network_device'
  | 'storage'
  | 'datastore'
  | 'workstation'
  | 'laptop'
  | 'security_device'
  | 'cloud_resource'
  | 'application'
  | 'business_service'
  | 'other'
  | (string & {});

export type AssetLifecycleState =
  | 'DISCOVERED'
  | 'ACTIVE'
  | 'STALE'
  | 'DECOMMISSION_CANDIDATE'
  | 'RETIRED'
  | 'ARCHIVED';

export type AssetIdentifierType =
  | 'HOSTNAME'
  | 'FQDN'
  | 'SERIAL_NUMBER'
  | 'BIOS_UUID'
  | 'VMWARE_INSTANCE_UUID'
  | 'CLOUD_INSTANCE_ID'
  | 'MAC_ADDRESS'
  | 'AGENT_ID'
  | 'EDR_DEVICE_ID'
  | 'CORTEX_ASSET_ID'
  | 'SCCM_RESOURCE_ID'
  | 'AD_OBJECT_GUID'
  | 'OTHER';

export type DiscoveryConnectorHealth = 'UNKNOWN' | 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'DISABLED';
export type DiscoverySyncRunType = 'FULL' | 'INCREMENTAL' | 'RECONCILIATION' | 'MANUAL';
export type DiscoverySyncRunState = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
export type DiscoverySourceRecordStatus = 'ACTIVE' | 'UNMATCHED' | 'MISSING' | 'STALE' | 'RETIRED' | 'ERROR';
export type RawObservationProcessingStatus = 'RECEIVED' | 'VALIDATED' | 'NORMALIZED' | 'PROCESSED' | 'REJECTED' | 'FAILED';
export type AssetRelationshipName =
  | 'RUNS_ON'
  | 'MEMBER_OF'
  | 'LOCATED_IN'
  | 'CONNECTED_TO'
  | 'STORED_ON'
  | 'DEPENDS_ON'
  | 'HOSTS'
  | 'PART_OF'
  | 'MANAGED_BY'
  | 'BACKED_UP_BY'
  | 'PROTECTED_BY'
  | 'RELATED_TO';

export interface CanonicalAssetRecord {
  id: string;
  assetKey: string;
  ciNumber: string;
  name: string;
  description?: string;
  displayName?: string;
  assetType: CanonicalAssetType;
  assetSubtype?: string;
  lifecycleState: AssetLifecycleState;
  technicalStatus: string;
  environment: string;
  criticality: string;
  businessCriticality?: string;
  ownerUserId?: string;
  technicalOwnerUserId?: string;
  businessOwnerUserId?: string;
  supportGroupId?: string;
  departmentId?: string;
  firstSeenAt: string;
  lastSeenAt?: string;
  staleSince?: string;
  retiredAt?: string;
  reactivatedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AssetIdentifierRecord {
  id: string;
  assetId: string;
  identifierType: AssetIdentifierType;
  namespace: string;
  value: string;
  normalizedValue: string;
  source: string;
  connectorId?: string;
  sourceRecordId?: string;
  confidence: number;
  isPrimary: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  retiredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveryConnectorRecord {
  id: string;
  connectionId?: string;
  name: string;
  connectorType: string;
  environment: string;
  enabled: boolean;
  healthStatus: DiscoveryConnectorHealth;
  nonSecretConfiguration: Record<string, unknown>;
  secretReference?: string;
  tlsCaReference?: string;
  scheduleMinutes: number;
  lastSyncAt?: string;
  lastSuccessfulSyncAt?: string;
  lastFailureAt?: string;
  lastFailureCode?: string;
  lastFailureMessage?: string;
  consecutiveFailures: number;
  checkpoint?: string;
  /** Optimistic-lock revision required for update and deletion. */
  version: number;
  latestRun?: {
    id: string;
    state: DiscoverySyncRunState;
    discoveredCount: number;
    failedCount: number;
    queuedAt: string;
    startedAt?: string;
    completedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  vcenter?: {
    endpointFqdn: VCenterConnectorConfiguration['endpointFqdn'];
    port: VCenterConnectorConfiguration['port'];
    soapEndpointPath: string;
    automationApiBasePath: string;
    responseSizeLimitBytes: number;
    endpointAllowPrivateNetwork: boolean;
    accessMode: 'READ_ONLY';
    operationalState: VCenterOperationalState;
    configurationStatus: VCenterConfigurationStatus;
    connectionStatus: VCenterConnectionStatus;
    discoveryStatus: VCenterDiscoveryStatus;
    detectedProduct?: string;
    detectedVersion?: string;
    detectedBuild?: string;
    detectedApiVersion?: string;
    detectedInstanceUuid?: string;
    capabilities: VCenterCapabilities;
    certificate?: VCenterCertificateMetadata;
    lastConnectionTestAt?: string;
    lastSuccessfulConnectionAt?: string;
    lastFullSyncAt?: string;
    lastIncrementalAt?: string;
    lastReconciliationAt?: string;
    lastConnectionAttemptAt?: string;
    lastAuthSuccessAt?: string;
    retryAttempt: number;
    nextRetryAt?: string;
    possibleDuplicate?: {
      connectorId: string;
      connectorName: string;
      reason: 'INSTANCE_UUID_MATCH';
      warning: 'POSSIBLE_DUPLICATE_VCENTER';
    };
  };
}

export interface DiscoverySyncRunRecord {
  id: string;
  connectorId: string;
  connectorType?: string;
  runType: DiscoverySyncRunType;
  state: DiscoverySyncRunState;
  requestedByUserId?: string;
  correlationId?: string;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  checkpoint?: string;
  cursor?: string;
  discoveredCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  unmatchedCount: number;
  staleCandidateCount: number;
  errors: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface DiscoverySourceRecord {
  id: string;
  assetId?: string;
  connectorId: string;
  externalObjectType: string;
  externalObjectId: string;
  nativeUuid?: string;
  sourceName?: string;
  sourcePath?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSyncRunId: string;
  currentObservationHash?: string;
  normalizedPayloadHash?: string;
  revision: number;
  status: DiscoverySourceRecordStatus;
  missingSince?: string;
  retiredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RawDiscoveryObservationRecord {
  id: string;
  connectorId: string;
  syncRunId: string;
  sourceRecordId?: string;
  sourceObjectType: string;
  sourceObjectId: string;
  observedAt: string;
  schemaVersion: number;
  rawPayload: unknown;
  deterministicHash: string;
  processingStatus: RawObservationProcessingStatus;
  processingErrorCode?: string;
  processingError?: string;
  processingAttempts: number;
  processedAt?: string;
  createdAt: string;
}

export interface NetworkInterfaceRecord {
  id: string;
  assetId: string;
  connectorId?: string;
  sourceRecordId?: string;
  interfaceKey: string;
  name?: string;
  description?: string;
  interfaceType?: string;
  technicalStatus: string;
  mtu?: number;
  speedBps?: string;
  isVirtual: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  retiredAt?: string;
}

export interface MacAddressRecord {
  id: string;
  interfaceId: string;
  normalizedMac: string;
  displayMac: string;
  addressType: string;
  isPrimary: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  retiredAt?: string;
}

export interface IpAddressRecord {
  id: string;
  assetId: string;
  interfaceId?: string;
  ipAddress: string;
  addressRole: string;
  dnsName?: string;
  isPrimary: boolean;
  isDynamic: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  retiredAt?: string;
}

export interface StorageDeviceRecord {
  id: string;
  assetId: string;
  storageAssetId?: string;
  connectorId?: string;
  sourceRecordId?: string;
  deviceKey: string;
  name: string;
  storageType: string;
  technicalStatus: string;
  vendor?: string;
  model?: string;
  serialNumber?: string;
  capacityBytes?: string;
  usedBytes?: string;
  freeBytes?: string;
  filesystem?: string;
  mountPath?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  retiredAt?: string;
}

export interface AssetAttributeProvenanceRecord {
  assetId: string;
  attributePath: string;
  effectiveValue: unknown;
  source: string;
  connectorId?: string;
  sourceRecordId?: string;
  precedence: number;
  confidence: number;
  manuallyManaged: boolean;
  manualLock: boolean;
  observedAt: string;
  updatedAt: string;
}

export interface AssetMaterialChangeRecord {
  id: string;
  assetId: string;
  changeType: string;
  fieldPath: string;
  beforeValue: unknown;
  afterValue: unknown;
  source: string;
  connectorId?: string;
  sourceRecordId?: string;
  sourceRecordRevision?: number;
  syncRunId?: string;
  detectionHash: string;
  detectedAt: string;
  createdAt: string;
}

export interface CmdbFoundationIntegrityReport {
  assets: number;
  identifiers: number;
  discoveryConnectors: number;
  sourceRecords: number;
  rawObservations: number;
  materialChanges: number;
  legacyAssets: number;
  legacyApplications: number;
  mappedLegacyAssets: number;
  mappedLegacyApplications: number;
  unresolvedLegacyReferences: number;
  invalidLifecycleRows: number;
  orphanedFoundationReferences: number;
  forbiddenSecretConfigurations: number;
}
