import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { db } from '../db/database.js';
import { AuthService } from '../services/auth.service.js';
import { WorkflowService } from '../services/workflow.service.js';
import { SLAService } from '../services/sla.service.js';
import { AuditService } from '../services/audit.service.js';
import { AutomationService } from '../services/automation.service.js';
import { SearchService } from '../services/search.service.js';
import { Ticket } from '../../shared/types/ticket.js';

export class TicketsController {
  public static list(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const jql = req.query.jql as string;

    // Refresh SLAs before returning
    SLAService.refreshAllTicketSLAs();

    const filteredTickets = SearchService.query(db.data.tickets, jql, user);

    res.json({
      success: true,
      total: filteredTickets.length,
      tickets: filteredTickets,
    });
  }

  public static getById(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const ticket = db.data.tickets.find((t) => t.id === req.params.id || t.key === req.params.id);

    if (!ticket) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }

    const check = AuthService.canAccessResource({
      user,
      action: 'READ',
      resourceType: 'TICKET',
      resource: ticket,
    });

    if (!check.allowed) {
      res.status(403).json({ success: false, error: check.reason });
      return;
    }

    // Refresh SLA for this ticket
    const sla = SLAService.calculateSLA(ticket);
    ticket.slaState = sla.state;
    ticket.slaRemainingMinutes = sla.remainingMinutes;
    ticket.slaPausedReason = sla.pausedReason;

    // Fetch related records
    const comments = db.data.comments
      .filter((c) => c.ticketId === ticket.id)
      .filter((c) => {
        return AuthService.canAccessResource({
          user,
          action: 'READ',
          resourceType: 'COMMENT',
          resource: c,
        }).allowed;
      });

    const attachments = db.data.attachments.filter((a) => a.ticketId === ticket.id);
    const auditEvents = AuditService.getEventsForEntity(ticket.id);
    const approvalChain = db.data.approvals.find((a) => a.ticketId === ticket.id);
    const transitions = WorkflowService.getAvailableTransitions(ticket, user);

    // Linked application and asset details
    const application = db.data.applications.find((a) => a.id === ticket.applicationId);
    const asset = db.data.assets.find((a) => a.id === ticket.assetId);

    // Log restricted case view
    if (ticket.confidentiality === 'HIGHLY_RESTRICTED_HR_LEGAL' || ticket.confidentiality === 'CONFIDENTIAL_SECURITY_ONLY') {
      AuditService.log({
        actor: user,
        action: 'RESTRICTED_ACCESS_VIEWED',
        entityType: 'TICKET',
        entityId: ticket.id,
        entityKey: ticket.key,
      });
    }

