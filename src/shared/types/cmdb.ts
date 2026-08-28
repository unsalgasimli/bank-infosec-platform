export type CIStatus = 'ACTIVE' | 'INACTIVE' | 'RETIRED' | 'ARCHIVED';
export type CILifecycleStatus = 'REQUESTED' | 'PROCURED' | 'RECEIVED' | 'IN_STOCK' | 'ASSIGNED' | 'IN_USE' | 'MAINTENANCE' | 'RETURNED' | 'RETIRED' | 'DISPOSED' | 'LOST';
export type CMDBEnvironment = 'DEV' | 'TEST' | 'UAT' | 'STAGING' | 'PRODUCTION' | 'DR' | 'UNKNOWN';
export type CMDBCriticality = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CIType {
  id: string;
  name: string;
  parentTypeId?: string;
  icon: string;
  isActive: boolean;
  requiredAttributes: string[];
  optionalAttributes: string[];
  validationRules: Record<string, unknown>;
  allowedRelationshipTypeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipType {
  id: string;
  name: string;
  inverseName: string;
  isDependency: boolean;
  preventsCycles: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigurationItem {
  id: string;
  ciNumber: string;
  /** Concurrency-safe canonical asset key. ciNumber remains as a compatibility display number. */
  assetKey?: string;
  name: string;
  displayName?: string;
  typeId: string;
  assetSubtype?: string;
  status: CIStatus;
  /** Discovery lifecycle is separate from procurement lifecycleStatus and technical status. */
  lifecycleState?: 'DISCOVERED' | 'ACTIVE' | 'STALE' | 'DECOMMISSION_CANDIDATE' | 'RETIRED' | 'ARCHIVED';
  technicalStatus?: string;
  lifecycleStatus: CILifecycleStatus;
  environment: CMDBEnvironment;
  criticality: CMDBCriticality;
  businessCriticality?: CMDBCriticality;
  description?: string;
  ownerUserId?: string;
  technicalOwnerUserId?: string;
  businessOwnerUserId?: string;
  supportGroupId?: string;
  departmentId?: string;
  locationId?: string;
  vendor?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  assetTag?: string;
  hostname?: string;
  fqdn?: string;
  ipAddress?: string;
  macAddress?: string;
  operatingSystem?: string;
  osVersion?: string;
  externalReference?: string;
  source: 'MANUAL' | 'ACTIVE_DIRECTORY' | 'SCCM' | 'INTUNE' | 'VMWARE' | 'SERVICE_DISCOVERY' | 'IMPORT' | 'API' | 'SECURITY_PLATFORM';
  sourceSystem?: string;
  sourceRecordId?: string;
  discoveryStatus: 'NOT_DISCOVERED' | 'DISCOVERED' | 'SYNCED' | 'ERROR';
  lastDiscoveredAt?: string;
  lastVerifiedAt?: string;
  lastSeenAt?: string;
  firstSeenAt?: string;
  staleSince?: string;
  retiredAt?: string;
  reactivatedAt?: string;
  lastSyncAt?: string;
  syncStatus?: 'PENDING' | 'SYNCED' | 'ERROR';
  details: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  archivedAt?: string;
}

export interface CIRelationship {
  id: string;
  sourceCiId: string;
  targetCiId: string;
  relationshipTypeId: string;
  status: 'ACTIVE' | 'INACTIVE';
  description?: string;
  source: 'MANUAL' | 'DISCOVERY' | 'IMPORT' | 'API';
  confidence: number;
  validFrom: string;
  validTo?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  staleSince?: string;
  retiredAt?: string;
  createdAt: string;
  createdBy: string;
  archivedAt?: string;
}

export interface CIRecordLink {
  id: string;
  ciId: string;
  recordType: 'TICKET' | 'INCIDENT' | 'SERVICE_REQUEST' | 'CHANGE' | 'PROBLEM' | 'VULNERABILITY' | 'PROJECT' | 'TASK' | 'RISK' | 'WORKFLOW' | 'WORKFLOW_INSTANCE' | 'THREAT_MODEL';
  recordId: string;
  relationship: 'AFFECTED_BY' | 'RELATED_TO' | 'IMPLEMENTED_BY';
  createdAt: string;
  createdBy: string;
}

export interface CMDBGraph {
  nodes: Array<Pick<ConfigurationItem, 'id' | 'ciNumber' | 'name' | 'displayName' | 'typeId' | 'status' | 'criticality' | 'environment'>>;
  edges: Array<{ id: string; source: string; target: string; relationshipTypeId: string; relationshipType: string }>;
}
