import type { BankRole, SecurityDomain } from './auth.js';
import type { RoutingStrategy } from './itsm.js';
import type { BusinessPriority, TechnicalSeverity, TicketCategory, TicketProjectCode } from './ticket.js';

export interface WorkflowParameterDefinition {
  id: string;
  label: string;
  type: 'TEXT' | 'TEXTAREA' | 'SELECT' | 'BOOLEAN' | 'NUMBER';
  required: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string;
  options?: Array<{ value: string; label: string }>;
  showIfFieldId?: string;
  showIfEquals?: string;
}

export type GraphNodeType =
  | 'TASK'
  | 'APPROVAL'
  | 'CONDITION'
  | 'PARALLEL_SPLIT'
  | 'PARALLEL_JOIN'
  | 'DELAY'
  | 'AUTOMATION'
  | 'NOTIFICATION'
  | 'MANUAL_DECISION'
  | 'SUB_WORKFLOW';

export type DependencyEdgeType =
  | 'FINISH_TO_START'
  | 'START_TO_START'
  | 'FINISH_TO_FINISH'
  | 'START_TO_FINISH';

export interface GraphDependencyEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  type: DependencyEdgeType;
  lagDays?: number;
  lagHours?: number;
  conditionExpression?: string;
}

export interface GraphNodeDefinition {
  id: string;
  type: GraphNodeType;
  title: string;
  description?: string;
  targetDepartment?: string;
  teamId?: string;
  assigneeId?: string;
  assigneeRole?: BankRole | string;
  routingStrategy?: RoutingStrategy;
  technicalSeverity?: TechnicalSeverity;
  businessPriority?: BusinessPriority;
  category?: TicketCategory;
  securityDomain?: SecurityDomain;
  slaPolicyId?: string;
  durationDays?: number;
  offsetDays?: number;
  tags?: string[];
  
  // Approval Node Configuration
  approvalMode?: 'ANY_ONE' | 'ALL_UNANIMOUS' | 'MAJORITY' | 'N_OF_M' | 'PERCENTAGE_QUORUM';
  approvalResolver?: 'SPECIFIC_USER' | 'ROLE' | 'REQUESTER_MANAGER' | 'DEPARTMENT_HEAD' | 'SERVICE_OWNER' | 'ASSET_OWNER' | 'CAB_BOARD';
  approvalQuorumCount?: number;
  approvalQuorumPercentage?: number;
  approvalDeadlineHours?: number;

  // Condition / Gateway Node Configuration
  conditionExpression?: string;

  // Parallel Join Policy
  joinPolicy?: 'WAIT_ALL' | 'WAIT_ANY';

  // Delay / Timer Configuration
  delayMinutes?: number;

  // Automation Action Configuration
  automationAction?: string;
  automationPayload?: Record<string, any>;

  // Notification Alert Configuration
  notificationRecipients?: string[];
  notificationMessage?: string;

  // Sub-workflow Configuration
  subWorkflowTemplateId?: string;

  // Visual layout coordinate for designer canvas
  position?: { x: number; y: number };
}

export interface BlueprintTaskTemplate {
  id?: string;
  title: string;
  description: string;
  technicalSeverity: TechnicalSeverity;
  businessPriority: BusinessPriority;
  category: TicketCategory;
  securityDomain?: SecurityDomain;
  targetDepartment?: string;
  teamId?: string;
  assigneeRole?: BankRole | string;
  assigneeId?: string;
  slaPolicyId?: string;
  offsetDays: number;
  durationDays: number;
  dependsOnIndex?: number | null;
  dependsOnTaskId?: string | null;
  dependencyType?: DependencyEdgeType;
  lagDays?: number;
  nodeType?: GraphNodeType;
  tags: string[];
}

export type BlueprintScope = 'COMPANY' | 'DEPARTMENT' | 'PERSONAL';
export type BlueprintLifecycleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface ProjectBlueprint {
  id: string;
  title: string;
  shortName?: string;
  domain: string;
  departmentId?: string;
  isCrossDepartment?: boolean;
  participatingDepartments?: string[];
  scope?: BlueprintScope;
  status?: BlueprintLifecycleStatus;
  ownerId?: string;
  createdByName?: string;
  taskCount: number;
  estimatedDays: number;
  description: string;
  iconName: string;
  projectCode?: TicketProjectCode;
  workflowId?: string;
  slaPolicyId?: string;
  version?: number;
  isActive?: boolean;
  parameters?: WorkflowParameterDefinition[];
  defaultTasks: BlueprintTaskTemplate[];
  nodes?: GraphNodeDefinition[];
  edges?: GraphDependencyEdge[];
  versionHistory?: Array<{
    version: number;
    updatedAt: string;
    updatedBy: string;
    changeSummary: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowRun {
  id: string;
  templateId?: string;
  templateVersion?: number;
  title: string;
  status: 'COMPLETED' | 'RUNNING' | 'FAILED' | 'CANCELLED';
  idempotencyKey?: string;
  parameters: Record<string, string>;
  createdTicketIds: string[];
  createdApprovalIds?: string[];
  dependencyEdges?: GraphDependencyEdge[];
  createdByUserId: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}
