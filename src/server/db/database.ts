import fs from 'fs';
import path from 'path';
import { BankDivision, BankDepartment, BankTeam, BankUser } from '../../shared/types/auth.js';
import { Ticket } from '../../shared/types/ticket.js';
import { Workflow } from '../../shared/types/workflow.js';
import { TicketApprovalChain } from '../../shared/types/approval.js';
import { SLAPolicy } from '../../shared/types/sla.js';
import { BankAsset, BankApplication } from '../../shared/types/asset.js';
import { RiskRegisterItem } from '../../shared/types/risk.js';
import { AuditEvent } from '../../shared/types/audit.js';
import { AutomationRule } from '../../shared/types/automation.js';
import { TicketComment } from '../../shared/types/comments.js';
import { TicketAttachment } from '../../shared/types/attachment.js';
import { TeamQueue } from '../../shared/types/queues.js';
import { KBArticle } from '../../shared/types/kb.js';
import { IdeaNode } from '../../shared/types/ideate.js';
import { GanttDependency } from '../../shared/types/gantt.js';
import { RequestFormDefinition, RequestFormSubmission } from '../../shared/types/request-forms.js';
import { ProjectBlueprint, WorkflowRun } from '../../shared/types/blueprints.js';
import { ProofingDocument } from '../../shared/types/proofing.js';
import { AppNotification } from '../../shared/types/notification.js';
import {
  TicketAIRecommendation,
  TicketRelationship,
  TicketSatisfaction,
  TicketSLAInstance,
  TicketTask,
  TicketWorklog,
} from '../../shared/types/itsm.js';

import { DepartmentConnection } from '../../shared/types/connections.js';
import type {
  AssignmentRule,
  BusinessCalendar,
  ConnectorDefinition,
  DeadLetterRecord,
  ExecutionEvent,
  FormDefinition,
  FormFieldGroupDefinition,
  FormVersion,
  NodeAttempt,
  NodeInstance,
  NotificationDelivery,
  NotificationPolicy,
  RequestTypeDefinition,
  TriggerReceipt,
  WorkItem,
  WorkRelation,
  WorkflowCatalogTemplate,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowPolicySet,
  WorkflowSlaClock,
  WorkflowVersion,
} from '../../shared/types/orchestration.js';

import { initialSeedData } from './seed.js';

export interface DatabaseSchema {
  divisions: BankDivision[];
  departments: BankDepartment[];
  teams: BankTeam[];
  users: BankUser[];
  workflows: Workflow[];
  slaPolicies: SLAPolicy[];
  tickets: Ticket[];
  approvals: TicketApprovalChain[];
  assets: BankAsset[];
  applications: BankApplication[];
  risks: RiskRegisterItem[];
  comments: TicketComment[];
  attachments: TicketAttachment[];
  auditEvents: AuditEvent[];
  automationRules: AutomationRule[];
  queues: TeamQueue[];
  kbArticles: KBArticle[];
  ideas: IdeaNode[];
  requestForms: RequestFormDefinition[];
  requestSubmissions: RequestFormSubmission[];
  blueprints: ProjectBlueprint[];
  workflowRuns: WorkflowRun[];
  proofingDocuments: ProofingDocument[];
  ganttDependencies: GanttDependency[];
  notifications: AppNotification[];
  connections: DepartmentConnection[];
  savedFilters: Array<{ id: string; name: string; jql: string; userId: string; isGlobal: boolean }>;
  ticketRelationships: TicketRelationship[];
  ticketTasks: TicketTask[];
  ticketWorklogs: TicketWorklog[];
  ticketSlaInstances: TicketSLAInstance[];
  ticketSatisfaction: TicketSatisfaction[];
  ticketAiRecommendations: TicketAIRecommendation[];
  workflowDefinitions: WorkflowDefinition[];
  workflowVersions: WorkflowVersion[];
  workflowCatalogTemplates: WorkflowCatalogTemplate[];
  formDefinitionsV2: FormDefinition[];
  formFieldGroupsV2: FormFieldGroupDefinition[];
  formVersions: FormVersion[];
  requestTypesV2: RequestTypeDefinition[];
  workflowPolicySets: WorkflowPolicySet[];
  assignmentRulesV2: AssignmentRule[];
  businessCalendarsV2: BusinessCalendar[];
  connectorDefinitions: ConnectorDefinition[];
  notificationPoliciesV2: NotificationPolicy[];
  workflowInstances: WorkflowInstance[];
  nodeInstances: NodeInstance[];
  nodeAttempts: NodeAttempt[];
  deadLetters: DeadLetterRecord[];
  workItemsV2: WorkItem[];
  workRelations: WorkRelation[];
  workflowSlaClocks: WorkflowSlaClock[];
  notificationDeliveries: NotificationDelivery[];
  triggerReceipts: TriggerReceipt[];
  executionEvents: ExecutionEvent[];
}

