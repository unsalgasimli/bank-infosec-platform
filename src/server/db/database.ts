import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { BankDivision, BankDepartment, BankDepartmentSection, BankTeam, BankUser } from '../../shared/types/auth.js';
import { Ticket } from '../../shared/types/ticket.js';
import { Workflow } from '../../shared/types/workflow.js';
import { TicketApprovalChain } from '../../shared/types/approval.js';
import { SLAPolicy } from '../../shared/types/sla.js';
import { BankAsset, BankApplication } from '../../shared/types/asset.js';
import { CIRecordLink, CIRelationship, CIType, ConfigurationItem, RelationshipType } from '../../shared/types/cmdb.js';
import { RiskRegisterItem } from '../../shared/types/risk.js';
import { AuditEvent } from '../../shared/types/audit.js';
import { AutomationRule } from '../../shared/types/automation.js';
import { TicketComment } from '../../shared/types/comments.js';
import { TicketAttachment } from '../../shared/types/attachment.js';
import { TeamQueue } from '../../shared/types/queues.js';
import { KBArticle } from '../../shared/types/kb.js';
import { IdeaNode } from '../../shared/types/ideate.js';
import { GanttDependency } from '../../shared/types/gantt.js';
import { Project, ProjectActivity, ProjectMember, ProjectMilestone, ProjectRisk, ProjectStatusUpdate, ProjectTaskDependency } from '../../shared/types/project.js';
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

import { createEmptyDatabaseSchema } from './seed.js';
import { config } from '../config/index.js';
import { PostgresProjectionRepository } from './postgres/projection-repository.js';
import { OutboxService } from '../services/outbox.service.js';

export interface DatabaseSchema {
  divisions: BankDivision[];
  departments: BankDepartment[];
  departmentSections: BankDepartmentSection[];
  teams: BankTeam[];
  users: BankUser[];
  workflows: Workflow[];
  slaPolicies: SLAPolicy[];
  tickets: Ticket[];
  approvals: TicketApprovalChain[];
  assets: BankAsset[];
  applications: BankApplication[];
  cmdbTypes: CIType[];
  cmdbRelationshipTypes: RelationshipType[];
  configurationItems: ConfigurationItem[];
  ciRelationships: CIRelationship[];
  ciRecordLinks: CIRecordLink[];
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
  projects: Project[];
  projectMembers: ProjectMember[];
  projectMilestones: ProjectMilestone[];
  projectTaskDependencies: ProjectTaskDependency[];
  projectStatusUpdates: ProjectStatusUpdate[];
  projectRisks: ProjectRisk[];
  projectActivities: ProjectActivity[];
}

const isUnitTestProcess = () =>
  process.env.NODE_ENV === 'test' ||
  process.argv.some((argument) => argument === '--test' || argument.includes('.test.ts') || argument.includes('test-concurrency'));

export class Database {
  private static instance: Database;
  private postgresWriteQueue: Promise<void> = Promise.resolve();
  private postgresLastWriteError: Error | null = null;
  private postgresQueuedSnapshotChecksum: string | null = null;
  private currentData: DatabaseSchema;
  private readonly isolatedProjection = new AsyncLocalStorage<{ data: DatabaseSchema }>();
  public get data(): DatabaseSchema { return this.isolatedProjection.getStore()?.data ?? this.currentData; }
  public set data(data: DatabaseSchema) {
    const isolated = this.isolatedProjection.getStore();
    if (isolated) isolated.data = data;
    else this.currentData = data;
  }

