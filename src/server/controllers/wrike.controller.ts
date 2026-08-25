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
import { ProofingDocument } from '../../shared/types/proofing.js';
import { BankUser } from '../../shared/types/auth.js';
import { TicketLifecycleService } from '../services/ticket-lifecycle.service.js';
import { WorkflowTemplateError, WorkflowTemplateService } from '../services/workflow-template.service.js';
import { GraphOrchestratorService } from '../services/graph-orchestrator.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { AuthService } from '../services/auth.service.js';

type WorkDataScope = 'authorized' | 'assigned' | 'reported';

export class WrikeController {
  /**
   * Work views must never treat a client-side list as an authorization boundary.
   * Start with ABAC-filtered tickets, then permit a view to narrow that list to
   * work assigned to, or reported by, the authenticated user.
   */
  private static getVisibleWorkTickets(req: AuthenticatedRequest): Ticket[] {
    const user = req.user;
    if (!user) return [];

    const authorizedTickets = AuthService.filterAuthorizedTickets(db.data.tickets || [], user);
    const requestedScope = String(req.query.scope || 'authorized').toLowerCase();
    const scope: WorkDataScope = requestedScope === 'assigned' || requestedScope === 'reported'
      ? requestedScope
      : 'authorized';

    if (scope === 'assigned') {
      return authorizedTickets.filter(
        (ticket) =>
          ticket.assigneeId === user.id ||
          (!ticket.assigneeId &&
            ((ticket.targetDepartmentId && ticket.targetDepartmentId === user.departmentId) ||
              (ticket.departmentId && ticket.departmentId === user.departmentId) ||
              (ticket.assignmentGroupId && user.teamIds?.includes(ticket.assignmentGroupId)) ||
              ticket.participatingDepartmentIds?.includes(user.departmentId || '')))
      );
    }

    if (scope === 'reported') {
      return authorizedTickets.filter((ticket) => ticket.reporterId === user.id);
    }

    return authorizedTickets;
  }

