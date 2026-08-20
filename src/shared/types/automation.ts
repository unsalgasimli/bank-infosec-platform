export type AutomationTrigger =
  | 'TICKET_CREATED'
  | 'SEVERITY_CHANGED'
  | 'STATUS_CHANGED'
  | 'SLA_WARNING_THRESHOLD'
  | 'SLA_NEAR_BREACH'
  | 'SLA_BREACHED'
  | 'COMMENT_ADDED'
  | 'ASSIGNMENT_CHANGED'
  | 'EXCEPTION_APPROACHING_EXPIRY'
  | 'APPROVAL_COMPLETED'
  | 'APPROVAL_REJECTED'
  | 'DEPENDENCY_COMPLETED'
  | 'RECURRING_SCHEDULE_TRIGGERED';

export interface AutomationCondition {
  field: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'IN' | 'NOT_IN' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS' | 'STARTS_WITH' | 'IS_EMPTY' | 'IS_NOT_EMPTY';
  value: any;
}

export interface AutomationAction {
  type:
    | 'ASSIGN_TEAM'
    | 'ASSIGN_USER'
    | 'ASSIGN_DYNAMIC'
    | 'SET_PRIORITY'
    | 'SET_SEVERITY'
    | 'SET_STATUS'
    | 'ADD_TAG'
    | 'ADD_WATCHER'
    | 'NOTIFY_MANAGER'
    | 'ADD_INTERNAL_NOTE'
    | 'CREATE_SUBTASK'
    | 'ESCALATE_TO_CISO'
    | 'CALL_WEBHOOK'
    | 'LAUNCH_WORKFLOW'
    | 'PAUSE_SLA'
    | 'RESUME_SLA';
  payload: Record<string, any>;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  executionCount: number;
  lastExecutedAt?: string;
  maxRecursionDepth?: number;
}

export interface AutomationExecutionLog {
  id: string;
  ruleId: string;
  ruleName: string;
  trigger: AutomationTrigger;
  ticketId: string;
  ticketKey: string;
  executedActionsCount: number;
  success: boolean;
  error?: string;
  executedAt: string;
}
