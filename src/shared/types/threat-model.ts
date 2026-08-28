import type { ConfidentialityTier } from './auth.js';
import type { RiskRating } from './ticket.js';

export type ThreatModelStatus = 'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUIRED' | 'APPROVED' | 'REVIEW_REQUIRED' | 'SUPERSEDED' | 'ARCHIVED';
export type ThreatModelRevisionStatus = 'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUIRED' | 'APPROVED' | 'SUPERSEDED';
export type ThreatModelApplicabilityDecision = 'REQUIRED' | 'NOT_REQUIRED' | 'SECURITY_REVIEW_REQUIRED';
export type ThreatModelComponentType = 'PROCESS' | 'SERVICE' | 'API' | 'DATABASE' | 'DATASTORE' | 'QUEUE' | 'EXTERNAL_SYSTEM' | 'USER' | 'ADMIN' | 'THIRD_PARTY' | 'NETWORK_ZONE' | 'CLOUD_SERVICE' | 'DEVICE' | 'OTHER';
export type ThreatCategory = 'SPOOFING' | 'TAMPERING' | 'REPUDIATION' | 'INFORMATION_DISCLOSURE' | 'DENIAL_OF_SERVICE' | 'ELEVATION_OF_PRIVILEGE' | 'BUSINESS_ABUSE' | 'FRAUD' | 'PRIVILEGE_ABUSE' | 'WORKFLOW_BYPASS' | 'SEGREGATION_OF_DUTIES_BYPASS' | 'TRANSACTION_MANIPULATION' | 'REPLAY' | 'ACCOUNT_TAKEOVER' | 'API_ABUSE' | 'AUTOMATION_ABUSE' | 'DATA_EXFILTRATION' | 'INSIDER_THREAT' | 'THIRD_PARTY_COMPROMISE';
export type ThreatStatus = 'OPEN' | 'MITIGATING' | 'MITIGATED' | 'ACCEPTED' | 'CLOSED';
export type ThreatControlStatus = 'PROPOSED' | 'PLANNED' | 'IN_IMPLEMENTATION' | 'IMPLEMENTED' | 'VERIFICATION_REQUIRED' | 'VERIFIED' | 'FAILED' | 'ACCEPTED_RISK' | 'NOT_APPLICABLE';
export type VerificationType = 'MANUAL_SECURITY_TEST' | 'SAST' | 'DAST' | 'SCA' | 'API_SECURITY_TEST' | 'PENETRATION_TEST' | 'CODE_REVIEW' | 'ARCHITECTURE_REVIEW' | 'CONFIGURATION_REVIEW' | 'IAM_REVIEW' | 'INFRASTRUCTURE_TEST' | 'CONTROL_ATTESTATION' | 'OTHER';
export type VerificationResult = 'NOT_RUN' | 'PASS' | 'FAIL' | 'PARTIAL' | 'EXPIRED';
export type ThreatModelApprovalStage = 'APPSEC' | 'SECURITY_ARCHITECTURE' | 'RISK_AUTHORITY';
export type ThreatModelExceptionStatus = 'REQUESTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';

export interface ThreatModel {
  id: string;
  key: string;
  organizationId: string;
  serviceId?: string;
  assetId?: string;
  projectId?: string;
  changeId?: string;
  releaseId?: string;
  title: string;
  description: string;
  criticality: RiskRating;
  dataClassification: ConfidentialityTier;
  businessOwnerId: string;
  technicalOwnerId: string;
  securityOwnerId?: string;
  departmentId?: string;
  currentRevisionId?: string;
  status: ThreatModelStatus;
  nextReviewAt?: string;
  lastApprovedAt?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  version: number;
}

export interface ThreatModelRevision {
  id: string;
  threatModelId: string;
  revisionNumber: number;
  status: ThreatModelRevisionStatus;
  scopeSummary: string;
  architectureSummary: string;
  assumptions: string;
  securityObjectives: string;
  inScope: string[];
  outOfScope: string[];
  supersedesRevisionId?: string;
  changeReason?: string;
  createdBy: string;
  createdAt: string;
  submittedBy?: string;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  version: number;
}

