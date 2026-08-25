import { BankRole } from './auth.js';

export type ApprovalDecision = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'DELEGATED' | 'ESCALATED';
export type ApprovalMode = 'ANY_ONE' | 'ALL' | 'MAJORITY' | 'SEQUENTIAL' | 'PARALLEL' | 'N_OF_M' | 'PERCENTAGE_QUORUM';

export type ApproverResolverType =
  | 'SPECIFIC_USER'
  | 'ROLE'
  | 'REQUESTER_MANAGER'
  | 'DEPARTMENT_HEAD'
  | 'SERVICE_OWNER'
  | 'ASSET_OWNER'
  | 'CAB_BOARD';

export interface ApprovalStep {
  id: string;
  stepNumber: number;
  name: string;
  requiredRole?: BankRole;
  resolverType?: ApproverResolverType;
  candidateUserIds?: string[];
  assignedApproverId?: string;
  assignedApproverName?: string;
  status: ApprovalDecision;
  decisionByUserId?: string;
  decisionByUserName?: string;
  decisionAt?: string;
  comments?: string;
  delegatedToUserId?: string;
  delegationHistory?: Array<{ fromUserId: string; toUserId: string; delegatedAt: string; reason?: string }>;
  immutableSignatureHash?: string;
  isMandatory: boolean;
  quorumCount?: number;
  quorumPercentage?: number;
  deadlineAt?: string;
  /** Server-calculated for the authenticated viewer; never persisted. */
  canDecide?: boolean;
  escalationUserId?: string;
  requiresReapprovalOnChange?: boolean;
}

export interface TicketApprovalChain {
  id: string;
  ticketId: string;
  title: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  createdAt: string;
  mode?: ApprovalMode;
  quorumCount?: number;
  quorumPercentage?: number;
  workflowInstanceId?: string;
  nodeInstanceId?: string;
  requesterId?: string;
  preventSelfApproval?: boolean;
  commentsMandatoryOnReject?: boolean;
  allowDelegation?: boolean;
  completedAt?: string;
  steps: ApprovalStep[];
}