    res.json({
      success: true,
      ticket,
      comments,
      attachments,
      auditEvents,
      approvalChain,
      transitions,
      application,
      asset,
    });
  }

  public static create(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const body = req.body;

    const projectCode = body.projectCode || 'SEC';
    const count = db.data.tickets.length + 1;
    const key = `${projectCode}-2026-${String(count).padStart(4, '0')}`;
    const now = new Date().toISOString();

    const newTicket: Ticket = {
      id: `tick-${uuidv4().substring(0, 8)}`,
      key,
      projectCode,
      ticketTypeId: body.ticketTypeId || 'type-vuln',
      ticketTypeName: body.ticketTypeName || 'Security Ticket',
      category: body.category || 'VULNERABILITY',
      securityDomain: body.securityDomain || 'GENERAL_INFOSEC',
      title: body.title,
      description: body.description,
      statusId: body.statusId || (body.category === 'INCIDENT' ? 'INC_NEW' : body.category === 'SECURITY_EXCEPTION' ? 'EXC_DRAFT' : 'VULN_OPEN'),
      statusName: body.statusName || 'Open',
      statusCategory: 'TO_DO',
      workflowId: body.workflowId || (body.category === 'INCIDENT' ? 'wf-incident-std' : body.category === 'SECURITY_EXCEPTION' ? 'wf-exception-std' : 'wf-vuln-std'),
      workflowVersion: 1,
      technicalSeverity: body.technicalSeverity || 'MEDIUM',
      businessPriority: body.businessPriority || 'P3_MEDIUM',
      businessImpact: body.businessImpact || 'MODERATE',
      inherentRisk: body.inherentRisk || 'MEDIUM',
      residualRisk: body.residualRisk || 'LOW',
      riskScore: body.riskScore || 50,
      cvssScore: body.cvssScore,
      cvssVector: body.cvssVector,
      confidentiality: body.confidentiality || 'INTERNAL',
      restrictedUserIds: body.restrictedUserIds || [],
      restrictedTeamIds: body.restrictedTeamIds || [],
      reporterId: user.id,
      assigneeId: body.assigneeId,
      securityOwnerId: body.securityOwnerId || user.id,
      teamId: body.teamId,
      departmentId: body.departmentId || user.departmentId,
      applicationId: body.applicationId,
      assetId: body.assetId,
      riskOwnerId: body.riskOwnerId,
      watcherIds: [user.id, ...(body.watcherIds || [])],
      findingDetails: body.findingDetails,
      incidentDetails: body.incidentDetails,
      exceptionDetails: body.exceptionDetails,
      customFields: body.customFields || [],
      createdAt: now,
      updatedAt: now,
      detectedAt: body.detectedAt || now,
      dueDate: body.dueDate || new Date(Date.now() + 86400000 * 7).toISOString(),
      remediationDeadline: body.remediationDeadline || new Date(Date.now() + 86400000 * 3).toISOString(),
      slaPolicyId: body.slaPolicyId || 'sla-tier1-banking',
      slaState: 'SAFE',
      version: 1,
      tags: body.tags || [],
    };

    // Calculate initial SLA
    const sla = SLAService.calculateSLA(newTicket);
    newTicket.slaState = sla.state;
    newTicket.slaRemainingMinutes = sla.remainingMinutes;

    db.data.tickets.unshift(newTicket);

    // Audit log
    AuditService.log({
      actor: user,
      action: 'TICKET_CREATED',
      entityType: 'TICKET',
      entityId: newTicket.id,
      entityKey: newTicket.key,
      metadata: { title: newTicket.title, severity: newTicket.technicalSeverity },
    });

    // Run Automations
    AutomationService.triggerEvent('TICKET_CREATED', newTicket, user);

    db.persist();
    res.status(201).json({ success: true, ticket: newTicket });
  }

  public static update(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const ticketId = req.params.id;
    const updates = req.body;

    const ticket = db.data.tickets.find((t) => t.id === ticketId || t.key === ticketId);
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }

    // ABAC write check
    const check = AuthService.canAccessResource({
      user,
      action: 'WRITE',
      resourceType: 'TICKET',
      resource: ticket,
    });

    if (!check.allowed) {
      res.status(403).json({ success: false, error: check.reason });
      return;
    }

    // Optimistic Concurrency check
    if (updates.version !== undefined && updates.version !== ticket.version) {
      res.status(409).json({
        success: false,
        error: 'Conflict: This ticket was modified by another analyst. Please refresh and apply changes again.',
      });
      return;
    }

    const fieldChanges: { field: string; oldValue: any; newValue: any }[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (k !== 'id' && k !== 'key' && k !== 'version' && (ticket as any)[k] !== v) {
        fieldChanges.push({ field: k, oldValue: (ticket as any)[k], newValue: v });
        (ticket as any)[k] = v;
      }
    }

    ticket.updatedAt = new Date().toISOString();
    ticket.version += 1;

    // Recalculate SLA
    const sla = SLAService.calculateSLA(ticket);
    ticket.slaState = sla.state;
    ticket.slaRemainingMinutes = sla.remainingMinutes;

    AuditService.log({
      actor: user,
      action: 'TICKET_UPDATED',
      entityType: 'TICKET',
      entityId: ticket.id,
      entityKey: ticket.key,
      fieldChanges,
    });

    if (updates.technicalSeverity) {
      AutomationService.triggerEvent('SEVERITY_CHANGED', ticket, user);
    }
    if (updates.assigneeId) {
      AutomationService.triggerEvent('ASSIGNMENT_CHANGED', ticket, user);
    }

    db.persist();
    res.json({ success: true, ticket });
  }

  public static transition(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const ticketId = req.params.id;
    const { transitionId, comment, requiredFieldUpdates } = req.body;

    const result = WorkflowService.executeTransition({
      ticketId,
      transitionId,
      user,
      comment,
      requiredFieldUpdates,
    });

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    if (result.ticket) {
      AutomationService.triggerEvent('STATUS_CHANGED', result.ticket, user);
    }

    res.json(result);
  }

  public static addComment(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const ticketId = req.params.id;
    const { content, visibility, mentions } = req.body;

    const ticket = db.data.tickets.find((t) => t.id === ticketId || t.key === ticketId);
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }

    const newComment = {
      id: `comm-${uuidv4().substring(0, 8)}`,
      ticketId: ticket.id,
      authorId: user.id,
      authorName: user.fullName,
      authorRole: user.roles[0] || 'ANALYST',
      authorAvatar: user.avatarUrl,
      content,
      visibility: visibility || 'PUBLIC',
      confidentiality: ticket.confidentiality,
      mentions: mentions || [],
      createdAt: new Date().toISOString(),
      isEdited: false,
      reactions: [],
    };

    db.data.comments.unshift(newComment);
    ticket.updatedAt = new Date().toISOString();

    AuditService.log({
      actor: user,
      action: 'COMMENT_ADDED',
      entityType: 'COMMENT',
      entityId: newComment.id,
      entityKey: ticket.key,
      metadata: { visibility: newComment.visibility },
    });

    AutomationService.triggerEvent('COMMENT_ADDED', ticket, user);

    db.persist();
    res.status(201).json({ success: true, comment: newComment });
  }

  public static bulkUpdate(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const { ticketIds, action, value } = req.body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      res.status(400).json({ success: false, error: 'No ticket IDs specified.' });
      return;
    }

    let updatedCount = 0;
    const now = new Date().toISOString();

    for (const tid of ticketIds) {
      const ticket = db.data.tickets.find((t) => t.id === tid || t.key === tid);
      if (!ticket) continue;

      const check = AuthService.canAccessResource({
        user,
        action: 'WRITE',
        resourceType: 'TICKET',
        resource: ticket,
      });

      if (!check.allowed) continue;

      switch (action) {
        case 'ASSIGN':
          ticket.assigneeId = value;
          ticket.assignedAt = now;
          break;
        case 'SET_PRIORITY':
          ticket.businessPriority = value;
          break;
        case 'SET_SEVERITY':
          ticket.technicalSeverity = value;
          break;
        case 'ADD_TAG':
          if (!ticket.tags.includes(value)) ticket.tags.push(value);
          break;
      }

      ticket.updatedAt = now;
      ticket.version += 1;
      updatedCount += 1;
    }

    AuditService.log({
      actor: user,
      action: 'BULK_UPDATE',
      entityType: 'TICKET',
      entityId: 'BULK',
      metadata: { action, value, affectedCount: updatedCount },
    });

    db.persist();
    res.json({ success: true, updatedCount });
  }
}
