export type AutomationTrigger =
  | 'TICKET_CREATED'
  | 'SEVERITY_CHANGED'
  | 'STATUS_CHANGED'
  | 'SLA_NEAR_BREACH'
  | 'SLA_BREACHED'
  | 'COMMENT_ADDED'
  | 'ASSIGNMENT_CHANGED'
  | 'EXCEPTION_APPROACHING_EXPIRY';

export interface AutomationCondition {
  field: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'IN' | 'NOT_IN' | 'GREATER_THAN' | 'CONTAINS';
  value: any;
}

export interface AutomationAction {
  type:
    | 'ASSIGN_TEAM'
    | 'ASSIGN_USER'
    | 'SET_PRIORITY'
    | 'SET_SEVERITY'
    | 'ADD_TAG'
    | 'NOTIFY_MANAGER'
    | 'ADD_INTERNAL_NOTE'
    | 'CREATE_SUBTASK'
    | 'ESCALATE_TO_CISO';
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
}
