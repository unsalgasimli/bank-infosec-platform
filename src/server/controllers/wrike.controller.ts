import { Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { logger } from '../services/logger.service.js';
import { AuditService } from '../services/audit.service.js';
import { SLAService } from '../services/sla.service.js';
import { AutomationService } from '../services/automation.service.js';
import { IdeaNode } from '../../shared/types/ideate.js';
import { Ticket } from '../../shared/types/ticket.js';
import { RequestFormDefinition, RequestFormSubmission } from '../../shared/types/request-forms.js';
import { ProjectBlueprint } from '../../shared/types/blueprints.js';
import { ProofingDocument } from '../../shared/types/proofing.js';
import { BankUser } from '../../shared/types/auth.js';

export class WrikeController {
  // ==========================================
  // 1. WRIKE IDEATE & BRAINSTORMING CANVAS API
  // ==========================================

  public static async listIdeas(req: Request, res: Response): Promise<void> {
    try {
      const ideas = db.data.ideas || [];
      res.json({ success: true, ideas });
    } catch (err: any) {
      logger.error({ err }, 'Failed to list ideas');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async createIdea(req: Request, res: Response): Promise<void> {
    try {
      const { title, description, category, color, x, y, priority, assignee, tags } = req.body;
      if (!title) {
        res.status(400).json({ success: false, error: 'Idea title is required' });
        return;
      }

      const currentUser: BankUser = (req as any).user || db.data.users[0];

      const newIdea: IdeaNode = {
        id: `idea-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: title.trim(),
        description: description?.trim() || '',
        category: category || 'GENERAL',
        color: color || 'green',
        x: Number(x) || 100,
        y: Number(y) || 100,
        status: 'IDEA',
        priority: priority || 'P2_HIGH',
        assignee: assignee || currentUser.fullName,
        tags: tags || ['IDEATE'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.data.ideas = db.data.ideas || [];
      db.data.ideas.push(newIdea);
      db.persist();

      AuditService.log({
        actor: currentUser,
        action: 'TICKET_CREATED',
        entityType: 'TICKET',
        entityId: newIdea.id,
        entityKey: newIdea.id,
        metadata: { action: 'CREATED_IDEATE_NOTE', title: newIdea.title, category: newIdea.category },
      });

      res.status(201).json({ success: true, idea: newIdea });
    } catch (err: any) {
      logger.error({ err }, 'Failed to create idea');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async updateIdea(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      const idea = (db.data.ideas || []).find((i) => i.id === id);
      if (!idea) {
        res.status(404).json({ success: false, error: 'Idea not found' });
        return;
      }

      Object.assign(idea, updates, { updatedAt: new Date().toISOString() });
      db.persist();

      res.json({ success: true, idea });
    } catch (err: any) {
      logger.error({ err }, 'Failed to update idea');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async deleteIdea(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      db.data.ideas = (db.data.ideas || []).filter((i) => i.id !== id);
      db.persist();

      res.json({ success: true, message: 'Idea deleted' });
    } catch (err: any) {
      logger.error({ err }, 'Failed to delete idea');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async convertIdeaToTask(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const idea = (db.data.ideas || []).find((i) => i.id === id);
      if (!idea) {
        res.status(404).json({ success: false, error: 'Idea not found' });
        return;
      }

      const currentUser: BankUser = (req as any).user || db.data.users[0];
      const count = db.data.tickets.length + 1;
      const ticketKey = `SEC-2026-${String(count).padStart(4, '0')}`;
      const ticketId = `tick-${uuidv4().substring(0, 8)}`;
      const now = new Date().toISOString();

      const workflow = db.data.workflows[0] || {
        id: 'wf-secops-v1',
        states: [{ id: 'st-open', name: 'Open', category: 'TO_DO', color: '#657694', isInitial: true }],
      };
      const initialStatus = workflow.states.find((s) => s.isInitial) || workflow.states[0];

      const newTicket: Ticket = {
        id: ticketId,
        key: ticketKey,
        projectCode: 'SEC',
        ticketTypeId: idea.category === 'INCIDENT_IR' ? 'type-incident' : 'type-vuln',
        ticketTypeName: idea.category === 'INCIDENT_IR' ? 'Security Incident' : 'Cyber Security Initiative',
        category: idea.category === 'INCIDENT_IR' ? 'INCIDENT' : idea.category === 'COMPLIANCE' ? 'SECURITY_REVIEW' : 'VULNERABILITY',
        securityDomain: idea.category === 'INCIDENT_IR' ? 'SOC' : idea.category === 'COMPLIANCE' ? 'GRC' : 'APPSEC',
        title: idea.title,
        description: `${idea.description}\n\n*Converted from Wrike Ideate Canvas (${idea.category})*`,
        statusId: initialStatus.id,
        statusName: initialStatus.name,
        statusCategory: initialStatus.category,
        workflowId: workflow.id,
        workflowVersion: 1,
        technicalSeverity: idea.priority === 'P1_URGENT' ? 'CRITICAL' : 'HIGH',
        businessPriority: idea.priority,
        businessImpact: 'SIGNIFICANT',
        inherentRisk: 'HIGH',
        residualRisk: 'MEDIUM',
        riskScore: 70,
        confidentiality: 'RESTRICTED',
        restrictedUserIds: [],
        restrictedTeamIds: [],
        reporterId: currentUser.id,
        assigneeId: currentUser.id,
        securityOwnerId: currentUser.id,
        departmentId: currentUser.departmentId,
        watcherIds: [currentUser.id],
        tags: [...idea.tags, 'WRIKE_IDEATE_CONVERTED'],
        customFields: [],
        createdAt: now,
        updatedAt: now,
        detectedAt: now,
        dueDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        remediationDeadline: new Date(Date.now() + 86400000 * 3).toISOString(),
        slaPolicyId: 'sla-tier1-banking',
        slaState: 'SAFE',
        version: 1,
      };

      const sla = SLAService.calculateSLA(newTicket);
      newTicket.slaState = sla.state;
      newTicket.slaRemainingMinutes = sla.remainingMinutes;

      db.data.tickets.unshift(newTicket);

      // Update idea status
      idea.status = 'CONVERTED';
      idea.convertedTicketKey = ticketKey;
      idea.convertedTicketId = ticketId;
      idea.updatedAt = now;

      db.persist();

      AuditService.log({
        actor: currentUser,
        action: 'TICKET_CREATED',
        entityType: 'TICKET',
        entityId: ticketId,
        entityKey: ticketKey,
        metadata: { action: 'CONVERTED_IDEATE_TO_TASK', ideaId: idea.id, title: idea.title },
      });

      AutomationService.triggerEvent('TICKET_CREATED', newTicket, currentUser);

      res.json({ success: true, ticket: newTicket, idea });
    } catch (err: any) {
      logger.error({ err }, 'Failed to convert idea to task');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ==========================================
  // 2. WRIKE GANTT CHART & SCHEDULE API
  // ==========================================

  public static async getGanttSchedule(req: Request, res: Response): Promise<void> {
    try {
      const tickets = db.data.tickets || [];
      const dependencies = db.data.ganttDependencies || [];

      const tasks = tickets.map((t, idx) => {
        const startDate = new Date(Date.now() - (7 - (idx % 5)) * 86400000).toISOString();
        const durationDays = t.technicalSeverity === 'CRITICAL' ? 3 : t.technicalSeverity === 'HIGH' ? 7 : 14;
        const endDate = new Date(new Date(startDate).getTime() + durationDays * 86400000).toISOString();

        return {
          id: t.id,
          ticketKey: t.key,
          title: t.title,
          startDate,
          endDate,
          progressPercent: t.statusCategory === 'DONE' ? 100 : t.statusCategory === 'IN_PROGRESS' ? 60 : 15,
          isMilestone: t.technicalSeverity === 'CRITICAL' || t.businessPriority === 'P1_URGENT',
          isCriticalPath: idx === 0 || t.technicalSeverity === 'CRITICAL',
          dependencies: dependencies.filter((d) => d.toTaskId === t.id).map((d) => d.fromTaskId),
          statusCategory: t.statusCategory,
          technicalSeverity: t.technicalSeverity,
        };
      });

      res.json({
        success: true,
        tasks,
        dependencies,
        criticalPathTaskIds: tasks.filter((t) => t.isCriticalPath).map((t) => t.id),
      });
    } catch (err: any) {
      logger.error({ err }, 'Failed to get gantt schedule');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async addGanttDependency(req: Request, res: Response): Promise<void> {
    try {
      const { fromTaskId, toTaskId, type } = req.body;
      if (!fromTaskId || !toTaskId) {
        res.status(400).json({ success: false, error: 'fromTaskId and toTaskId are required' });
        return;
      }

      const newDep = {
        id: `dep-${Date.now()}`,
        fromTaskId,
        toTaskId,
        type: type || 'FINISH_TO_START',
      };

      db.data.ganttDependencies = db.data.ganttDependencies || [];
      db.data.ganttDependencies.push(newDep);
      db.persist();

      res.status(201).json({ success: true, dependency: newDep });
    } catch (err: any) {
      logger.error({ err }, 'Failed to add gantt dependency');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ==========================================
  // 3. WRIKE WORKLOAD & CAPACITY MANAGEMENT API
  // ==========================================

  public static async getWorkload(req: Request, res: Response): Promise<void> {
    try {
      const users = db.data.users || [];
      const tickets = db.data.tickets || [];

      const members = users.map((u) => {
        const assignedTickets = tickets.filter((t) => t.assigneeId === u.id && t.statusCategory !== 'DONE');
        const maxWeeklyHours = 40;
        const allocatedWeeklyHours = assignedTickets.reduce((acc, t) => {
          const h = t.technicalSeverity === 'CRITICAL' ? 12 : t.technicalSeverity === 'HIGH' ? 8 : 4;
          return acc + h;
        }, 10);

        const utilizationPercent = Math.round((allocatedWeeklyHours / maxWeeklyHours) * 100);

        return {
          userId: u.id,
          name: u.fullName,
          title: u.title,
          avatar: u.fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2),
          role: u.roles[0],
          maxWeeklyHours,
          allocatedWeeklyHours,
          utilizationPercent,
          isOverAllocated: allocatedWeeklyHours > maxWeeklyHours,
          assignedTicketIds: assignedTickets.map((t) => t.id),
        };
      });

      const totalTeamCapacityHours = members.reduce((acc, m) => acc + m.maxWeeklyHours, 0);
      const totalAllocatedHours = members.reduce((acc, m) => acc + m.allocatedWeeklyHours, 0);
      const overallUtilizationPercent = Math.round((totalAllocatedHours / (totalTeamCapacityHours || 1)) * 100);

      res.json({
        success: true,
        selectedWeek: 'Current Sprint Week (Aug 18 - Aug 24)',
        totalTeamCapacityHours,
        totalAllocatedHours,
        overallUtilizationPercent,
        members,
      });
    } catch (err: any) {
      logger.error({ err }, 'Failed to get workload');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async rebalanceWorkload(req: Request, res: Response): Promise<void> {
    try {
      const { fromUserId, toUserId, ticketId } = req.body;
      const currentUser: BankUser = (req as any).user || db.data.users[0];
      const ticket = (db.data.tickets || []).find((t) => t.id === ticketId);
      if (!ticket) {
        res.status(404).json({ success: false, error: 'Ticket not found' });
        return;
      }

      ticket.assigneeId = toUserId;
      ticket.updatedAt = new Date().toISOString();
      db.persist();

      AuditService.log({
        actor: currentUser,
        action: 'ASSIGNMENT_CHANGED',
        entityType: 'TICKET',
        entityId: ticket.id,
        entityKey: ticket.key,
        metadata: { action: 'WORKLOAD_REBALANCED', fromUserId, toUserId },
      });

      res.json({ success: true, message: 'Workload successfully rebalanced', ticket });
    } catch (err: any) {
      logger.error({ err }, 'Failed to rebalance workload');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ==========================================
  // 4. WRIKE DYNAMIC REQUEST FORMS API
  // ==========================================

  public static async listRequestForms(req: Request, res: Response): Promise<void> {
    try {
      const forms = db.data.requestForms || [];
      res.json({ success: true, forms });
    } catch (err: any) {
      logger.error({ err }, 'Failed to list request forms');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async submitRequestForm(req: Request, res: Response): Promise<void> {
    try {
      const { id: formId } = req.params;
      const { values } = req.body;

      const form = (db.data.requestForms || []).find((f) => f.id === formId);
      if (!form) {
        res.status(404).json({ success: false, error: 'Request form not found' });
        return;
      }

      const currentUser: BankUser = (req as any).user || db.data.users[0];
      const count = db.data.tickets.length + 1;
      const ticketKey = `SEC-2026-${String(count).padStart(4, '0')}`;
      const ticketId = `tick-${uuidv4().substring(0, 8)}`;
      const now = new Date().toISOString();

      const workflow = db.data.workflows[0];
      const initialStatus = workflow.states.find((s) => s.isInitial) || workflow.states[0];

      const newTicket: Ticket = {
        id: ticketId,
        key: ticketKey,
        projectCode: 'SEC',
        ticketTypeId: form.defaultTicketType as any,
        ticketTypeName: form.title,
        category: form.defaultTicketType as any,
        securityDomain: form.category.includes('SOC') ? 'SOC' : form.category.includes('GRC') ? 'GRC' : 'APPSEC',
        title: values?.title || `[${form.title}] ${values?.targetSystem || 'Banking System'}`,
        description: `### ${form.title}\n\n**Destination**: ${form.destinationFolder}\n\n**Justification / Details**:\n${values?.justification || 'Submitted via Wrike Request Portal'}\n\n**Parameters**:\n${JSON.stringify(values, null, 2)}`,
        statusId: initialStatus.id,
        statusName: initialStatus.name,
        statusCategory: initialStatus.category,
        workflowId: workflow.id,
        workflowVersion: 1,
        technicalSeverity: (values?.urgency === 'EMERGENCY' ? 'CRITICAL' : form.defaultSeverity) as any,
        businessPriority: (values?.urgency === 'EMERGENCY' ? 'P1_URGENT' : form.defaultPriority) as any,
        businessImpact: 'SIGNIFICANT',
        inherentRisk: 'HIGH',
        residualRisk: 'MEDIUM',
        riskScore: 75,
        confidentiality: 'RESTRICTED',
        restrictedUserIds: [],
        restrictedTeamIds: [],
        reporterId: currentUser.id,
        assigneeId: currentUser.id,
        securityOwnerId: currentUser.id,
        departmentId: currentUser.departmentId,
        watcherIds: [currentUser.id],
        tags: ['WRIKE_FORM', form.id.toUpperCase()],
        customFields: [],
        createdAt: now,
        updatedAt: now,
        detectedAt: now,
        dueDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        remediationDeadline: new Date(Date.now() + 86400000 * 3).toISOString(),
        slaPolicyId: 'sla-tier1-banking',
        slaState: 'SAFE',
        version: 1,
      };

      const sla = SLAService.calculateSLA(newTicket);
      newTicket.slaState = sla.state;
      newTicket.slaRemainingMinutes = sla.remainingMinutes;

      db.data.tickets.unshift(newTicket);

      const submission: RequestFormSubmission = {
        id: `sub-${Date.now()}`,
        formId: form.id,
        submittedByUserId: currentUser.id,
        submittedByUserName: currentUser.fullName,
        values: values || {},
        createdTicketId: ticketId,
        createdTicketKey: ticketKey,
        createdAt: now,
      };

      db.data.requestSubmissions = db.data.requestSubmissions || [];
      db.data.requestSubmissions.push(submission);

      db.persist();

      AuditService.log({
        actor: currentUser,
        action: 'TICKET_CREATED',
        entityType: 'TICKET',
        entityId: ticketId,
        entityKey: ticketKey,
        metadata: { action: 'SUBMITTED_REQUEST_FORM', formId: form.id, title: newTicket.title },
      });

      AutomationService.triggerEvent('TICKET_CREATED', newTicket, currentUser);

      res.status(201).json({ success: true, ticket: newTicket, submission });
    } catch (err: any) {
      logger.error({ err }, 'Failed to submit request form');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ==========================================
  // 5. WRIKE AUTOMATIONS & BLUEPRINTS API
  // ==========================================

  public static async listAutomations(req: Request, res: Response): Promise<void> {
    try {
      const rules = db.data.automationRules || [];
      res.json({ success: true, rules });
    } catch (err: any) {
      logger.error({ err }, 'Failed to list automations');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async listBlueprints(req: Request, res: Response): Promise<void> {
    try {
      const blueprints = db.data.blueprints || [];
      res.json({ success: true, blueprints });
    } catch (err: any) {
      logger.error({ err }, 'Failed to list blueprints');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async launchBlueprint(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const bp = (db.data.blueprints || []).find((b) => b.id === id);
      if (!bp) {
        res.status(404).json({ success: false, error: 'Blueprint not found' });
        return;
      }

      const currentUser: BankUser = (req as any).user || db.data.users[0];
      const createdTickets: Ticket[] = [];
      const workflow = db.data.workflows[0];
      const initialStatus = workflow.states.find((s) => s.isInitial) || workflow.states[0];
      const now = new Date().toISOString();

      for (let i = 0; i < bp.defaultTasks.length; i++) {
        const taskDef = bp.defaultTasks[i];
        const count = db.data.tickets.length + 1;
        const ticketKey = `SEC-2026-${String(count).padStart(4, '0')}`;
        const ticketId = `tick-${uuidv4().substring(0, 8)}`;

        const newTicket: Ticket = {
          id: ticketId,
          key: ticketKey,
          projectCode: 'SEC',
          ticketTypeId: taskDef.category === 'INCIDENT' ? 'type-incident' : 'type-vuln',
          ticketTypeName: taskDef.title,
          category: taskDef.category,
          securityDomain: taskDef.category === 'INCIDENT' ? 'SOC' : taskDef.category === 'SECURITY_REVIEW' ? 'GRC' : 'APPSEC',
          title: taskDef.title,
          description: `${taskDef.description}\n\n*Created from Wrike Project Blueprint: ${bp.title}*`,
          statusId: initialStatus.id,
          statusName: initialStatus.name,
          statusCategory: initialStatus.category,
          workflowId: workflow.id,
          workflowVersion: 1,
          technicalSeverity: taskDef.technicalSeverity,
          businessPriority: taskDef.businessPriority,
          businessImpact: 'SIGNIFICANT',
          inherentRisk: 'HIGH',
          residualRisk: 'LOW',
          riskScore: 65,
          confidentiality: 'RESTRICTED',
          restrictedUserIds: [],
          restrictedTeamIds: [],
          reporterId: currentUser.id,
          assigneeId: currentUser.id,
          securityOwnerId: currentUser.id,
          departmentId: currentUser.departmentId,
          watcherIds: [currentUser.id],
          tags: [...taskDef.tags, 'BLUEPRINT', bp.id.toUpperCase()],
          customFields: [],
          createdAt: now,
          updatedAt: now,
          detectedAt: now,
          dueDate: new Date(Date.now() + 86400000 * taskDef.durationDays).toISOString(),
          remediationDeadline: new Date(Date.now() + 86400000 * taskDef.durationDays).toISOString(),
          slaPolicyId: 'sla-tier1-banking',
          slaState: 'SAFE',
          version: 1,
        };

        const sla = SLAService.calculateSLA(newTicket);
        newTicket.slaState = sla.state;
        newTicket.slaRemainingMinutes = sla.remainingMinutes;

        db.data.tickets.unshift(newTicket);
        createdTickets.push(newTicket);

        AuditService.log({
          actor: currentUser,
          action: 'TICKET_CREATED',
          entityType: 'TICKET',
          entityId: ticketId,
          entityKey: ticketKey,
          metadata: { action: 'LAUNCHED_BLUEPRINT_TASK', blueprintTitle: bp.title, title: newTicket.title },
        });

        AutomationService.triggerEvent('TICKET_CREATED', newTicket, currentUser);
      }

      db.persist();

      res.status(201).json({ success: true, blueprint: bp, createdTickets });
    } catch (err: any) {
      logger.error({ err }, 'Failed to launch blueprint');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ==========================================
  // 6. WRIKE DOCUMENT & ASSET PROOFING API
  // ==========================================

  public static async listProofingDocuments(req: Request, res: Response): Promise<void> {
    try {
      const documents = db.data.proofingDocuments || [];
      res.json({ success: true, documents });
    } catch (err: any) {
      logger.error({ err }, 'Failed to list proofing documents');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async addProofingAnnotation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { x, y, comment } = req.body;
      const currentUser: BankUser = (req as any).user || db.data.users[0];

      const doc = (db.data.proofingDocuments || []).find((d) => d.id === id);
      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const newAnnotation = {
        id: `ann-${Date.now()}`,
        x: Number(x) || 50,
        y: Number(y) || 50,
        authorId: currentUser.id,
        authorName: currentUser.fullName,
        authorRole: currentUser.roles[0] || 'CISO',
        comment: comment?.trim() || '',
        status: 'OPEN' as const,
        createdAt: new Date().toISOString(),
      };

      doc.annotations.push(newAnnotation);
      doc.updatedAt = new Date().toISOString();
      db.persist();

      AuditService.log({
        actor: currentUser,
        action: 'COMMENT_ADDED',
        entityType: 'ATTACHMENT',
        entityId: doc.id,
        metadata: { action: 'PROOFING_ANNOTATION_ADDED', comment: newAnnotation.comment },
      });

      res.status(201).json({ success: true, annotation: newAnnotation, document: doc });
    } catch (err: any) {
      logger.error({ err }, 'Failed to add annotation');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async signOffProofingDocument(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const currentUser: BankUser = (req as any).user || db.data.users[0];

      const doc = (db.data.proofingDocuments || []).find((d) => d.id === id);
      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const signaturePayload = `${doc.id}:${currentUser.id}:${Date.now()}:APEX_BANK_CISO_SEAL`;
      const signatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

      doc.isSignedOff = true;
      doc.signedByUserId = currentUser.id;
      doc.signedByUserName = currentUser.fullName;
      doc.signedAt = new Date().toISOString();
      doc.signatureHash = signatureHash;
      doc.updatedAt = new Date().toISOString();

      db.persist();

      AuditService.log({
        actor: currentUser,
        action: 'APPROVAL_DECISION',
        entityType: 'APPROVAL',
        entityId: doc.id,
        entityKey: doc.id,
        metadata: { action: 'PROOFING_CISO_SIGNOFF', signatureHash, documentTitle: doc.title },
      });

      res.json({ success: true, document: doc, signatureHash });
    } catch (err: any) {
      logger.error({ err }, 'Failed to sign off document');
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
