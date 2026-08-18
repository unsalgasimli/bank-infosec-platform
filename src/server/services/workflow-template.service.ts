import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import type { BankUser, SecurityDomain } from '../../shared/types/auth.js';
import type { BlueprintTaskTemplate, ProjectBlueprint, WorkflowRun } from '../../shared/types/blueprints.js';
import type { Ticket, TicketProjectCode } from '../../shared/types/ticket.js';
import { db } from '../db/database.js';
import { AuditService } from './audit.service.js';
import { AutomationService } from './automation.service.js';
import { SLAService } from './sla.service.js';
import { TicketLifecycleService } from './ticket-lifecycle.service.js';

const launchSchema = z.object({
  parameters: z.record(z.string().trim().max(500)).default({}),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

const customTemplateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(5000),
  projectCode: z.string().trim().min(2).max(12).optional(),
  workflowId: z.string().trim().min(1).optional(),
  slaPolicyId: z.string().trim().min(1).optional(),
  tasks: z.array(z.object({
    id: z.string().trim().min(1).max(100),
    title: z.string().trim().min(3).max(240),
    description: z.string().trim().max(5000).default(''),
    targetDepartment: z.string().trim().min(1),
    teamId: z.string().trim().optional(),
    assigneeId: z.string().trim().optional(),
    assigneeRole: z.string().trim().optional(),
    technicalSeverity: z.enum(['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    businessPriority: z.enum(['P1_URGENT', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW']),
    category: z.enum(['VULNERABILITY', 'INCIDENT', 'SECURITY_EXCEPTION', 'RISK_ACCEPTANCE', 'AUDIT_FINDING', 'SECURITY_REVIEW', 'IAM_REQUEST', 'DLP_ALERT', 'THIRD_PARTY_ASSESSMENT', 'GENERAL_REQUEST']),
    slaPolicyId: z.string().trim().optional(),
    durationDays: z.number().int().min(1).max(365),
    offsetDays: z.number().int().min(0).max(365).default(0),
    dependsOnTaskId: z.string().trim().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  })).min(1).max(100),
});

export class WorkflowTemplateError extends Error {
  constructor(message: string, public readonly statusCode = 400, public readonly details?: unknown) {
    super(message);
  }
}

type ResolvedTask = { definition: BlueprintTaskTemplate; assignee: BankUser; departmentId: string; teamId?: string; dependencyId?: string };

export class WorkflowTemplateService {
  static list() {
    return (db.data.blueprints || []).filter((template) => template.isActive !== false).map((template) => this.enrich(template));
  }

  static metadata() {
    return {
      departments: (db.data.departments || []).filter((item) => item.isActive !== false).map(({ id, name, code, color, settings }) => ({
        id, name, code, color, defaultSlaHours: settings?.defaultSlaHours,
      })),
      teams: (db.data.teams || []).map(({ id, name, code, departmentId, securityDomain }) => ({ id, name, code, departmentId, securityDomain })),
      users: (db.data.users || []).filter((item) => item.isActive).map(({ id, fullName, title, departmentId, teamIds, roles }) => ({ id, fullName, title, departmentId, teamIds, roles })),
      workflows: (db.data.workflows || []).filter((item) => item.isActive !== false).map(({ id, name, version }) => ({ id, name, version })),
      slaPolicies: (db.data.slaPolicies || []).map(({ id, name, description, isDefault, thresholds }) => ({ id, name, description, isDefault, thresholds })),
      categories: ['VULNERABILITY', 'INCIDENT', 'SECURITY_EXCEPTION', 'RISK_ACCEPTANCE', 'AUDIT_FINDING', 'SECURITY_REVIEW', 'IAM_REQUEST', 'DLP_ALERT', 'THIRD_PARTY_ASSESSMENT', 'GENERAL_REQUEST'],
      severities: ['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      priorities: ['P1_URGENT', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW'],
      projectCodes: ['SEC', 'SOC', 'VM', 'APPSEC', 'GRC', 'DLP', 'IAM', 'ARCH', 'AUDIT', 'TPRM'],
    };
  }

