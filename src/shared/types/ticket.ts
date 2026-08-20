import { ConfidentialityTier, SecurityDomain } from './auth.js';
import type { ChecklistItem, EnterpriseTicketType, RecurringTaskConfig, TicketIntakeChannel, TicketResolutionCode, TicketUrgency } from './itsm.js';

export type TicketProjectCode =
  | 'SEC'
  | 'SOC'
  | 'VM'
  | 'APPSEC'
  | 'GRC'
  | 'DLP'
  | 'IAM'
  | 'ARCH'
  | 'AUDIT'
  | 'TPRM';

export type TicketCategory =
  | 'VULNERABILITY'
  | 'INCIDENT'
  | 'SECURITY_EXCEPTION'
  | 'RISK_ACCEPTANCE'
  | 'AUDIT_FINDING'
  | 'SECURITY_REVIEW'
  | 'IAM_REQUEST'
  | 'DLP_ALERT'
  | 'THIRD_PARTY_ASSESSMENT'
  | 'GENERAL_REQUEST';

export type TechnicalSeverity = 'INFORMATIONAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type BusinessPriority = 'P1_URGENT' | 'P2_HIGH' | 'P3_MEDIUM' | 'P4_LOW';
export type BusinessImpact = 'CATASTROPHIC' | 'SIGNIFICANT' | 'MODERATE' | 'MINOR' | 'NEGLIGIBLE';
export type RiskRating = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SecurityFindingDetails {
  vulnerabilityTitle: string;
  cweId?: string;
  cweName?: string;
  cveId?: string;
  cvssScore?: number;
  cvssVector?: string;
  owaspCategory?: string;
  endpoint?: string;
  httpParameter?: string;
  affectedService?: string;
  affectedComponent?: string;
  filePath?: string;
  codeLine?: number;
  gitBranch?: string;
  gitRepository?: string;
  packageName?: string;
  installedVersion?: string;
  fixedVersion?: string;
  exploitability?: 'UNPROVEN' | 'POC' | 'FUNCTIONAL' | 'HIGH' | 'NOT_DEFINED';
  proofOfConcept?: string;
  remediationRecommendation?: string;
  compensatingControls?: string;
  falsePositiveReason?: string;
  isFalsePositive?: boolean;
  scannerSource?: 'CHECKMARX' | 'DEFECTDOJO' | 'TRIVY' | 'DEFENDER' | 'SIEM' | 'BURP_SUITE' | 'PENTEST' | 'MANUAL' | 'BUG_BOUNTY' | 'AUDIT';
  findingFingerprint?: string;
  observationCount?: number;
  firstDetectedAt?: string;
  lastDetectedAt?: string;
}

export interface MitreAttackRef {
  tactic: string;
  techniqueId: string;
  techniqueName: string;
}

export interface IncidentDetails {
  incidentPhase?: 'DETECTED' | 'TRIAGE' | 'INVESTIGATION' | 'CONTAINMENT' | 'ERADICATION' | 'RECOVERY' | 'POST_INCIDENT_REVIEW';
  incidentType: 'PHISHING' | 'RANSOMWARE' | 'UNAUTHORIZED_ACCESS' | 'CREDENTIAL_DUMPING' | 'DATA_EXFILTRATION' | 'DDOS' | 'INSIDER_THREAT' | 'MALWARE' | 'POLICY_VIOLATION';
  detectionSource: 'SIEM_CORRELATION' | 'EDR_ALERT' | 'USER_REPORT' | 'FIREWALL_ALERT' | 'DLP_SENSOR' | 'THREAT_INTEL' | 'AUDITOR';
  affectedUserIds?: string[];
  affectedAssetIds?: string[];
  affectedApplicationIds?: string[];
  iocs: {
    ipAddresses?: string[];
    domains?: string[];
    urls?: string[];
    fileHashes?: string[];
    emailSenders?: string[];
  };
  mitreAttack?: MitreAttackRef[];
  containmentActions?: string;
  eradicationActions?: string;
  recoveryActions?: string;
  rootCause?: string;
  businessImpactSummary?: string;
  regulatoryImpact?: boolean;
  regulatoryNotificationDeadline?: string;
  dataBreachIndication?: boolean;
  dataBreachRecordsCount?: number;
}

export interface SecurityExceptionDetails {
  requestedControlId: string;
  requestedControlName: string;
  reason: string;
  businessJustification: string;
  inherentRisk: RiskRating;
  compensatingControls: string;
  riskOwnerId: string;
  effectiveDate: string;
  expirationDate: string;
  autoRenew: boolean;
  renewalCount?: number;
  reviewFrequencyDays: number;
}