export interface ThreatModelApplicabilityAssessment {
  id: string;
  threatModelId?: string;
  organizationId: string;
  projectId?: string;
  changeId?: string;
  serviceId?: string;
  assetId?: string;
  answers: Record<string, boolean>;
  decision: ThreatModelApplicabilityDecision;
  justification?: string;
  assessedBy: string;
  assessedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ThreatModelComponent {
  id: string;
  revisionId: string;
  name: string;
  type: ThreatModelComponentType;
  description?: string;
  technology?: string;
  assetId?: string;
  ownerId?: string;
  criticality?: RiskRating;
}

export interface ThreatModelDataFlow {
  id: string;
  revisionId: string;
  sourceComponentId: string;
  destinationComponentId: string;
  name: string;
  description?: string;
  protocol?: string;
  port?: number;
  authenticationMethod?: string;
  encryptionInTransit?: boolean;
  dataClassification: ConfidentialityTier;
  dataTypes: string[];
  crossesTrustBoundary: boolean;
  trustBoundaryId?: string;
  direction: 'ONE_WAY' | 'BIDIRECTIONAL';
  notes?: string;
}

export interface ThreatModelTrustBoundary {
  id: string;
  revisionId: string;
  name: string;
  description?: string;
  boundaryType: string;
  trustLevelFrom?: string;
  trustLevelTo?: string;
  authenticationRequired: boolean;
  encryptionRequired: boolean;
  notes?: string;
}

export interface Threat {
  id: string;
  revisionId: string;
  key: string;
  title: string;
  description: string;
  categories: ThreatCategory[];
  attackScenario: string;
  attackerType?: string;
  attackerCapability?: string;
  preconditions?: string;
  attackPath?: string;
  affectedComponentId?: string;
  affectedDataFlowId?: string;
  affectedTrustBoundaryId?: string;
  affectedAssetId?: string;
  cweIds: string[];
  capecIds: string[];
  inherentLikelihood: number;
  inherentImpact: number;
  inherentScore: number;
  residualLikelihood?: number;
  residualImpact?: number;
  residualScore?: number;
  residualRiskRationale?: string;
  residualRiskCalculatedAt?: string;
  residualRiskCalculatedBy?: string;
  status: ThreatStatus;
  ownerId?: string;
  dueDate?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ThreatControl {
  id: string;
  threatId: string;
  title: string;
  description: string;
  controlType: string;
  implementationOwnerId?: string;
  status: ThreatControlStatus;
  implementationTicketId?: string;
  requiredBeforeRelease: boolean;
  dueDate?: string;
  effectivenessStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ControlVerification {
  id: string;
  controlId: string;
  verificationType: VerificationType;
  testCase: string;
  expectedResult: string;
  result: VerificationResult;
  evidenceIds: string[];
  executedBy: string;
  executedAt: string;
  reviewerId?: string;
  reviewedAt?: string;
  expiresAt?: string;
  notes?: string;
}

export interface ThreatModelApproval {
  id: string;
  revisionId: string;
  stage: ThreatModelApprovalStage;
  decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  decidedBy: string;
  decidedAt: string;
  comments?: string;
}

export interface ThreatModelException {
  id: string;
  threatId: string;
  controlId?: string;
  reason: string;
  businessJustification: string;
  riskLevel: RiskRating;
  compensatingControls?: string;
  requestedBy: string;
  approverId?: string;
  approvedAt?: string;
  expiresAt: string;
  reviewDate?: string;
  status: ThreatModelExceptionStatus;
  createdAt: string;
}

export interface SecurityReleaseGateResult {
  allowed: boolean;
  blockers: string[];
  warnings: string[];
  evaluatedAt: string;
  evidenceSnapshot: Record<string, unknown>;
}
