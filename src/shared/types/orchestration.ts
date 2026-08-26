import type { BankRole, ConfidentialityTier } from './auth.js';
import type { ApprovalMode, ApproverResolverType } from './approval.js';

export type EnterpriseDomain =
  | 'SOFTWARE_DEVELOPMENT'
  | 'DEVOPS'
  | 'IT_OPERATIONS'
  | 'ITSM'
  | 'INFORMATION_SECURITY'
  | 'HR'
  | 'FINANCE'
  | 'LEGAL'
  | 'PROCUREMENT'
  | 'FACILITIES'
  | 'GENERAL';

export type UniversalWorkType =
  | 'TASK'
  | 'STORY'
  | 'BUG'
  | 'INCIDENT'
  | 'PROBLEM'
  | 'CHANGE'
  | 'SERVICE_REQUEST'
  | 'SECURITY_CASE'
  | 'VULNERABILITY'
  | 'HR_CASE'
  | 'EMPLOYEE_LIFECYCLE_EVENT'
  | 'APPROVAL_REQUEST'
  | 'PROCUREMENT_REQUEST';

export type WorkflowLifecycle = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'DEPRECATED' | 'ARCHIVED';
export type TemplateScope = 'COMPANY' | 'DEPARTMENT' | 'PERSONAL';
export type WorkflowCatalogTemplateKind = 'WORKFLOW' | 'BASIC_TICKET';
export type TriggerType = 'MANUAL' | 'RECORD_EVENT' | 'DATE_EVENT' | 'SCHEDULE' | 'EXTERNAL_EVENT' | 'DEVOPS_EVENT' | 'HR_EVENT' | 'IT_EVENT';
export type WorkflowNodeType =
  | 'START'
  | 'INPUT'
  | 'TICKET_INPUT'
  | 'TASK'
  | 'APPROVAL'
  | 'INFORMATION_REQUEST'
  | 'CONDITION'
  | 'PARALLEL_SPLIT'
  | 'PARALLEL_JOIN'
  | 'WAIT_TIMER'
  | 'MILESTONE'
  | 'SUBWORKFLOW'
  | 'SYSTEM_ACTION'
  | 'WEBHOOK_ACTION'
  | 'INTEGRATION_ACTION'
  | 'NOTIFICATION'
  | 'CREATE_RECORD'
  | 'SCRIPT_EXPRESSION'
  | 'SUCCESS_END'
  | 'REJECTED_END'
  | 'CANCELLED_END'
  | 'FAILED_END';

export type WorkflowInstanceStatus = 'PENDING' | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'FAILED';
export type NodeInstanceStatus = 'PENDING' | 'READY' | 'RUNNING' | 'WAITING' | 'WAITING_RETRY' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED' | 'FAILED' | 'COMPENSATED';
export type WorkItemStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED';

export type ConditionOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'IN'
  | 'NOT_IN'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'EXISTS'
  | 'NOT_EXISTS'
  | 'IS_TRUE'
  | 'IS_FALSE'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL';

export interface ConditionClause {
  left: { source: 'CONTEXT' | 'NODE_OUTPUT' | 'LITERAL'; path?: string; nodeId?: string; value?: unknown };
  operator: ConditionOperator;
  right?: { source: 'CONTEXT' | 'NODE_OUTPUT' | 'LITERAL'; path?: string; nodeId?: string; value?: unknown };
}

export interface ConditionGroup {
  combinator: 'ALL' | 'ANY';
  clauses: Array<ConditionClause | ConditionGroup>;
}

export type FormFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'RICH_TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'DATETIME'
  | 'DURATION'
  | 'MONEY'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'RADIO'
  | 'CHECKBOX'
  | 'USER'
  | 'GROUP'
  | 'DEPARTMENT'
  | 'APPLICATION_SERVICE'
  | 'ASSET_CI'
  | 'ATTACHMENTS'
  | 'EVIDENCE'
  | 'URL'
  | 'TABLE'
  | 'LABELS'
  | 'SECURE_TEXT'
  | 'HIDDEN';