export class Database {
  private static instance: Database;
  private dbPath: string;
  private lastKnownMtimeMs = 0;
  public data: DatabaseSchema;

  private constructor() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const isTestRunner =
      process.env.NODE_ENV === 'test' ||
      process.argv.some((arg) => arg === '--test' || arg.includes('.test.ts') || arg.includes('test-concurrency'));
    const dbFileName = isTestRunner ? 'database.test.json' : 'database.json';
    this.dbPath = path.join(dataDir, dbFileName);
    this.data = this.loadOrInit();
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  private loadOrInit(): DatabaseSchema {
    if (fs.existsSync(this.dbPath)) {
      try {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.users)) {
          this.lastKnownMtimeMs = fs.statSync(this.dbPath).mtimeMs;
          // Ensure all required collections exist
          parsed.users = parsed.users || [];
          parsed.departments = parsed.departments || [];
          parsed.divisions = parsed.divisions || [];
          parsed.ideas = parsed.ideas || [];
          parsed.requestForms = parsed.requestForms || [];
          parsed.requestSubmissions = parsed.requestSubmissions || [];
          parsed.blueprints = parsed.blueprints || [];
          parsed.workflowRuns = parsed.workflowRuns || [];
          parsed.proofingDocuments = parsed.proofingDocuments || [];
          parsed.ganttDependencies = parsed.ganttDependencies || [];
          parsed.notifications = parsed.notifications || [];
          parsed.connections = parsed.connections || [];
          parsed.ticketRelationships = parsed.ticketRelationships || [];
          parsed.ticketTasks = parsed.ticketTasks || [];
          parsed.ticketWorklogs = parsed.ticketWorklogs || [];
          parsed.ticketSlaInstances = parsed.ticketSlaInstances || [];
          parsed.ticketSatisfaction = parsed.ticketSatisfaction || [];
          parsed.ticketAiRecommendations = parsed.ticketAiRecommendations || [];
          parsed.workflowDefinitions = parsed.workflowDefinitions || [];
          parsed.workflowVersions = parsed.workflowVersions || [];
          parsed.workflowCatalogTemplates = parsed.workflowCatalogTemplates || [];
          parsed.formDefinitionsV2 = parsed.formDefinitionsV2 || [];
          parsed.formFieldGroupsV2 = parsed.formFieldGroupsV2 || [];
          parsed.formVersions = parsed.formVersions || [];
          parsed.requestTypesV2 = parsed.requestTypesV2 || [];
          parsed.workflowPolicySets = parsed.workflowPolicySets || [];
          parsed.assignmentRulesV2 = parsed.assignmentRulesV2 || [];
          parsed.businessCalendarsV2 = parsed.businessCalendarsV2 || [];
          parsed.connectorDefinitions = parsed.connectorDefinitions || [];
          parsed.notificationPoliciesV2 = parsed.notificationPoliciesV2 || [];
          parsed.workflowInstances = parsed.workflowInstances || [];
          parsed.nodeInstances = parsed.nodeInstances || [];
          parsed.nodeAttempts = parsed.nodeAttempts || [];
          parsed.deadLetters = parsed.deadLetters || [];
          parsed.workItemsV2 = parsed.workItemsV2 || [];
          parsed.workRelations = parsed.workRelations || [];
          parsed.workflowSlaClocks = parsed.workflowSlaClocks || [];
          parsed.notificationDeliveries = parsed.notificationDeliveries || [];
          parsed.triggerReceipts = parsed.triggerReceipts || [];
          parsed.executionEvents = parsed.executionEvents || [];
          return parsed;
        }
      } catch (err) {
        console.error('Error reading database file, re-initializing...', err);
      }
    }
    const initial = JSON.parse(JSON.stringify(initialSeedData));
    this.data = initial;
    this.persist();
    return initial;
  }

  public persist(): void {
    try {
      // `sync:ad` runs as a separate CLI process. A long-lived API process
      // may still hold an older in-memory snapshot, so merge the durable AD
      // projection before any write. This prevents an unrelated ticket/audit
      // update from erasing a successful directory synchronization.
      if (fs.existsSync(this.dbPath)) {
        try {
          const persisted = JSON.parse(fs.readFileSync(this.dbPath, 'utf8')) as Partial<DatabaseSchema>;
          const persistedMtimeMs = fs.statSync(this.dbPath).mtimeMs;
          const directoryProjectionChangedExternally = persistedMtimeMs > this.lastKnownMtimeMs;
          const persistedDirectoryUsers = (persisted.users || []).filter((user) => user.directorySource === 'ACTIVE_DIRECTORY');
          const inMemoryDirectoryUsers = (this.data.users || []).filter((user) => user.directorySource === 'ACTIVE_DIRECTORY');
          if (persistedDirectoryUsers.length > 0 && (inMemoryDirectoryUsers.length === 0 || directoryProjectionChangedExternally)) {
            const directoryKeys = new Set(
              persistedDirectoryUsers.flatMap((user) => [user.id, user.username?.toLowerCase(), user.sAMAccountName?.toLowerCase(), user.email?.toLowerCase()].filter(Boolean))
            );
            this.data.users = [
              ...this.data.users.filter(
                (user) =>
                  !directoryKeys.has(user.id) &&
                  !directoryKeys.has(user.username?.toLowerCase()) &&
                  !directoryKeys.has(user.sAMAccountName?.toLowerCase()) &&
                  !directoryKeys.has(user.email?.toLowerCase())
              ),
              ...persistedDirectoryUsers,
            ];
          }

          const persistedDirectoryDepartments = (persisted.departments || []).filter(
            (department) => department.directorySource === 'ACTIVE_DIRECTORY'
          );
          const inMemoryDirectoryDepartments = (this.data.departments || []).filter(
            (department) => department.directorySource === 'ACTIVE_DIRECTORY'
          );
          if (persistedDirectoryDepartments.length > 0 && (inMemoryDirectoryDepartments.length === 0 || directoryProjectionChangedExternally)) {
            const directoryDepartmentIds = new Set(persistedDirectoryDepartments.map((department) => department.id));
            this.data.departments = [
              ...this.data.departments.filter((department) => !directoryDepartmentIds.has(department.id)),
              ...persistedDirectoryDepartments,
            ];
          }
        } catch {
          // The normal write below remains the recovery path for malformed or
          // partially-created local development data.
        }
      }

      const tempPath = `${this.dbPath}.${process.pid}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tempPath, this.dbPath);
      this.lastKnownMtimeMs = fs.statSync(this.dbPath).mtimeMs;
    } catch (err) {
      console.error('Failed to persist database file', err);
    }
  }

  public transaction<T>(operation: () => T): T {
    const snapshot = JSON.parse(JSON.stringify(this.data)) as DatabaseSchema;
    try {
      const result = operation();
      this.persist();
      return result;
    } catch (error) {
      this.data = snapshot;
      throw error;
    }
  }

  public reload(): DatabaseSchema {
    this.data = this.loadOrInit();
    return this.data;
  }

  public reset(seedData: DatabaseSchema): void {
    this.data = seedData;
    this.data.ticketRelationships ||= [];
    this.data.ticketTasks ||= [];
    this.data.ticketWorklogs ||= [];
    this.data.ticketSlaInstances ||= [];
    this.data.ticketSatisfaction ||= [];
    this.data.ticketAiRecommendations ||= [];
    this.data.workflowRuns ||= [];
    this.data.workflowDefinitions ||= [];
    this.data.workflowVersions ||= [];
    this.data.workflowCatalogTemplates ||= [];
    this.data.formDefinitionsV2 ||= [];
    this.data.formFieldGroupsV2 ||= [];
    this.data.formVersions ||= [];
    this.data.requestTypesV2 ||= [];
    this.data.workflowPolicySets ||= [];
    this.data.assignmentRulesV2 ||= [];
    this.data.businessCalendarsV2 ||= [];
    this.data.connectorDefinitions ||= [];
    this.data.notificationPoliciesV2 ||= [];
    this.data.workflowInstances ||= [];
    this.data.nodeInstances ||= [];
    this.data.nodeAttempts ||= [];
    this.data.deadLetters ||= [];
    this.data.workItemsV2 ||= [];
    this.data.workRelations ||= [];
    this.data.workflowSlaClocks ||= [];
    this.data.notificationDeliveries ||= [];
    this.data.triggerReceipts ||= [];
    this.data.executionEvents ||= [];
    this.persist();
  }
}

export const db = Database.getInstance();