  static listRuns(actor: BankUser) {
    const canSeeAll = actor.roles.some((role) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER'].includes(role));
    return (db.data.workflowRuns || [])
      .filter((run) => canSeeAll || run.createdByUserId === actor.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((run) => ({
        ...run,
        tickets: run.createdTicketIds.map((id) => db.data.tickets.find((ticket) => ticket.id === id)).filter((ticket): ticket is Ticket => Boolean(ticket)).map(({ id, key, title, statusName, assigneeId }) => ({ id, key, title, statusName, assigneeId })),
      }));
  }

  static preview(template: ProjectBlueprint) {
    const resolved = this.resolve(template);
    return {
      template: this.enrich(template),
      tasks: resolved.map(({ definition, assignee, departmentId, teamId, dependencyId }) => ({
        ...definition,
        departmentId,
        departmentName: db.data.departments.find((item) => item.id === departmentId)?.name,
        teamId,
        teamName: teamId ? db.data.teams.find((item) => item.id === teamId)?.name : undefined,
        assigneeId: assignee.id,
        assigneeName: assignee.fullName,
        dependsOnTaskId: dependencyId,
      })),
    };
  }

  static launchStored(id: string, rawInput: unknown, actor: BankUser) {
    const template = (db.data.blueprints || []).find((item) => item.id === id && item.isActive !== false);
    if (!template) throw new WorkflowTemplateError('Workflow template not found.', 404);
    const input = launchSchema.parse(rawInput || {});
    this.validateParameters(template, input.parameters);
    return this.launch(template, input.parameters, actor, input.idempotencyKey);
  }

  static launchCustom(rawInput: unknown, actor: BankUser) {
    if (!actor.roles.some((role) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'TEAM_LEAD', 'DEPARTMENT_ADMIN'].includes(role))) {
      throw new WorkflowTemplateError('Workflow designer permission is required to launch a custom cross-team graph.', 403);
    }
    const parsed = customTemplateSchema.parse(rawInput);
    const template: ProjectBlueprint = {
      id: `custom-${uuidv4()}`,
      title: parsed.title,
      domain: 'Custom workflow',
      description: parsed.description,
      iconName: 'GitBranch',
      taskCount: parsed.tasks.length,
      estimatedDays: Math.max(...parsed.tasks.map((task) => task.offsetDays + task.durationDays)),
      projectCode: (parsed.projectCode || 'SEC') as TicketProjectCode,
      workflowId: parsed.workflowId,
      slaPolicyId: parsed.slaPolicyId,
      version: 1,
      isActive: true,
      defaultTasks: parsed.tasks,
    };
    return this.launch(template, {}, actor);
  }

  private static launch(template: ProjectBlueprint, parameters: Record<string, string>, actor: BankUser, idempotencyKey?: string) {
    if (idempotencyKey) {
      const prior = (db.data.workflowRuns || []).find((run) => run.idempotencyKey === idempotencyKey && run.createdByUserId === actor.id);
      if (prior) {
        return {
          run: prior,
          tickets: prior.createdTicketIds
            .map((id) => db.data.tickets.find((ticket) => ticket.id === id))
            .filter((ticket): ticket is Ticket => Boolean(ticket)),
          replayed: true,
        };
      }
    }

    const resolved = this.resolve(template);
    const workflow = db.data.workflows.find((item) => item.id === template.workflowId) || db.data.workflows.find((item) => item.isActive !== false);
    if (!workflow) throw new WorkflowTemplateError('No active ticket workflow is configured.', 422);
    const initialStatus = workflow.states.find((state) => state.isInitial) || workflow.states[0];
    if (!initialStatus) throw new WorkflowTemplateError('Selected workflow has no initial status.', 422);

    const now = new Date().toISOString();
    const projectCode = (template.projectCode || 'SEC') as TicketProjectCode;
    const year = new Date().getUTCFullYear();
    let sequence = db.data.tickets.reduce((highest, ticket) => {
      const match = ticket.key.match(new RegExp(`^${projectCode}-${year}-(\\d+)$`));
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    const created: Ticket[] = [];
    const idByDefinition = new Map<string, string>();
    const subject = parameters.subject?.trim();

    for (const item of resolved) {
      const definition = item.definition;
      const id = `tick-${uuidv4().slice(0, 8)}`;
      if (definition.id) idByDefinition.set(definition.id, id);
      sequence += 1;
      const slaPolicyId = definition.slaPolicyId || template.slaPolicyId || db.data.slaPolicies.find((policy) => policy.isDefault)?.id;
      if (!slaPolicyId) throw new WorkflowTemplateError(`No SLA policy is configured for task "${definition.title}".`, 422);
      const deadlines = TicketLifecycleService.calculateSlaDeadlines(slaPolicyId, definition.technicalSeverity, now);
      const team = item.teamId ? db.data.teams.find((candidate) => candidate.id === item.teamId) : undefined;
      const securityDomain = definition.securityDomain || team?.securityDomain || this.domainForCategory(definition.category);
      const ticket: Ticket = {
        id,
        key: `${projectCode}-${year}-${String(sequence).padStart(4, '0')}`,
        projectCode,
        ticketTypeId: definition.category,
        ticketTypeName: definition.category.replaceAll('_', ' '),
        type: definition.category === 'INCIDENT' ? 'SECURITY_INCIDENT' : definition.category === 'VULNERABILITY' ? 'VULNERABILITY' : 'SERVICE_REQUEST',
        intakeChannel: 'PORTAL',
        category: definition.category,
        securityDomain,
        title: subject ? `[${subject}] ${definition.title}` : definition.title,
        description: `${definition.description}\n\nWorkflow: ${template.title}${subject ? `\nContext: ${subject}` : ''}`,
        statusId: initialStatus.id,
        statusName: initialStatus.name,
        statusCategory: initialStatus.category,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        technicalSeverity: definition.technicalSeverity,
        businessPriority: definition.businessPriority,
        businessImpact: 'SIGNIFICANT',
        inherentRisk: definition.technicalSeverity === 'CRITICAL' ? 'CRITICAL' : definition.technicalSeverity === 'HIGH' ? 'HIGH' : 'MEDIUM',
        residualRisk: 'LOW',
        riskScore: definition.technicalSeverity === 'CRITICAL' ? 90 : definition.technicalSeverity === 'HIGH' ? 70 : 50,
        confidentiality: 'RESTRICTED',
        restrictedUserIds: [],
        restrictedTeamIds: [],
        reporterId: actor.id,
        requesterId: actor.id,
        assigneeId: item.assignee.id,
        assignedAt: now,
        assignmentGroupId: item.teamId,
        teamId: item.teamId,
        ownerId: actor.id,
        securityOwnerId: actor.id,
        departmentId: item.departmentId,
        targetDepartmentId: item.departmentId,
        watcherIds: Array.from(new Set([actor.id, item.assignee.id])),
        customFields: [],
        createdAt: now,
        updatedAt: now,
        detectedAt: now,
        dueDate: deadlines.resolutionDeadline,
        remediationDeadline: deadlines.remediationDeadline,
        slaPolicyId,
        slaState: 'SAFE',
        version: 1,
        tags: Array.from(new Set([...definition.tags, 'WORKFLOW_RUN', template.id.toUpperCase()])),
      };
      const sla = SLAService.calculateSLA(ticket);
      ticket.slaState = sla.state;
      ticket.slaRemainingMinutes = sla.remainingMinutes;
      created.push(ticket);
    }

    const dependencies = resolved.flatMap((item, index) => {
      const fromDefinitionId = item.dependencyId;
      const fromTaskId = fromDefinitionId ? idByDefinition.get(fromDefinitionId) : undefined;
      return fromTaskId ? [{ id: `dep-${uuidv4().slice(0, 8)}`, fromTaskId, toTaskId: created[index].id, type: 'FINISH_TO_START' as const }] : [];
    });
    const run: WorkflowRun = {
      id: `run-${uuidv4().slice(0, 8)}`,
      templateId: template.id.startsWith('custom-') ? undefined : template.id,
      templateVersion: template.version || 1,
      title: subject ? `${template.title}: ${subject}` : template.title,
      status: 'COMPLETED',
      idempotencyKey,
      parameters,
      createdTicketIds: created.map((ticket) => ticket.id),
      createdByUserId: actor.id,
      createdAt: now,
    };

    db.data.tickets.unshift(...created);
    db.data.ganttDependencies.push(...dependencies);
    db.data.workflowRuns ||= [];
    db.data.workflowRuns.push(run);
    for (const ticket of created) {
      TicketLifecycleService.initializeSlaMetrics(ticket);
      AuditService.log({ actor, action: 'TICKET_CREATED', entityType: 'TICKET', entityId: ticket.id, entityKey: ticket.key, metadata: { workflowRunId: run.id, templateId: template.id, assigneeId: ticket.assigneeId } });
      AutomationService.triggerEvent('TICKET_CREATED', ticket, actor);
    }
    db.persist();
    return { run, tickets: created, dependencies, replayed: false };
  }

  private static resolve(template: ProjectBlueprint): ResolvedTask[] {
    if (!template.defaultTasks.length) throw new WorkflowTemplateError('Workflow must contain at least one task.', 422);
    const ids = template.defaultTasks.map((task, index) => task.id || `task-${index + 1}`);
    if (new Set(ids).size !== ids.length) throw new WorkflowTemplateError('Workflow task IDs must be unique.', 422);
    const dependencyById = new Map<string, string | undefined>();
    template.defaultTasks.forEach((task, index) => {
      const dependency = task.dependsOnTaskId || (task.dependsOnIndex != null ? ids[task.dependsOnIndex] : undefined);
      if (dependency && !ids.includes(dependency)) throw new WorkflowTemplateError(`Task "${task.title}" has an invalid dependency.`, 422);
      if (dependency === ids[index]) throw new WorkflowTemplateError(`Task "${task.title}" cannot depend on itself.`, 422);
      dependencyById.set(ids[index], dependency || undefined);
    });
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const walk = (id: string) => {
      if (visiting.has(id)) throw new WorkflowTemplateError('Workflow dependency graph contains a cycle.', 422);
      if (visited.has(id)) return;
      visiting.add(id);
      const dependency = dependencyById.get(id);
      if (dependency) walk(dependency);
      visiting.delete(id);
      visited.add(id);
    };
    ids.forEach(walk);

    return template.defaultTasks.map((definition, index) => {
      const department = definition.targetDepartment ? db.data.departments.find((item) => item.id === definition.targetDepartment && item.isActive !== false) : undefined;
      if (!department) throw new WorkflowTemplateError(`Task "${definition.title}" references an inactive or missing department.`, 422);
      const team = definition.teamId ? db.data.teams.find((item) => item.id === definition.teamId && item.departmentId === department.id) : undefined;
      if (definition.teamId && !team) throw new WorkflowTemplateError(`Task "${definition.title}" references a team outside its department.`, 422);
      const candidates = db.data.users.filter((user) => user.isActive && user.departmentId === department.id && (!team || user.teamIds.includes(team.id)));
      let assignee = definition.assigneeId ? candidates.find((user) => user.id === definition.assigneeId) : undefined;
      if (definition.assigneeId && !assignee) throw new WorkflowTemplateError(`Task "${definition.title}" has an explicit assignee who is inactive or outside ${department.name}.`, 422);
      if (!assignee && definition.assigneeRole) assignee = candidates.find((user) => user.roles.includes(definition.assigneeRole as any));
      if (definition.assigneeRole && !definition.assigneeId && !assignee) throw new WorkflowTemplateError(`No active ${definition.assigneeRole} is configured for task "${definition.title}" in ${department.name}.`, 422);
      if (!assignee && team?.leadId) assignee = candidates.find((user) => user.id === team.leadId);
      if (!assignee && department.settings?.defaultAssigneeId) assignee = candidates.find((user) => user.id === department.settings?.defaultAssigneeId);
      if (!assignee && department.managerId) assignee = candidates.find((user) => user.id === department.managerId);
      if (!assignee) throw new WorkflowTemplateError(`No eligible assignee is configured for task "${definition.title}" in ${department.name}.`, 422);
      return { definition: { ...definition, id: ids[index] }, assignee, departmentId: department.id, teamId: team?.id, dependencyId: dependencyById.get(ids[index]) };
    });
  }

  private static validateParameters(template: ProjectBlueprint, parameters: Record<string, string>) {
    for (const field of template.parameters || []) {
      if (field.required && !parameters[field.id]?.trim()) throw new WorkflowTemplateError(`${field.label} is required.`, 400);
    }
  }

  private static enrich(template: ProjectBlueprint) {
    return {
      ...template,
      version: template.version || 1,
      isActive: template.isActive !== false,
      taskCount: template.defaultTasks.length,
      defaultTasks: template.defaultTasks.map((task, index) => ({
        ...task,
        id: task.id || `task-${index + 1}`,
        departmentName: db.data.departments.find((department) => department.id === task.targetDepartment)?.name,
        teamName: db.data.teams.find((team) => team.id === task.teamId)?.name,
        assigneeName: db.data.users.find((user) => user.id === task.assigneeId)?.fullName,
        slaPolicyName: db.data.slaPolicies.find((policy) => policy.id === (task.slaPolicyId || template.slaPolicyId))?.name,
      })),
    };
  }

  private static domainForCategory(category: BlueprintTaskTemplate['category']): SecurityDomain {
    if (category === 'INCIDENT') return 'SOC';
    if (category === 'VULNERABILITY') return 'APPSEC';
    if (category === 'IAM_REQUEST') return 'IAM_PAM';
    if (category === 'AUDIT_FINDING' || category === 'SECURITY_EXCEPTION' || category === 'RISK_ACCEPTANCE') return 'GRC';
    if (category === 'DLP_ALERT') return 'DLP';
    if (category === 'THIRD_PARTY_ASSESSMENT') return 'THIRD_PARTY_RISK';
    return 'GENERAL_INFOSEC';
  }
}