export interface FormFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: FormFieldType;
  description?: string;
  placeholder?: string;
  required?: boolean;
  sensitive?: boolean;
  encrypted?: boolean;
  defaultValue?: unknown;
  calculatedValue?: { function: string; arguments: unknown[] };
  visibilityCondition?: ConditionGroup;
  requiredCondition?: ConditionGroup;
  validation?: { min?: number | string; max?: number | string; pattern?: string; allowedValues?: unknown[]; maxRows?: number; maxFileSizeMb?: number };
  options?: Array<{ value: string; label: string; parentValue?: string }>;
  dependsOnFieldKey?: string;
  reusableGroupId?: string;
  fieldAcl?: { readRoles?: BankRole[]; writeRoles?: BankRole[] };
}

export interface FormSectionDefinition {
  id: string;
  title: string;
  description?: string;
  fields: FormFieldDefinition[];
  reusableGroupIds?: string[];
  visibilityCondition?: ConditionGroup;
}

export interface FormFieldGroupDefinition {
  id: string;
  name: string;
  description?: string;
  fields: FormFieldDefinition[];
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
}

export interface FormDefinition {
  id: string;
  key: string;
  title: string;
  description: string;
  domain: EnterpriseDomain;
  lifecycle: WorkflowLifecycle;
  latestVersion: number;
  ownerId: string;
  maintainerIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FormVersion {
  id: string;
  formDefinitionId: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  sections: FormSectionDefinition[];
  changeLog: string;
  createdByUserId: string;
  createdAt: string;
}

export interface RequestTypeDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  domain: EnterpriseDomain;
  workType: UniversalWorkType;
  category: string;
  iconName: string;
  formDefinitionId: string;
  formVersion: number;
  workflowDefinitionId: string;
  workflowVersion?: number;
  policySetId: string;
  supportedChannels: Array<'EMPLOYEE_PORTAL' | 'AGENT' | 'MANAGER' | 'ADMIN' | 'API'>;
  visibility: 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL';
  isActive: boolean;
  tags: string[];
}

export interface WorkflowVariableDefinition {
  key: string;
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'DATETIME' | 'MONEY' | 'USER_REF' | 'GROUP_REF' | 'RECORD_REF' | 'LIST' | 'OBJECT';
  required?: boolean;
  sensitive?: boolean;
  description?: string;
  defaultValue?: unknown;
}

export interface WorkflowTriggerDefinition {
  id: string;
  type: TriggerType;
  eventName?: string;
  recordType?: string;
  schedule?: string;
  dateExpression?: string;
  condition?: ConditionGroup;
  enabled: boolean;
}

export interface WorkflowStageDefinition {
  id: string;
  key: string;
  title: string;
  description?: string;
  order: number;
  trigger: 'IMMEDIATE' | 'AFTER_PREVIOUS' | 'DATE_RELATIVE' | 'EVENT_DRIVEN' | 'CONDITION_BASED';
  triggerExpression?: string;
  nodeIds: string[];
  targetPolicyId?: string;
}

export interface AssignmentConfiguration {
  strategy:
    | 'FIXED_GROUP'
    | 'FIXED_PERSON'
    | 'REQUESTER_MANAGER'
    | 'EMPLOYEE_MANAGER'
    | 'DEPARTMENT_OWNER'
    | 'APPLICATION_OWNER'
    | 'SERVICE_OWNER'
    | 'CI_OWNER'
    | 'ROLE_BASED'
    | 'SKILL_BASED'
    | 'ROUND_ROBIN'
    | 'LOWEST_WORKLOAD'
    | 'ON_CALL'
    | 'RULE_ENGINE'
    | 'UNASSIGNED_TEAM_QUEUE';
  /** The department / branch that owns this human activity. */
  departmentId?: string;
  /** Optional AD-confirmed child section. When present it narrows the department queue and eligible employees. */
  sectionId?: string;
  groupId?: string;
  assigneeId?: string;
  role?: BankRole;
  capability?: string;
  expressionPath?: string;
  ruleSetId?: string;
}

