import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import type { BankUser, SecurityDomain } from '../../shared/types/auth.js';
import type { BlueprintScope, BlueprintTaskTemplate, ProjectBlueprint, WorkflowRun } from '../../shared/types/blueprints.js';
import type { Ticket, TicketProjectCode } from '../../shared/types/ticket.js';
import { db } from '../db/database.js';
import { AuditService } from './audit.service.js';
import { GraphOrchestratorService } from './graph-orchestrator.service.js';
import { SLAService } from './sla.service.js';

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

const createBlueprintSchema = z.object({
  title: z.string().trim().min(3).max(200),
  shortName: z.string().trim().max(100).optional(),
  scope: z.enum(['COMPANY', 'DEPARTMENT', 'PERSONAL']).default('PERSONAL'),
  domain: z.string().trim().min(2).max(100).default('General Infosec'),
  departmentId: z.string().trim().optional(),
  isCrossDepartment: z.boolean().optional(),
  participatingDepartments: z.array(z.string()).optional(),
  description: z.string().trim().min(3).max(5000),
  iconName: z.string().trim().max(64).default('Shield'),
  projectCode: z.string().trim().min(2).max(12).optional(),
  workflowId: z.string().trim().min(1).optional(),
  slaPolicyId: z.string().trim().min(1).optional(),
  parameters: z.array(z.object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    type: z.enum(['TEXT', 'TEXTAREA', 'SELECT', 'BOOLEAN', 'NUMBER']).default('TEXT'),
    required: z.boolean().default(false),
    placeholder: z.string().trim().optional(),
    helpText: z.string().trim().optional(),
    defaultValue: z.string().trim().optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
    showIfFieldId: z.string().trim().optional(),
    showIfEquals: z.string().trim().optional(),
  })).default([]),
  defaultTasks: z.array(z.object({
    id: z.string().trim().min(1).max(100).optional(),
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
    durationDays: z.number().int().min(1).max(365).default(1),
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

type ResolvedTask = { definition: BlueprintTaskTemplate; assignee?: BankUser; departmentId: string; teamId?: string; dependencyId?: string };

export class WorkflowTemplateService {
  static list(actor?: BankUser) {
    const isSuper = actor?.roles.some((role) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER'].includes(role));
    return (db.data.blueprints || [])
      .filter((template) => {
        if (template.isActive === false) return false;
        if (!actor) return true;
        const scope = this.resolveScope(template);
        if (scope === 'PERSONAL') {
          return isSuper || template.ownerId === actor.id;
        }
        return true;
      })
      .map((template) => this.enrich(template));
  }

  static metadata({ includeUsers = false }: { includeUsers?: boolean } = {}) {
    // `sync:ad` can run in a separate CLI process. Reload the durable
    // directory projection before returning assignment choices so a running
    // API immediately sees the newly synchronized identities.
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test') db.reload();
    SLAService.ensurePoliciesInstalled();
    const departments = (db.data.departments || [])
      .filter((item) => item.isActive !== false && item.directorySource === 'ACTIVE_DIRECTORY');
    const departmentIds = new Set(departments.map((item) => item.id));
    const users = (db.data.users || [])
      .filter((item) => item.isActive && item.directorySource === 'ACTIVE_DIRECTORY' && departmentIds.has(item.departmentId));

    const sections = db.data.departmentSections || [];
    return {
      directory: {
        source: 'ACTIVE_DIRECTORY',
        ready: departments.length > 0 && users.length > 0,
        message: departments.length > 0 && users.length > 0
          ? undefined
          : 'No live Active Directory directory data is available. Complete a successful LDAPS synchronization before assigning a user or department queue.',
      },
      departments: departments.map(({ id, name, code, color, settings, managerId, adminUserIds, divisionId }) => ({
        id, name, code, color, defaultSlaHours: settings?.defaultSlaHours, managerId, adminUserIds, divisionId,
      })),
      sections: sections.filter((section) => section.isActive !== false).map(({ id, departmentId, name, code, managerId }) => ({ id, departmentId, name, code, managerId })),
      teams: [
        { id: 'team-soc', name: 'SOC & İnsidentlərin İdarəolunması', code: 'SOC', departmentId: 'dept-secops', securityDomain: 'SOC' as const },
        { id: 'team-appsec', name: 'Tətbiqi Təhlükəsizlik (AppSec & Pentest)', code: 'APPSEC', departmentId: 'dept-secops', securityDomain: 'APPSEC' as const },
        { id: 'team-grc', name: 'Komplayens, Audit və Risk (GRC)', code: 'GRC', departmentId: 'dept-secops', securityDomain: 'GRC' as const },
        { id: 'team-devsecops', name: 'DevSecOps & Platform Mühəndisliyi', code: 'DEVSECOPS', departmentId: 'dept-secops', securityDomain: 'SEC_ARCHITECTURE' as const },
        { id: 'team-it-infra', name: 'İT İnfrastruktur və Sistemlər', code: 'IT_INFRA', departmentId: 'dept-it', securityDomain: 'GENERAL_INFOSEC' as const },
        { id: 'team-hr-ops', name: 'İnsan Resursları və Kadr Əməliyyatları', code: 'HR_OPS', departmentId: 'dept-marketing', securityDomain: 'GENERAL_INFOSEC' as const },
        { id: 'team-swift-eng', name: 'Əsas Bankçılıq və SWIFT Əməliyyatları', code: 'SWIFT', departmentId: 'dept-hesablasmalar-departamenti', securityDomain: 'GENERAL_INFOSEC' as const },
        ...(db.data.teams || []).filter((item) => !['team-soc', 'team-appsec', 'team-grc', 'team-devsecops', 'team-it-infra', 'team-hr-ops', 'team-swift-eng'].includes(item.id)),
      ],
      // User assignment choices are loaded separately in bounded pages. Sending
      // the entire directory here made every ticket-modal opening deserialize
      // and process hundreds of identities, even when no assignment was made.
      users: includeUsers
        ? users.map(({ id, fullName, title, departmentId, sectionId, teamIds, roles, managerId }) => ({ id, fullName, title, departmentId, sectionId, sectionName: sections.find((section) => section.id === sectionId)?.name, teamIds, roles, managerId }))
        : [],
      workflows: (db.data.workflows || []).filter((item) => item.isActive !== false).map(({ id, name, version }) => ({ id, name, version })),
      slaPolicies: (db.data.slaPolicies || []).map(({ id, name, description, isDefault, thresholds }) => ({ id, name, description, isDefault, thresholds })),
      categories: [
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
      ],
      severities: ['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      priorities: ['P1_URGENT', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW'],
      projectCodes: ['SEC', 'SOC', 'VM', 'APPSEC', 'GRC', 'DLP', 'IAM', 'ARCH', 'AUDIT', 'TPRM'],
      workTypes: [
        { value: 'NORMAL_TASK', label: 'Normal Task / Subtask' },
        { value: 'PROJECT_WORK', label: 'Project Work / Milestone' },
        { value: 'SERVICE_REQUEST', label: 'Service Request' },
        { value: 'INCIDENT', label: 'Incident Triage' },
        { value: 'MAJOR_INCIDENT', label: 'Major Incident Protocol' },
        { value: 'PROBLEM', label: 'Problem Investigation' },
        { value: 'CHANGE', label: 'Change Request / CAB' },
        { value: 'ACCESS_REQUEST', label: 'Access / IAM Request' },
        { value: 'PRIVILEGED_ACCESS', label: 'Privileged Access / PAM' },
        { value: 'VULNERABILITY', label: 'Vulnerability Remediation' },
        { value: 'SECURITY_EXCEPTION', label: 'Security Exception / Waiver' },
        { value: 'RISK_ACCEPTANCE', label: 'Risk Acceptance Gate' },
        { value: 'EMPLOYEE_ONBOARDING', label: 'Employee Onboarding' },
        { value: 'EMPLOYEE_OFFBOARDING', label: 'Employee Offboarding' },
        { value: 'PROVISIONING', label: 'Hardware / Software Provisioning' },
        { value: 'PROCUREMENT_APPROVAL', label: 'Procurement / Vendor Approval' },
        { value: 'COMPLIANCE_REMEDIATION', label: 'Compliance & Audit Remediation' },
        { value: 'RELEASE_DEPLOYMENT', label: 'Release & Deployment' },
        { value: 'HR_FINANCE_APPROVAL', label: 'HR / Legal / Finance Approval' },
        { value: 'RECURRING_TASK', label: 'Recurring Operational Task' },
        { value: 'CROSS_DEPARTMENT', label: 'Cross-Department Orchestration' },
      ],
    };
  }

  static assignmentOptions(input: { departmentId?: string; sectionId?: string; query?: string; offset?: number; limit?: number }) {
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test') db.reload();
    const departments = (db.data.departments || [])
      .filter((item) => item.isActive !== false && item.directorySource === 'ACTIVE_DIRECTORY');
    const departmentIds = new Set(departments.map((item) => item.id));
    const departmentId = input.departmentId?.trim() || undefined;
    const sectionId = input.sectionId?.trim() || undefined;
    const query = input.query?.trim().toLocaleLowerCase('az') || '';
    const offset = Math.max(0, Math.floor(input.offset || 0));
    const limit = Math.min(100, Math.max(10, Math.floor(input.limit || 40)));
    const team = departmentId ? (db.data.teams || []).find((item) => item.id === departmentId) : undefined;
    const itSubDepartmentIds = new Set([
      'dept-it',
      'dept-sistem-inzibatciligi-bolmesi',
      'dept-sebeke-inzibatciligi-bolmesi',
      'dept-proqram-teminatlarinin-idare-olunmasi-ve-desteklenmesi-sobesi',
      'dept-texniki-destek-sobesi',
    ]);
    const secSubDepartmentIds = new Set(['dept-secops', 'dept-phys-sec']);

    const matchesScope = (user: BankUser) => {
      if (sectionId && user.sectionId !== sectionId) return false;
      if (!departmentId) return true;
      if (user.departmentId === departmentId) return true;
      if (team && user.teamIds?.includes(team.id)) return true;
      if (departmentId === 'dept-it' && itSubDepartmentIds.has(user.departmentId)) return true;
      return departmentId === 'dept-secops' && (
        secSubDepartmentIds.has(user.departmentId) ||
        user.teamIds?.some((id) => ['team-soc', 'team-appsec', 'team-grc', 'team-devsecops'].includes(id))
      );
    };
    const matchesQuery = (user: BankUser) => !query || [user.fullName, user.title, user.username, user.email]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase('az').includes(query));
    const matches = (db.data.users || [])
      .filter((user) => user.isActive && user.directorySource === 'ACTIVE_DIRECTORY' && departmentIds.has(user.departmentId))
      .filter(matchesScope)
      .filter(matchesQuery)
      .sort((left, right) => left.fullName.localeCompare(right.fullName, 'az'));
    const page = matches.slice(offset, offset + limit)
      .map(({ id, fullName, title, departmentId: userDepartmentId, sectionId, teamIds, roles, managerId }) => ({ id, fullName, title, departmentId: userDepartmentId, sectionId, sectionName: (db.data.departmentSections || []).find((section) => section.id === sectionId)?.name, teamIds, roles, managerId }));

    return {
      users: page,
      total: matches.length,
      nextOffset: offset + page.length < matches.length ? offset + page.length : null,
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
      tasks: resolved.map(({ definition, assignee, departmentId, teamId, dependencyId }) => {
        const dept = db.data.departments.find((item) => item.id === departmentId);
        return {
          ...definition,
          departmentId,
          departmentName: dept?.name,
          teamId,
          teamName: teamId ? db.data.teams.find((item) => item.id === teamId)?.name : undefined,
          assigneeId: assignee?.id,
          assigneeName: assignee ? assignee.fullName : `Təyin edilməyib (${dept?.name || 'Departament'} növbəsi)`,
          dependsOnTaskId: dependencyId,
        };
      }),
    };
  }

  static launchStored(id: string, rawInput: unknown, actor: BankUser) {
    const template = (db.data.blueprints || []).find((item) => item.id === id && item.isActive !== false);
    if (!template) throw new WorkflowTemplateError('Workflow template not found.', 404);
    const input = launchSchema.parse(rawInput || {});
    this.validateParameters(template, input.parameters);

    return GraphOrchestratorService.launchGraph({
      title: template.title,
      description: template.description,
      templateId: template.id,
      templateVersion: template.version || 1,
      nodes: template.nodes && template.nodes.length > 0 ? template.nodes : template.defaultTasks,
      edges: template.edges || [],
      parameters: input.parameters,
      projectCode: template.projectCode,
      workflowId: template.workflowId,
      slaPolicyId: template.slaPolicyId,
      actor,
      idempotencyKey: input.idempotencyKey,
    });
  }

  static launchCustom(rawInput: unknown, actor: BankUser) {
    if (!actor.roles.some((role) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'TEAM_LEAD', 'DEPARTMENT_ADMIN'].includes(role))) {
      throw new WorkflowTemplateError('Workflow designer permission is required to launch a custom cross-team graph.', 403);
    }
    const parsed = customTemplateSchema.parse(rawInput);
    return GraphOrchestratorService.launchGraph({
      title: parsed.title,
      description: parsed.description,
      nodes: parsed.tasks,
      projectCode: (parsed.projectCode || 'SEC') as TicketProjectCode,
      workflowId: parsed.workflowId,
      slaPolicyId: parsed.slaPolicyId,
      actor,
    });
  }

  private static resolve(template: ProjectBlueprint): ResolvedTask[] {
    const tasks = template.defaultTasks;
    if (!tasks || !tasks.length) throw new WorkflowTemplateError('Workflow must contain at least one task.', 422);

    // Use GraphOrchestratorService for validation
    const validation = GraphOrchestratorService.validateGraph(tasks, template.edges);
    if (!validation.isValid) {
      throw new WorkflowTemplateError(`Template graph validation error: ${validation.errors.join(' | ')}`, 422);
    }

    const ids = tasks.map((task, index) => task.id || `task-${index + 1}`);
    const dependencyById = new Map<string, string | undefined>();
    tasks.forEach((task, index) => {
      const dependency = task.dependsOnTaskId || (task.dependsOnIndex != null ? ids[task.dependsOnIndex] : undefined);
      dependencyById.set(ids[index], dependency || undefined);
    });

    return tasks.map((definition, index) => {
      const department = definition.targetDepartment ? db.data.departments.find((item) => (item.id === definition.targetDepartment || item.code?.toLowerCase() === definition.targetDepartment?.toLowerCase()) && item.isActive !== false) : undefined;
      if (!department) throw new WorkflowTemplateError(`Task "${definition.title}" references an inactive or missing department.`, 422);
      const team = definition.teamId ? db.data.teams.find((item) => item.id === definition.teamId && item.departmentId === department.id) : undefined;
      const candidates = db.data.users.filter((user) => user.isActive && (user.departmentId === department.id || user.roles.some((r) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN'].includes(r))) && (!team || user.teamIds.includes(team.id)));
      let assignee = definition.assigneeId ? candidates.find((user) => user.id === definition.assigneeId) : undefined;
      if (!assignee && definition.assigneeRole) assignee = candidates.find((user) => user.roles.includes(definition.assigneeRole as any));
      return { definition: { ...definition, id: ids[index] }, assignee, departmentId: department.id, teamId: team?.id, dependencyId: dependencyById.get(ids[index]) };
    });
  }

  private static validateParameters(template: ProjectBlueprint, parameters: Record<string, string>) {
    for (const field of template.parameters || []) {
      if (field.required && !parameters[field.id]?.trim()) {
        throw new WorkflowTemplateError(`${field.label} is required.`, 400);
      }
    }
  }

  static create(rawInput: unknown, actor: BankUser): ProjectBlueprint {
    const parsed = createBlueprintSchema.parse(rawInput);
    const scope = parsed.scope;

    if (scope === 'COMPANY') {
      const canCreateCompany = actor.roles.some((role) =>
        ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER'].includes(role)
      );
      if (!canCreateCompany) {
        throw new WorkflowTemplateError('Company template creation requires Platform Admin, CISO, or InfoSec Admin access.', 403);
      }
    } else if (scope === 'DEPARTMENT') {
      const canCreateDept = actor.roles.some((role) =>
        ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'IT_ADMIN', 'HR_ADMIN', 'CORE_BANK_ADMIN', 'LEGAL_ADMIN'].includes(role)
      );
      if (!canCreateDept) {
        throw new WorkflowTemplateError('Department template creation requires Department Admin or Team Lead access.', 403);
      }
    }

    const isCrossDepartment = scope === 'COMPANY' ? true : (parsed.isCrossDepartment ?? false);
    const departmentId = scope === 'DEPARTMENT' ? (parsed.departmentId || actor.departmentId) : parsed.departmentId;

    const blueprint: ProjectBlueprint = {
      id: `bp-${scope.toLowerCase()}-${uuidv4().slice(0, 8)}`,
      title: parsed.title,
      shortName: parsed.shortName || parsed.title,
      scope,
      status: 'PUBLISHED',
      domain: parsed.domain,
      departmentId,
      isCrossDepartment,
      participatingDepartments: parsed.participatingDepartments || (isCrossDepartment ? [] : departmentId ? [departmentId] : []),
      ownerId: actor.id,
      createdByName: actor.fullName,
      taskCount: parsed.defaultTasks.length,
      estimatedDays: Math.max(...parsed.defaultTasks.map((task) => (task.offsetDays || 0) + (task.durationDays || 1)), 1),
      description: parsed.description,
      iconName: parsed.iconName || 'Shield',
      projectCode: (parsed.projectCode || 'SEC') as TicketProjectCode,
      workflowId: parsed.workflowId,
      slaPolicyId: parsed.slaPolicyId,
      version: 1,
      isActive: true,
      parameters: parsed.parameters,
      defaultTasks: parsed.defaultTasks.map((task, idx) => ({
        ...task,
        id: task.id || `task-${idx + 1}`,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Validate graph routing
    this.resolve(blueprint);

    db.data.blueprints ||= [];
    db.data.blueprints.push(blueprint);
    db.persist();

    AuditService.log({
      actor,
      action: 'ADMIN_CONFIG_CHANGED',
      entityType: 'WORKFLOW',
      entityId: blueprint.id,
      entityKey: blueprint.shortName || blueprint.title,
      metadata: { scope: blueprint.scope, title: blueprint.title, taskCount: blueprint.taskCount },
    });

    return this.enrich(blueprint);
  }

  static clone(id: string, actor?: BankUser): ProjectBlueprint {
    const template = (db.data.blueprints || []).find((item) => item.id === id);
    if (!template) throw new WorkflowTemplateError('Template not found.', 404);

    const fallbackActor = actor || db.data.users.find((u) => u.roles.includes('CISO')) || db.data.users[0];

    const cloned: ProjectBlueprint = {
      ...JSON.parse(JSON.stringify(template)),
      id: `bp-clone-${uuidv4().slice(0, 8)}`,
      title: `${template.title} (Copy)`,
      shortName: `${template.shortName || template.title} (Copy)`.slice(0, 24),
      scope: 'PERSONAL',
      status: 'DRAFT',
      ownerId: fallbackActor?.id || '',
      createdByName: fallbackActor?.fullName || '',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.data.blueprints.push(cloned);
    db.persist();
    return this.enrich(cloned);
  }

  static resolveScope(template: ProjectBlueprint): 'COMPANY' | 'DEPARTMENT' | 'PERSONAL' {
    if (template.scope) return template.scope;
    if (template.ownerId) return 'PERSONAL';
    if (template.isCrossDepartment || !template.departmentId) return 'COMPANY';
    return 'DEPARTMENT';
  }

  private static enrich(template: ProjectBlueprint) {
    const scope = this.resolveScope(template);
    return {
      ...template,
      scope,
      status: template.status || 'PUBLISHED',
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
}
