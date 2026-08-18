import { BankRole } from './auth.js';

export type ApprovalDecision = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'DELEGATED' | 'ESCALATED';
export type ApprovalMode = 'ANY_ONE' | 'ALL' | 'MAJORITY' | 'SEQUENTIAL' | 'PARALLEL';

export interface ApprovalStep {
  id: string;
  stepNumber: number;
  name: string;
  requiredRole?: BankRole;
  assignedApproverId?: string;
  assignedApproverName?: string;
  status: ApprovalDecision;
  decisionByUserId?: string;
  decisionByUserName?: string;
  decisionAt?: string;
  comments?: string;
  delegatedToUserId?: string;
  immutableSignatureHash?: string;
  isMandatory: boolean;
}

export interface TicketApprovalChain {
  id: string;
  ticketId: string;
  title: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  createdAt: string;
  mode?: ApprovalMode;
  completedAt?: string;
  steps: ApprovalStep[];
}