export type ApprovalDepartmentSource =
  | 'STATIC'
  | 'REQUESTER_DEPARTMENT'
  | 'REQUESTER_PARENT_DEPARTMENT'
  | 'TICKET_DEPARTMENT'
  | 'TICKET_PARENT_DEPARTMENT';

export interface ApprovalConfiguration {
  approverSource: ApproverResolverType | 'DEPARTMENT_MEMBERS' | 'MANAGERS_MANAGER' | 'APPLICATION_OWNER' | 'CI_OWNER' | 'DYNAMIC_EXPRESSION';
  approvalMode: ApprovalMode;
  /** Selects the runtime origin of a department / branch approval route. */
  departmentSource?: ApprovalDepartmentSource;
  /** Used only when departmentSource is STATIC (or by legacy definitions). */
  departmentId?: string;
  specificUserIds?: string[];
  groupId?: string;
  role?: BankRole;
  dynamicPath?: string;
  quorumCount?: number;
  timeoutMinutes?: number;
  reminderMinutes?: number;
  escalationSource?: ApproverResolverType;
  commentsMandatoryOnReject?: boolean;
  allowDelegation?: boolean;
  expiresAfterMinutes?: number;
  rejectOutcome?: string;
  preventSelfApproval?: boolean;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialBackoffSeconds: number;
  multiplier: number;
  maxBackoffSeconds: number;
  timeoutSeconds?: number;
}

export interface CompensationConfiguration {
  onFailure?: boolean;
  onCancel?: boolean;
  actionType: 'SYSTEM_ACTION' | 'INTEGRATION_ACTION' | 'WEBHOOK_ACTION';
  connectorId?: string;
  actionKey: string;
  inputMapping?: Record<string, string>;
}

export interface WorkflowNodeDefinition {
  id: string;
  key: string;
  type: WorkflowNodeType;
  title: string;
  description?: string;
  stageId?: string;
  position: { x: number; y: number };
  instructions?: string;
  acceptanceCriteria?: string[];
  checklist?: string[];
  assignment?: AssignmentConfiguration;
  approval?: ApprovalConfiguration;
  condition?: ConditionGroup;
  join?: { strategy: 'ALL' | 'ANY' | 'QUORUM' | 'N_OF_M'; requiredCount?: number };
  timer?: { mode: 'DURATION' | 'ABSOLUTE' | 'CONTEXT_DATE_RELATIVE' | 'NEXT_BUSINESS_TIME'; durationMinutes?: number; datePath?: string; offsetMinutes?: number; businessCalendarId?: string };
  action?: { connectorId?: string; credentialReferenceId?: string; actionKey: string; inputMapping?: Record<string, string>; idempotencyKeyTemplate?: string; dryRunSupported?: boolean };
  notification?: { event: string; recipients: string[]; templateKey: string; deduplicationWindowMinutes?: number };
  subworkflow?: { workflowDefinitionId: string; version?: number; inputMapping?: Record<string, string> };
  inputConfig?: { fields: FormFieldDefinition[]; submitButtonLabel?: string; prompt?: string };
  outputSchema?: WorkflowVariableDefinition[];
  retryPolicy?: RetryPolicy;
  compensation?: CompensationConfiguration;
  timeoutMinutes?: number;
  permission?: { allowedRoles?: BankRole[]; confidential?: boolean };
}

export interface WorkflowEdgeDefinition {
  id: string;
  sourceNodeId: string;
  destinationNodeId: string;
  outcome?: string;
  branchLabel?: string;
  dependencyType?: 'FINISH_TO_START' | 'START_TO_START' | 'FINISH_TO_FINISH' | 'START_TO_FINISH';
  delayMinutes?: number;
  condition?: ConditionGroup;
}

