import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { BankUser } from '../../shared/types/auth.js';
import { BusinessImpact, BusinessPriority, TechnicalSeverity, Ticket, TicketCategory } from '../../shared/types/ticket.js';
import {
  ChecklistItem,
  EnterpriseTicketType,
  RecurringTaskConfig,
  RoutingStrategy,
  TicketAIRecommendation,
  TicketLifecycleBundle,
  TicketRelationship,
  TicketRelationshipType,
  TicketSatisfaction,
  TicketSLAInstance,
  TicketTask,
  TicketTaskStatus,
  TicketUrgency,
  TicketWorklog,
} from '../../shared/types/itsm.js';
import { db } from '../db/database.js';
import { AuditService } from './audit.service.js';
import { AuthService } from './auth.service.js';
import { RequestFormDefinition } from '../../shared/types/request-forms.js';
import { isIP } from 'node:net';

const createTicketSchema = z
  .object({
    projectCode: z.enum(['SEC', 'SOC', 'VM', 'APPSEC', 'GRC', 'DLP', 'IAM', 'ARCH', 'AUDIT', 'TPRM']).optional(),
    category: z.enum([
      'GENERAL_REQUEST',
      'GENERAL_TASK',
      'IT_SUPPORT',
      'ACCESS_REQUEST',
      'HARDWARE_SOFTWARE',
      'NETWORK_INFRASTRUCTURE',
      'CHANGE_REQUEST',
      'INCIDENT_MANAGEMENT',
      'PROJECT_DELIVERY',
      'FINANCE_PROCUREMENT',
      'HR_OPERATIONS',
      'COMPLIANCE_LEGAL',
      'BUSINESS_OPERATIONS',
      'SECURITY_REVIEW',
      'VULNERABILITY',
      'INCIDENT',
      'SECURITY_EXCEPTION',
      'RISK_ACCEPTANCE',
      'AUDIT_FINDING',
      'IAM_REQUEST',
      'DLP_ALERT',
      'THIRD_PARTY_ASSESSMENT',
    ]).optional(),
    securityDomain: z.enum(['GENERAL_INFOSEC', 'SOC', 'VULNERABILITY_MGMT', 'APPSEC', 'GRC', 'DLP', 'IAM_PAM', 'SEC_ARCHITECTURE', 'AUDIT_COMPLIANCE', 'THIRD_PARTY_RISK']).optional(),
    type: z.enum([
      'NORMAL_TASK',
      'PROJECT_WORK',
      'SERVICE_REQUEST',
      'INCIDENT',
      'MAJOR_INCIDENT',
      'PROBLEM',
      'CHANGE',
      'ACCESS_REQUEST',
      'PRIVILEGED_ACCESS',
      'VULNERABILITY',
      'SECURITY_EXCEPTION',
      'RISK_ACCEPTANCE',
      'EMPLOYEE_ONBOARDING',
      'EMPLOYEE_OFFBOARDING',
      'PROVISIONING',
      'PROCUREMENT_APPROVAL',
      'COMPLIANCE_REMEDIATION',
      'RELEASE_DEPLOYMENT',
      'HR_FINANCE_APPROVAL',
      'RECURRING_TASK',
      'CROSS_DEPARTMENT',
      'SECURITY_INCIDENT',
      'CUSTOM',
    ]).optional(),
    title: z.string().trim().min(3).max(300),
    description: z.string().trim().min(1).max(100_000).optional(),
    slaPolicyId: z.string().min(1).optional(),
    technicalSeverity: z.enum(['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    businessPriority: z.enum(['P1_URGENT', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW']).optional(),
    businessImpact: z.enum(['CATASTROPHIC', 'SIGNIFICANT', 'MODERATE', 'MINOR', 'NEGLIGIBLE']).optional(),
    urgency: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
    intakeChannel: z
      .enum(['PORTAL', 'EMAIL', 'AGENT', 'API', 'WEBHOOK', 'CHAT', 'MONITORING_SIEM', 'SECURITY_TOOL', 'AUTOMATION', 'ANOTHER_TICKET', 'SCHEDULED_TASK'])
      .optional(),
    requesterId: z.string().min(1).optional(),
    reporterId: z.string().min(1).optional(),
    onBehalfOfUserId: z.string().min(1).optional(),
    assigneeId: z.string().min(1).optional(),
    assignmentGroupId: z.string().min(1).optional(),
    departmentId: z.string().min(1).optional(),
    targetDepartmentId: z.string().min(1).optional(),
    acceptanceCriteria: z.string().max(20000).optional(),
    checklists: z.array(z.object({
      id: z.string().optional(),
      text: z.string().min(1),
      isCompleted: z.boolean().default(false),
      assigneeId: z.string().optional(),
      dueAt: z.string().optional(),
    })).optional(),
    recurringConfig: z.object({
      frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM_CRON']),
      interval: z.number().int().min(1).optional(),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
      cronExpression: z.string().optional(),
      nextRunAt: z.string(),
      endDate: z.string().optional(),
      isActive: z.boolean().default(true),
    }).optional(),
    estimatedHours: z.number().min(0).max(10000).optional(),
    storyPoints: z.number().min(0).max(100).optional(),
    startDate: z.string().optional(),
    routingStrategy: z.enum(['DIRECT_USER', 'TEAM_QUEUE', 'DEPT_MANAGER', 'REQUESTER_MANAGER', 'SERVICE_OWNER', 'ASSET_OWNER', 'ROLE_DISPATCH', 'ROUND_ROBIN', 'WORKLOAD_BALANCED', 'ON_CALL_GROUP']).optional(),
  })
  .passthrough();

