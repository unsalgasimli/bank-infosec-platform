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
import type { Ticket, TicketCategoryOption, TicketIntakeCategoryOption } from '../../shared/types/ticket.js';
import { TicketLifecycleService } from '../services/ticket-lifecycle.service.js';
import { TicketRelationshipType, TicketTaskStatus } from '../../shared/types/itsm.js';
import { config } from '../config/index.js';
import { pgClient } from '../db/postgres/client.js';
import { CMDBService } from '../services/cmdb.service.js';
import { isGenuineEmployeeOrIntern } from '../services/ldap-directory.data.js';
import { WorkflowOrchestrationService } from '../services/workflow-orchestration.service.js';

const memoryTicketCategories = [
  'GENERAL_REQUEST', 'GENERAL_TASK', 'IT_SUPPORT', 'ACCESS_REQUEST', 'HARDWARE_SOFTWARE', 'NETWORK_INFRASTRUCTURE',
  'CHANGE_REQUEST', 'INCIDENT_MANAGEMENT', 'PROJECT_DELIVERY', 'FINANCE_PROCUREMENT', 'HR_OPERATIONS', 'COMPLIANCE_LEGAL',
  'BUSINESS_OPERATIONS', 'SECURITY_REVIEW', 'VULNERABILITY', 'INCIDENT', 'SECURITY_EXCEPTION', 'RISK_ACCEPTANCE',
  'AUDIT_FINDING', 'IAM_REQUEST', 'DLP_ALERT', 'THIRD_PARTY_ASSESSMENT',
];

const memoryTicketCategoryOptions = (): TicketCategoryOption[] => memoryTicketCategories.map((code) => ({
  code: code as TicketCategoryOption['code'],
  label: code.replaceAll('_', ' ').toLocaleLowerCase('az').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('az')),
}));

const TICKET_EDITABLE_FIELDS = new Set([
  'title',
  'description',
  'technicalSeverity',
  'businessImpact',
  'urgency',
  'inherentRisk',
  'residualRisk',
  'riskScore',
  'cvssScore',
  'cvssVector',
  'confidentiality',
  'restrictedUserIds',
  'restrictedTeamIds',
  'assigneeId',
  'assignmentGroupId',
  'ownerId',
  'securityOwnerId',
  'teamId',
  'departmentId',
  'targetDepartmentId',
  'targetSectionId',
  'applicationId',
  'assetId',
  'affectedAssetIds',
  'affectedServiceId',
  'riskOwnerId',
  'watcherIds',
  'participantIds',
  'dueDate',
  'remediationDeadline',
  'tags',
  'customFields',
]);

const TICKET_ADMIN_FIELDS = new Set([
  'confidentiality',
  'restrictedUserIds',
  'restrictedTeamIds',
  'assigneeId',
  'assignmentGroupId',
  'ownerId',
  'securityOwnerId',
  'teamId',
  'departmentId',
  'targetDepartmentId',
  'targetSectionId',
]);