export interface WorkflowDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  domain: EnterpriseDomain;
  defaultWorkType: UniversalWorkType;
  lifecycle: WorkflowLifecycle;
  scope: TemplateScope;
  /** Required for DEPARTMENT scope; enforced from the authenticated owner. */
  departmentId?: string;
  ownerId: string;
  maintainerIds: string[];
  latestVersion: number;
  tags: string[];
  iconName: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVersion {
  id: string;
  workflowDefinitionId: string;
  version: number;
  status: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'RETIRED';
  variables: WorkflowVariableDefinition[];
  triggers: WorkflowTriggerDefinition[];
  stages: WorkflowStageDefinition[];
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
  policySetId: string;
  policySetVersion: number;
  formDefinitionId?: string;
  formVersion?: number;
  changeLog: string;
  checksum: string;
  createdByUserId: string;
  createdAt: string;
  publishedAt?: string;
}

export interface WorkflowCatalogTemplate {
  id: string;
  workflowDefinitionId: string;
  publishedWorkflowVersion: number;
  title: string;
  purpose: string;
  domain: EnterpriseDomain;
  category: string;
  scope: TemplateScope;
  departmentId?: string;
  ownerId: string;
  maintainerIds: string[];
  tags: string[];
  iconName: string;
  estimatedDurationMinutes: number;
  stageCount: number;
  departmentCount: number;
  approvalCount: number;
  automationCount: number;
  runCount: number;
  successRate: number;
  favoriteUserIds: string[];
  lastUsedAt?: string;
  lifecycle: WorkflowLifecycle;
  changeLog: string;
  /** How this intake is presented to non-technical users. */
  kind?: WorkflowCatalogTemplateKind;
  /** Human-friendly group inherited from the source service catalogue. */
  catalogGroup?: string;
  /** Request type used to render the template-specific intake form. */
  requestTypeId?: string;
  /** Server-calculated catalog management permission for the current actor. */
  canDelete?: boolean;
  /** Server-calculated definition edit permission for the current actor. */
  canEdit?: boolean;
}