  private static canManageWorkload(user: BankUser, ticket: Ticket, targetUser: BankUser): boolean {
    if (user.roles.some((role) => ['PLATFORM_ADMIN', 'CISO'].includes(role))) return true;

    const isWorkManager = user.roles.some((role) =>
      ['INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'DEPARTMENT_ADMIN', 'TEAM_LEAD'].includes(role)
    );

    return Boolean(
      isWorkManager &&
      user.departmentId &&
      ticket.departmentId === user.departmentId &&
      targetUser.departmentId === user.departmentId
    );
  }

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

      const workflow = db.data.workflows.find((candidate) => candidate.states?.length) || {
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

  public static async getGanttSchedule(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const tickets = WrikeController.getVisibleWorkTickets(req);
      const visibleTicketIds = new Set(tickets.map((ticket) => ticket.id));
      // A dependency is sensitive too: do not expose an ID or a relationship
      // to a task that is outside the caller's authorized scope.
      const dependencies = (db.data.ganttDependencies || []).filter(
        (dependency) => visibleTicketIds.has(dependency.fromTaskId) && visibleTicketIds.has(dependency.toTaskId)
      );

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

  public static async addGanttDependency(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { fromTaskId, toTaskId, type } = req.body;
      if (!fromTaskId || !toTaskId) {
        res.status(400).json({ success: false, error: 'fromTaskId and toTaskId are required' });
        return;
      }

      if (fromTaskId === toTaskId) {
        res.status(400).json({ success: false, error: 'A task cannot depend on itself' });
        return;
      }

      const user = req.user!;
      const fromTask = (db.data.tickets || []).find((ticket) => ticket.id === fromTaskId);
      const toTask = (db.data.tickets || []).find((ticket) => ticket.id === toTaskId);
      if (!fromTask || !toTask) {
        res.status(404).json({ success: false, error: 'One or both tasks were not found' });
        return;
      }

      const canWriteBothTasks = [fromTask, toTask].every((ticket) =>
        AuthService.canAccessResource({ user, action: 'WRITE', resourceType: 'TICKET', resource: ticket }).allowed
      );
      if (!canWriteBothTasks) {
        // Do not reveal which side of a cross-scope relationship was denied.
        res.status(403).json({ success: false, error: 'Not authorized to link one or both tasks' });
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

  public static async getWorkload(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const currentUser = req.user!;
      const tickets = WrikeController.getVisibleWorkTickets(req);
      const visibleAssigneeIds = new Set(tickets.map((ticket) => ticket.assigneeId).filter(Boolean));
      visibleAssigneeIds.add(currentUser.id);
      // Never enumerate people who have no work visible to this caller.
      const users = (db.data.users || []).filter((user) => visibleAssigneeIds.has(user.id));

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

  public static async rebalanceWorkload(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { fromUserId, toUserId, ticketId } = req.body;
      const currentUser = req.user!;
      const ticket = (db.data.tickets || []).find((t) => t.id === ticketId);
      if (!ticket) {
        res.status(404).json({ success: false, error: 'Ticket not found' });
        return;
      }

      const targetUser = (db.data.users || []).find((user) => user.id === toUserId && user.isActive);
      if (!targetUser) {
        res.status(400).json({ success: false, error: 'Target assignee does not exist or is inactive' });
        return;
      }

      if (ticket.assigneeId !== fromUserId) {
        res.status(409).json({ success: false, error: 'Task assignee changed; refresh and try again' });
        return;
      }

      const ticketAccess = AuthService.canAccessResource({
        user: currentUser,
        action: 'WRITE',
        resourceType: 'TICKET',
        resource: ticket,
      });
      if (!ticketAccess.allowed || !WrikeController.canManageWorkload(currentUser, ticket, targetUser)) {
        res.status(403).json({ success: false, error: 'Not authorized to rebalance this task' });
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
      const { values: rawValues } = req.body;

      const form = (db.data.requestForms || []).find((f) => f.id === formId);
      if (!form) {
        res.status(404).json({ success: false, error: 'Request form not found' });
        return;
      }

      let values: Record<string, any>;
      try {
        values = TicketLifecycleService.validateRequestFormSubmission(form, rawValues);
      } catch (validationError: any) {
        res.status(400).json({ success: false, error: validationError.message || 'Request form validation failed.' });
        return;
      }

      const currentUser: BankUser = (req as any).user || db.data.users[0];
      const year = new Date().getUTCFullYear();
      const highestSequence = db.data.tickets.reduce((highest, ticket) => {
        const match = ticket.key.match(new RegExp(`^SEC-${year}-(\\d+)$`));
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 0);
      const ticketKey = `SEC-${year}-${String(highestSequence + 1).padStart(4, '0')}`;
      const ticketId = `tick-${uuidv4().substring(0, 8)}`;
      const now = new Date().toISOString();

      const workflow = db.data.workflows.find((candidate) => candidate.states?.length);
      if (!workflow) {
        res.status(422).json({ success: false, error: 'No active ticket workflow is configured in the system.' });
        return;
      }
      const initialStatus = workflow.states.find((s) => s.isInitial) || workflow.states[0];
      const technicalSeverity = (values?.urgency === 'EMERGENCY' ? 'CRITICAL' : form.defaultSeverity) as Ticket['technicalSeverity'];
      const slaPolicyId = form.slaPolicyId || db.data.slaPolicies[0]?.id;
      const slaDeadlines = TicketLifecycleService.calculateSlaDeadlines(slaPolicyId, technicalSeverity, now);

      const newTicket: Ticket = {
        id: ticketId,
        key: ticketKey,
        projectCode: 'SEC',
        ticketTypeId: form.defaultTicketType as any,
        ticketTypeName: form.title,
        type: form.defaultTicketType === 'INCIDENT' ? 'SECURITY_INCIDENT' : form.defaultTicketType === 'VULNERABILITY' ? 'VULNERABILITY' : 'SERVICE_REQUEST',
        requestTypeId: form.id,
        requestTypeName: form.title,
        intakeChannel: 'PORTAL',
        category: form.defaultTicketType as any,
        securityDomain: form.category.includes('SOC') ? 'SOC' : form.category.includes('GRC') ? 'GRC' : 'APPSEC',
        title: values?.title || `[${form.title}] ${values?.targetSystem || 'Banking System'}`,
        description: `### ${form.title}\n\n**Destination**: ${form.destinationFolder}\n\n**Justification / Details**:\n${values?.justification || 'Submitted via Wrike Request Portal'}\n\n**Parameters**:\n${JSON.stringify(values, null, 2)}`,
        statusId: initialStatus.id,
        statusName: initialStatus.name,
        statusCategory: initialStatus.category,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        technicalSeverity,
        businessPriority: (values?.urgency === 'EMERGENCY' ? 'P1_URGENT' : form.defaultPriority) as any,
        businessImpact: 'SIGNIFICANT',
        urgency: values?.urgency === 'EMERGENCY' ? 'CRITICAL' : 'MEDIUM',
        inherentRisk: 'HIGH',
        residualRisk: 'MEDIUM',
        riskScore: 75,
        confidentiality: 'RESTRICTED',
        restrictedUserIds: [],
        restrictedTeamIds: [],
        reporterId: currentUser.id,
        requesterId: currentUser.id,
        assignmentGroupId: form.defaultGroupId,
        securityOwnerId: currentUser.id,
        departmentId: currentUser.departmentId,
        watcherIds: [currentUser.id],
        tags: ['WRIKE_FORM', form.id.toUpperCase()],
        customFields: [],
        createdAt: now,
        updatedAt: now,
        detectedAt: now,
        dueDate: slaDeadlines.resolutionDeadline,
        remediationDeadline: slaDeadlines.remediationDeadline,
        slaPolicyId,
        slaState: 'SAFE',
        version: 1,
      };

      const sla = SLAService.calculateSLA(newTicket);
      newTicket.slaState = sla.state;
      newTicket.slaRemainingMinutes = sla.remainingMinutes;

      db.data.tickets.unshift(newTicket);
      TicketLifecycleService.initializeSlaMetrics(newTicket);

      const submission: RequestFormSubmission = {
        id: `sub-${Date.now()}`,
        formId: form.id,
        submittedByUserId: currentUser.id,
        submittedByUserName: currentUser.fullName,
        values,
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
      const actor = (req as any).user;
      const blueprints = WorkflowTemplateService.list(actor);
      res.json({ success: true, blueprints });
    } catch (err: any) {
      logger.error({ err }, 'Failed to list blueprints');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async createBlueprint(req: Request, res: Response): Promise<void> {
    try {
      const actor = (req as any).user || db.data.users[0];
      const blueprint = WorkflowTemplateService.create(req.body, actor);
      res.status(201).json({ success: true, blueprint });
    } catch (err: any) {
      logger.error({ err }, 'Failed to create blueprint');
      const status = err instanceof WorkflowTemplateError ? err.statusCode : err?.name === 'ZodError' ? 400 : 500;
      res.status(status).json({ success: false, error: err.message, details: err.details || err.issues });
    }
  }

  public static async launchBlueprint(req: Request, res: Response): Promise<void> {
    try {
      const result = WorkflowTemplateService.launchStored(String(req.params.id), req.body, (req as any).user);
      res.status(result.replayed ? 200 : 201).json({ success: true, ...result, createdTickets: result.tickets });
    } catch (err: any) {
      logger.error({ err }, 'Failed to launch blueprint');
      const status = err instanceof WorkflowTemplateError ? err.statusCode : err?.name === 'ZodError' ? 400 : 500;
      res.status(status).json({ success: false, error: err.message, details: err.details || err.issues });
    }
  }

  public static async getWorkflowTemplateMetadata(req: Request, res: Response): Promise<void> {
    res.json({ success: true, metadata: WorkflowTemplateService.metadata() });
  }

  public static async getWorkflowAssignmentOptions(req: Request, res: Response): Promise<void> {
    const offset = Number.parseInt(String(req.query.offset || '0'), 10);
    const limit = Number.parseInt(String(req.query.limit || '40'), 10);
    const page = WorkflowTemplateService.assignmentOptions({
      departmentId: typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined,
      sectionId: typeof req.query.sectionId === 'string' ? req.query.sectionId : undefined,
      query: typeof req.query.query === 'string' ? req.query.query : undefined,
      offset: Number.isFinite(offset) ? offset : 0,
      limit: Number.isFinite(limit) ? limit : 40,
    });
    res.json({ success: true, ...page });
  }

  public static async listWorkflowRuns(req: Request, res: Response): Promise<void> {
    res.json({ success: true, runs: WorkflowTemplateService.listRuns((req as any).user) });
  }

  public static async previewBlueprint(req: Request, res: Response): Promise<void> {
    try {
      const template = (db.data.blueprints || []).find((item) => item.id === String(req.params.id) && item.isActive !== false);
      if (!template) throw new WorkflowTemplateError('Workflow template not found.', 404);
      res.json({ success: true, preview: WorkflowTemplateService.preview(template) });
    } catch (err: any) {
      const status = err instanceof WorkflowTemplateError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message, details: err.details });
    }
  }

  public static async validateGraph(req: Request, res: Response): Promise<void> {
    try {
      const { nodes = [], edges = [] } = req.body;
      const result = GraphOrchestratorService.validateGraph(nodes, edges, (req as any).user);
      res.json({ success: true, validation: result });
    } catch (err: any) {
      logger.error({ err }, 'Failed to validate workflow graph');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async cloneBlueprint(req: Request, res: Response): Promise<void> {
    try {
      const actor = (req as any).user || db.data.users[0];
      const blueprint = WorkflowTemplateService.clone(String(req.params.id), actor);
      res.status(201).json({ success: true, blueprint });
    } catch (err: any) {
      logger.error({ err }, 'Failed to clone blueprint');
      const status = err instanceof WorkflowTemplateError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  }

  public static async launchCustomWorkflow(req: Request, res: Response): Promise<void> {
    try {
      const result = WorkflowTemplateService.launchCustom(req.body, (req as any).user);
      res.status(201).json({ success: true, ...result, createdTickets: result.tickets });
    } catch (err: any) {
      logger.error({ err }, 'Failed to launch custom workflow');
      const status = err instanceof WorkflowTemplateError ? err.statusCode : err?.name === 'ZodError' ? 400 : 500;
      res.status(status).json({ success: false, error: err.message, details: err.details || err.issues });
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