export class TicketsController {
  /**
   * Minimal, server-authenticated contract for the new-work modal.  The client
   * never supplies a requester identity and only receives AD-confirmed routing
   * choices.  Supplying `targetId` returns the bounded assignee list for that
   * department or team.
   */
  public static async intakeOptions(req: AuthenticatedRequest, res: Response): Promise<void> {
    const user = req.user!;
    db.reload();

    const departments = (db.data.departments || [])
      .filter((department) => department.isActive !== false && department.directorySource === 'ACTIVE_DIRECTORY');
    const departmentIds = new Set(departments.map((department) => department.id));
    const sections = (db.data.departmentSections || [])
      .filter((section) => section.isActive !== false && section.directorySource === 'ACTIVE_DIRECTORY' && departmentIds.has(section.departmentId));
    const teams = (db.data.teams || []).filter((team) => departmentIds.has(team.departmentId));
    const targetId = typeof req.query.targetId === 'string' ? req.query.targetId.trim() : '';
    const targetDepartment = departments.find((department) => department.id === targetId);
    const targetTeam = teams.find((team) => team.id === targetId);
    const targetSection = sections.find((section) => section.id === targetId);
    const targetDepartmentId = targetTeam?.departmentId || targetSection?.departmentId || targetDepartment?.id;

    const assignees = targetDepartmentId
      ? (db.data.users || [])
          .filter((candidate) =>
            candidate.isActive &&
            candidate.directorySource === 'ACTIVE_DIRECTORY' &&
            isGenuineEmployeeOrIntern(candidate, candidate.distributionGroups || [], candidate.sAMAccountName || candidate.username) &&
            departmentIds.has(candidate.departmentId) &&
            (targetSection
              ? candidate.sectionId === targetSection.id
              : candidate.departmentId === targetDepartmentId || Boolean(targetTeam && candidate.teamIds?.includes(targetTeam.id)))
          )
          .sort((left, right) => left.fullName.localeCompare(right.fullName, 'az'))
          .map(({ id, fullName, title, departmentId, sectionId, teamIds }) => ({
            id,
            fullName,
            title,
            departmentId,
            sectionId,
            sectionName: sections.find((section) => section.id === sectionId)?.name,
            sectionCode: sections.find((section) => section.id === sectionId)?.code,
            teamIds,
          }))
      : [];

    const directoryReady = departments.length > 0 && (db.data.users || []).some((candidate) =>
      candidate.isActive && candidate.directorySource === 'ACTIVE_DIRECTORY' &&
      isGenuineEmployeeOrIntern(candidate, candidate.distributionGroups || [], candidate.sAMAccountName || candidate.username) &&
      departmentIds.has(candidate.departmentId)
    );
    const canAssignDirect = user.roles.some((role) =>
      ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'TEAM_LEAD', 'SECURITY_ANALYST', 'SOC_ANALYST', 'APPSEC_ANALYST', 'VULN_ANALYST', 'GRC_ANALYST', 'DLP_ANALYST'].includes(role)
    );

    const categories: TicketIntakeCategoryOption[] = config.DB_TYPE === 'postgres'
      ? (await pgClient.query<{ code: TicketCategoryOption['code']; displayName: string; description: string }>(
          'SELECT code, display_name AS "displayName", description FROM ticket_categories WHERE is_active = TRUE ORDER BY sort_order ASC, code ASC'
        )).rows.map((row) => ({
          code: row.code,
          label: row.displayName,
          description: row.description || undefined,
        }))
      : memoryTicketCategoryOptions().map((category) => ({ ...category, kind: 'CATEGORY' as const }));

    // Keep the 71 catalog-backed basic tasks available as searchable intake
    // categories. catalogPayload performs the normal baseline/bootstrap check;
    // the raw template list is used here because listCatalog intentionally
    // hides these cards from the workflow catalog.
    WorkflowOrchestrationService.catalogPayload(user);
    const helpDeskDepartment = departments
      .map((department) => {
        const code = department.code.toLocaleLowerCase('az');
        const name = department.name.toLocaleLowerCase('az');
        const score = name.includes('help desk') || name.includes('helpdesk') ? 100
          : code === 'it' || code.startsWith('it_') || code.startsWith('it-') ? 90
            : name.includes('information technology') || name.includes('informasiya texnolog') ? 80
              : /(^|[^a-z])it([^a-z]|$)/i.test(code) ? 70
                : 0;
        return { department, score };
      })
      .sort((left, right) => right.score - left.score)[0];
    const basicTaskCategories = db.data.workflowCatalogTemplates
      .filter((template) => template.kind === 'BASIC_TICKET' && template.catalogGroup?.startsWith('IT ·') && template.requestTypeId)
      .sort((left, right) => (left.catalogGroup || '').localeCompare(right.catalogGroup || '', 'az') || left.title.localeCompare(right.title, 'az'))
      .map((template) => ({
        code: template.requestTypeId!,
        label: template.title,
        description: `${template.catalogGroup} · Help Desk task`,
        kind: 'BASIC_TICKET' as const,
        requestTypeId: template.requestTypeId,
        catalogGroup: template.catalogGroup,
        targetDepartmentId: helpDeskDepartment?.score ? helpDeskDepartment.department.id : undefined,
      }));
    const categoryCodes = new Set(categories.map((category) => category.code));
    categories.push(...basicTaskCategories.filter((category) => !categoryCodes.has(category.code)));

