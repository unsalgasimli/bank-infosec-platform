import { BankRole } from './auth.js';

export interface WorkflowValidationRule {
  type: 'REQUIRED_FIELD' | 'REQUIRED_EVIDENCE' | 'REQUIRED_APPROVAL' | 'REQUIRED_COMMENT' | 'MIN_SEVERITY' | 'CUSTOM_CONDITION';
  fieldKey?: string;
  errorMessage: string;
}

export interface WorkflowTransition {
  id: string;
  name: string;
  fromStateId: string;
  toStateId: string;
  allowedRoles: BankRole[];
  requireComment?: boolean;
  requiredFields?: string[];
  requireEvidence?: boolean;
  approvalChainId?: string;
  isAutomated?: boolean;
  automationTriggerName?: string;
  validators?: WorkflowValidationRule[];
  actions?: Array<'SET_RESOLVED_AT' | 'SET_CLOSED_AT' | 'CLEAR_RESOLUTION' | 'START_SLA' | 'STOP_SLA' | 'PAUSE_SLA' | 'RESUME_SLA'>;
}

export interface WorkflowState {
  id: string;
  name: string;
  category: 'TO_DO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED';
  color: string;
  isInitial?: boolean;
  isTerminal?: boolean;
  isPausedSLA?: boolean;
  pauseReason?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  ticketTypeId: string;
  departmentId?: string;
  isCrossDepartment?: boolean;
  version: number;
  isActive: boolean;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}
