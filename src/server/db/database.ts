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
  savedFilters: Array<{ id: string; name: string; jql: string; userId: string; isGlobal: boolean }>;
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
        return JSON.parse(raw);
      } catch (err) {
        console.error('Error reading database file, re-initializing...', err);
      }
    }
    return {
      divisions: [],
      departments: [],
      teams: [],
      users: [],
      workflows: [],
      slaPolicies: [],
      tickets: [],
      approvals: [],
      assets: [],
      applications: [],
      risks: [],
      comments: [],
      attachments: [],
      auditEvents: [],
      automationRules: [],
      queues: [],
      kbArticles: [],
      savedFilters: [],
    };
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
    this.persist();
  }
}

export const db = Database.getInstance();