export interface WorkflowPolicySet {
  id: string;
  key: string;
  name: string;
  domain: EnterpriseDomain;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  routingRuleIds: string[];
  slaPolicyId?: string;
  businessCalendarId: string;
  priorityMechanism: 'IMPACT_URGENCY' | 'SECURITY_RISK' | 'DEV_VALUE_RISK' | 'LIFECYCLE' | 'FIXED';
  priorityRules: Array<{ when?: ConditionGroup; priority: string; explanation: string }>;
  escalationPolicy?: { warningPercent: number; escalationBeforeBreachMinutes: number; recipientPaths: string[] };
  notificationPolicyId?: string;
  permissionPolicy?: { visibility: 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL'; allowedRoles?: BankRole[]; allowedDepartmentIds?: string[]; fieldLevelAcl?: boolean };
}

export interface AssignmentRule {
  id: string;
  name: string;
  priority: number;
  condition?: ConditionGroup;
  assignment: AssignmentConfiguration;
  explanation: string;
  isActive: boolean;
}

export interface BusinessCalendar {
  id: string;
  name: string;
  timezone: string;
  workdays: number[];
  businessStart: string;
  businessEnd: string;
  holidays: string[];
  is24x7: boolean;
}

export interface ConnectorDefinition {
  id: string;
  key: string;
  name: string;
  category: 'SOURCE_CONTROL' | 'CI_CD' | 'IAM' | 'MICROSOFT_365' | 'HRIS' | 'CMDB' | 'MESSAGING' | 'MONITORING' | 'SECURITY' | 'PROCUREMENT' | 'ERP' | 'GENERIC';
  status: 'ACTIVE' | 'DISABLED' | 'DEGRADED';
  actionKeys: string[];
  credentialReferenceIds: string[];
  supportsDryRun: boolean;
  ownerId: string;
}

export interface NotificationPolicy {
  id: string;
  name: string;
  eventTypes: string[];
  recipientResolvers: Array<'REQUESTER' | 'EMPLOYEE' | 'MANAGER' | 'ASSIGNEE' | 'ASSIGNMENT_GROUP' | 'APPROVER' | 'WORKFLOW_OWNER' | 'DYNAMIC_ROLE'>;
  channels: Array<'IN_APP' | 'EMAIL' | 'TEAMS' | 'SLACK'>;
  templateKey: string;
  deduplicationWindowMinutes: number;
  digestWindowMinutes?: number;
  enabled: boolean;
}

export interface NotificationDelivery {
  id: string;
  workflowInstanceId: string;
  nodeInstanceId?: string;
  policyId?: string;
  eventType: string;
  recipientUserIds: string[];
  recipientGroupIds: string[];
  channels: string[];
  deduplicationKey: string;
  status: 'QUEUED' | 'SENT' | 'SUPPRESSED' | 'FAILED';
  createdAt: string;
  sentAt?: string;
}

export type WorkRelationType = 'PARENT' | 'CHILD' | 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO' | 'DUPLICATES' | 'CAUSED_BY' | 'REMEDIATES' | 'IMPLEMENTS' | 'DEPLOYS' | 'TRIGGERED_BY';

export interface WorkRelation {
  id: string;
  sourceType: 'WORKFLOW_INSTANCE' | 'WORK_ITEM' | 'TICKET' | 'ASSET' | 'APPLICATION';
  sourceId: string;
  targetType: 'WORKFLOW_INSTANCE' | 'WORK_ITEM' | 'TICKET' | 'ASSET' | 'APPLICATION';
  targetId: string;
  relationType: WorkRelationType;
  createdByUserId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowSlaClock {
  id: string;
  workflowInstanceId: string;
  clockType: 'FIRST_RESPONSE' | 'ASSIGNMENT' | 'RESOLUTION' | 'APPROVAL' | 'STAGE' | 'LIFECYCLE_TARGET';
  label: string;
  businessCalendarId: string;
  targetAt: string;
  status: 'RUNNING' | 'PAUSED' | 'MET' | 'AT_RISK' | 'BREACHED' | 'CANCELLED';
  elapsedMinutes: number;
  targetMinutes: number;
  pausedAt?: string;
  totalPausedMinutes: number;
  completedAt?: string;
  warningAt?: string;
  escalationAt?: string;
}

export interface TriggerReceipt {
  id: string;
  idempotencyKey: string;
  triggerType: Exclude<TriggerType, 'MANUAL'>;
  eventName: string;
  recordType?: string;
  source: string;
  context: Record<string, unknown>;
  receivedAt: string;
  processedAt?: string;
  launchedWorkflowInstanceIds: string[];
}

export interface WorkflowInstance {
  id: string;
  key: string;
  title: string;
  workflowDefinitionId: string;
  workflowVersion: number;
  formDefinitionId?: string;
  formVersion?: number;
  policySetId: string;
  policySetVersion: number;
  requestTypeId?: string;
  workType: UniversalWorkType;
  domain: EnterpriseDomain;
  triggerType: TriggerType;
  triggerEventId?: string;
  parentWorkflowInstanceId?: string;
  status: WorkflowInstanceStatus;
  currentStageId?: string;
  context: Record<string, unknown>;
  nodeOutputs: Record<string, Record<string, unknown>>;
  requesterId: string;
  ownerId: string;
  allowedUserIds: string[];
  allowedRoleIds: BankRole[];
  allowedDepartmentIds: string[];
  confidentiality: ConfidentialityTier;
  idempotencyKey?: string;
  version: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  failureReason?: string;
}

export interface NodeInstance {
  id: string;
  workflowInstanceId: string;
  nodeId: string;
  nodeKey: string;
  nodeType: WorkflowNodeType;
  stageId?: string;
  status: NodeInstanceStatus;
  attemptCount: number;
  logicalCompletionKey: string;
  activatedAt?: string;
  startedAt?: string;
  waitingUntil?: string;
  nextReminderAt?: string;
  nextAttemptAt?: string;
  completedAt?: string;
  outcome?: string;
  output?: Record<string, unknown>;
  error?: string;
  assignmentGroupId?: string;
  assigneeId?: string;
  routingExplanation?: string;
  workItemId?: string;
  approvalChainId?: string;
  childWorkflowInstanceId?: string;
  version: number;
}

export interface NodeAttempt {
  id: string;
  workflowInstanceId: string;
  nodeInstanceId: string;
  attempt: number;
  idempotencyKey: string;
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT';
  dryRun: boolean;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface DeadLetterRecord {
  id: string;
  workflowInstanceId: string;
  nodeInstanceId: string;
  nodeAttemptId: string;
  actionKey: string;
  idempotencyKey: string;
  error: string;
  status: 'OPEN' | 'REQUEUED' | 'RESOLVED';
  retryCount: number;
  failedAt: string;
  lastRetriedAt?: string;
  resolvedAt?: string;
}

export interface WorkItem {
  id: string;
  key: string;
  workflowInstanceId: string;
  nodeInstanceId: string;
  parentWorkItemId?: string;
  workType: UniversalWorkType;
  title: string;
  description?: string;
  instructions?: string;
  acceptanceCriteria: string[];
  checklist: Array<{ id: string; label: string; completed: boolean }>;
  status: WorkItemStatus;
  assignmentGroupId?: string;
  /** Server-resolved organisational queue scope. A section narrows its parent department. */
  targetDepartmentId?: string;
  targetSectionId?: string;
  assigneeId?: string;
  requesterId: string;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ExecutionEvent {
  id: string;
  sequence: number;
  workflowInstanceId: string;
  nodeInstanceId?: string;
  type:
    | 'WORKFLOW_STARTED'
    | 'WORKFLOW_COMPLETED'
    | 'WORKFLOW_FAILED'
    | 'WORKFLOW_CANCELLED'
    | 'NODE_READY'
    | 'NODE_STARTED'
    | 'NODE_WAITING'
    | 'NODE_COMPLETED'
    | 'NODE_FAILED'
    | 'NODE_RETRY_SCHEDULED'
    | 'NODE_COMPENSATED'
    | 'DEAD_LETTER_CREATED'
    | 'DEAD_LETTER_REQUEUED'
    | 'WORK_ITEM_CREATED'
    | 'WORK_ITEM_CLAIMED'
    | 'WORK_ITEM_COMPLETED'
    | 'TASK_CONFIRMED'
    | 'INFORMATION_SHARED'
    | 'COMMENT_ADDED'
    | 'APPROVAL_CREATED'
    | 'APPROVAL_DECIDED'
    | 'ROUTING_RESOLVED'
    | 'SLA_RESOLVED'
    | 'PERMISSION_DECISION'
    | 'NOTIFICATION_DISPATCHED'
    | 'INTEGRATION_ACTION'
    | 'RELATION_CREATED'
    | 'SLA_WARNING'
    | 'SLA_BREACHED'
    | 'TRIGGER_MATCHED'
    | 'INSTANCE_MIGRATED';
  actorId: string;
  actorName: string;
  timestamp: string;
  data: Record<string, unknown>;
  previousHash?: string;
  hash: string;
}

export interface PreflightIssue {
  severity: 'ERROR' | 'WARNING' | 'RECOMMENDATION';
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  remediation?: string;
}

export interface PreflightResult {
  valid: boolean;
  issues: PreflightIssue[];
  summary: { errors: number; warnings: number; recommendations: number };
}

export interface SimulationResult {
  workflowDefinitionId: string;
  workflowVersion: number;
  dryRun: true;
  context: Record<string, unknown>;
  selectedNodeIds: string[];
  skippedNodeIds: string[];
  branchDecisions: Array<{ nodeId: string; outcome: string; explanation: string }>;
  assignments: Array<{ nodeId: string; groupId?: string; assigneeId?: string; explanation: string }>;
  approvals: Array<{ nodeId: string; approverIds: string[]; mode: ApprovalMode }>;
  scheduledTimes: Array<{ nodeId: string; executeAt: string; explanation: string }>;
  actions: Array<{ nodeId: string; actionKey: string; input: Record<string, unknown>; executed: false }>;
  preflight: PreflightResult;
}