  private constructor() {
    this.currentData = this.loadOrInit();
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  private loadOrInit(): DatabaseSchema {
    // Runtime state is hydrated from PostgreSQL after migrations. In tests and
    // explicit memory mode this is only an isolated process-local projection;
    // no operational JSON file is ever read or written.
    return createEmptyDatabaseSchema();
  }

  public async initialize(): Promise<void> {
    if (config.DB_TYPE !== 'postgres') return;
    await PostgresProjectionRepository.protectLegacyIdentityData();
    this.data = await PostgresProjectionRepository.hydrate();
    this.postgresQueuedSnapshotChecksum = this.snapshotChecksum(this.data);
  }

  private snapshotChecksum(data: DatabaseSchema): string {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  public persist(): void {
    // A caller-owned transaction explicitly persists this staged snapshot.
    // Never enqueue it on the process-wide compatibility write queue.
    if (this.isolatedProjection.getStore()) return;
    if (config.DB_TYPE === 'postgres') {
      if (isUnitTestProcess()) return;
      const serialized = JSON.stringify(this.data);
      const checksum = crypto.createHash('sha256').update(serialized).digest('hex');
      const pendingOutboxEvents = OutboxService.pending();
      if (checksum === this.postgresQueuedSnapshotChecksum && pendingOutboxEvents.length === 0) return;
      this.postgresQueuedSnapshotChecksum = checksum;
      const snapshot = JSON.parse(serialized) as DatabaseSchema;
      // Keep writes ordered. Every caller still receives the synchronous
      // compatibility API, while the HTTP boundary flushes the committed
      // PostgreSQL transaction before returning a response.
      this.postgresWriteQueue = this.postgresWriteQueue
        .catch(() => undefined)
        .then(() => PostgresProjectionRepository.persist(snapshot, pendingOutboxEvents))
        .then(
          () => {
            OutboxService.markCommitted(pendingOutboxEvents.map((event) => event.id));
            this.postgresLastWriteError = null;
          },
          (error: unknown) => {
            this.postgresLastWriteError = error instanceof Error ? error : new Error(String(error));
            this.postgresQueuedSnapshotChecksum = null;
          }
        );
      return;
    }
    // Memory mode is intentionally non-persistent. PostgreSQL is the only
    // durable application store.
  }

  public transaction<T>(operation: () => T, options: { persist?: boolean } = {}): T {
    const snapshot = JSON.parse(JSON.stringify(this.data)) as DatabaseSchema;
    const outboxCheckpoint = OutboxService.checkpoint();
    try {
      const result = operation();
      if (options.persist !== false) this.persist();
      return result;
    } catch (error) {
      this.data = snapshot;
      OutboxService.rollbackTo(outboxCheckpoint);
      throw error;
    }
  }

  public async flush(): Promise<void> {
    if (this.isolatedProjection.getStore()) return;
    if (config.DB_TYPE !== 'postgres') return;
    await this.postgresWriteQueue;
    if (this.postgresLastWriteError) throw this.postgresLastWriteError;
  }

  public async persistAsync(): Promise<void> {
    this.persist();
    await this.flush();
  }

  /** Keep async projection work private until its database transaction commits. */
  public async stageProjection<T>(data: DatabaseSchema, operation: () => Promise<T>): Promise<{ value: T; data: DatabaseSchema }> {
    if (this.isolatedProjection.getStore()) throw new Error('Nested staged projections are not supported.');
    const scope = { data: structuredClone(data) };
    return this.isolatedProjection.run(scope, async () => ({ value: await operation(), data: scope.data }));
  }

  /** Publish committed data without reverting process-local concurrent edits. */
  public publishCommittedProjection(before: DatabaseSchema, committed: DatabaseSchema): void {
    for (const [collection, committedItems] of Object.entries(committed)) {
      if (!Array.isArray(committedItems)) continue;
      const oldItems = (before as any)[collection] as Array<{ id?: string }>;
      const currentItems = (this.currentData as any)[collection] as Array<{ id?: string }>;
      if (!Array.isArray(oldItems) || !Array.isArray(currentItems)) continue;
      const old = new Map(oldItems.map((item) => [item.id, item]));
      const next = new Map(committedItems.map((item: any) => [item.id, item]));
      const retained = currentItems.flatMap((item) => {
        if (!item.id || JSON.stringify(item) !== JSON.stringify(old.get(item.id))) return [item];
        const replacement = next.get(item.id);
        return replacement ? [structuredClone(replacement)] : [];
      });
      const present = new Set(currentItems.map((item) => item.id));
      for (const item of committedItems) if (item.id && !present.has(item.id) && !old.has(item.id)) retained.push(structuredClone(item));
      (this.currentData as any)[collection] = retained;
    }
    PostgresProjectionRepository.acceptCommittedSnapshot(committed);
    this.postgresQueuedSnapshotChecksum = null;
  }

  public reload(): DatabaseSchema {
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
    this.data.cmdbTypes ||= [];
    this.data.cmdbRelationshipTypes ||= [];
    this.data.configurationItems ||= [];
    this.data.ciRelationships ||= [];
    this.data.ciRecordLinks ||= [];
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
    this.data.projects ||= [];
    this.data.projectMembers ||= [];
    this.data.projectMilestones ||= [];
    this.data.projectTaskDependencies ||= [];
    this.data.projectStatusUpdates ||= [];
    this.data.projectRisks ||= [];
    this.data.projectActivities ||= [];
    this.persist();
  }
}

export const db = Database.getInstance();
