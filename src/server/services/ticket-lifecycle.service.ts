import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { BankUser } from '../../shared/types/auth.js';
import { BusinessImpact, BusinessPriority, TechnicalSeverity, Ticket, TicketCategory } from '../../shared/types/ticket.js';
import {
  EnterpriseTicketType,
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
    category: z.enum(['VULNERABILITY', 'INCIDENT', 'SECURITY_EXCEPTION', 'RISK_ACCEPTANCE', 'AUDIT_FINDING', 'SECURITY_REVIEW', 'IAM_REQUEST', 'DLP_ALERT', 'THIRD_PARTY_ASSESSMENT', 'GENERAL_REQUEST']).optional(),
    securityDomain: z.enum(['GENERAL_INFOSEC', 'SOC', 'VULNERABILITY_MGMT', 'APPSEC', 'GRC', 'DLP', 'IAM_PAM', 'SEC_ARCHITECTURE', 'AUDIT_COMPLIANCE', 'THIRD_PARTY_RISK']).optional(),
    type: z.enum(['INCIDENT', 'SERVICE_REQUEST', 'PROBLEM', 'CHANGE', 'SECURITY_INCIDENT', 'ACCESS_REQUEST', 'VULNERABILITY', 'CUSTOM']).optional(),
    title: z.string().trim().min(3).max(300),
    description: z.string().trim().min(1).max(100_000).optional(),
    technicalSeverity: z.enum(['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    businessPriority: z.enum(['P1_URGENT', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW']).optional(),
    businessImpact: z.enum(['CATASTROPHIC', 'SIGNIFICANT', 'MODERATE', 'MINOR', 'NEGLIGIBLE']).optional(),
    urgency: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
    intakeChannel: z
      .enum(['PORTAL', 'EMAIL', 'AGENT', 'API', 'WEBHOOK', 'CHAT', 'MONITORING_SIEM', 'SECURITY_TOOL', 'AUTOMATION', 'ANOTHER_TICKET', 'SCHEDULED_TASK'])
      .optional(),
    requesterId: z.string().min(1).optional(),
    onBehalfOfUserId: z.string().min(1).optional(),
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
    const body: any = createTicketSchema.parse(raw);
    const requesterId = body.requesterId || body.onBehalfOfUserId || actor.id;
    if (!db.data.users.some((user) => user.id === requesterId && user.isActive)) {
      throw new Error('Requester does not exist or is inactive.');
    }
    if (body.onBehalfOfUserId && !db.data.users.some((user) => user.id === body.onBehalfOfUserId && user.isActive)) {
      throw new Error('On-behalf-of user does not exist or is inactive.');
    }

    const impact = (body.businessImpact || 'MODERATE') as BusinessImpact;
    const urgency = (body.urgency || TicketLifecycleService.deriveUrgency(body.technicalSeverity)) as TicketUrgency;
    const ticketType = (body.type || TicketLifecycleService.mapCategoryToType(body.category)) as EnterpriseTicketType;
    const priority = body.businessPriority || TicketLifecycleService.calculatePriority(impact, urgency);

    return {
      ...body,
      description: body.description || body.title,
      requesterId,
      businessImpact: impact,
      urgency,
      type: ticketType,
      requestTypeId: body.requestTypeId || body.ticketTypeId || body.category || ticketType,
      requestTypeName: body.requestTypeName || body.ticketTypeName || TicketLifecycleService.titleCase(ticketType),
      intakeChannel: body.intakeChannel || 'PORTAL',
      businessPriority: priority,
      assignmentGroupId: body.assignmentGroupId || TicketLifecycleService.suggestAssignmentGroup(body.securityDomain, body.category),
      participantIds: Array.from(new Set([requesterId, ...(body.participantIds || [])])),
      affectedAssetIds: Array.from(new Set([...(body.affectedAssetIds || []), ...(body.assetId ? [body.assetId] : [])])),
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
    const updates = ticketUpdateSchema.parse(raw);
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
    const state = workflow?.states.find((item) => item.id === ticket.statusId);
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
    const relationships = db.data.ticketRelationships
      .filter((relationship) => relationship.sourceTicketId === ticket.id || relationship.targetTicketId === ticket.id)
      .map((relationship) => {
        const relatedId = relationship.sourceTicketId === ticket.id ? relationship.targetTicketId : relationship.sourceTicketId;
        const related = db.data.tickets.find((candidate) => candidate.id === relatedId);
        const canSeeRelated = related && (!user || AuthService.canAccessResource({ user, action: 'READ', resourceType: 'TICKET', resource: related }).allowed);
        return {
          ...relationship,
          relatedTicket: canSeeRelated && related
            ? { id: related.id, key: related.key, title: related.title, statusName: related.statusName }
            : undefined,
        };
      });
    return {
      relationships,
      tasks: db.data.ticketTasks.filter((task) => task.ticketId === ticket.id),
      worklogs: db.data.ticketWorklogs.filter((worklog) => worklog.ticketId === ticket.id),
      slaMetrics: TicketLifecycleService.initializeSlaMetrics(ticket),
      satisfaction: db.data.ticketSatisfaction.find((survey) => survey.ticketId === ticket.id),
      aiRecommendations: db.data.ticketAiRecommendations
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

  public static addTask(ticket: Ticket, input: Partial<TicketTask>, actor: BankUser): TicketTask {
    TicketLifecycleService.requireAgent(actor, 'create ticket tasks');
    const title = String(input.title || '').trim();
    if (title.length < 3) throw new Error('Task title must contain at least 3 characters.');
    const dependencyTaskIds = Array.from(new Set(input.dependencyTaskIds || []));
    if (dependencyTaskIds.some((id) => !db.data.ticketTasks.some((task) => task.id === id && task.ticketId === ticket.id))) {
      throw new Error('Every dependency must be a task on the same ticket.');
    }
    const now = new Date().toISOString();
    const task: TicketTask = {
      id: `task-${uuidv4().slice(0, 8)}`,
      ticketId: ticket.id,
      title,
      description: input.description,
      ownerId: input.ownerId,
      groupId: input.groupId,
      status: 'TO_DO',
      dueAt: input.dueAt,
      dependencyTaskIds,
      completionCondition: input.completionCondition,
      createdByUserId: actor.id,
      createdAt: now,
      updatedAt: now,
    };
    db.data.ticketTasks.push(task);
    TicketLifecycleService.audit(actor, ticket, 'TASK_ADDED', { taskId: task.id, title: task.title });
    db.persist();
    return task;
  }

  public static updateTask(ticket: Ticket, taskId: string, status: TicketTaskStatus, actor: BankUser): TicketTask {
    TicketLifecycleService.requireAgent(actor, 'update ticket tasks');
    if (!TASK_STATUSES.includes(status)) throw new Error('Unsupported task status.');
    const task = db.data.ticketTasks.find((candidate) => candidate.id === taskId && candidate.ticketId === ticket.id);
    if (!task) throw new Error('Ticket task not found.');
    if (status === 'DONE') {
      const blockedBy = task.dependencyTaskIds
        .map((id) => db.data.ticketTasks.find((candidate) => candidate.id === id))
        .filter((dependency) => dependency && !TERMINAL_TASK_STATES.includes(dependency.status));
      if (blockedBy.length > 0) throw new Error('Task dependencies must be completed first.');
    }
    const oldStatus = task.status;
    task.status = status;
    task.updatedAt = new Date().toISOString();
    task.completedAt = status === 'DONE' ? task.updatedAt : undefined;
    TicketLifecycleService.audit(actor, ticket, 'TASK_STATUS_CHANGED', { taskId, oldStatus, newStatus: status });
    db.persist();
    return task;
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
      activityType: input.activityType || 'INVESTIGATION',
      createdAt: new Date().toISOString(),
    };
    db.data.ticketWorklogs.push(worklog);
    TicketLifecycleService.audit(actor, ticket, 'WORKLOG_ADDED', { worklogId: worklog.id, durationMinutes });
    db.persist();
    return worklog;
  }

  public static submitSatisfaction(ticket: Ticket, input: Partial<TicketSatisfaction>, actor: BankUser): TicketSatisfaction {
    if (ticket.statusCategory !== 'DONE' && ticket.statusId !== 'RESOLVED' && ticket.statusId !== 'CLOSED') {
      throw new Error('CSAT can only be submitted for a resolved or closed ticket.');
    }
    if (db.data.ticketSatisfaction.some((survey) => survey.ticketId === ticket.id)) {
      throw new Error('Satisfaction feedback has already been submitted for this ticket.');
    }
    const score = Number(input.score);
    if (![1, 2, 3, 4, 5].includes(score)) throw new Error('CSAT score must be between 1 and 5.');
    const satisfaction: TicketSatisfaction = {
      id: `csat-${uuidv4().slice(0, 8)}`,
      ticketId: ticket.id,
      requesterId: actor.id,
      score: score as TicketSatisfaction['score'],
      comment: input.comment,
      agentRating: input.agentRating,
      resolutionQuality: input.resolutionQuality,
      speedRating: input.speedRating,
      submittedAt: new Date().toISOString(),
    };
    db.data.ticketSatisfaction.push(satisfaction);
    TicketLifecycleService.audit(actor, ticket, 'CSAT_SUBMITTED', { score });
    db.persist();
    return satisfaction;
  }

  public static analyze(ticket: Ticket): TicketAIRecommendation {
    const text = `${ticket.title} ${ticket.description}`.toLowerCase();
    let category: TicketCategory = ticket.category;
    let ticketType: EnterpriseTicketType = ticket.type || TicketLifecycleService.mapCategoryToType(ticket.category);
    let assignmentGroupId = ticket.assignmentGroupId;
    const tags = new Set(ticket.tags);
    const evidence: string[] = [];
    const riskSignals: string[] = [];

    if (/phish|suspicious sender|malicious email/.test(text)) {
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
      ticket.type === 'SECURITY_INCIDENT' && !ticket.incidentDetails ? 'incidentDetails' : '',
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
    if (category === 'INCIDENT' || category === 'DLP_ALERT') return 'SECURITY_INCIDENT';
    if (category === 'VULNERABILITY') return 'VULNERABILITY';
    if (category === 'IAM_REQUEST') return 'ACCESS_REQUEST';
    if (category === 'GENERAL_REQUEST' || category === 'SECURITY_REVIEW' || category === 'THIRD_PARTY_ASSESSMENT') return 'SERVICE_REQUEST';
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
    if (domain === 'GRC' || category === 'SECURITY_EXCEPTION' || category === 'RISK_ACCEPTANCE') return 'team-grc';
    if (domain === 'IAM_PAM' || category === 'IAM_REQUEST') return 'team-it-infra';
    if (domain === 'SOC' || domain === 'DLP' || category === 'INCIDENT' || category === 'DLP_ALERT') return 'team-soc';
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
      ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'TEAM_LEAD', 'SECURITY_ANALYST', 'SOC_ANALYST', 'APPSEC_ANALYST', 'VULN_ANALYST', 'GRC_ANALYST', 'DLP_ANALYST'].includes(role)
    );
    if (!allowed) throw new Error(`An agent role is required to ${operation}.`);
  }
}