    res.json({
      success: true,
      intake: {
        requester: { id: user.id, fullName: user.fullName, title: user.title, departmentId: user.departmentId },
        canAssignDirect,
        directory: {
          ready: directoryReady,
          message: directoryReady ? undefined : 'Canlı Active Directory sinxronizasiyası tələb olunur. İcraçı və növbə seçimi əlçatan deyil.',
        },
        departments: departments.map(({ id, name, code }) => ({ id, name, code })),
        sections: sections.map(({ id, departmentId, name, code }) => ({ id, departmentId, name, code })),
        teams: teams.map(({ id, departmentId, name, code }) => ({ id, departmentId, name, code })),
        assignees,
        slaPolicies: (db.data.slaPolicies || []).map(({ id, name, description, isDefault }) => ({ id, name, description, isDefault })),
         categories,
      },
    });
  }

  public static list(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const jql = req.query.jql as string;
    const archivedOnly = req.query.archived === 'true';

    // Refresh SLAs before returning
    SLAService.refreshAllTicketSLAs();

    const lifecycleTickets = (db.data.tickets || []).filter((ticket) => archivedOnly === Boolean(ticket.archivedAt));
    const filteredTickets = SearchService.query(lifecycleTickets, jql, user);

    res.json({
      success: true,
      total: filteredTickets.length,
      archived: archivedOnly,
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
    const comments = (db.data.comments || [])
      .filter((c) => c.ticketId === ticket.id)
      .filter((c) => {
        return AuthService.canAccessResource({
          user,
          action: 'READ',
          resourceType: 'COMMENT',
          resource: c,
        }).allowed;
      });

    // The object-store key is an internal capability, never ticket-detail data.
    const attachments = (db.data.attachments || [])
      .filter((attachment) => attachment.ticketId === ticket.id)
      .map(({ storageKey: _storageKey, ...attachment }) => attachment);
    const auditEvents = AuditService.getEventsForEntity(ticket.id);
    const approvalChain = (db.data.approvals || []).find((a) => a.ticketId === ticket.id);
    const transitions = WorkflowService.getAvailableTransitions(ticket, user);

    // Linked application and asset details
    const application = (db.data.applications || []).find((a) => a.id === ticket.applicationId);
    const asset = (db.data.assets || []).find((a) => a.id === ticket.assetId);
    const cmdb = CMDBService.ticketContext(ticket.id);
    const lifecycle = TicketLifecycleService.getBundle(ticket, user);

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
      cmdb,
      transitions,
      application,
      asset,
      lifecycle,
    });
  }

  public static create(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user!;
      const canAssignDirectUser = user.roles.some((role) =>
        ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'TEAM_LEAD', 'SECURITY_ANALYST', 'SOC_ANALYST', 'APPSEC_ANALYST', 'VULN_ANALYST', 'GRC_ANALYST', 'DLP_ANALYST'].includes(role)
      );
      if (req.body.assigneeId && !canAssignDirectUser && req.body.assigneeId !== user.id) {
        res.status(403).json({ success: false, error: 'You are not allowed to assign work to another user.' });
        return;
      }
      const requestedAssigneeId = canAssignDirectUser || req.body.assigneeId === user.id ? req.body.assigneeId : undefined;
      const rawBody = {
        ...req.body,
        assigneeId: requestedAssigneeId,
        targetDepartmentId: req.body.targetDepartmentId,
        targetSectionId: req.body.targetSectionId,
        assignmentGroupId: req.body.assignmentGroupId,
      };
      const body = TicketLifecycleService.validateAndNormalizeCreateInput(rawBody, user);

      const projectCode = body.projectCode || 'SEC';
      const year = new Date().getUTCFullYear();
      const highestSequence = (db.data.tickets || []).reduce((highest, ticket) => {
        const match = ticket.key.match(new RegExp(`^${projectCode}-${year}-(\\d+)$`));
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 0);
      const key = `${projectCode}-${year}-${String(highestSequence + 1).padStart(4, '0')}`;
      const now = new Date().toISOString();

      const defaultWorkflow = (db.data.workflows || [])[0];
      const initialStatus = defaultWorkflow?.states?.[0] || { id: 'OPEN', name: 'Open', category: 'TO_DO' };
      const defaultSlaPolicy = (db.data.slaPolicies || [])[0] || { id: 'sla-p1-emergency' };
      const slaPolicyId = body.slaPolicyId || defaultSlaPolicy.id;
      const technicalSeverity = body.technicalSeverity || 'MEDIUM';
      const slaDeadlines = TicketLifecycleService.calculateSlaDeadlines(slaPolicyId, technicalSeverity, now);

      const assigneeId = body.assigneeId || undefined;
      const targetDepartmentId = body.targetDepartmentId || undefined;
      const targetSectionId = body.targetSectionId || undefined;
      const departmentId = targetDepartmentId || body.departmentId || user.departmentId;

      const newTicket: Ticket = {
        id: `tick-${uuidv4().substring(0, 8)}`,
        key,
        projectCode,
        ticketTypeId: body.ticketTypeId || body.category || 'VULNERABILITY',
        ticketTypeName: body.ticketTypeName || 'Security Ticket',
        type: body.type,
        requestTypeId: body.requestTypeId,
        requestTypeName: body.requestTypeName,
        intakeChannel: body.intakeChannel,
        category: body.category || 'VULNERABILITY',
        securityDomain: body.securityDomain || 'GENERAL_INFOSEC',
        title: body.title || 'Untitled Security Task',
        description: body.description || body.title || '',
        statusId: body.statusId || initialStatus.id,
        statusName: body.statusName || initialStatus.name,
        statusCategory: (body.statusCategory || initialStatus.category || 'TO_DO') as any,
        workflowId: body.workflowId || defaultWorkflow?.id || 'wf-secops-default',
        workflowVersion: defaultWorkflow?.version || 1,
        technicalSeverity,
        businessPriority: body.businessPriority || 'P3_MEDIUM',
        businessImpact: body.businessImpact || 'MODERATE',
        urgency: body.urgency,
        inherentRisk: body.inherentRisk || 'MEDIUM',
        residualRisk: body.residualRisk || 'LOW',
        riskScore: body.riskScore || 50,
        cvssScore: body.cvssScore,
        cvssVector: body.cvssVector,
        confidentiality: body.confidentiality || 'INTERNAL',
        restrictedUserIds: body.restrictedUserIds || [],
        restrictedTeamIds: body.restrictedTeamIds || [],
        reporterId: user.id,
        requesterId: body.requesterId,
        onBehalfOfUserId: body.onBehalfOfUserId,
        assigneeId,
        assignmentGroupId: body.assignmentGroupId,
        ownerId: body.ownerId || body.securityOwnerId || user.id,
        securityOwnerId: body.securityOwnerId || user.id,
        teamId: body.teamId,
        departmentId,
        targetDepartmentId,
        targetSectionId,
        applicationId: body.applicationId || undefined,
        assetId: body.assetId || undefined,
        riskOwnerId: body.riskOwnerId,
        watcherIds: Array.from(new Set([user.id, ...(body.watcherIds || [])])),
        participantIds: body.participantIds,
        organizationId: body.organizationId,
        siteId: body.siteId,
        affectedServiceId: body.affectedServiceId,
        affectedAssetIds: body.affectedAssetIds,
        parentTicketId: body.parentTicketId,
        findingDetails: body.findingDetails,
        incidentDetails: body.incidentDetails,
        exceptionDetails: body.exceptionDetails,
        customFields: body.customFields || [],
        createdAt: now,
        updatedAt: now,
        detectedAt: body.detectedAt || now,
        assignedAt: assigneeId ? now : undefined,
        dueDate: body.dueDate || slaDeadlines.resolutionDeadline,
        remediationDeadline: body.remediationDeadline || slaDeadlines.remediationDeadline,
        slaPolicyId,
        slaState: 'SAFE',
        version: 1,
        tags: body.tags || [],
      };

      // Calculate initial SLA
      const sla = SLAService.calculateSLA(newTicket);
      newTicket.slaState = sla.state;
      newTicket.slaRemainingMinutes = sla.remainingMinutes;

      if (!db.data.tickets) {
        db.data.tickets = [];
      }
      db.data.tickets.unshift(newTicket);
      // Ticket → CI uses the generic association model. The old assetId and
      // applicationId remain compatibility fields, not a second CMDB model.
      const affectedCiIds: string[] = Array.isArray(req.body.affectedCiIds)
        ? [...new Set((req.body.affectedCiIds as unknown[]).filter((id): id is string => {
            if (typeof id !== 'string') return false;
            return id.trim().length > 0;
          }))]
        : [];
      for (const ciId of affectedCiIds) CMDBService.linkTicketOnCreate(ciId, newTicket.id, user);
      TicketLifecycleService.initializeSlaMetrics(newTicket);

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
    } catch (err: any) {
      const validationError = err?.name === 'ZodError' || /does not exist|inactive|required|invalid/i.test(err?.message || '');
      const errorMessage =
        err?.issues?.[0]?.message ||
        err?.message ||
        (validationError ? 'Ticket validation failed.' : 'Internal Server Error');
      res.status(validationError ? 400 : 500).json({
        success: false,
        error: errorMessage,
        details: validationError ? err.issues || err.message : undefined,
      });
    }
  }

  public static claim(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const ticketId = req.params.id as string;
    const ticket = db.data.tickets.find((candidate) => candidate.id === ticketId || candidate.key === ticketId);

    if (!ticket) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }

    const access = AuthService.canAccessResource({
      user,
      action: 'READ',
      resourceType: 'TICKET',
      resource: ticket,
    });
    if (!access.allowed) {
      res.status(403).json({ success: false, error: access.reason });
      return;
    }

    const isDepartmentMember = Boolean(
      ((ticket.targetDepartmentId && ticket.targetDepartmentId === user.departmentId) ||
        (!ticket.targetDepartmentId && ticket.departmentId && ticket.departmentId === user.departmentId) ||
        ticket.participatingDepartmentIds?.includes(user.departmentId || '')) &&
      (!ticket.targetSectionId || ticket.targetSectionId === user.sectionId)
    );
    const isTeamMember = Boolean(
      ticket.assignmentGroupId && user.teamIds?.includes(ticket.assignmentGroupId)
    );
    const isPlatformPrivileged = user.roles.some((r) =>
      ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER'].includes(r)
    );
    if (!isDepartmentMember && !isTeamMember && !isPlatformPrivileged) {
      res.status(403).json({ success: false, error: 'Only a member of the assigned department or team can claim this ticket.' });
      return;
    }

    if (ticket.statusCategory === 'DONE' || ticket.statusCategory === 'CANCELLED') {
      res.status(409).json({ success: false, error: 'Completed or cancelled tickets cannot be claimed.' });
      return;
    }

    if (ticket.assigneeId && ticket.assigneeId !== user.id) {
      res.status(409).json({ success: false, error: 'This ticket has already been claimed by another employee.' });
      return;
    }

    if (ticket.assigneeId === user.id) {
      res.json({ success: true, ticket, alreadyClaimed: true });
      return;
    }

    const now = new Date().toISOString();
    ticket.assigneeId = user.id;
    ticket.assignedAt = now;
    ticket.updatedAt = now;
    ticket.version += 1;
    ticket.participantIds = Array.from(new Set([...(ticket.participantIds || []), user.id]));
    ticket.watcherIds = Array.from(new Set([...(ticket.watcherIds || []), user.id]));

    AuditService.log({
      actor: user,
      action: 'ASSIGNMENT_CHANGED',
      entityType: 'TICKET',
      entityId: ticket.id,
      entityKey: ticket.key,
      fieldChanges: [{ field: 'assigneeId', oldValue: undefined, newValue: user.id }],
      metadata: { source: 'DEPARTMENT_QUEUE_CLAIM', targetDepartmentId: ticket.targetDepartmentId },
    });
    AutomationService.triggerEvent('ASSIGNMENT_CHANGED', ticket, user);
    db.persist();

    res.json({ success: true, ticket });
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

    try {
      TicketLifecycleService.validateTicketUpdates(updates);
    } catch (error: any) {
      res.status(400).json({ success: false, error: 'Ticket update validation failed.', details: error.issues || error.message });
      return;
    }

    const rejectedFields = Object.keys(updates).filter((key) => !TICKET_EDITABLE_FIELDS.has(key) && key !== 'version');
    if (rejectedFields.length > 0) {
      res.status(400).json({
        success: false,
        error: `Fields must be changed through their dedicated lifecycle operation: ${rejectedFields.join(', ')}`,
      });
      return;
    }

    const requestedAdminFields = Object.keys(updates).filter((key) => TICKET_ADMIN_FIELDS.has(key));
    const canAdministerTicket = user.roles.some((role) =>
      ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'TEAM_LEAD'].includes(role)
    );
    if (requestedAdminFields.length > 0 && !canAdministerTicket) {
      res.status(403).json({ success: false, error: `Administrative ticket permission required for: ${requestedAdminFields.join(', ')}` });
      return;
    }

    const fieldChanges: { field: string; oldValue: any; newValue: any }[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (TICKET_EDITABLE_FIELDS.has(k) && (ticket as any)[k] !== v) {
        fieldChanges.push({ field: k, oldValue: (ticket as any)[k], newValue: v });
        (ticket as any)[k] = v;
      }
    }

    ticket.updatedAt = new Date().toISOString();
    ticket.version += 1;

    if (updates.businessImpact || updates.urgency) {
      ticket.businessPriority = TicketLifecycleService.calculatePriority(
        ticket.businessImpact,
        ticket.urgency || 'MEDIUM'
      );
    }
    if (updates.assigneeId && !ticket.assignedAt) ticket.assignedAt = ticket.updatedAt;

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
    const ticketId = req.params.id as string;
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

    const access = AuthService.canAccessResource({ user, action: 'WRITE', resourceType: 'TICKET', resource: ticket });
    if (!access.allowed) {
      res.status(403).json({ success: false, error: access.reason });
      return;
    }

    if (typeof content !== 'string' || content.trim().length === 0 || content.length > 50_000) {
      res.status(400).json({ success: false, error: 'Comment content is required and must be shorter than 50,000 characters.' });
      return;
    }

    const internalVisibility = visibility === 'SECURITY_TEAM_ONLY';
    const canWriteInternal = user.roles.some((role) =>
      ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'TEAM_LEAD', 'SECURITY_ANALYST', 'SOC_ANALYST', 'APPSEC_ANALYST', 'VULN_ANALYST', 'GRC_ANALYST', 'DLP_ANALYST'].includes(role)
    );
    if (internalVisibility && !canWriteInternal) {
      res.status(403).json({ success: false, error: 'Internal security notes require an agent or security role.' });
      return;
    }

    const newComment = {
      id: `comm-${uuidv4().substring(0, 8)}`,
      ticketId: ticket.id,
      authorId: user.id,
      authorName: user.fullName,
      authorRole: user.roles[0] || 'ANALYST',
      authorAvatar: user.avatarUrl,
      content: content.trim(),
      visibility: visibility || 'PUBLIC',
      confidentiality: ticket.confidentiality,
      mentions: mentions || [],
      createdAt: new Date().toISOString(),
      isEdited: false,
      reactions: [],
    };

    db.data.comments.unshift(newComment);
    ticket.updatedAt = new Date().toISOString();
    if (!internalVisibility && !ticket.firstResponseAt && user.id !== (ticket.requesterId || ticket.reporterId)) {
      ticket.firstResponseAt = ticket.updatedAt;
    }

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

  public static getLifecycle(req: AuthenticatedRequest, res: Response): void {
    const ticket = TicketsController.getAuthorizedTicket(req, res, 'READ');
    if (!ticket) return;
    res.json({ success: true, lifecycle: TicketLifecycleService.getBundle(ticket, req.user!) });
  }

  public static addRelationship(req: AuthenticatedRequest, res: Response): void {
    const ticket = TicketsController.getAuthorizedTicket(req, res, 'WRITE');
    if (!ticket) return;
    try {
      const relationship = TicketLifecycleService.addRelationship(
        ticket,
        req.body.targetTicketId,
        req.body.type as TicketRelationshipType,
        req.user!,
        req.body.note
      );
      res.status(201).json({ success: true, relationship });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  public static mergeDuplicate(req: AuthenticatedRequest, res: Response): void {
    const ticket = TicketsController.getAuthorizedTicket(req, res, 'WRITE');
    if (!ticket) return;
    try {
      const result = TicketLifecycleService.mergeDuplicate(ticket, req.body.primaryTicketId, req.user!, Boolean(req.body.moveComments));
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  public static addTask(req: AuthenticatedRequest, res: Response): void {
    const ticket = TicketsController.getAuthorizedTicket(req, res, 'WRITE');
    if (!ticket) return;
    try {
      const task = TicketLifecycleService.addTask(ticket, req.body, req.user!);
      res.status(201).json({ success: true, task });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  public static updateTask(req: AuthenticatedRequest, res: Response): void {
    const ticket = TicketsController.getAuthorizedTicket(req, res, 'WRITE');
    if (!ticket) return;
    try {
      const updates = typeof req.body === 'object' && req.body !== null ? req.body : { status: req.body };
      const task = TicketLifecycleService.updateTask(ticket, String(req.params.taskId), updates, req.user!);
      res.json({ success: true, task });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  public static createSubTicket(req: AuthenticatedRequest, res: Response): void {
    const ticket = TicketsController.getAuthorizedTicket(req, res, 'WRITE');
    if (!ticket) return;
    try {
      const result = TicketLifecycleService.createSubTicket(ticket, req.body, req.user!);
      res.status(201).json({ success: true, ...result });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  public static addWorklog(req: AuthenticatedRequest, res: Response): void {
    const ticket = TicketsController.getAuthorizedTicket(req, res, 'WRITE');
    if (!ticket) return;
    try {
      const worklog = TicketLifecycleService.addWorklog(ticket, req.body, req.user!);
      res.status(201).json({ success: true, worklog });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  public static submitSatisfaction(req: AuthenticatedRequest, res: Response): void {
    const ticket = TicketsController.getAuthorizedTicket(req, res, 'READ');
    if (!ticket) return;
    const user = req.user!;
    if (user.id !== (ticket.requesterId || ticket.reporterId) && !user.roles.includes('PLATFORM_ADMIN')) {
      res.status(403).json({ success: false, error: 'Only the requester can submit satisfaction feedback.' });
      return;
    }
    try {
      const satisfaction = TicketLifecycleService.submitSatisfaction(ticket, Number(req.body?.score), req.body?.comment, user);
      res.status(201).json({ success: true, satisfaction });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  public static analyze(req: AuthenticatedRequest, res: Response): void {
    const ticket = TicketsController.getAuthorizedTicket(req, res, 'WRITE');
    if (!ticket) return;
    const recommendation = TicketLifecycleService.analyze(ticket);
    AuditService.log({
      actor: req.user!,
      action: 'TICKET_UPDATED',
      entityType: 'TICKET',
      entityId: ticket.id,
      entityKey: ticket.key,
      metadata: { lifecycleAction: 'AI_RECOMMENDATION_CREATED', recommendationId: recommendation.id },
    });
    res.status(201).json({ success: true, recommendation });
  }

  public static applyRecommendation(req: AuthenticatedRequest, res: Response): void {
    const ticket = TicketsController.getAuthorizedTicket(req, res, 'WRITE');
    if (!ticket) return;
    if (req.body.confirmed !== true) {
      res.status(400).json({ success: false, error: 'Explicit human confirmation is required.' });
      return;
    }
    try {
      const recommendation = TicketLifecycleService.applyRecommendation(ticket, String(req.params.recommendationId), req.user!);
      res.json({ success: true, recommendation, ticket });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  public static bulkUpdate(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const { ticketIds, action, value } = req.body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      res.status(400).json({ success: false, error: 'No ticket IDs specified.' });
      return;
    }

    if (!['ASSIGN', 'SET_PRIORITY', 'SET_SEVERITY', 'ADD_TAG', 'RESOLVE', 'MARK_RESOLVED'].includes(action)) {
      res.status(400).json({ success: false, error: 'Unsupported bulk action.' });
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
        case 'RESOLVE':
        case 'MARK_RESOLVED':
          ticket.statusId = 'RESOLVED';
          ticket.statusName = 'Resolved';
          ticket.statusCategory = 'DONE';
          ticket.resolvedAt = now;
          ticket.slaState = 'MET';
          ticket.resolutionCode = 'FIXED';
          ticket.resolutionSummary = typeof value === 'string' && value ? value : 'Marked as resolved via bulk table action';
          TicketLifecycleService.refreshSlaMetrics(ticket);
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

  /**
   * Enterprise Multi-Department Workflow & Task Graph Fanout
   */
  public static createMultiTaskWorkflow(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const { templateTitle, description, tasks } = req.body;

    if (!templateTitle || !Array.isArray(tasks) || tasks.length === 0) {
      res.status(400).json({ success: false, error: 'Workflow requires a title and at least 1 task.' });
      return;
    }

    const now = new Date().toISOString();
    const createdTickets: Ticket[] = [];
    const createdDependencies: any[] = [];

    // Ensure ganttDependencies array exists
    if (!db.data.ganttDependencies) {
      db.data.ganttDependencies = [];
    }

    // Create tasks sequentially
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const seqNumber = db.data.tickets.length + 101 + i;
      const category = t.category || 'SECURITY_REVIEW';
      const severity = t.technicalSeverity || 'HIGH';
      const priority = t.businessPriority || 'P2_HIGH';
      const slaHours = Number(t.slaHours) || 24;

      const newTicket: Ticket = {
        id: `tick-wf-${uuidv4().substring(0, 8)}`,
        key: `SEC-2026-${seqNumber}`,
        projectCode: 'SEC',
        ticketTypeId: category,
        ticketTypeName: t.targetDepartment ? `[${t.targetDepartment}] ${category}` : category,
        category,
        securityDomain: (t.targetDepartment === 'HR_LEGAL' ? 'AUDIT_COMPLIANCE' : t.targetDepartment === 'SECOPS_SOC' ? 'SOC' : 'APPSEC') as any,
        workflowId: 'wf-secops-default',
        workflowVersion: 1,
        statusId: 'OPEN',
        statusName: 'Open',
        statusCategory: 'TO_DO',
        title: t.title,
        description: t.description || `Generated part of workflow: ${templateTitle}`,
        technicalSeverity: severity,
        businessPriority: priority,
        businessImpact: 'SIGNIFICANT',
        inherentRisk: 'MEDIUM',
        residualRisk: 'LOW',
        riskScore: 6.5,
        confidentiality: 'RESTRICTED',
        restrictedUserIds: [],
        restrictedTeamIds: [],
        reporterId: user.id,
        assigneeId: t.assigneeId || user.id,
        watcherIds: [user.id],
        customFields: [],
        createdAt: now,
        updatedAt: now,
        detectedAt: now,
        dueDate: new Date(Date.now() + (t.offsetDays || i * 2) * 86400000 + slaHours * 3600000).toISOString(),
        remediationDeadline: new Date(Date.now() + (t.offsetDays || i * 2) * 86400000 + slaHours * 3600000).toISOString(),
        slaPolicyId: 'sla-p1-emergency',
        slaState: 'SAFE',
        version: 1,
        tags: ['MULTI_DEPT_WORKFLOW', t.targetDepartment || 'GENERAL', ...(t.tags || [])],
      };

      const sla = SLAService.calculateSLA(newTicket);
      newTicket.slaState = sla.state;
      newTicket.slaRemainingMinutes = sla.remainingMinutes;

      db.data.tickets.unshift(newTicket);
      createdTickets.push(newTicket);

      // Create dependency if dependsOnPreviousIndex is specified
      if (t.dependsOnIndex !== undefined && t.dependsOnIndex !== null && createdTickets[t.dependsOnIndex]) {
        const fromTicket = createdTickets[t.dependsOnIndex];
        const dep = {
          id: `dep-${uuidv4().substring(0, 8)}`,
          fromTaskId: fromTicket.id,
          toTaskId: newTicket.id,
          type: 'FINISH_TO_START' as const,
        };
        db.data.ganttDependencies.push(dep);
        createdDependencies.push(dep);
      }

      // Create real notification for assignee
      if (newTicket.assigneeId) {
        if (!db.data.notifications) db.data.notifications = [];
        db.data.notifications.unshift({
          id: `notif-${uuidv4().substring(0, 8)}`,
          userId: newTicket.assigneeId,
          title: `New Assigned Task: ${newTicket.key}`,
          message: `You were assigned [${t.targetDepartment || 'Workflow'}]: "${newTicket.title}" under ${templateTitle}.`,
          type: 'ASSIGNMENT',
          severity: severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
          timestamp: now,
          isRead: false,
          ticketId: newTicket.id,
          ticketKey: newTicket.key,
        });
      }

      AuditService.log({
        actor: user,
        action: 'TICKET_CREATED',
        entityType: 'TICKET',
        entityId: newTicket.id,
        entityKey: newTicket.key,
        metadata: { title: newTicket.title, template: templateTitle, department: t.targetDepartment },
      });
    }

    db.persist();

    res.status(201).json({
      success: true,
      message: `Successfully instantiated workflow "${templateTitle}" with ${createdTickets.length} tasks across target departments.`,
      tickets: createdTickets,
      dependencies: createdDependencies,
    });
  }

  private static getAuthorizedTicket(
    req: AuthenticatedRequest,
    res: Response,
    action: 'READ' | 'WRITE'
  ): Ticket | undefined {
    const ticket = db.data.tickets.find((candidate) => candidate.id === req.params.id || candidate.key === req.params.id);
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return undefined;
    }
    const access = AuthService.canAccessResource({ user: req.user!, action, resourceType: 'TICKET', resource: ticket });
    if (!access.allowed) {
      res.status(403).json({ success: false, error: access.reason });
      return undefined;
    }
    return ticket;
  }
}
