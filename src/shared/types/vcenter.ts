/**
 * vCenter control-plane contracts.
 *
 * These types intentionally stop at connection, capability detection and
 * runtime isolation. Inventory traversal and normalization belong to the
 * discovery implementation phase and must not leak into this boundary.
 */

export const VCENTER_CONNECTOR_TYPE = 'VCENTER' as const;
export const DEFAULT_VCENTER_PORT = 443 as const;
export const DEFAULT_VCENTER_SOAP_PATH = '/sdk' as const;
export const DEFAULT_VCENTER_AUTOMATION_API_PATH = '/api' as const;

export type VCenterOperationalState =
  | 'DISABLED'
  | 'IDLE'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'CONNECTED'
  | 'READY'
  | 'DEGRADED'
  | 'SYNCING'
  | 'RECONCILING'
  | 'AUTH_FAILED'
  | 'TLS_FAILED'
  | 'DNS_FAILED'
  | 'NETWORK_FAILED'
  | 'PERMISSION_DENIED'
  | 'UNSUPPORTED_VERSION'
  | 'CONFIG_INVALID';

export type VCenterConfigurationStatus = 'UNKNOWN' | 'VALID' | 'INVALID';
export type VCenterConnectionStatus =
  | 'UNKNOWN'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'CONNECTED'
  | 'AUTH_FAILED'
  | 'TLS_FAILED'
  | 'DNS_FAILED'
  | 'NETWORK_FAILED'
  | 'PERMISSION_DENIED'
  | 'UNSUPPORTED_VERSION';
export type VCenterDiscoveryStatus = 'UNKNOWN' | 'READY' | 'SYNCING' | 'RECONCILING' | 'DEGRADED' | 'FAILED';

export type VCenterErrorCode =
  | 'VCENTER_DNS_FAILED'
  | 'VCENTER_CONNECT_TIMEOUT'
  | 'VCENTER_TLS_UNTRUSTED'
  | 'VCENTER_TLS_HOSTNAME_MISMATCH'
  | 'VCENTER_TLS_EXPIRED'
  | 'VCENTER_TLS_HANDSHAKE_FAILED'
  | 'VCENTER_AUTH_FAILED'
  | 'VCENTER_SESSION_EXPIRED'
  | 'VCENTER_PERMISSION_DENIED'
  | 'VCENTER_API_UNSUPPORTED'
  | 'VCENTER_RESPONSE_INVALID'
  | 'VCENTER_RATE_LIMITED'
  | 'VCENTER_INTERNAL_ERROR'
  | 'VCENTER_CONFIG_INVALID';

export interface VCenterCertificateMetadata {
  subject?: string;
  issuer?: string;
  serialNumber?: string;
  sha256Fingerprint?: string;
  notBefore?: string;
  notAfter?: string;
}

export interface VCenterConnectorConfiguration {
  connectorId: string;
  endpointFqdn: string;
  port: number;
  soapEndpointPath: string;
  automationApiBasePath: string;
  tlsVerifyCertificates: boolean;
  tlsCaReference?: string;
  credentialSecretReference?: string;
  requestTimeoutMs: number;
  responseSizeLimitBytes: number;
  endpointAllowPrivateNetwork: boolean;
  accessMode: 'READ_ONLY';
}

export interface VCenterServerInfo {
  product: string;
  version: string;
  build: string;
  apiVersion?: string;
  instanceUuid?: string;
}

export interface VCenterCapabilities {
  version: string;
  build: string;
  apiVersion?: string;
  supportsRestApi: boolean;
  supportsVmInventory: boolean;
  supportsHostInventory: boolean;
  supportsClusterInventory: boolean;
  supportsDatacenterInventory: boolean;
  supportsDatastoreInventory: boolean;
  supportsNetworkInventory: boolean;
  supportsResourcePoolInventory: boolean;
  supportsTagging: boolean;
}

export type VCenterTestStage = 'OK' | 'FAILED' | 'SKIPPED';
export interface VCenterConnectionTestResult {
  status: 'READY' | 'READY_WITH_LIMITED_CAPABILITIES' | 'FAILED';
  connection: { validateConfig: VCenterTestStage; resolveSecret: VCenterTestStage; dns: VCenterTestStage; tcp: VCenterTestStage; tls: VCenterTestStage; authentication: VCenterTestStage; session: VCenterTestStage; inventory: VCenterTestStage; serverInfo: VCenterTestStage; permissions: VCenterTestStage };
  errorCode?: VCenterErrorCode;
  server?: VCenterServerInfo;
  capabilities?: VCenterCapabilities;
  session?: { username: string; createdAt?: string; lastAccessedAt?: string };
}

export interface VCenterConnectionSnapshot {
  server: VCenterServerInfo;
  capabilities: VCenterCapabilities;
  certificate?: VCenterCertificateMetadata;
  connectionTestedAt: string;
  testResult?: VCenterConnectionTestResult;
}

export interface VCenterRuntimeState {
  connectorId: string;
  retryAttempt: number;
  nextRetryAt?: string;
  rateLimitUntil?: string;
  propertyCollectorVersion?: string;
  filterGeneration?: number;
}

export interface VCenterSyncState {
  connectorId: string;
  baselineGeneration: number;
  incrementalVersion?: string;
  filterGeneration: number;
  lastFullSyncAt?: string;
  lastReconcileAt?: string;
  lastIncrementalUpdateAt?: string;
  state: 'UNINITIALIZED' | 'READY' | 'SYNCING' | 'RECONCILING' | 'DEGRADED';
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface PersistedVCenterConnector extends VCenterConnectorConfiguration {
  name: string;
  environment: string;
  enabled: boolean;
  healthStatus: 'UNKNOWN' | 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'DISABLED';
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
  possibleDuplicate?: {
    connectorId: string;
    connectorName: string;
    reason: 'INSTANCE_UUID_MATCH';
    warning: 'POSSIBLE_DUPLICATE_VCENTER';
  };
}

/** VMware tag/category identities are namespaced by connector, never global. */
export interface VCenterCategorySourceRecord {
  connectorId: string;
  categoryId: string;
  name?: string;
  description?: string;
  cardinality?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VCenterTagSourceRecord {
  connectorId: string;
  tagId: string;
  categoryId?: string;
  name?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export function sourceIdentityKey(connectorId: string, sourceObjectType: string, sourceObjectId: string): string {
  const parts = [connectorId, sourceObjectType, sourceObjectId].map((part) => part.trim());
  if (parts.some((part) => !part)) throw new Error('Connector-scoped source identity requires connector, object type and object ID.');
  return parts.join('\u0000');
}