const ticketUpdateSchema = z.object({
  title: z.string().trim().min(3).max(300).optional(),
  description: z.string().trim().min(1).max(100_000).optional(),
  technicalSeverity: z.enum(['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  businessImpact: z.enum(['CATASTROPHIC', 'SIGNIFICANT', 'MODERATE', 'MINOR', 'NEGLIGIBLE']).optional(),
  urgency: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  inherentRisk: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  residualRisk: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  cvssScore: z.number().min(0).max(10).nullable().optional(),
  cvssVector: z.string().max(128).nullable().optional(),
  confidentiality: z.enum(['PUBLIC', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL_SECURITY_ONLY', 'HIGHLY_RESTRICTED_HR_LEGAL']).optional(),
  restrictedUserIds: z.array(z.string()).max(500).optional(),
  restrictedTeamIds: z.array(z.string()).max(100).optional(),
  assigneeId: z.string().nullable().optional(),
  assignmentGroupId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  securityOwnerId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  targetDepartmentId: z.string().nullable().optional(),
  applicationId: z.string().nullable().optional(),
  assetId: z.string().nullable().optional(),
  affectedAssetIds: z.array(z.string()).max(500).optional(),
  affectedServiceId: z.string().nullable().optional(),
  riskOwnerId: z.string().nullable().optional(),
  watcherIds: z.array(z.string()).max(500).optional(),
  participantIds: z.array(z.string()).max(500).optional(),
  dueDate: z.string().datetime().optional(),
  remediationDeadline: z.string().datetime().optional(),
  startDate: z.string().optional(),
  acceptanceCriteria: z.string().max(20000).optional(),
  checklists: z.array(z.any()).max(100).optional(),
  recurringConfig: z.any().optional(),
  estimatedHours: z.number().min(0).max(10000).optional(),
  storyPoints: z.number().min(0).max(100).optional(),
  tags: z.array(z.string().min(1).max(64)).max(100).optional(),
  customFields: z.array(z.any()).max(500).optional(),
}).passthrough();

const IMPACT_SCORE: Record<BusinessImpact, number> = {
  CATASTROPHIC: 4,
  SIGNIFICANT: 3,
  MODERATE: 2,
  MINOR: 1,
  NEGLIGIBLE: 1,
};

const URGENCY_SCORE: Record<TicketUrgency, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

const TERMINAL_TASK_STATES: TicketTaskStatus[] = ['DONE', 'CANCELLED'];
const RELATIONSHIP_TYPES: TicketRelationshipType[] = ['RELATES_TO', 'BLOCKS', 'DUPLICATES', 'CAUSED_BY', 'PARENT_OF', 'PROBLEM_FOR', 'INCIDENT_OF', 'CHANGE_CAUSED', 'SECURITY_CASE_FOR'];
const TASK_STATUSES: TicketTaskStatus[] = ['TO_DO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];

export class TicketLifecycleService {
  public static validateAndNormalizeCreateInput(raw: unknown, actor: BankUser): Record<string, any> {
    const sanitized =
      typeof raw === 'object' && raw !== null
        ? Object.fromEntries(
            Object.entries(raw as Record<string, any>).map(([k, v]) => [
              k,
              typeof v === 'string' && v.trim() === '' ? undefined : v,
            ])
          )
        : raw;
    const body: any = createTicketSchema.parse(sanitized);
    const requesterId = body.requesterId || body.onBehalfOfUserId || actor.id;
    if (!db.data.users.some((user) => user.id === requesterId && user.isActive)) {
      throw new Error('Requester does not exist or is inactive.');
    }
    if (body.onBehalfOfUserId && !db.data.users.some((user) => user.id === body.onBehalfOfUserId && user.isActive)) {
      throw new Error('On-behalf-of user does not exist or is inactive.');
    }
    const assigneeId = body.assigneeId;
    if (assigneeId && !db.data.users.some((user) => user.id === assigneeId && user.isActive)) {
      throw new Error('Assignee does not exist or is inactive.');
    }
    const targetDepartment = body.targetDepartmentId
      ? db.data.departments.find((department) => department.id === body.targetDepartmentId && department.isActive !== false)
      : undefined;
    const targetTeam = body.targetDepartmentId
      ? db.data.teams.find((team) => team.id === body.targetDepartmentId)
      : undefined;
    if (body.targetDepartmentId && !targetDepartment && !targetTeam) {
      throw new Error('Target department or team does not exist or is inactive.');
    }
    const resolvedTargetDepartmentId = targetTeam?.departmentId || targetDepartment?.id;
    if (targetTeam && !db.data.departments.some((department) => department.id === targetTeam.departmentId && department.isActive !== false)) {
      throw new Error('Target team does not belong to an active department.');
    }
    if (body.slaPolicyId && !db.data.slaPolicies.some((policy) => policy.id === body.slaPolicyId)) {
      throw new Error('SLA policy does not exist.');
    }

    const impact = (body.businessImpact || 'MODERATE') as BusinessImpact;
    const urgency = (body.urgency || TicketLifecycleService.deriveUrgency(body.technicalSeverity)) as TicketUrgency;
    const ticketType = (body.type || TicketLifecycleService.mapCategoryToType(body.category)) as EnterpriseTicketType;
    const priority = body.businessPriority || TicketLifecycleService.calculatePriority(impact, urgency);

    // Dynamic Routing Strategy
    let dynamicAssigneeId = body.assigneeId;
    // Intake callers may select a target unit, never an arbitrary group ID.
    // Queue identity is derived below from that server-validated target.
    let dynamicGroupId: string | undefined;

    if (body.routingStrategy && !dynamicAssigneeId) {
      const requester = db.data.users.find((u) => u.id === requesterId);
      const dept = db.data.departments.find((d) => d.id === (resolvedTargetDepartmentId || body.departmentId || requester?.departmentId));
      if (body.routingStrategy === 'REQUESTER_MANAGER' && requester?.managerId) {
        dynamicAssigneeId = requester.managerId;
      } else if (body.routingStrategy === 'DEPT_MANAGER' && dept?.managerId) {
        dynamicAssigneeId = dept.managerId;
      } else if (body.routingStrategy === 'SERVICE_OWNER' && body.applicationId) {
        const app = db.data.applications.find((a) => a.id === body.applicationId);
        if (app?.ownerId) dynamicAssigneeId = app.ownerId;
      } else if (body.routingStrategy === 'ASSET_OWNER' && body.assetId) {
        const asset = db.data.assets.find((a) => a.id === body.assetId);
        if (asset?.ownerId) dynamicAssigneeId = asset.ownerId;
      }
    }

    if (dynamicAssigneeId && resolvedTargetDepartmentId) {
      const assignee = db.data.users.find((user) => user.id === dynamicAssigneeId);
      const isInTarget = assignee?.departmentId === resolvedTargetDepartmentId || Boolean(targetTeam && assignee?.teamIds?.includes(targetTeam.id));
      if (!isInTarget) throw new Error('Assignee does not belong to the selected department or team.');
    }

    return {
      ...body,
      description: body.description || body.title,
      requesterId,
      reporterId: body.reporterId || actor.id,
      businessImpact: impact,
      urgency,
      type: ticketType,
      ticketTypeId: ticketType,
      businessPriority: priority,
      departmentId: resolvedTargetDepartmentId || body.departmentId || actor.departmentId,
      targetDepartmentId: resolvedTargetDepartmentId,
      // A ticket is routed to a named person OR to a queue, never both. Client
      // supplied group IDs are ignored whenever a target unit has been chosen.
      assignmentGroupId: dynamicAssigneeId
        ? undefined
        : resolvedTargetDepartmentId
          ? targetTeam?.id
          : (dynamicGroupId || TicketLifecycleService.suggestAssignmentGroup(body.securityDomain, body.category)),
      assigneeId: dynamicAssigneeId,
      requestTypeId: body.requestTypeId || body.ticketTypeId || body.category || ticketType,
      requestTypeName: body.requestTypeName || body.ticketTypeName || TicketLifecycleService.titleCase(ticketType),
      intakeChannel: body.intakeChannel || 'PORTAL',
      participantIds: Array.from(new Set([requesterId, actor.id, ...(body.participantIds || [])])),
      affectedAssetIds: Array.from(new Set([...(body.affectedAssetIds || []), ...(body.assetId ? [body.assetId] : [])])),
      checklists: (body.checklists || []).map((item: any, idx: number) => ({
        id: item.id || `chk-${idx + 1}`,
        text: item.text,
        isCompleted: Boolean(item.isCompleted),
        assigneeId: item.assigneeId,
        dueAt: item.dueAt,
      })),
      acceptanceCriteria: body.acceptanceCriteria,
      recurringConfig: body.recurringConfig,
      estimatedHours: body.estimatedHours,
      storyPoints: body.storyPoints,
      startDate: body.startDate,
    };
  }

  public static calculatePriority(impact: BusinessImpact, urgency: TicketUrgency): BusinessPriority {
    const score = IMPACT_SCORE[impact] + URGENCY_SCORE[urgency];
    if (score >= 7) return 'P1_URGENT';
    if (score >= 5) return 'P2_HIGH';
    if (score >= 3) return 'P3_MEDIUM';
    return 'P4_LOW';
  }

  public static validateTicketUpdates(raw: unknown): void {
    const sanitized =
      typeof raw === 'object' && raw !== null
        ? Object.fromEntries(
            Object.entries(raw as Record<string, any>).map(([k, v]) => [
              k,
              typeof v === 'string' && v.trim() === '' ? undefined : v,
            ])
          )
        : raw;
    const updates = ticketUpdateSchema.parse(sanitized);
    const references: Array<[string, unknown, Array<{ id: string }>]> = [
      ['assigneeId', updates.assigneeId, db.data.users],
      ['ownerId', updates.ownerId, db.data.users],
      ['securityOwnerId', updates.securityOwnerId, db.data.users],
      ['riskOwnerId', updates.riskOwnerId, db.data.users],
      ['assignmentGroupId', updates.assignmentGroupId, db.data.teams],
      ['teamId', updates.teamId, db.data.teams],
      ['departmentId', updates.departmentId, db.data.departments],
      ['targetDepartmentId', updates.targetDepartmentId, db.data.departments],
      ['applicationId', updates.applicationId, db.data.applications],
      ['assetId', updates.assetId, db.data.assets],
    ];
    for (const [field, value, collection] of references) {
      if (typeof value === 'string' && !collection.some((candidate) => candidate.id === value)) {
        throw new Error(`${field} references an unknown record.`);
      }
    }
  }

  public static calculateSlaDeadlines(policyId: string | undefined, severity: TechnicalSeverity, startedAt: string): {
    remediationDeadline: string;
    resolutionDeadline: string;
  } {
    const policy = db.data.slaPolicies.find((candidate) => candidate.id === policyId) || db.data.slaPolicies[0];
    const thresholds = policy?.thresholds?.[severity] || policy?.thresholds?.MEDIUM;
    const startedMs = new Date(startedAt).getTime();
    return {
      remediationDeadline: new Date(startedMs + (thresholds?.remediationMinutes || 3 * 24 * 60) * 60_000).toISOString(),
      resolutionDeadline: new Date(startedMs + (thresholds?.resolutionMinutes || 7 * 24 * 60) * 60_000).toISOString(),
    };
  }

  public static validateRequestFormSubmission(form: RequestFormDefinition, values: unknown): Record<string, any> {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Request form values must be an object.');
    const input = values as Record<string, any>;
    const output: Record<string, any> = {};
    const errors: string[] = [];

    for (const field of form.fields) {
      const condition = field.conditionalOn;
      const controllingValue = condition ? input[condition.fieldId] : undefined;
      const isVisible = !condition || TicketLifecycleService.matchesFormCondition(
        controllingValue,
        condition.operator || 'EQUALS',
        condition.value
      );
      if (!isVisible || field.type === 'calculated') continue;
      if (field.type === 'hidden') {
        if (field.defaultValue !== undefined) output[field.id] = field.defaultValue;
        continue;
      }

      const value = input[field.id] ?? field.defaultValue;
      const isEmpty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
      if (field.required && isEmpty) {
        errors.push(`${field.label} is required.`);
        continue;
      }
      if (isEmpty) continue;

      if (field.type === 'number' && !Number.isFinite(Number(value))) errors.push(`${field.label} must be numeric.`);
      if (field.type === 'email' && !z.string().email().safeParse(value).success) errors.push(`${field.label} must be a valid email address.`);
      if (field.type === 'url' && !z.string().url().safeParse(value).success) errors.push(`${field.label} must be a valid URL.`);
      if (field.type === 'ip-address' && isIP(String(value)) === 0) errors.push(`${field.label} must be a valid IP address.`);
      if ((field.type === 'select' || field.type === 'radio') && field.options && !field.options.includes(String(value))) {
        errors.push(`${field.label} contains an unsupported option.`);
      }
      if (field.type === 'multi-select' && (!Array.isArray(value) || value.some((item) => field.options && !field.options.includes(String(item))))) {
        errors.push(`${field.label} contains unsupported options.`);
      }
      if (typeof value === 'string' && field.validation?.pattern && !new RegExp(field.validation.pattern).test(value)) {
        errors.push(`${field.label} does not match the required format.`);
      }
      output[field.id] = field.type === 'number' ? Number(value) : value;
    }

    if (errors.length > 0) throw new Error(errors.join(' '));
    return output;
  }

  public static initializeSlaMetrics(ticket: Ticket): TicketSLAInstance[] {
    const existing = db.data.ticketSlaInstances.filter((metric) => metric.ticketId === ticket.id);
    if (existing.length > 0) return TicketLifecycleService.refreshSlaMetrics(ticket);

    const policy = db.data.slaPolicies.find((item) => item.id === ticket.slaPolicyId) || db.data.slaPolicies[0];
    if (!policy) return [];
    const thresholds = policy.thresholds[ticket.technicalSeverity] || policy.thresholds.MEDIUM;
    const definitions: Array<[TicketSLAInstance['metric'], number]> = [
      ['ACKNOWLEDGMENT', thresholds.acknowledgmentMinutes],
      ['FIRST_RESPONSE', thresholds.firstResponseMinutes],
      ['ASSIGNMENT', Math.min(thresholds.acknowledgmentMinutes, thresholds.firstResponseMinutes)],
      ['REMEDIATION', thresholds.remediationMinutes],
      ['RESOLUTION', thresholds.resolutionMinutes],
    ];
    if (ticket.type === 'SECURITY_INCIDENT' || ticket.category === 'INCIDENT') {
      definitions.push(['CONTAINMENT', thresholds.remediationMinutes]);
    }

    const startedAt = ticket.createdAt;
    const startMs = new Date(startedAt).getTime();
    const created = definitions.map(([metric, targetMinutes]) => ({
      id: `sla-${uuidv4().slice(0, 8)}`,
      ticketId: ticket.id,
      policyId: policy.id,
      metric,
      targetMinutes,
      startedAt,
      deadlineAt: new Date(startMs + targetMinutes * 60_000).toISOString(),
      state: 'RUNNING' as const,
      elapsedMinutes: 0,
      remainingMinutes: targetMinutes,
      accruedPausedMinutes: 0,
    }));
    db.data.ticketSlaInstances.push(...created);
    db.persist();
    return TicketLifecycleService.refreshSlaMetrics(ticket);
  }

  public static refreshSlaMetrics(ticket: Ticket): TicketSLAInstance[] {
    const metrics = db.data.ticketSlaInstances.filter((metric) => metric.ticketId === ticket.id);
    const workflow = db.data.workflows.find((item) => item.id === ticket.workflowId);
    const state = workflow?.states?.find((item) => item.id === ticket.statusId);
    const shouldPause = Boolean(state?.isPausedSLA);
    const now = Date.now();

    for (const metric of metrics) {
      const completion = TicketLifecycleService.getMetricCompletion(ticket, metric.metric);
      if (completion) {
        const completedMs = new Date(completion).getTime();
        metric.completedAt = completion;
        metric.elapsedMinutes = Math.max(0, Math.floor((completedMs - new Date(metric.startedAt).getTime()) / 60_000) - metric.accruedPausedMinutes);
        metric.remainingMinutes = Math.max(0, metric.targetMinutes - metric.elapsedMinutes);
        metric.state = completedMs <= new Date(metric.deadlineAt).getTime() ? 'MET' : 'BREACHED';
        if (metric.state === 'BREACHED' && !metric.breachedAt) metric.breachedAt = metric.deadlineAt;
        continue;
      }

      if (shouldPause) {
        if (!metric.pausedAt) metric.pausedAt = new Date(now).toISOString();
        metric.pausedReason = state?.pauseReason || ticket.slaPausedReason || 'Workflow wait state';
        metric.state = 'PAUSED';
      } else {
        if (metric.pausedAt) {
          metric.accruedPausedMinutes += Math.max(0, Math.floor((now - new Date(metric.pausedAt).getTime()) / 60_000));
          metric.pausedAt = undefined;
          metric.pausedReason = undefined;
          metric.deadlineAt = new Date(new Date(metric.startedAt).getTime() + (metric.targetMinutes + metric.accruedPausedMinutes) * 60_000).toISOString();
        }
        metric.elapsedMinutes = Math.max(0, Math.floor((now - new Date(metric.startedAt).getTime()) / 60_000) - metric.accruedPausedMinutes);
        metric.remainingMinutes = Math.max(0, metric.targetMinutes - metric.elapsedMinutes);
        if (metric.remainingMinutes <= 0) {
          metric.state = 'BREACHED';
          metric.breachedAt ||= metric.deadlineAt;
        } else if (metric.remainingMinutes <= Math.max(15, Math.floor(metric.targetMinutes * 0.25))) {
          metric.state = 'AT_RISK';
        } else {
          metric.state = 'RUNNING';
        }
      }
    }
    return metrics;
  }

  public static getBundle(ticket: Ticket, user?: BankUser): TicketLifecycleBundle {
    const relationships = (db.data.ticketRelationships || [])
      .filter((relationship) => relationship.sourceTicketId === ticket.id || relationship.targetTicketId === ticket.id)
      .map((relationship) => {
        const relatedId = relationship.sourceTicketId === ticket.id ? relationship.targetTicketId : relationship.sourceTicketId;
        const related = db.data.tickets.find((candidate) => candidate.id === relatedId);
        const canSeeRelated = related && (!user || AuthService.canAccessResource({ user, action: 'READ', resourceType: 'TICKET', resource: related }).allowed);
        return {
          ...relationship,
          relatedTicket: canSeeRelated && related
            ? {
                id: related.id,
                key: related.key,
                title: related.title,
                statusName: related.statusName,
                statusCategory: related.statusCategory,
                assigneeId: related.assigneeId,
                technicalSeverity: related.technicalSeverity,
                businessPriority: related.businessPriority,
              }
            : undefined,
        };
      });

    const subTickets = (db.data.tickets || [])
      .filter((t) => t.parentTicketId === ticket.id)
      .map((t) => ({
        id: t.id,
        key: t.key,
        title: t.title,
        statusName: t.statusName,
        statusCategory: t.statusCategory,
        assigneeId: t.assigneeId,
        departmentId: t.departmentId,
        targetDepartmentId: t.targetDepartmentId,
        technicalSeverity: t.technicalSeverity,
        businessPriority: t.businessPriority,
        createdAt: t.createdAt,
      }));

    let parentTicket: any = undefined;
    if (ticket.parentTicketId) {
      const p = (db.data.tickets || []).find((t) => t.id === ticket.parentTicketId);
      if (p) {
        parentTicket = {
          id: p.id,
          key: p.key,
          title: p.title,
          statusName: p.statusName,
          statusCategory: p.statusCategory,
          assigneeId: p.assigneeId,
          requesterId: p.requesterId,
          departmentId: p.departmentId,
        };
      }
    }

    return {
      relationships,
      tasks: (db.data.ticketTasks || []).filter((task) => task.ticketId === ticket.id),
      subTickets,
      parentTicket,
      worklogs: (db.data.ticketWorklogs || []).filter((worklog) => worklog.ticketId === ticket.id),
      slaMetrics: TicketLifecycleService.initializeSlaMetrics(ticket),
      satisfaction: (db.data.ticketSatisfaction || []).find((survey) => survey.ticketId === ticket.id),
      aiRecommendations: (db.data.ticketAiRecommendations || [])
        .filter((recommendation) => recommendation.ticketId === ticket.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  public static addRelationship(ticket: Ticket, targetTicketId: string, type: TicketRelationshipType, actor: BankUser, note?: string): TicketRelationship {
    if (!RELATIONSHIP_TYPES.includes(type)) throw new Error('Unsupported ticket relationship type.');
    const target = db.data.tickets.find((candidate) => candidate.id === targetTicketId || candidate.key === targetTicketId);
    if (!target || target.id === ticket.id) throw new Error('A distinct related ticket is required.');
    if (!AuthService.canAccessResource({ user: actor, action: 'READ', resourceType: 'TICKET', resource: target }).allowed) {
      throw new Error('Related ticket is unavailable.');
    }
    const duplicate = db.data.ticketRelationships.find(
      (item) => item.sourceTicketId === ticket.id && item.targetTicketId === target.id && item.type === type
    );
    if (duplicate) return duplicate;
    const relationship: TicketRelationship = {
      id: `rel-${uuidv4().slice(0, 8)}`,
      sourceTicketId: ticket.id,
      targetTicketId: target.id,
      type,
      createdByUserId: actor.id,
      createdAt: new Date().toISOString(),
      note,
    };
    db.data.ticketRelationships.push(relationship);
    TicketLifecycleService.audit(actor, ticket, 'RELATIONSHIP_ADDED', { relationshipId: relationship.id, type, targetTicketKey: target.key });
    db.persist();
    return relationship;
  }

  public static mergeDuplicate(
    duplicate: Ticket,
    primaryTicketId: string,
    actor: BankUser,
    moveComments = false
  ): { primary: Ticket; duplicate: Ticket; relationship: TicketRelationship } {
    TicketLifecycleService.requireAgent(actor, 'merge duplicate tickets');
    const primary = db.data.tickets.find((candidate) => candidate.id === primaryTicketId || candidate.key === primaryTicketId);
    if (!primary || primary.id === duplicate.id) throw new Error('A distinct primary ticket is required.');
    if (!AuthService.canAccessResource({ user: actor, action: 'WRITE', resourceType: 'TICKET', resource: primary }).allowed) {
      throw new Error('Primary ticket is unavailable.');
    }
    const relationship = TicketLifecycleService.addRelationship(duplicate, primary.id, 'DUPLICATES', actor, `Merged into ${primary.key}`);
    const now = new Date().toISOString();
    duplicate.statusId = 'CLOSED';
    duplicate.statusName = 'Closed';
    duplicate.statusCategory = 'DONE';
    duplicate.resolutionCode = 'DUPLICATE';
    duplicate.resolutionSummary = `Merged into primary ticket ${primary.key}.`;
    duplicate.duplicateOfTicketId = primary.id;
    duplicate.resolvedAt = now;
    duplicate.closedAt = now;
    duplicate.updatedAt = now;
    duplicate.version += 1;
    primary.watcherIds = Array.from(new Set([...primary.watcherIds, ...duplicate.watcherIds]));
    primary.participantIds = Array.from(new Set([...(primary.participantIds || []), ...(duplicate.participantIds || [])]));
    if (moveComments) {
      for (const comment of db.data.comments.filter((candidate) => candidate.ticketId === duplicate.id)) comment.ticketId = primary.id;
    }
    TicketLifecycleService.refreshSlaMetrics(duplicate);
    TicketLifecycleService.audit(actor, duplicate, 'DUPLICATE_MERGED', { primaryTicketId: primary.id, primaryTicketKey: primary.key, moveComments });
    db.persist();
    return { primary, duplicate, relationship };
  }

  public static addTask(ticket: Ticket, input: Partial<TicketTask> & { updateNote?: string }, actor: BankUser): TicketTask {
    TicketLifecycleService.requireAgent(actor, 'create ticket tasks');
    const title = String(input.title || '').trim();
    if (title.length < 2) throw new Error('Task title must contain at least 2 characters.');
    const dependencyTaskIds = Array.from(new Set(input.dependencyTaskIds || []));
    if (dependencyTaskIds.some((id) => !db.data.ticketTasks.some((task) => task.id === id && task.ticketId === ticket.id))) {
      throw new Error('Every dependency must be a task on the same ticket.');
    }
    const now = new Date().toISOString();
    const task: TicketTask = {
      id: `task-${uuidv4().slice(0, 8)}`,
      ticketId: ticket.id,
      title,
      description: input.description || input.updateNote || '',
      ownerId: input.ownerId || actor.id,
      groupId: input.groupId,
      status: (input.status as TicketTaskStatus) || 'TO_DO',
      dueAt: input.dueAt,
      dependencyTaskIds,
      completionCondition: input.completionCondition,
      createdByUserId: actor.id,
      createdAt: now,
      updatedAt: now,
    };
    db.data.ticketTasks.push(task);
    TicketLifecycleService.audit(actor, ticket, 'TASK_ADDED', { taskId: task.id, title: task.title, description: task.description });
    db.persist();
    return task;
  }

  public static updateTask(
    ticket: Ticket,
    taskId: string,
    updatesOrStatus: TicketTaskStatus | { status?: TicketTaskStatus; title?: string; description?: string; updateNote?: string },
    actor: BankUser
  ): TicketTask {
    TicketLifecycleService.requireAgent(actor, 'update ticket tasks');
    const updates = typeof updatesOrStatus === 'string' ? { status: updatesOrStatus } : updatesOrStatus;
    const task = db.data.ticketTasks.find((candidate) => candidate.id === taskId && candidate.ticketId === ticket.id);
    if (!task) throw new Error('Ticket task not found.');
    const oldStatus = task.status;
    if (updates.status && TASK_STATUSES.includes(updates.status)) {
      if (updates.status === 'DONE') {
        const blockedBy = task.dependencyTaskIds
          .map((id) => db.data.ticketTasks.find((candidate) => candidate.id === id))
          .filter((dependency) => dependency && !TERMINAL_TASK_STATES.includes(dependency.status));
        if (blockedBy.length > 0) throw new Error('Task dependencies must be completed first.');
      }
      task.status = updates.status;
      task.completedAt = updates.status === 'DONE' ? new Date().toISOString() : undefined;
    }
    if (updates.title) task.title = updates.title.trim();
    if (updates.description !== undefined) task.description = updates.description.trim();
    if (updates.updateNote) {
      task.description = task.description
        ? `${task.description}\n[${new Date().toLocaleTimeString()} ${actor.fullName}]: ${updates.updateNote.trim()}`
        : updates.updateNote.trim();
    }
    task.updatedAt = new Date().toISOString();
    TicketLifecycleService.audit(actor, ticket, 'TASK_STATUS_CHANGED', { taskId, oldStatus, newStatus: task.status, description: task.description });
    db.persist();
    return task;
  }

  public static createSubTicket(
    parentTicket: Ticket,
    input: {
      title: string;
      description?: string;
      targetDepartmentId?: string;
      assigneeId?: string;
      category?: TicketCategory;
      technicalSeverity?: TechnicalSeverity;
      businessImpact?: BusinessImpact;
      urgency?: TicketUrgency;
      businessPriority?: BusinessPriority;
      slaPolicyId?: string;
    },
    actor: BankUser
  ): { subTicket: Ticket; relationship: TicketRelationship } {
    TicketLifecycleService.requireAgent(actor, 'create sub-tickets');
    const title = String(input.title || '').trim();
    if (title.length < 3) throw new Error('Sub-ticket title must contain at least 3 characters.');

    const projectCode = parentTicket.projectCode || 'SEC';
    const year = new Date().getUTCFullYear();
    const highestSequence = (db.data.tickets || []).reduce((highest, ticket) => {
      const match = ticket.key.match(new RegExp(`^${projectCode}-${year}-(\\d+)$`));
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    const key = `${projectCode}-${year}-${String(highestSequence + 1).padStart(4, '0')}`;
    const now = new Date().toISOString();

    const defaultWorkflow = (db.data.workflows || [])[0];
    const initialStatus = defaultWorkflow?.states?.[0] || { id: 'OPEN', name: 'Open', category: 'TO_DO' };
    const defaultSlaPolicy = (db.data.slaPolicies || [])[0] || { id: 'sla-standard-business' };
    const slaPolicyId = input.slaPolicyId || defaultSlaPolicy.id;
    const technicalSeverity = input.technicalSeverity || parentTicket.technicalSeverity || 'MEDIUM';
    const slaDeadlines = TicketLifecycleService.calculateSlaDeadlines(slaPolicyId, technicalSeverity, now);

    const target = input.targetDepartmentId || undefined;
    const targetDepartment = target
      ? db.data.departments.find((department) => department.id === target && department.isActive !== false && department.directorySource === 'ACTIVE_DIRECTORY')
      : undefined;
    const targetTeam = target
      ? db.data.teams.find((team) => team.id === target)
      : undefined;
    if (target && !targetDepartment && !targetTeam) {
      throw new Error('Target department or team does not exist, is inactive, or is not AD-confirmed.');
    }
    if (targetTeam && !db.data.departments.some((department) => department.id === targetTeam.departmentId && department.isActive !== false && department.directorySource === 'ACTIVE_DIRECTORY')) {
      throw new Error('Target team does not belong to an active AD-confirmed department.');
    }

    const assignee = input.assigneeId
      ? db.data.users.find((user) => user.id === input.assigneeId && user.isActive && user.directorySource === 'ACTIVE_DIRECTORY')
      : undefined;
    if (input.assigneeId && !assignee) {
      throw new Error('Assignee does not exist, is inactive, or is not AD-confirmed.');
    }
    const canAssignDirect = actor.roles.some((role) =>
      ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'TEAM_LEAD', 'SECURITY_ANALYST', 'SOC_ANALYST', 'APPSEC_ANALYST', 'VULN_ANALYST', 'GRC_ANALYST', 'DLP_ANALYST'].includes(role)
    );
    if (assignee && !canAssignDirect && assignee.id !== actor.id) {
      throw new Error('You are not allowed to assign this sub-ticket to another user.');
    }

    const resolvedTargetDepartmentId = targetTeam?.departmentId || targetDepartment?.id;
    if (assignee && resolvedTargetDepartmentId) {
      const isInTarget = assignee.departmentId === resolvedTargetDepartmentId || Boolean(targetTeam && assignee.teamIds?.includes(targetTeam.id));
      if (!isInTarget) throw new Error('Assignee does not belong to the selected department or team.');
    }
    if (input.slaPolicyId && !db.data.slaPolicies.some((policy) => policy.id === input.slaPolicyId)) {
      throw new Error('SLA policy does not exist.');
    }

    const targetDeptId = resolvedTargetDepartmentId || undefined;
    const departmentId = targetDeptId || parentTicket.departmentId || actor.departmentId;
    const assigneeId = assignee?.id;

    // Participant sync: ensures A (requester), B (creator), C (assignee) are all linked
    const participantIds = Array.from(
      new Set([
        parentTicket.requesterId,
        parentTicket.assigneeId,
        actor.id,
        assigneeId,
        ...(parentTicket.participantIds || []),
      ].filter(Boolean) as string[])
    );

    const subTicket: Ticket = {
      id: `tick-${uuidv4().substring(0, 8)}`,
      key,
      projectCode,
      parentTicketId: parentTicket.id,
      ticketTypeId: input.category || parentTicket.ticketTypeId || 'GENERAL_TASK',
      ticketTypeName: parentTicket.ticketTypeName || 'Sub-Task',
      type: 'NORMAL_TASK',
      category: input.category || parentTicket.category || 'GENERAL_REQUEST',
      securityDomain: parentTicket.securityDomain || 'GENERAL_INFOSEC',
      title,
      description: input.description || title,
      statusId: initialStatus.id,
      statusName: initialStatus.name,
      statusCategory: initialStatus.category as any,
      workflowId: defaultWorkflow?.id || parentTicket.workflowId || 'wf-secops-default',
      workflowVersion: 1,
      technicalSeverity,
      businessPriority: input.businessPriority || parentTicket.businessPriority || 'P3_MEDIUM',
      businessImpact: input.businessImpact || parentTicket.businessImpact || 'MODERATE',
      urgency: input.urgency || parentTicket.urgency || 'MEDIUM',
      inherentRisk: parentTicket.inherentRisk || 'MEDIUM',
      residualRisk: parentTicket.residualRisk || 'LOW',
      riskScore: parentTicket.riskScore || 50,
      confidentiality: parentTicket.confidentiality || 'INTERNAL',
      restrictedUserIds: parentTicket.restrictedUserIds || [],
      restrictedTeamIds: parentTicket.restrictedTeamIds || [],
      reporterId: actor.id,
      requesterId: actor.id,
      assigneeId,
      assignmentGroupId: targetTeam && !assigneeId ? targetTeam.id : undefined,
      ownerId: actor.id,
      securityOwnerId: parentTicket.securityOwnerId || actor.id,
      departmentId,
      targetDepartmentId: targetDeptId,
      participantIds,
      watcherIds: Array.from(new Set([parentTicket.requesterId, actor.id, ...(parentTicket.watcherIds || [])].filter(Boolean) as string[])),
      createdAt: now,
      updatedAt: now,
      detectedAt: now,
      assignedAt: assigneeId ? now : undefined,
      dueDate: slaDeadlines.resolutionDeadline,
      remediationDeadline: slaDeadlines.remediationDeadline,
      slaState: 'SAFE',
      slaRemainingMinutes: 480,
      slaPolicyId,
      version: 1,
      tags: [...(parentTicket.tags || []), 'sub-ticket'],
      acceptanceCriteria: parentTicket.acceptanceCriteria,
      customFields: [],
    };

    db.data.tickets.unshift(subTicket);

    // Update parent ticket with child participant IDs
    parentTicket.participantIds = participantIds;
    parentTicket.watcherIds = Array.from(new Set([...(parentTicket.watcherIds || []), ...(assigneeId ? [assigneeId] : [])]));
    parentTicket.updatedAt = now;
    parentTicket.version += 1;

    // Create bidirectional relationship
    const relationship: TicketRelationship = {
      id: `rel-${uuidv4().slice(0, 8)}`,
      sourceTicketId: parentTicket.id,
      targetTicketId: subTicket.id,
      type: 'PARENT_OF',
      createdByUserId: actor.id,
      createdAt: now,
      note: `Delegated sub-ticket: ${subTicket.key}`,
    };
    db.data.ticketRelationships.push(relationship);

    TicketLifecycleService.audit(actor, parentTicket, 'SUB_TICKET_CREATED', { subTicketId: subTicket.id, subTicketKey: subTicket.key });
    TicketLifecycleService.audit(actor, subTicket, 'CREATED_AS_SUB_TICKET', { parentTicketId: parentTicket.id, parentTicketKey: parentTicket.key });

    db.persist();
    return { subTicket, relationship };
  }

  public static addWorklog(ticket: Ticket, input: Partial<TicketWorklog>, actor: BankUser): TicketWorklog {
    TicketLifecycleService.requireAgent(actor, 'record worklogs');
    const durationMinutes = Number(input.durationMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 24 * 60) {
      throw new Error('Worklog duration must be between 1 and 1440 minutes.');
    }
    const description = String(input.description || '').trim();
    if (!description) throw new Error('Worklog description is required.');
    const worklog: TicketWorklog = {
      id: `work-${uuidv4().slice(0, 8)}`,
      ticketId: ticket.id,
      agentId: actor.id,
      startedAt: input.startedAt || new Date().toISOString(),
      durationMinutes,
      description,
      billable: Boolean(input.billable),
      activityType: input.activityType || 'ANALYSIS',
      createdAt: new Date().toISOString(),
    };
    db.data.ticketWorklogs.push(worklog);
    TicketLifecycleService.audit(actor, ticket, 'WORKLOG_ADDED', { worklogId: worklog.id, durationMinutes, activityType: worklog.activityType });
    db.persist();
    return worklog;
  }

  public static submitSatisfaction(ticket: Ticket, score: number, comment: string | undefined, actor: BankUser): TicketSatisfaction {
    if (![1, 2, 3, 4, 5].includes(score)) throw new Error('Satisfaction score must be between 1 and 5.');
    const requesterId = ticket.requesterId || ticket.reporterId;
    if (actor.id !== requesterId && !actor.roles.includes('PLATFORM_ADMIN') && !actor.roles.includes('CISO')) {
      throw new Error('Only the ticket requester may submit satisfaction ratings.');
    }
    const satisfaction: TicketSatisfaction = {
      id: `csat-${uuidv4().slice(0, 8)}`,
      ticketId: ticket.id,
      requesterId: actor.id,
      score: score as 1 | 2 | 3 | 4 | 5,
      comment: comment?.trim() || undefined,
      submittedAt: new Date().toISOString(),
    };
    db.data.ticketSatisfaction = db.data.ticketSatisfaction.filter((item) => item.ticketId !== ticket.id);
    db.data.ticketSatisfaction.push(satisfaction);
    TicketLifecycleService.audit(actor, ticket, 'SATISFACTION_SUBMITTED', { satisfactionId: satisfaction.id, score });
    db.persist();
    return satisfaction;
  }

  public static analyze(ticket: Ticket): TicketAIRecommendation {
    return TicketLifecycleService.analyzeTicket(ticket);
  }

  public static analyzeTicket(ticket: Ticket): TicketAIRecommendation {
    const text = `${ticket.title} ${ticket.description}`.toLowerCase();
    const tags = new Set<string>(ticket.tags || []);
    const evidence: string[] = [];
    const riskSignals: string[] = [];

    let category = ticket.category;
    let ticketType = ticket.type || TicketLifecycleService.mapCategoryToType(ticket.category);
    let assignmentGroupId = ticket.assignmentGroupId;

    if (/phish|suspicious email|credential harvest|spoof/.test(text)) {
      category = 'INCIDENT';
      ticketType = 'SECURITY_INCIDENT';
      assignmentGroupId = 'team-soc';
      tags.add('PHISHING');
      evidence.push('Phishing-related language detected in title or description.');
    } else if (/vpn|privileged access|permission|access request/.test(text)) {
      category = 'IAM_REQUEST';
      ticketType = 'ACCESS_REQUEST';
      assignmentGroupId = 'team-it-infra';
      tags.add('ACCESS');
      evidence.push('Access-management language detected.');
    } else if (/cve-|vulnerab|cvss|injection|xss/.test(text)) {
      category = 'VULNERABILITY';
      ticketType = 'VULNERABILITY';
      assignmentGroupId = ticket.applicationId ? 'team-appsec' : 'team-soc';
      tags.add('VULNERABILITY');
      evidence.push('Vulnerability identifiers or weakness terminology detected.');
    }
    if (/production|swift|core banking|data exfiltration|ransomware/.test(text)) {
      riskSignals.push('Potential impact to a critical banking service or sensitive data.');
    }
    if (/credential|password|token|secret|customer data/.test(text)) {
      riskSignals.push('Credential or protected-data exposure language detected.');
    }

    const missingFields = [
      !ticket.affectedServiceId && !ticket.applicationId ? 'affectedService' : '',
      !ticket.assignmentGroupId ? 'assignmentGroup' : '',
      ticket.type === 'INCIDENT' && !ticket.incidentDetails ? 'incidentDetails' : '',
    ].filter(Boolean);
    const priority = riskSignals.length > 0
      ? TicketLifecycleService.calculatePriority(ticket.businessImpact, ticket.urgency || 'HIGH')
      : ticket.businessPriority;
    const confidence = Math.min(0.98, 0.58 + evidence.length * 0.16 + riskSignals.length * 0.08);
    const recommendation: TicketAIRecommendation = {
      id: `ai-${uuidv4().slice(0, 8)}`,
      ticketId: ticket.id,
      status: 'PENDING_REVIEW',
      category,
      ticketType,
      priority,
      assignmentGroupId,
      tags: Array.from(tags),
      summary: riskSignals.length > 0
        ? `Review as ${TicketLifecycleService.titleCase(ticketType)} with elevated banking-security context.`
        : `Review classification as ${TicketLifecycleService.titleCase(ticketType)}.`,
      missingFields,
      riskSignals,
      evidence: evidence.length > 0 ? evidence : ['No strong classifier signature; current classification retained.'],
      confidence,
      engineVersion: 'aegis-deterministic-advisor-v1',
      requiresHumanConfirmation: true,
      createdAt: new Date().toISOString(),
    };
    db.data.ticketAiRecommendations.push(recommendation);
    db.persist();
    return recommendation;
  }

  public static applyRecommendation(ticket: Ticket, recommendationId: string, actor: BankUser): TicketAIRecommendation {
    TicketLifecycleService.requireAgent(actor, 'apply AI recommendations');
    const recommendation = db.data.ticketAiRecommendations.find(
      (candidate) => candidate.id === recommendationId && candidate.ticketId === ticket.id
    );
    if (!recommendation || recommendation.status !== 'PENDING_REVIEW') throw new Error('Pending AI recommendation not found.');
    ticket.category = recommendation.category || ticket.category;
    ticket.type = recommendation.ticketType || ticket.type;
    ticket.businessPriority = recommendation.priority || ticket.businessPriority;
    ticket.assignmentGroupId = recommendation.assignmentGroupId || ticket.assignmentGroupId;
    ticket.tags = Array.from(new Set([...ticket.tags, ...(recommendation.tags || [])]));
    ticket.updatedAt = new Date().toISOString();
    ticket.version += 1;
    recommendation.status = 'APPLIED';
    recommendation.reviewedAt = ticket.updatedAt;
    recommendation.reviewedByUserId = actor.id;
    TicketLifecycleService.audit(actor, ticket, 'AI_RECOMMENDATION_APPLIED', {
      recommendationId,
      engineVersion: recommendation.engineVersion,
      confidence: recommendation.confidence,
    });
    db.persist();
    return recommendation;
  }

  private static getMetricCompletion(ticket: Ticket, metric: TicketSLAInstance['metric']): string | undefined {
    if (metric === 'ACKNOWLEDGMENT') return ticket.acknowledgedAt;
    if (metric === 'FIRST_RESPONSE' || metric === 'CUSTOMER_UPDATE') return ticket.firstResponseAt;
    if (metric === 'ASSIGNMENT') return ticket.assignedAt;
    if (metric === 'RESOLUTION' || metric === 'REMEDIATION' || metric === 'CONTAINMENT' || metric === 'RECOVERY') return ticket.resolvedAt;
    return undefined;
  }

  private static mapCategoryToType(category?: TicketCategory): EnterpriseTicketType {
    if (category === 'INCIDENT' || category === 'DLP_ALERT' || category === 'INCIDENT_MANAGEMENT') return 'SECURITY_INCIDENT';
    if (category === 'VULNERABILITY') return 'VULNERABILITY';
    if (category === 'IAM_REQUEST' || category === 'ACCESS_REQUEST') return 'ACCESS_REQUEST';
    if (category === 'SECURITY_EXCEPTION') return 'SECURITY_EXCEPTION';
    if (category === 'RISK_ACCEPTANCE') return 'RISK_ACCEPTANCE';
    if (category === 'IT_SUPPORT' || category === 'HARDWARE_SOFTWARE') return 'SERVICE_REQUEST';
    if (category === 'CHANGE_REQUEST' || category === 'NETWORK_INFRASTRUCTURE') return 'CHANGE';
    if (category === 'PROJECT_DELIVERY') return 'PROJECT_WORK';
    if (category === 'HR_OPERATIONS') return 'EMPLOYEE_ONBOARDING';
    if (category === 'GENERAL_TASK') return 'NORMAL_TASK';
    if (category === 'GENERAL_REQUEST' || category === 'SECURITY_REVIEW' || category === 'THIRD_PARTY_ASSESSMENT' || category === 'BUSINESS_OPERATIONS' || category === 'COMPLIANCE_LEGAL' || category === 'FINANCE_PROCUREMENT') return 'SERVICE_REQUEST';
    return 'CUSTOM';
  }

  private static deriveUrgency(severity?: string): TicketUrgency {
    if (severity === 'CRITICAL') return 'CRITICAL';
    if (severity === 'HIGH') return 'HIGH';
    if (severity === 'LOW' || severity === 'INFORMATIONAL') return 'LOW';
    return 'MEDIUM';
  }

  private static suggestAssignmentGroup(domain?: string, category?: TicketCategory): string | undefined {
    if (domain === 'APPSEC') return 'team-appsec';
    if (domain === 'GRC' || category === 'SECURITY_EXCEPTION' || category === 'RISK_ACCEPTANCE' || category === 'COMPLIANCE_LEGAL') return 'team-grc';
    if (domain === 'IAM_PAM' || category === 'IAM_REQUEST' || category === 'ACCESS_REQUEST' || category === 'IT_SUPPORT' || category === 'HARDWARE_SOFTWARE' || category === 'NETWORK_INFRASTRUCTURE') return 'team-it-infra';
    if (domain === 'SOC' || domain === 'DLP' || category === 'INCIDENT' || category === 'DLP_ALERT' || category === 'INCIDENT_MANAGEMENT') return 'team-soc';
    if (category === 'HR_OPERATIONS') return 'team-hr-ops';
    return undefined;
  }

  private static titleCase(value: string): string {
    return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  }

  private static matchesFormCondition(actual: any, operator: string, expected: any): boolean {
    if (operator === 'NOT_EQUALS') return actual !== expected;
    if (operator === 'IN') return Array.isArray(expected) && expected.includes(actual);
    if (operator === 'CONTAINS') return Array.isArray(actual) ? actual.includes(expected) : String(actual || '').includes(String(expected));
    if (operator === 'IS_SET') return actual !== undefined && actual !== null && actual !== '';
    return actual === expected;
  }

  private static audit(actor: BankUser, ticket: Ticket, lifecycleAction: string, metadata: Record<string, any>): void {
    AuditService.log({
      actor,
      action: 'TICKET_UPDATED',
      entityType: 'TICKET',
      entityId: ticket.id,
      entityKey: ticket.key,
      metadata: { lifecycleAction, ...metadata },
    });
  }

  private static requireAgent(actor: BankUser, operation: string): void {
    const allowed = actor.roles.some((role) =>
      ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'TEAM_LEAD', 'SECURITY_ANALYST', 'SOC_ANALYST', 'APPSEC_ANALYST', 'VULN_ANALYST', 'GRC_ANALYST', 'DLP_ANALYST', 'ASSIGNEE', 'DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'REQUESTER', 'APPROVER', 'OPERATOR', 'BRANCH_EMPLOYEE'].includes(role)
    );
    if (!allowed) throw new Error(`An agent role is required to ${operation}.`);
  }
}