export interface CustomFieldValue {
  fieldId: string;
  name: string;
  type: 'TEXT' | 'TEXTAREA' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'SELECT' | 'MULTI_SELECT' | 'DATE' | 'USER' | 'TEAM' | 'ASSET' | 'APP' | 'CVE';
  value: any;
}

export interface Ticket {
  id: string; // UUID
  key: string; // e.g. APPSEC-2026-001245
  projectCode: TicketProjectCode;
  ticketTypeId: string;
  ticketTypeName: string;
  type?: EnterpriseTicketType;
  requestTypeId?: string;
  requestTypeName?: string;
  intakeChannel?: TicketIntakeChannel;
  category: TicketCategory;
  securityDomain: SecurityDomain;
  title: string;
  description: string;
  
  // Status & Workflow
  statusId: string;
  statusName: string;
  statusCategory: 'TO_DO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED';
  resolutionCode?: TicketResolutionCode;
  resolutionSummary?: string;
  workflowId: string;
  workflowVersion: number;
  
  // Severity, Priority, Risk
  technicalSeverity: TechnicalSeverity;
  businessPriority: BusinessPriority;
  businessImpact: BusinessImpact;
  urgency?: TicketUrgency;
  inherentRisk: RiskRating;
  residualRisk: RiskRating;
  riskScore: number; // 0 - 100
  cvssScore?: number;
  cvssVector?: string;
  
  // Confidentiality & ABAC
  confidentiality: ConfidentialityTier;
  restrictedUserIds?: string[];
  restrictedTeamIds?: string[];
  
  // Ownership & Department Context
  reporterId: string;
  requesterId?: string;
  onBehalfOfUserId?: string;
  assigneeId?: string;
  assignmentGroupId?: string;
  ownerId?: string;
  securityOwnerId?: string;
  teamId?: string;
  departmentId?: string;
  targetDepartmentId?: string;
  applicationId?: string;
  assetId?: string;
  riskOwnerId?: string;
  watcherIds: string[];
  participantIds?: string[];
  organizationId?: string;
  siteId?: string;
  affectedServiceId?: string;
  affectedAssetIds?: string[];
  parentTicketId?: string;
  duplicateOfTicketId?: string;
  subtaskIds?: string[];

  // Cross-Department Orchestration & Graph Context
  parentTaskId?: string;
  crossDepartmentId?: string;
  isCrossDepartmentParent?: boolean;
  participatingDepartmentIds?: string[];
  departmentStepIndex?: number;
  dependsOnTaskId?: string;
  graphNodeId?: string;
  workflowRunId?: string;
  
  // Specialized details & Enterprise Extensions
  findingDetails?: SecurityFindingDetails;
  incidentDetails?: IncidentDetails;
  exceptionDetails?: SecurityExceptionDetails;
  customFields?: CustomFieldValue[];
  checklists?: ChecklistItem[];
  acceptanceCriteria?: string;
  recurringConfig?: RecurringTaskConfig;
  estimatedHours?: number;
  storyPoints?: number;
  
  // Dates & SLA
  detectedAt?: string;
  createdAt: string;
  updatedAt: string;
  assignedAt?: string;
  acknowledgedAt?: string;
  firstResponseAt?: string;
  startDate?: string;
  dueDate: string;
  remediationDeadline: string;
  resolvedAt?: string;
  closedAt?: string;
  reopenedAt?: string;
  
  // SLA Status
  slaPolicyId?: string;
  slaState: 'SAFE' | 'AT_RISK' | 'BREACHED' | 'PAUSED' | 'MET';
  slaBreachDeadline?: string;
  slaPausedReason?: string;
  slaRemainingMinutes?: number;
  
  // Concurrency Version
  version: number;
  tags: string[];
}

/**
 * Deterministic calculation matrix: Business Impact + Urgency -> Business Priority
 */
export const calculatePriorityFromImpactUrgency = (
  impact: BusinessImpact,
  urgency: TicketUrgency
): BusinessPriority => {
  const impactWeights: Record<BusinessImpact, number> = {
    CATASTROPHIC: 4,
    SIGNIFICANT: 3,
    MODERATE: 2,
    MINOR: 1,
    NEGLIGIBLE: 1,
  };
  const urgencyWeights: Record<TicketUrgency, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  const score = impactWeights[impact] + urgencyWeights[urgency];
  if (score >= 7) return 'P1_URGENT';
  if (score >= 5) return 'P2_HIGH';
  if (score >= 3) return 'P3_MEDIUM';
  return 'P4_LOW';
};
