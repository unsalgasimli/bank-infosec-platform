import { BusinessPriority, Ticket, TicketCategory } from './ticket.js';

export type EnterpriseTicketType =
  | 'NORMAL_TASK'
  | 'PROJECT_WORK'
  | 'SERVICE_REQUEST'
  | 'INCIDENT'
  | 'MAJOR_INCIDENT'
  | 'PROBLEM'
  | 'CHANGE'
  | 'ACCESS_REQUEST'
  | 'PRIVILEGED_ACCESS'
  | 'VULNERABILITY'
  | 'SECURITY_EXCEPTION'
  | 'RISK_ACCEPTANCE'
  | 'EMPLOYEE_ONBOARDING'
  | 'EMPLOYEE_OFFBOARDING'
  | 'PROVISIONING'
  | 'PROCUREMENT_APPROVAL'
  | 'COMPLIANCE_REMEDIATION'
  | 'RELEASE_DEPLOYMENT'
  | 'HR_FINANCE_APPROVAL'
  | 'RECURRING_TASK'
  | 'CROSS_DEPARTMENT'
  | 'SECURITY_INCIDENT'
  | 'CUSTOM';

export type TicketResolutionCode =
  | 'FIXED'
  | 'WORKAROUND'
  | 'DUPLICATE'
  | 'FALSE_POSITIVE'
  | 'USER_ERROR'
  | 'KNOWN_ISSUE'
  | 'REJECTED'
  | 'CANCELLED'
  | 'NO_ACTION_REQUIRED'
  | 'MITIGATED'
  | 'RISK_ACCEPTED';

export type TicketUrgency = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type TicketIntakeChannel =
  | 'PORTAL'
  | 'EMAIL'
  | 'AGENT'
  | 'API'
  | 'WEBHOOK'
  | 'CHAT'
  | 'MONITORING_SIEM'
  | 'SECURITY_TOOL'
  | 'AUTOMATION'
  | 'ANOTHER_TICKET'
  | 'SCHEDULED_TASK';

export type TicketRelationshipType =
  | 'RELATES_TO'
  | 'BLOCKS'
  | 'DUPLICATES'
  | 'CAUSED_BY'
  | 'PARENT_OF'
  | 'PROBLEM_FOR'
  | 'INCIDENT_OF'
  | 'CHANGE_CAUSED'
  | 'SECURITY_CASE_FOR';

export interface TicketRelationship {
  id: string;
  sourceTicketId: string;
  targetTicketId: string;
  type: TicketRelationshipType;
  createdByUserId: string;
  createdAt: string;
  note?: string;
}

export type TicketTaskStatus = 'TO_DO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';

export interface ChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
  completedAt?: string;
  completedByUserId?: string;
  assigneeId?: string;
  dueAt?: string;
}

export interface RecurringTaskConfig {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM_CRON';
  interval?: number;
  daysOfWeek?: number[];
  cronExpression?: string;
  nextRunAt: string;
  endDate?: string;
  lastRunAt?: string;
  isActive: boolean;
}

export interface BusinessCalendarConfig {
  id: string;
  name: string;
  timezone: string;
  workdays: number[]; // 0 = Sunday, 1 = Monday, ...
  startHour: number; // 9 = 09:00
  endHour: number; // 18 = 18:00
  holidays: string[]; // YYYY-MM-DD
  is24x7: boolean;
}

export type RoutingStrategy =
  | 'DIRECT_USER'
  | 'TEAM_QUEUE'
  | 'DEPT_MANAGER'
  | 'REQUESTER_MANAGER'
  | 'SERVICE_OWNER'
  | 'ASSET_OWNER'
  | 'ROLE_DISPATCH'
  | 'ROUND_ROBIN'
  | 'WORKLOAD_BALANCED'
  | 'ON_CALL_GROUP';

export interface TicketTask {
  id: string;
  ticketId: string;
  title: string;
  description?: string;
  ownerId?: string;
  groupId?: string;
  status: TicketTaskStatus;
  dueAt?: string;
  dependencyTaskIds: string[];
  completionCondition?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TicketWorklog {
  id: string;
  ticketId: string;
  agentId: string;
  startedAt: string;
  durationMinutes: number;
  description: string;
  billable: boolean;
  activityType: 'INVESTIGATION' | 'ANALYSIS' | 'COMMUNICATION' | 'REMEDIATION' | 'DOCUMENTATION' | 'OTHER';
  createdAt: string;
}

export type SLAMetricName =
  | 'ACKNOWLEDGMENT'
  | 'FIRST_RESPONSE'
  | 'ASSIGNMENT'
  | 'RESOLUTION'
  | 'REMEDIATION'
  | 'APPROVAL'
  | 'CUSTOMER_UPDATE'
  | 'CONTAINMENT'
  | 'RECOVERY';

export interface TicketSLAInstance {
  id: string;
  ticketId: string;
  policyId: string;
  metric: SLAMetricName;
  targetMinutes: number;
  startedAt: string;
  deadlineAt: string;
  state: 'RUNNING' | 'AT_RISK' | 'PAUSED' | 'BREACHED' | 'MET' | 'CANCELLED';
  elapsedMinutes: number;
  remainingMinutes: number;
  pausedAt?: string;
  pausedReason?: string;
  accruedPausedMinutes: number;
  completedAt?: string;
  breachedAt?: string;
}

export interface TicketSatisfaction {
  id: string;
  ticketId: string;
  requesterId: string;
  score: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  agentRating?: 1 | 2 | 3 | 4 | 5;
  resolutionQuality?: 1 | 2 | 3 | 4 | 5;
  speedRating?: 1 | 2 | 3 | 4 | 5;
  submittedAt: string;
}

export interface TicketAIRecommendation {
  id: string;
  ticketId: string;
  status: 'PENDING_REVIEW' | 'APPLIED' | 'DISMISSED';
  category?: TicketCategory;
  ticketType?: EnterpriseTicketType;
  priority?: BusinessPriority;
  assignmentGroupId?: string;
  tags?: string[];
  summary: string;
  missingFields: string[];
  riskSignals: string[];
  evidence: string[];
  confidence: number;
  engineVersion: string;
  requiresHumanConfirmation: true;
  createdAt: string;
  reviewedAt?: string;
  reviewedByUserId?: string;
  /** Outbox event identity makes worker redelivery idempotent. */
  outboxEventId?: string;
}

export interface TicketLifecycleBundle {
  relationships: Array<TicketRelationship & { relatedTicket?: Pick<Ticket, 'id' | 'key' | 'title' | 'statusName' | 'statusCategory' | 'assigneeId' | 'technicalSeverity' | 'businessPriority'> }>;
  tasks: TicketTask[];
  subTickets: Array<Pick<Ticket, 'id' | 'key' | 'title' | 'statusName' | 'statusCategory' | 'assigneeId' | 'departmentId' | 'targetDepartmentId' | 'technicalSeverity' | 'businessPriority' | 'createdAt'>>;
  parentTicket?: Pick<Ticket, 'id' | 'key' | 'title' | 'statusName' | 'statusCategory' | 'assigneeId' | 'requesterId' | 'departmentId'>;
  worklogs: TicketWorklog[];
  slaMetrics: TicketSLAInstance[];
  satisfaction?: TicketSatisfaction;
  aiRecommendations: TicketAIRecommendation[];
}
