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
  | 'GENERAL_REQUEST'
  | 'GENERAL_TASK'
  | 'IT_SUPPORT'
  | 'ACCESS_REQUEST'
  | 'HARDWARE_SOFTWARE'
  | 'NETWORK_INFRASTRUCTURE'
  | 'CHANGE_REQUEST'
  | 'INCIDENT_MANAGEMENT'
  | 'PROJECT_DELIVERY'
  | 'FINANCE_PROCUREMENT'
  | 'HR_OPERATIONS'
  | 'COMPLIANCE_LEGAL'
  | 'BUSINESS_OPERATIONS'
  | 'SECURITY_REVIEW'
  | 'VULNERABILITY'
  | 'INCIDENT'
  | 'SECURITY_EXCEPTION'
  | 'RISK_ACCEPTANCE'
  | 'AUDIT_FINDING'
  | 'IAM_REQUEST'
  | 'DLP_ALERT'
  | 'THIRD_PARTY_ASSESSMENT';

export interface TicketCategoryOption {
  code: TicketCategory;
  label: string;
  description?: string;
}

/**
 * The new-ticket intake also exposes catalog-backed Help Desk tasks. These
 * options are intentionally separate from TicketCategory so the persisted
 * generic-ticket contract remains a finite, validated union.
 */
export interface TicketIntakeCategoryOption extends Omit<TicketCategoryOption, 'code'> {
  code: string;
  kind?: 'CATEGORY' | 'BASIC_TICKET';
  requestTypeId?: string;
  catalogGroup?: string;
  targetDepartmentId?: string;
}

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
  /** Canonical generic CMDB associations. assetId/applicationId are legacy compatibility pointers. */
  affectedCiIds?: string[];
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
  /** AD-confirmed child organisational unit selected for queue routing. */
  targetSectionId?: string;
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
  /** Set only after the ticket's complete workflow reaches its final node. */
  archivedAt?: string;
  archivedByUserId?: string;
  
  // SLA Status
  slaPolicyId?: string;
  slaState: 'SAFE' | 'AT_RISK' | 'BREACHED' | 'PAUSED' | 'MET';
  slaBreachDeadline?: string;
  slaPausedReason?: string;
  slaRemainingMinutes?: number;
  
  // Concurrency Version
  version: number;
  tags: string[];

  // Project workspace fields. Tickets remain the canonical Task entity, and
  // become project-scoped work only when projectId is present.
  projectId?: string;
  milestoneId?: string;
  projectTaskNumber?: number;
  projectTaskStatus?: import('./project.js').ProjectTaskStatus;
  /** The configured project work-item type; tickets remain the canonical persisted entity. */
  projectWorkItemType?: import('./project.js').ProjectWorkItemType;
  actualHours?: number;
  taskWeight?: number;
  blockedReason?: string;
  blockerTaskId?: string;
  blockerExpectedResolutionDate?: string;
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
