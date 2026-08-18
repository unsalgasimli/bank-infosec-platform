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
}

export class Database {
  private static instance: Database;
  private dbPath: string;
  public data: DatabaseSchema;

  private constructor() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'database.json');
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
        if (parsed.users && parsed.users.length > 0) {
          // Ensure all arrays exist even if loaded from older db version
          parsed.ideas = parsed.ideas || JSON.parse(JSON.stringify(initialSeedData.ideas || []));
          parsed.requestForms = parsed.requestForms || JSON.parse(JSON.stringify(initialSeedData.requestForms || []));
          for (const seededForm of initialSeedData.requestForms || []) {
            const existingForm = parsed.requestForms.find((form: RequestFormDefinition) => form.id === seededForm.id);
            if (!existingForm) parsed.requestForms.push(JSON.parse(JSON.stringify(seededForm)));
            else {
              for (const seededField of seededForm.fields) {
                if (!existingForm.fields.some((field: RequestFormDefinition['fields'][number]) => field.id === seededField.id)) {
                  existingForm.fields.push(JSON.parse(JSON.stringify(seededField)));
                }
              }
            }
          }
          parsed.requestSubmissions = parsed.requestSubmissions || JSON.parse(JSON.stringify(initialSeedData.requestSubmissions || []));
          parsed.blueprints = parsed.blueprints || JSON.parse(JSON.stringify(initialSeedData.blueprints || []));
          for (const seededBlueprint of initialSeedData.blueprints || []) {
            const existingBlueprint = parsed.blueprints.find((item: ProjectBlueprint) => item.id === seededBlueprint.id);
            if (!existingBlueprint) parsed.blueprints.push(JSON.parse(JSON.stringify(seededBlueprint)));
            else {
              for (const key of ['shortName', 'version', 'isActive', 'projectCode', 'workflowId', 'slaPolicyId', 'parameters'] as const) {
                if (existingBlueprint[key] === undefined && seededBlueprint[key] !== undefined) {
                  existingBlueprint[key] = JSON.parse(JSON.stringify(seededBlueprint[key]));
                }
              }
            }
          }
          parsed.workflowRuns = parsed.workflowRuns || [];
          parsed.proofingDocuments = parsed.proofingDocuments || JSON.parse(JSON.stringify(initialSeedData.proofingDocuments || []));
          parsed.ganttDependencies = parsed.ganttDependencies || JSON.parse(JSON.stringify(initialSeedData.ganttDependencies || []));
          parsed.notifications = parsed.notifications || JSON.parse(JSON.stringify(initialSeedData.notifications || []));
          parsed.connections = parsed.connections && parsed.connections.length > 0 ? parsed.connections : JSON.parse(JSON.stringify(initialSeedData.connections || []));
          parsed.ticketRelationships = parsed.ticketRelationships || [];
          parsed.ticketTasks = parsed.ticketTasks || [];
          parsed.ticketWorklogs = parsed.ticketWorklogs || [];
          parsed.ticketSlaInstances = parsed.ticketSlaInstances || [];
          parsed.ticketSatisfaction = parsed.ticketSatisfaction || [];
          parsed.ticketAiRecommendations = parsed.ticketAiRecommendations || [];
          for (const seededWorkflow of initialSeedData.workflows || []) {
            const existingIndex = parsed.workflows.findIndex((workflow: Workflow) => workflow.id === seededWorkflow.id);
            if (existingIndex === -1) parsed.workflows.push(JSON.parse(JSON.stringify(seededWorkflow)));
            else if ((parsed.workflows[existingIndex].version || 0) < seededWorkflow.version) {
              parsed.workflows[existingIndex] = JSON.parse(JSON.stringify(seededWorkflow));
            }
          }
          parsed.departments = parsed.departments && parsed.departments.length >= 5 ? parsed.departments : JSON.parse(JSON.stringify(initialSeedData.departments || []));
          parsed.divisions = parsed.divisions && parsed.divisions.length >= 4 ? parsed.divisions : JSON.parse(JSON.stringify(initialSeedData.divisions || []));
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
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to persist database file', err);
    }
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
    this.persist();
  }
}

export const db = Database.getInstance();
