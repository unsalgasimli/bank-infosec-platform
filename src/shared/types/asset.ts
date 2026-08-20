import { ConfidentialityTier } from './auth.js';

export type AssetType =
  | 'SERVER'
  | 'WORKSTATION'
  | 'VM'
  | 'DATABASE'
  | 'API_GATEWAY'
  | 'FIREWALL'
  | 'NETWORK_DEVICE'
  | 'CLOUD_RESOURCE'
  | 'CONTAINER'
  | 'KUBERNETES_CLUSTER'
  | 'REPOSITORY'
  | 'DOMAIN'
  | 'CERTIFICATE'
  | 'EMPLOYEE'
  | 'VENDOR';

export type CriticalityTier = 'TIER_1' | 'TIER_2' | 'TIER_3';

export interface BankAsset {
  id: string;
  name: string;
  assetType: AssetType;
  hostname?: string;
  ipAddress?: string;
  environment: 'PRODUCTION' | 'UAT' | 'DR' | 'STAGING' | 'DEVELOPMENT';
  criticality: CriticalityTier;
  internetExposed: boolean;
  businessService?: string;
  applicationId?: string;
  ownerId: string;
  ownerName?: string;
  operatingSystem?: string;
  departmentId: string;
  dataClassification: ConfidentialityTier;
  cmdbId?: string;
  openTicketCount?: number;
  criticalFindingCount?: number;
}

export interface BankApplication {
  id: string;
  code: string;
  name: string;
  description: string;
  criticality: CriticalityTier;
  ownerId?: string;
  businessOwnerId: string;
  technicalOwnerId: string;
  securityLeadId: string;
  developmentTeamId: string;
  environment: 'PRODUCTION' | 'UAT' | 'DEVELOPMENT';
  techStack: string[];
  gitRepositories: string[];
  connectedDatabases: string[];
  connectedApis: string[];
  internetExposed: boolean;
  dataClassification: ConfidentialityTier;
  activeRiskCount: number;
  openVulnerabilitiesCount: number;
}
