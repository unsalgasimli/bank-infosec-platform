import type { BankRole, SecurityDomain } from './auth.js';
import type { BusinessPriority, TechnicalSeverity, TicketCategory, TicketProjectCode } from './ticket.js';

export interface WorkflowParameterDefinition {
  id: string;
  label: string;
  type: 'TEXT' | 'TEXTAREA';
  required: boolean;
  placeholder?: string;
  helpText?: string;
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
  tags: string[];
}

export interface ProjectBlueprint {
  id: string;
  title: string;
  shortName?: string;
  domain: string;
  departmentId?: string;
  isCrossDepartment?: boolean;
  participatingDepartments?: string[];
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
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowRun {
  id: string;
  templateId?: string;
  templateVersion?: number;
  title: string;
  status: 'COMPLETED' | 'FAILED';
  idempotencyKey?: string;
  parameters: Record<string, string>;
  createdTicketIds: string[];
  createdByUserId: string;
  createdAt: string;
  error?: string;
}
