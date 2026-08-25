import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { BankRole, BankUser } from '../../shared/types/auth.js';
import type {
  AssignmentConfiguration,
  BusinessCalendar,
  FormFieldDefinition,
  NotificationPolicy,
  PreflightResult,
  RequestTypeDefinition,
  SimulationResult,
  WorkflowCatalogTemplate,
  WorkflowDefinition,
  WorkflowNodeDefinition,
  WorkflowPolicySet,
  WorkflowVersion,
} from '../../shared/types/orchestration.js';
import { calculatePriorityFromImpactUrgency } from '../../shared/types/ticket.js';
import { db } from '../db/database.js';
import { ApprovalService } from './approval.service.js';
import { BusinessCalendarService, OrchestrationExpressionService } from './orchestration-expression.service.js';
import { WorkflowPreflightService } from './workflow-preflight.service.js';
import { UsbAccessTemplateService } from './usb-access-template.service.js';
import { WebsiteAccessTemplateService } from './website-access-template.service.js';
import { StandardTaskTemplateService } from './standard-task-template.service.js';
import { ItServiceDeskTemplateService } from './it-service-desk-template.service.js';
import { SLAService } from './sla.service.js';

export class OrchestrationError extends Error {
  constructor(message: string, public readonly statusCode = 400, public readonly details?: unknown) { super(message); }
}

const designerRoles: BankRole[] = ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'IT_ADMIN', 'HR_ADMIN', 'CORE_BANK_ADMIN', 'LEGAL_ADMIN'];
// Company-wide workflow creation is reserved for administrative directory
// roles. Ordinary employees may still create personal and own-department
// workflows, but cannot publish a company-wide template.
const companyTemplateRoles: BankRole[] = ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'DEPARTMENT_ADMIN', 'IT_ADMIN', 'HR_ADMIN', 'CORE_BANK_ADMIN', 'LEGAL_ADMIN'];
const departmentTemplateRoles: BankRole[] = ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'IT_ADMIN', 'HR_ADMIN', 'CORE_BANK_ADMIN', 'LEGAL_ADMIN'];

export class WorkflowOrchestrationService {
  public static canDesign(actor: BankUser): boolean {
    return actor.isActive;
  }

  private static isCompanyAdmin(actor: BankUser): boolean {
    return actor.roles.some((role) => companyTemplateRoles.includes(role));
  }

  private static canUseScope(actor: BankUser, scope: WorkflowDefinition['scope']): boolean {
    if (!this.canDesign(actor)) return false;
    if (scope === 'COMPANY') return this.isCompanyAdmin(actor);
    // Every active employee may create a workflow for their own department.
    // Department/admin roles retain broader edit rights through
    // canEditDefinition(), while the scope itself remains department-bound.
    if (scope === 'DEPARTMENT') return Boolean(actor.departmentId);
    return true;
  }

  private static canViewDefinition(definition: WorkflowDefinition, actor: BankUser): boolean {
    if (!actor.isActive) return false;
    if (this.isCompanyAdmin(actor) || definition.scope === 'COMPANY') return true;
    if (definition.scope === 'DEPARTMENT') return Boolean(definition.departmentId && definition.departmentId === actor.departmentId);
    return definition.ownerId === actor.id || definition.maintainerIds.includes(actor.id);
  }

  private static canEditDefinition(definition: WorkflowDefinition, actor: BankUser): boolean {
    if (this.isCompanyAdmin(actor) || definition.ownerId === actor.id) return true;
    return definition.scope === 'DEPARTMENT' && definition.departmentId === actor.departmentId && actor.roles.some((role) => departmentTemplateRoles.includes(role));
  }

  public static canLaunchDefinition(definition: WorkflowDefinition, actor: BankUser): boolean {
    return this.canViewDefinition(definition, actor);
  }

  public static assertCanLaunchDefinition(definition: WorkflowDefinition, actor: BankUser): void {
    if (!this.canLaunchDefinition(definition, actor)) {
      throw new OrchestrationError('You are not authorized to launch this workflow template.', 403);
    }
  }

  public static permissions(actor: BankUser) {
    return {
      canCreatePersonal: this.canUseScope(actor, 'PERSONAL'),
      canCreateDepartment: this.canUseScope(actor, 'DEPARTMENT'),
      canCreateCompany: this.canUseScope(actor, 'COMPANY'),
      canLaunchWorkflows: this.canDesign(actor),
    };
  }

  /**
   * A fresh directory-backed installation has no fabricated workflows, but a
   * first real template still needs a pinned policy, business calendar and
   * notification recipient policy to execute.  These are neutral platform
   * configuration records, not sample users or sample tickets.
   */
  private static ensureRuntimeBaseline() {
    const calendarId = 'calendar-bank-baku';
    if (!db.data.businessCalendarsV2.some((calendar) => calendar.id === calendarId)) {
      const calendar: BusinessCalendar = { id: calendarId, name: 'Bank Baku business calendar', timezone: 'Asia/Baku', workdays: [1, 2, 3, 4, 5], businessStart: '09:00', businessEnd: '18:00', holidays: [], is24x7: false };
      db.data.businessCalendarsV2.push(calendar);
    }
    const notificationId = 'notification-workflow-participants-v1';
    if (!db.data.notificationPoliciesV2.some((policy) => policy.id === notificationId)) {
      const policy: NotificationPolicy = {
        id: notificationId,
        name: 'Workflow participant updates',
        eventTypes: ['APPROVAL_CREATED', 'APPROVAL_DECIDED', 'APPROVAL_REMINDER', 'WORK_ITEM_CREATED', 'WORK_ITEM_CLAIMED', 'WORK_ITEM_COMPLETED', 'COMMENT_ADDED', 'WORKFLOW_COMPLETED', 'WORKFLOW_FAILED', 'SLA_WARNING', 'SLA_BREACHED'],
        recipientResolvers: ['REQUESTER', 'ASSIGNEE', 'ASSIGNMENT_GROUP', 'APPROVER'],
        channels: ['IN_APP'], templateKey: 'workflow-participant-update', deduplicationWindowMinutes: 5, enabled: true,
      };
      db.data.notificationPoliciesV2.push(policy);
    }
    const participantPolicy = db.data.notificationPoliciesV2.find((policy) => policy.id === notificationId)!;
    participantPolicy.eventTypes = [...new Set([...participantPolicy.eventTypes, 'APPROVAL_CREATED', 'APPROVAL_DECIDED', 'APPROVAL_REMINDER', 'WORK_ITEM_CREATED', 'WORK_ITEM_CLAIMED', 'WORK_ITEM_COMPLETED', 'COMMENT_ADDED', 'WORKFLOW_COMPLETED', 'WORKFLOW_FAILED', 'SLA_WARNING', 'SLA_BREACHED'])];
    const requiredResolvers: NotificationPolicy['recipientResolvers'] = ['REQUESTER', 'ASSIGNEE', 'ASSIGNMENT_GROUP', 'APPROVER'];
    participantPolicy.recipientResolvers = [...new Set<NotificationPolicy['recipientResolvers'][number]>([...participantPolicy.recipientResolvers, ...requiredResolvers])];
    const policyId = 'policy-general-v1';
    if (!db.data.workflowPolicySets.some((policy) => policy.id === policyId && policy.version === 1)) {
      const policy: WorkflowPolicySet = {
        id: policyId, key: 'general-workflow', name: 'General workflow policy', domain: 'GENERAL', version: 1, status: 'PUBLISHED', routingRuleIds: [], businessCalendarId: calendarId,
        priorityMechanism: 'IMPACT_URGENCY', priorityRules: [], notificationPolicyId: notificationId,
        permissionPolicy: { visibility: 'INTERNAL' }, escalationPolicy: { warningPercent: 75, escalationBeforeBreachMinutes: 60, recipientPaths: [] },
      };
      db.data.workflowPolicySets.push(policy);
    }
    SLAService.ensurePoliciesInstalled();
    StandardTaskTemplateService.ensureInstalled();
    UsbAccessTemplateService.ensureInstalled();
    WebsiteAccessTemplateService.ensureInstalled();
    ItServiceDeskTemplateService.ensureInstalled();
  }

  public static listCatalog(actor: BankUser, query = '', category = ''): WorkflowCatalogTemplate[] {
    const normalized = query.trim().toLowerCase();
    return db.data.workflowCatalogTemplates.filter((template) => {
      if (template.lifecycle !== 'PUBLISHED') return false;
      if (category && template.category !== category) return false;
      const definition = db.data.workflowDefinitions.find((item) => item.id === template.workflowDefinitionId);
      if (!definition || definition.lifecycle !== 'PUBLISHED' || !this.canViewDefinition(definition, actor)) return false;
      if (!normalized) return true;
      const version = definition && this.getVersion(definition.id, template.publishedWorkflowVersion);
      const owner = db.data.users.find((user) => user.id === template.ownerId);
      const searchable = [template.title, template.purpose, template.domain, template.category, owner?.fullName, ...(template.tags || []), ...(version?.nodes.map((node) => node.title) || [])].join(' ').toLowerCase();
      return searchable.includes(normalized);
    }).sort((left, right) => Number(right.favoriteUserIds.includes(actor.id)) - Number(left.favoriteUserIds.includes(actor.id)) || right.runCount - left.runCount);
  }

  public static catalogPayload(actor: BankUser, query = '') {
    const needsBootstrap =
      !db.data.workflowPolicySets.some((policy) => policy.id === 'policy-general-v1' && policy.version === 1) ||
      !db.data.notificationPoliciesV2.some((policy) => policy.id === 'notification-workflow-participants-v1' && policy.eventTypes.includes('COMMENT_ADDED')) ||
      !db.data.workflowCatalogTemplates.some((template) => template.id === 'template-usb-access') ||
      !db.data.workflowCatalogTemplates.some((template) => template.id === 'template-website-access') ||
      !db.data.workflowCatalogTemplates.some((template) => template.id === 'template-it-mail-not-received') ||
      !db.data.workflowCatalogTemplates.some((template) => template.id === 'template-it-network-software-installation') ||
      !db.data.workflowCatalogTemplates.some((template) => template.id === 'template-standard-task') ||
      !db.data.requestTypesV2.some((requestType) => requestType.id === 'request-standard-task' && requestType.isActive) ||
      !db.data.slaPolicies?.length;
    if (needsBootstrap) {
      db.transaction(() => {
        this.ensureRuntimeBaseline();
      });
    } else {
      // Keep product-owned starter templates current even when the rest of
      // the orchestration baseline is already present in the database.
      if (UsbAccessTemplateService.ensureInstalled()) db.persist();
    }
    const templates = this.listCatalog(actor, query).map((template) => {
      const definition = this.getDefinition(template.workflowDefinitionId);
      return {
        ...template,
        canDelete: this.canDesign(actor) && this.canEditDefinition(definition, actor) && this.canUseScope(actor, definition.scope),
        canEdit: this.canDesign(actor) && this.canEditDefinition(definition, actor) && this.canUseScope(actor, definition.scope),
      };
    });
    const sections = [
      { name: 'Company Templates', scope: 'COMPANY' as const },
      { name: 'Department / Branch Templates', scope: 'DEPARTMENT' as const },
      { name: 'User Templates', scope: 'PERSONAL' as const },
    ];
    return {
      sections: sections.map((section) => ({
        name: section.name,
        scope: section.scope,
        templates: templates.filter((item) => item.scope === section.scope),
      })),
      templates,
      requestTypes: db.data.requestTypesV2.filter((requestType) => requestType.isActive),
      permissions: this.permissions(actor),
    };
  }

  public static directoryOptions(actor: BankUser) {
    if (!actor.isActive) throw new OrchestrationError('Inactive users cannot access directory routing options.', 403);
    const sections = (db.data.departmentSections || [])
      .filter((section) => section.isActive !== false && section.directorySource === 'ACTIVE_DIRECTORY');
    const users = db.data.users
      .filter((user) => user.isActive && user.directorySource === 'ACTIVE_DIRECTORY')
      .map((user) => ({ id: user.id, fullName: user.fullName, title: user.title, departmentId: user.departmentId, sectionId: user.sectionId, sectionName: sections.find((section) => section.id === user.sectionId)?.name, teamIds: user.teamIds, roles: user.roles, managerId: user.managerId }));
    const departments = db.data.departments
      .filter((department) => department.isActive !== false)
      .map((department) => ({ id: department.id, name: department.name, code: department.code, managerId: department.managerId }));
    const teamIds = new Set(users.flatMap((user) => user.teamIds));
    const groups = [...teamIds].sort().map((id) => ({
      id,
      name: db.data.teams.find((team) => team.id === id)?.name || id.replace(/^team-/, '').replaceAll('-', ' '),
    }));
    const roles = [...new Set(users.flatMap((user) => user.roles))].sort();
    return { users, departments, sections, groups, roles };
  }

  public static getDefinition(id: string): WorkflowDefinition {
    const definition = db.data.workflowDefinitions.find((item) => item.id === id);
    if (!definition) throw new OrchestrationError('Workflow definition not found.', 404);
    return definition;
  }

  public static getVersion(definitionId: string, version?: number): WorkflowVersion {
    const definition = this.getDefinition(definitionId);
    const resolvedVersion = version || definition.latestVersion;
    const snapshot = db.data.workflowVersions.find((item) => item.workflowDefinitionId === definitionId && item.version === resolvedVersion);
    if (!snapshot) throw new OrchestrationError(`Workflow version ${resolvedVersion} not found.`, 404);
    return snapshot;
  }

  public static getTemplate(id: string, actor?: BankUser): { template: WorkflowCatalogTemplate; definition: WorkflowDefinition; version: WorkflowVersion; preflight: PreflightResult } {
    const template = db.data.workflowCatalogTemplates.find((item) => item.id === id);
    if (!template) throw new OrchestrationError('Catalog template not found.', 404);
    const definition = this.getDefinition(template.workflowDefinitionId);
    if (template.lifecycle !== 'PUBLISHED' || definition.lifecycle !== 'PUBLISHED') throw new OrchestrationError('This workflow template is no longer available.', 404);
    if (actor && !this.canViewDefinition(definition, actor)) throw new OrchestrationError('You are not authorized to view this workflow template.', 403);
    const version = this.getVersion(definition.id, template.publishedWorkflowVersion);
    return { template, definition, version, preflight: WorkflowPreflightService.validate(version) };
  }

  public static compareVersions(definitionId: string, fromVersion: number, toVersion: number, actor: BankUser) {
    const definition = this.getDefinition(definitionId);
    if (!this.canDesign(actor) || !this.canViewDefinition(definition, actor)) throw new OrchestrationError('Workflow comparison is not authorized.', 403);
    const from = this.getVersion(definitionId, fromVersion);
    const to = this.getVersion(definitionId, toVersion);
    const fromNodes = new Map(from.nodes.map((node) => [node.id, node]));
    const toNodes = new Map(to.nodes.map((node) => [node.id, node]));
    const addedNodes = to.nodes.filter((node) => !fromNodes.has(node.id));
    const removedNodes = from.nodes.filter((node) => !toNodes.has(node.id));
    const changedNodes = to.nodes.filter((node) => fromNodes.has(node.id) && JSON.stringify(fromNodes.get(node.id)) !== JSON.stringify(node)).map((node) => ({ before: fromNodes.get(node.id), after: node }));
    const edgeKey = (edge: WorkflowVersion['edges'][number]) => `${edge.sourceNodeId}:${edge.destinationNodeId}:${edge.outcome || ''}:${JSON.stringify(edge.condition || null)}`;
    const fromEdges = new Set(from.edges.map(edgeKey));
    const toEdges = new Set(to.edges.map(edgeKey));
    return {
      definition: { id: definition.id, name: definition.name },
      from: { version: from.version, checksum: from.checksum, status: from.status, changeLog: from.changeLog },
      to: { version: to.version, checksum: to.checksum, status: to.status, changeLog: to.changeLog },
      changes: {
        addedNodes,
        removedNodes,
        changedNodes,
        addedEdges: to.edges.filter((edge) => !fromEdges.has(edgeKey(edge))),
        removedEdges: from.edges.filter((edge) => !toEdges.has(edgeKey(edge))),
        policyChanged: from.policySetId !== to.policySetId || from.policySetVersion !== to.policySetVersion,
        formChanged: from.formDefinitionId !== to.formDefinitionId || from.formVersion !== to.formVersion,
        triggerChanged: JSON.stringify(from.triggers) !== JSON.stringify(to.triggers),
      },
    };
  }

  public static cloneTemplate(templateId: string, actor: BankUser, mode: 'CLONE' | 'FORK' = 'CLONE') {
    if (!this.canDesign(actor)) throw new OrchestrationError('Workflow designer permission is required.', 403);
    const source = this.getTemplate(templateId, actor);
    const suffix = uuidv4().slice(0, 8);
    const draft = this.saveDraft({
      definition: {
        key: `${source.definition.key}-${mode.toLowerCase()}-${suffix}`,
        name: `${source.definition.name} â€” ${mode === 'FORK' ? 'Fork' : 'Copy'}`,
        description: source.definition.description,
        domain: source.definition.domain,
        defaultWorkType: source.definition.defaultWorkType,
        scope: mode === 'FORK' ? source.definition.scope : 'PERSONAL',
        tags: [...source.definition.tags, mode.toLowerCase(), `source:${source.definition.id}`],
        iconName: source.definition.iconName,
      },
      version: {
        status: 'DRAFT',
        variables: JSON.parse(JSON.stringify(source.version.variables)),
        triggers: JSON.parse(JSON.stringify(source.version.triggers)),
        stages: JSON.parse(JSON.stringify(source.version.stages)),
        nodes: JSON.parse(JSON.stringify(source.version.nodes)),
        edges: JSON.parse(JSON.stringify(source.version.edges)),
        policySetId: source.version.policySetId,
        policySetVersion: source.version.policySetVersion,
        formDefinitionId: source.version.formDefinitionId,
        formVersion: source.version.formVersion,
        changeLog: `${mode === 'FORK' ? 'Forked' : 'Cloned'} from ${source.definition.name} v${source.version.version}.`,
      },
    }, actor);
    return { ...draft, sourceTemplateId: templateId, sourceWorkflowDefinitionId: source.definition.id, mode };
  }

  public static setLifecycle(definitionId: string, lifecycle: WorkflowDefinition['lifecycle'], actor: BankUser) {
    if (!this.canDesign(actor)) throw new OrchestrationError('Workflow designer permission is required.', 403);
    const definition = this.getDefinition(definitionId);
    if (!this.canEditDefinition(definition, actor) || !this.canUseScope(actor, definition.scope)) throw new OrchestrationError('Only an authorized owner or scoped template administrator may change lifecycle.', 403);
    const allowed: Record<WorkflowDefinition['lifecycle'], WorkflowDefinition['lifecycle'][]> = { DRAFT: ['REVIEW', 'ARCHIVED'], REVIEW: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], PUBLISHED: ['DEPRECATED'], DEPRECATED: ['PUBLISHED', 'ARCHIVED'], ARCHIVED: [] };
    if (!allowed[definition.lifecycle].includes(lifecycle)) throw new OrchestrationError(`Lifecycle transition ${definition.lifecycle} â†’ ${lifecycle} is not allowed.`, 409);
    definition.lifecycle = lifecycle;
    definition.updatedAt = new Date().toISOString();
    const template = db.data.workflowCatalogTemplates.find((item) => item.workflowDefinitionId === definition.id);
    if (template) template.lifecycle = lifecycle;
    db.persist();
    return { definition, template };
  }

  /**
   * Removes a template from the catalog without deleting the immutable
   * versions or runtime evidence that may still be referenced by audits.
   */
  public static deleteTemplate(templateId: string, actor: BankUser) {
    if (!this.canDesign(actor)) throw new OrchestrationError('Workflow designer permission is required.', 403);
    return db.transaction(() => {
      const template = db.data.workflowCatalogTemplates.find((item) => item.id === templateId);
      if (!template) throw new OrchestrationError('Catalog template not found.', 404);
      const definition = this.getDefinition(template.workflowDefinitionId);
      if (!this.canEditDefinition(definition, actor) || !this.canUseScope(actor, definition.scope)) {
        throw new OrchestrationError('Only an authorized owner or scoped template administrator may delete this workflow template.', 403);
      }

      const archivedAt = new Date().toISOString();
      definition.lifecycle = 'ARCHIVED';
      definition.updatedAt = archivedAt;
      template.lifecycle = 'ARCHIVED';
      for (const requestType of db.data.requestTypesV2.filter((item) => item.workflowDefinitionId === definition.id)) {
        requestType.isActive = false;
      }
      return { templateId: template.id, archivedAt };
    });
  }

  public static getRequestType(id: string): RequestTypeDefinition {
    let requestType = db.data.requestTypesV2.find((item) => item.id === id && item.isActive);
    if (!requestType) {
      this.ensureRuntimeBaseline();
      requestType = db.data.requestTypesV2.find((item) => item.id === id && item.isActive);
    }
    if (!requestType) throw new OrchestrationError('Request type not found.', 404);
    return requestType;
  }

  public static getFormForRequestType(requestTypeId: string) {
    const requestType = this.getRequestType(requestTypeId);
    const definition = db.data.formDefinitionsV2.find((item) => item.id === requestType.formDefinitionId);
    const version = db.data.formVersions.find((item) => item.formDefinitionId === requestType.formDefinitionId && item.version === requestType.formVersion);
    if (!definition || !version) throw new OrchestrationError('The request type references an unavailable form version.', 422);
    return { requestType, definition, version };
  }

  public static resolveVisibleFields(requestTypeId: string, values: Record<string, unknown>, actor?: BankUser) {
    const form = this.getFormForRequestType(requestTypeId);
    return {
      ...form,
      sections: form.version.sections.map((section) => ({
        ...section,
        visible: OrchestrationExpressionService.evaluate(section.visibilityCondition, values),
        fields: [...section.fields, ...(section.reusableGroupIds || []).flatMap((groupId) => db.data.formFieldGroupsV2.find((group) => group.id === groupId && group.status === 'PUBLISHED')?.fields || [])]
          .filter((formField, index, fields) => fields.findIndex((candidate) => candidate.key === formField.key) === index)
          .map((formField) => {
            const readable = !formField.fieldAcl?.readRoles?.length || Boolean(actor?.roles.some((role) => formField.fieldAcl!.readRoles!.includes(role)));
            const writable = !formField.fieldAcl?.writeRoles?.length || Boolean(actor?.roles.some((role) => formField.fieldAcl!.writeRoles!.includes(role)));
            const parentValue = formField.dependsOnFieldKey ? values[formField.dependsOnFieldKey] : undefined;
            const options = formField.dependsOnFieldKey && parentValue != null ? formField.options?.filter((option) => option.parentValue == null || option.parentValue === parentValue) : formField.options;
            return {
              ...formField,
              options,
              readable,
              writable,
              visible: readable && OrchestrationExpressionService.evaluate(formField.visibilityCondition, values),
              resolvedRequired: Boolean(formField.required || (formField.requiredCondition && OrchestrationExpressionService.evaluate(formField.requiredCondition, values))),
              resolvedValue: values[formField.key] ?? formField.defaultValue,
            };
          }),
      })),
    };
  }

  public static validateSubmission(requestTypeId: string, values: Record<string, unknown>, actor?: BankUser) {
    const resolved = this.resolveVisibleFields(requestTypeId, values, actor);
    const errors: Array<{ fieldKey: string; message: string }> = [];
    for (const formField of resolved.sections.flatMap((section) => section.fields).filter((field, index, items) => items.findIndex((candidate) => candidate.key === field.key) === index)) {
      if (values[formField.key] !== undefined && formField.writable === false) errors.push({ fieldKey: formField.key, message: `${formField.label} is protected by field-level policy.` });
    }
    for (const section of resolved.sections.filter((item) => item.visible)) {
      for (const formField of section.fields.filter((item) => item.visible)) {
        const value = values[formField.key];
        if (formField.resolvedRequired && (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0))) {
          errors.push({ fieldKey: formField.key, message: `${formField.label} is required.` });
          continue;
        }
        this.validateField(formField, value, errors);
      }
    }
    return { valid: errors.length === 0, errors, resolved };
  }

  public static prepareSubmission(requestTypeId: string, values: Record<string, unknown>, actor: BankUser) {
    const validation = this.validateSubmission(requestTypeId, values, actor);
    if (!validation.valid) return { ...validation, values };
    const prepared: Record<string, unknown> = { ...values };
    const fields = validation.resolved.sections.flatMap((section) => section.fields).filter((formField, index, items) => items.findIndex((candidate) => candidate.key === formField.key) === index);
    for (const formField of fields) {
      if (prepared[formField.key] === undefined && formField.defaultValue !== undefined) prepared[formField.key] = structuredClone(formField.defaultValue);
      if (formField.calculatedValue) prepared[formField.key] = this.calculateField(formField.calculatedValue.function, prepared);
      if ((formField.type === 'SECURE_TEXT' || formField.sensitive || formField.encrypted) && prepared[formField.key] != null && prepared[formField.key] !== '') prepared[formField.key] = this.protectFieldValue(prepared[formField.key]);
    }
    return { ...validation, values: prepared };
  }

  private static calculateField(functionName: string, values: Record<string, unknown>) {
    if (functionName === 'changeRisk') {
      const environment = String(values.environment || 'NON_PRODUCTION');
      const blastRadius = String(values.blastRadius || 'LOW');
      const changeType = String(values.changeType || 'NORMAL');
      return changeType === 'EMERGENCY' || blastRadius === 'CRITICAL' ? 'CRITICAL' : environment === 'PRODUCTION' && blastRadius === 'HIGH' ? 'HIGH' : environment === 'PRODUCTION' || blastRadius === 'MEDIUM' ? 'MEDIUM' : 'LOW';
    }
    if (functionName === 'currentTimestamp') return new Date().toISOString();
    throw new OrchestrationError(`Calculated field function ${functionName} is not governed.`, 422);
  }

  private static protectFieldValue(value: unknown) {
    const keyMaterial = process.env.ORCHESTRATION_FIELD_KEY || process.env.SESSION_SECRET || 'development-orchestration-field-key';
    const key = crypto.createHash('sha256').update(keyMaterial).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return { protected: true, algorithm: 'AES-256-GCM', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  }

  private static validateField(formField: FormFieldDefinition, value: unknown, errors: Array<{ fieldKey: string; message: string }>) {
    if (value == null || value === '') return;
    const validation = formField.validation;
    if (formField.type === 'DATE') {
      const dateValue = String(value);
      const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
      const date = parsed ? new Date(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3])) : null;
      const validDate = Boolean(
        date &&
        date.getFullYear() === Number(parsed?.[1]) &&
        date.getMonth() === Number(parsed?.[2]) - 1 &&
        date.getDate() === Number(parsed?.[3]),
      );
      if (!validDate) errors.push({ fieldKey: formField.key, message: `${formField.label} must be a valid date.` });
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const minimum = validation?.min === 'today' ? todayIso : typeof validation?.min === 'string' ? validation.min : undefined;
      const maximum = validation?.max === 'today' ? todayIso : typeof validation?.max === 'string' ? validation.max : undefined;
      if (minimum && dateValue < minimum) errors.push({ fieldKey: formField.key, message: `${formField.label} cannot be earlier than today.` });
      if (maximum && dateValue > maximum) errors.push({ fieldKey: formField.key, message: `${formField.label} cannot be later than ${maximum}.` });
    }
    if (formField.type === 'NUMBER') {
      const number = Number(value);
      if (!Number.isFinite(number)) errors.push({ fieldKey: formField.key, message: `${formField.label} must be a number.` });
      if (typeof validation?.min === 'number' && number < validation.min) errors.push({ fieldKey: formField.key, message: `${formField.label} must be at least ${validation.min}.` });
      if (typeof validation?.max === 'number' && number > validation.max) errors.push({ fieldKey: formField.key, message: `${formField.label} must be at most ${validation.max}.` });
    }
    if (validation?.pattern && !new RegExp(validation.pattern).test(String(value))) errors.push({ fieldKey: formField.key, message: `${formField.label} has an invalid format.` });
    if (validation?.allowedValues && !validation.allowedValues.includes(value)) errors.push({ fieldKey: formField.key, message: `${formField.label} contains an unsupported value.` });
    if (formField.type === 'TABLE' && validation?.maxRows && Array.isArray(value) && value.length > validation.maxRows) errors.push({ fieldKey: formField.key, message: `${formField.label} allows at most ${validation.maxRows} rows.` });
  }

  public static resolveAssignment(configuration: AssignmentConfiguration | undefined, context: Record<string, unknown>, node: WorkflowNodeDefinition, requesterId: string): { groupId?: string; assigneeId?: string; explanation: string } {
    const directAssigneeId = typeof context.assigneeId === 'string' && context.assigneeId ? context.assigneeId : undefined;
    const directGroupId = typeof context.targetDepartmentId === 'string' && context.targetDepartmentId
      ? context.targetDepartmentId
      : typeof context.assignmentGroupId === 'string' && context.assignmentGroupId
        ? context.assignmentGroupId
        : undefined;

    if (directAssigneeId || directGroupId) {
      let assigneeId = directAssigneeId;
      let groupId = directGroupId;
      if (assigneeId) {
        const user = db.data.users.find((candidate) => candidate.id === assigneeId && candidate.isActive);
        if (!user) {
          assigneeId = undefined;
        } else if (!groupId) {
          // A person can belong to multiple AD groups.  The user is the
          // explicit route here, so retain their organisational home instead
          // of arbitrarily picking the first group in a directory array.
          groupId = user.departmentId;
        }
      }
      const group = db.data.departments.find((d) => d.id === groupId) || db.data.teams.find((t) => t.id === groupId);
      const assignee = db.data.users.find((u) => u.id === assigneeId);
      const explanation = assignee
        ? `Assigned directly to ${assignee.fullName}${group ? ` (${group.name})` : ''} as specified in intake.`
        : group
          ? `Routed directly to ${group.name} queue as specified in intake.`
          : `Assigned based on intake routing context.`;
      return { groupId, assigneeId, explanation };
    }

    const fallbackGroupId = node.stageId?.includes('onboard') || node.stageId?.includes('offboard') ? 'team-hr-ops' : undefined;
    if (!configuration) return { groupId: fallbackGroupId, explanation: fallbackGroupId ? `Assigned to HR Operations because stage “${node.stageId}” is an employee lifecycle stage.` : `No explicit routing policy matched; “${node.title}” remains in the workflow owner queue.` };
    let groupId = configuration.groupId;
    let assigneeId = configuration.assigneeId;
    const requester = db.data.users.find((user) => user.id === requesterId);
    const selectedSection = configuration.sectionId
      ? db.data.departmentSections.find((section) => section.id === configuration.sectionId && section.isActive !== false)
      : undefined;
    if (configuration.strategy === 'REQUESTER_MANAGER') assigneeId = requester?.managerId;
    if (configuration.strategy === 'EMPLOYEE_MANAGER') assigneeId = String(OrchestrationExpressionService.getPath(context, 'managerId') || OrchestrationExpressionService.getPath(context, 'employee.managerId') || '');
    if (configuration.strategy === 'DEPARTMENT_OWNER') {
      const departmentId = String(configuration.departmentId || selectedSection?.departmentId || OrchestrationExpressionService.getPath(context, 'departmentId') || requester?.departmentId || '');
      assigneeId = selectedSection?.managerId || db.data.departments.find((department) => department.id === departmentId)?.managerId;
    }
    if (configuration.strategy === 'FIXED_PERSON' && configuration.expressionPath) assigneeId = String(OrchestrationExpressionService.getPath(context, configuration.expressionPath) || configuration.assigneeId || '');
    if (configuration.strategy === 'APPLICATION_OWNER' || configuration.strategy === 'SERVICE_OWNER') {
      const applicationId = String(OrchestrationExpressionService.getPath(context, 'applicationId') || OrchestrationExpressionService.getPath(context, 'serviceId') || '');
      assigneeId = db.data.applications.find((application) => application.id === applicationId)?.ownerId;
    }
    if (configuration.strategy === 'CI_OWNER') {
      const assetId = String(OrchestrationExpressionService.getPath(context, 'assetId') || '');
      assigneeId = db.data.assets.find((asset) => asset.id === assetId)?.ownerId;
    }
    if (configuration.strategy === 'ROLE_BASED' && configuration.role) assigneeId = db.data.users.find((user) => user.isActive && user.roles.includes(configuration.role!))?.id;
    if (configuration.strategy === 'UNASSIGNED_TEAM_QUEUE' && configuration.role) {
      const eligible = db.data.users.filter((user) => user.isActive && user.roles.includes(configuration.role!));
      if (!groupId) {
        const sharedTeams = eligible.reduce<string[] | undefined>((shared, user) => shared === undefined ? [...user.teamIds] : shared.filter((teamId) => user.teamIds.includes(teamId)), undefined);
        groupId = sharedTeams?.[0] || eligible.find((user) => user.teamIds.length > 0)?.teamIds[0];
      }
    }
    // A department-scoped queue is a valid human-work destination even when
    // it is not backed by a named team. The corresponding authorization paths
    // use the department membership, so designers can safely select “Anyone
    // in this department / branch” from the builder without a hidden team ID.
    if (configuration.strategy === 'UNASSIGNED_TEAM_QUEUE' && !groupId && (configuration.departmentId || selectedSection?.departmentId)) groupId = configuration.departmentId || selectedSection?.departmentId;
    if (configuration.strategy === 'ON_CALL' && groupId) assigneeId = db.data.teams.find((team) => team.id === groupId)?.leadId;
    if (configuration.strategy === 'SKILL_BASED' && groupId) assigneeId = db.data.users.find((user) => user.isActive && user.teamIds.includes(groupId!))?.id;
    if (configuration.strategy === 'RULE_ENGINE') {
      const rule = db.data.assignmentRulesV2.filter((candidate) => candidate.isActive && (!configuration.ruleSetId || candidate.id === configuration.ruleSetId)).sort((left, right) => left.priority - right.priority).find((candidate) => !candidate.condition || OrchestrationExpressionService.evaluate(candidate.condition, { ...context, capability: configuration.capability }));
      if (rule) {
        const resolved: { groupId?: string; assigneeId?: string; explanation: string } = this.resolveAssignment(rule.assignment, context, node, requesterId);
        return { ...resolved, explanation: `${rule.explanation} ${resolved.explanation}` };
      }
      // The platform's generic work template must retain a real destination
      // even when no optional assignment rule matches. Routing it back to the
      // authenticated requester is deterministic and avoids an invisible,
      // unclaimable owner queue.
      const requesterFallback = db.data.users.find((user) => user.id === requesterId && user.isActive);
      if (requesterFallback) return { assigneeId: requesterFallback.id, groupId: requesterFallback.departmentId, explanation: `No rule matched; routed to requester ${requesterFallback.fullName}.` };
    }
    if (['ROUND_ROBIN', 'LOWEST_WORKLOAD'].includes(configuration.strategy) && groupId) {
      const candidates = db.data.users.filter((user) => user.isActive && user.teamIds.includes(groupId!));
      const counts = new Map(candidates.map((user) => [user.id, db.data.workItemsV2.filter((item) => item.assigneeId === user.id && !['COMPLETED', 'CANCELLED'].includes(item.status)).length]));
      assigneeId = [...candidates].sort((left, right) => (counts.get(left.id) || 0) - (counts.get(right.id) || 0) || left.id.localeCompare(right.id))[0]?.id;
    }
    if (assigneeId) {
      const user = db.data.users.find((candidate) => candidate.id === assigneeId && candidate.isActive);
      if (!user) assigneeId = undefined;
      else if (!groupId) groupId = configuration.departmentId || selectedSection?.departmentId || user.departmentId;
    }
    const group = db.data.teams.find((team) => team.id === groupId) || db.data.departments.find((department) => department.id === groupId);
    const assignee = db.data.users.find((user) => user.id === assigneeId);
    const capability = configuration.capability ? ` using capability “${configuration.capability}”` : '';
    const destination = selectedSection ? `${selectedSection.name} section` : group?.name;
    const explanation = assignee
      ? `Assigned to ${assignee.fullName}${destination ? ` in ${destination}` : ''} because node “${node.title}” uses ${configuration.strategy.replaceAll('_', ' ').toLowerCase()}${capability}.`
      : destination
        ? `Assigned to ${destination} because node “${node.title}” uses ${configuration.strategy.replaceAll('_', ' ').toLowerCase()}${capability}.`
        : `No eligible user or group resolved for node “${node.title}”; it remains in the workflow owner queue.`;
    return { groupId, assigneeId, explanation };
  }

  public static resolveApprovers(node: WorkflowNodeDefinition, context: Record<string, unknown>, requesterId: string): BankUser[] {
    const approval = node.approval;
    if (!approval) return [];
    let users: BankUser[] = [];
    const requester = db.data.users.find((user) => user.id === requesterId);
    const approvalDepartmentId = this.resolveApprovalDepartmentId(approval, context, requester);
    const usesDynamicDepartment = Boolean(approval.departmentSource && approval.departmentSource !== 'STATIC');
    // A runtime department route must never be overridden by a saved person ID.
    // This also keeps legacy drafts safe if they predate the designer restriction.
    const approverSource = usesDynamicDepartment && approval.approverSource === 'SPECIFIC_USER'
      ? 'DEPARTMENT_MEMBERS'
      : approval.approverSource;
    if (!usesDynamicDepartment && approval.specificUserIds?.length) users = db.data.users.filter((user) => approval.specificUserIds!.includes(user.id) && user.isActive);
    if (!users.length && approval.groupId) users = db.data.users.filter((user) => user.isActive && user.teamIds.includes(approval.groupId!));
    if (!users.length && approverSource === 'DEPARTMENT_MEMBERS') {
      users = db.data.users.filter((user) => user.isActive && user.departmentId === approvalDepartmentId);
    }
    if (!users.length && approverSource === 'DYNAMIC_EXPRESSION' && approval.dynamicPath) {
      const ids = OrchestrationExpressionService.getPath(context, approval.dynamicPath);
      users = db.data.users.filter((user) => user.isActive && (Array.isArray(ids) ? ids.includes(user.id) : ids === user.id));
    }
    if (!users.length && approverSource === 'MANAGERS_MANAGER') {
      const requester = db.data.users.find((user) => user.id === requesterId);
      const manager = db.data.users.find((user) => user.id === requester?.managerId);
      users = db.data.users.filter((user) => user.isActive && user.id === manager?.managerId);
    }
    if (!users.length) {
      const ticketLike: any = { requesterId, reporterId: requesterId, departmentId: approvalDepartmentId || '', applicationId: context.applicationId, assetId: context.assetId };
      const resolver = approverSource === 'APPLICATION_OWNER' || approverSource === 'CI_OWNER' ? (approverSource === 'APPLICATION_OWNER' ? 'SERVICE_OWNER' : 'ASSET_OWNER') : approverSource;
      if (['SPECIFIC_USER', 'ROLE', 'REQUESTER_MANAGER', 'DEPARTMENT_HEAD', 'SERVICE_OWNER', 'ASSET_OWNER', 'CAB_BOARD'].includes(resolver)) users = ApprovalService.resolveApprovers(resolver as any, ticketLike, approval.role);
    }
    if (approval.preventSelfApproval !== false) users = users.filter((user) => user.id !== requesterId);
    return [...new Map(users.map((user) => [user.id, user])).values()];
  }

  /** Resolve department routing from server-owned request context, never UI labels. */
  private static resolveApprovalDepartmentId(approval: NonNullable<WorkflowNodeDefinition['approval']>, context: Record<string, unknown>, requester?: BankUser): string | undefined {
    const contextString = (key: string) => typeof context[key] === 'string' && context[key].trim() ? context[key] as string : undefined;
    const requesterContext = typeof context.requester === 'object' && context.requester !== null ? context.requester as Record<string, unknown> : {};
    const requesterSectionId = requester?.sectionId || (typeof requesterContext.sectionId === 'string' ? requesterContext.sectionId : undefined);
    const sectionParent = (sectionId?: string) => sectionId ? db.data.departmentSections.find((section) => section.id === sectionId && section.isActive !== false)?.departmentId : undefined;

    switch (approval.departmentSource || 'STATIC') {
      case 'REQUESTER_DEPARTMENT':
        return requester?.departmentId || (typeof requesterContext.departmentId === 'string' ? requesterContext.departmentId : undefined) || contextString('departmentId');
      case 'REQUESTER_PARENT_DEPARTMENT':
        return sectionParent(requesterSectionId) || requester?.departmentId || (typeof requesterContext.departmentId === 'string' ? requesterContext.departmentId : undefined);
      case 'TICKET_DEPARTMENT':
        return contextString('targetDepartmentId') || contextString('departmentId');
      case 'TICKET_PARENT_DEPARTMENT':
        return sectionParent(contextString('targetSectionId') || contextString('sectionId')) || contextString('targetDepartmentId') || contextString('departmentId');
      case 'STATIC':
      default:
        return approval.departmentId || contextString('departmentId') || requester?.departmentId;
    }
  }

  public static resolvePriority(policySetId: string, context: Record<string, unknown>) {
    const policy = db.data.workflowPolicySets.find((item) => item.id === policySetId);
    if (!policy) throw new OrchestrationError('Workflow policy set not found.', 422);
    if (policy.priorityMechanism === 'IMPACT_URGENCY') {
      const impact = String(context.impact || 'MODERATE') as any;
      const urgency = String(context.urgency || 'MEDIUM') as any;
      return { priority: calculatePriorityFromImpactUrgency(impact, urgency), explanation: `Resolved from ITSM impact ${impact} × urgency ${urgency}.` };
    }
    if (policy.priorityMechanism === 'SECURITY_RISK') {
      const severity = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[String(context.severity || 'MEDIUM')] || 2;
      const exposure = context.internetExposure ? 2 : 0;
      const exploitability = { NONE: 0, POC: 1, ACTIVE: 2 }[String(context.exploitability || 'NONE')] || 0;
      const score = severity * 2 + exposure + exploitability;
      const priority = score >= 10 ? 'P1_URGENT' : score >= 7 ? 'P2_HIGH' : score >= 4 ? 'P3_MEDIUM' : 'P4_LOW';
      return { priority, explanation: `Security score ${score} from severity, exposure, and exploitability.` };
    }
    if (policy.priorityMechanism === 'LIFECYCLE') {
      const deadline = context.startDate || context.lastWorkingDate || context.effectiveDate || context.requiredBy;
      const hours = deadline ? (new Date(String(deadline)).getTime() - Date.now()) / 3_600_000 : Number.POSITIVE_INFINITY;
      return { priority: hours <= 24 ? 'CRITICAL' : hours <= 168 ? 'IMPORTANT' : 'STANDARD', explanation: deadline ? `Lifecycle priority resolved from deadline ${deadline}.` : 'Standard lifecycle priority because no immediate deadline is present.' };
    }
    if (policy.priorityMechanism === 'DEV_VALUE_RISK') {
      const risk = String(context.risk || context.blastRadius || 'MEDIUM');
      return { priority: ['HIGH', 'CRITICAL'].includes(risk) ? 'P1_URGENT' : risk === 'MEDIUM' ? 'P2_HIGH' : 'P3_MEDIUM', explanation: `DevOps priority resolved from release risk ${risk}.` };
    }
    return { priority: policy.priorityRules[0]?.priority || 'STANDARD', explanation: policy.priorityRules[0]?.explanation || 'Default policy priority.' };
  }

  public static resolveTargets(policySetId: string, context: Record<string, unknown>, start = new Date()) {
    const policy = db.data.workflowPolicySets.find((item) => item.id === policySetId);
    if (!policy) throw new OrchestrationError('Workflow policy set not found.', 422);
    const calendar = db.data.businessCalendarsV2.find((item) => item.id === policy.businessCalendarId);
    if (!calendar) throw new OrchestrationError('Business calendar not found.', 422);
    const priority = this.resolvePriority(policySetId, context);
    const priorityMinutes: Record<string, number> = { P1_URGENT: 120, P2_HIGH: 480, P3_MEDIUM: 1440, P4_LOW: 4320, CRITICAL: 240, IMPORTANT: 1440, STANDARD: 4320 };
    const resolutionMinutes = priorityMinutes[priority.priority] || 1440;
    return {
      priority,
      businessCalendarId: calendar.id,
      clocks: policy.priorityMechanism === 'LIFECYCLE'
        ? [{ metric: 'LIFECYCLE_TARGET', label: 'Required by', targetAt: String(context.startDate || context.lastWorkingDate || context.effectiveDate || context.requiredBy || BusinessCalendarService.addBusinessMinutes(start, resolutionMinutes, calendar).toISOString()) }]
        : [
          { metric: 'FIRST_RESPONSE', label: 'First response', targetAt: BusinessCalendarService.addBusinessMinutes(start, Math.max(15, Math.round(resolutionMinutes / 8)), calendar).toISOString() },
          { metric: 'ASSIGNMENT', label: 'Assignment', targetAt: BusinessCalendarService.addBusinessMinutes(start, Math.max(30, Math.round(resolutionMinutes / 4)), calendar).toISOString() },
          { metric: 'RESOLUTION', label: 'Resolution', targetAt: BusinessCalendarService.addBusinessMinutes(start, resolutionMinutes, calendar).toISOString() },
        ],
    };
  }

  public static simulate(definitionId: string, versionNumber: number | undefined, context: Record<string, unknown>, actor: BankUser): SimulationResult {
    const version = this.getVersion(definitionId, versionNumber);
    const preflight = WorkflowPreflightService.validate(version, actor);
    const selected = new Set<string>();
    const skipped = new Set<string>();
    const branchDecisions: SimulationResult['branchDecisions'] = [];
    const assignments: SimulationResult['assignments'] = [];
    const approvals: SimulationResult['approvals'] = [];
    const scheduledTimes: SimulationResult['scheduledTimes'] = [];
    const actions: SimulationResult['actions'] = [];
    const nodeOutputs: Record<string, Record<string, unknown>> = {};
    const startNode = version.nodes.find((node) => node.type === 'START');
    const queue = startNode ? [startNode.id] : [];
    while (queue.length) {
      const nodeId = queue.shift()!;
      if (selected.has(nodeId)) continue;
      const workflowNode = version.nodes.find((node) => node.id === nodeId);
      if (!workflowNode) continue;
      selected.add(nodeId);
      if (workflowNode.assignment) assignments.push({ nodeId, ...this.resolveAssignment(workflowNode.assignment, context, workflowNode, String(context.requesterId || actor.id)) });
      if (workflowNode.approval) approvals.push({ nodeId, approverIds: this.resolveApprovers(workflowNode, context, String(context.requesterId || actor.id)).map((user) => user.id), mode: workflowNode.approval.approvalMode });
      if (workflowNode.timer) {
        const raw = workflowNode.timer.datePath ? OrchestrationExpressionService.getPath(context, workflowNode.timer.datePath) : undefined;
        const base = raw ? new Date(String(raw)) : new Date();
        const executeAt = new Date(base.getTime() + (workflowNode.timer.offsetMinutes || workflowNode.timer.durationMinutes || 0) * 60_000);
        scheduledTimes.push({ nodeId, executeAt: executeAt.toISOString(), explanation: workflowNode.timer.datePath ? `Calculated from ${workflowNode.timer.datePath}.` : `Calculated from configured duration.` });
      }
      if (workflowNode.action) actions.push({ nodeId, actionKey: workflowNode.action.actionKey, input: OrchestrationExpressionService.mapInputs(workflowNode.action.inputMapping, { context, nodeOutputs, id: 'simulation', key: 'SIM-001' }), executed: false });
      const outgoing = version.edges.filter((workflowEdge) => workflowEdge.sourceNodeId === nodeId);
      let selectedEdges = outgoing.filter((workflowEdge) => !workflowEdge.condition || OrchestrationExpressionService.evaluate(workflowEdge.condition, context, nodeOutputs));
      if (workflowNode.type === 'CONDITION') {
        const value = OrchestrationExpressionService.evaluate(workflowNode.condition, context, nodeOutputs);
        const scalar = OrchestrationExpressionService.getPath(context, workflowNode.condition?.clauses[0] && !('clauses' in workflowNode.condition.clauses[0]) ? workflowNode.condition.clauses[0].left.path : undefined);
        const outcome = selectedEdges.some((item) => item.outcome === String(scalar)) ? String(scalar) : value ? 'TRUE' : 'FALSE';
        selectedEdges = selectedEdges.filter((workflowEdge) => !workflowEdge.outcome || workflowEdge.outcome === outcome);
        branchDecisions.push({ nodeId, outcome, explanation: `Safe expression builder evaluated decision to ${outcome}.` });
        outgoing.filter((workflowEdge) => !selectedEdges.includes(workflowEdge)).forEach((workflowEdge) => skipped.add(workflowEdge.destinationNodeId));
      }
      selectedEdges.forEach((workflowEdge) => queue.push(workflowEdge.destinationNodeId));
    }
    return { workflowDefinitionId: definitionId, workflowVersion: version.version, dryRun: true, context, selectedNodeIds: [...selected], skippedNodeIds: [...skipped].filter((id) => !selected.has(id)), branchDecisions, assignments, approvals, scheduledTimes, actions, preflight };
  }

  public static saveDraft(input: { definition?: Partial<WorkflowDefinition>; version: Omit<WorkflowVersion, 'id' | 'workflowDefinitionId' | 'version' | 'checksum' | 'createdAt' | 'createdByUserId'>; workflowDefinitionId?: string }, actor: BankUser) {
    if (!this.canDesign(actor)) throw new OrchestrationError('Workflow designer permission is required.', 403);
    return db.transaction(() => {
      this.ensureRuntimeBaseline();
      let definition: WorkflowDefinition;
      const requestedScope = input.definition?.scope || 'PERSONAL';
      if (!this.canUseScope(actor, requestedScope)) throw new OrchestrationError(`You are not authorized to create a ${requestedScope.toLowerCase()} workflow template.`, 403);
      if (input.workflowDefinitionId) {
        definition = this.getDefinition(input.workflowDefinitionId);
        if (!this.canEditDefinition(definition, actor)) throw new OrchestrationError('Only the owner, scoped department administrator, or company administrator may edit this workflow.', 403);
        if (input.definition?.scope && input.definition.scope !== definition.scope) {
          definition.scope = input.definition.scope;
          definition.departmentId = definition.scope === 'DEPARTMENT' ? actor.departmentId : undefined;
        }
        if (input.definition) {
          definition.key = input.definition.key || definition.key;
          definition.name = input.definition.name || definition.name;
          definition.description = input.definition.description ?? definition.description;
          definition.domain = input.definition.domain || definition.domain;
          definition.defaultWorkType = input.definition.defaultWorkType || definition.defaultWorkType;
          definition.tags = input.definition.tags || definition.tags;
          definition.iconName = input.definition.iconName || definition.iconName;
        }
      }
      else {
        const now = new Date().toISOString();
        definition = {
          id: `wf-${uuidv4().slice(0, 8)}`,
          key: input.definition?.key || `workflow-${uuidv4().slice(0, 8)}`,
          name: input.definition?.name || 'Untitled Workflow',
          description: input.definition?.description || '',
          domain: input.definition?.domain || 'GENERAL',
          defaultWorkType: input.definition?.defaultWorkType || 'TASK',
          lifecycle: 'DRAFT', scope: requestedScope, departmentId: requestedScope === 'DEPARTMENT' ? actor.departmentId : undefined, ownerId: actor.id, maintainerIds: [actor.id], latestVersion: 0,
          tags: input.definition?.tags || [], iconName: input.definition?.iconName || 'Workflow', createdAt: now, updatedAt: now,
        };
        db.data.workflowDefinitions.push(definition);
      }
      const nextVersion = Math.max(0, ...db.data.workflowVersions.filter((item) => item.workflowDefinitionId === definition.id).map((item) => item.version)) + 1;
      const payload = {
        ...input.version,
        status: 'DRAFT' as const,
        nodes: input.version.nodes.map((node) => {
          if (node.type !== 'APPROVAL' || !node.approval?.departmentSource || node.approval.departmentSource === 'STATIC') return node;
          const { specificUserIds: _specificUserIds, ...approval } = node.approval;
          return {
            ...node,
            approval: {
              ...approval,
              ...(approval.approverSource === 'SPECIFIC_USER' ? { approverSource: 'DEPARTMENT_MEMBERS' as const } : {}),
            },
          };
        }),
      };
      const checksum = `sha256-${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
      const snapshot: WorkflowVersion = { ...payload, id: `${definition.id}-v${nextVersion}`, workflowDefinitionId: definition.id, version: nextVersion, checksum, createdAt: new Date().toISOString(), createdByUserId: actor.id };
      db.data.workflowVersions.push(snapshot);
      definition.latestVersion = nextVersion;
      definition.updatedAt = snapshot.createdAt;
      return { definition, version: snapshot, preflight: WorkflowPreflightService.validate(snapshot, actor) };
    });
  }

  public static publish(definitionId: string, versionNumber: number, actor: BankUser) {
    if (!this.canDesign(actor)) throw new OrchestrationError('Workflow designer permission is required.', 403);
    return db.transaction(() => {
      const definition = this.getDefinition(definitionId);
      if (!this.canEditDefinition(definition, actor) || !this.canUseScope(actor, definition.scope)) throw new OrchestrationError('You are not authorized to publish this workflow scope.', 403);
      const version = this.getVersion(definitionId, versionNumber);
      const preflight = WorkflowPreflightService.validate(version, actor);
      if (!preflight.valid) throw new OrchestrationError('Workflow cannot be published until preflight errors are resolved.', 422, preflight);
      version.status = 'PUBLISHED';
      version.publishedAt = new Date().toISOString();
      definition.lifecycle = 'PUBLISHED';
      definition.latestVersion = Math.max(definition.latestVersion, version.version);
      definition.updatedAt = version.publishedAt;
      let template = db.data.workflowCatalogTemplates.find((item) => item.workflowDefinitionId === definition.id);
      if (!template) {
        template = { id: `template-${definition.key}`, workflowDefinitionId: definition.id, publishedWorkflowVersion: version.version, title: definition.name, purpose: definition.description, domain: definition.domain, category: 'Recommended', scope: definition.scope, departmentId: definition.departmentId, ownerId: definition.ownerId, maintainerIds: definition.maintainerIds, tags: definition.tags, iconName: definition.iconName, estimatedDurationMinutes: 1440, stageCount: version.stages.length, departmentCount: new Set(version.nodes.map((node) => node.assignment?.groupId).filter(Boolean)).size || 1, approvalCount: version.nodes.filter((node) => node.type === 'APPROVAL').length, automationCount: version.nodes.filter((node) => node.action).length, runCount: 0, successRate: 0, favoriteUserIds: [], lifecycle: 'PUBLISHED', changeLog: version.changeLog };
        db.data.workflowCatalogTemplates.push(template);
      } else {
        template.publishedWorkflowVersion = version.version;
        template.title = definition.name;
        template.purpose = definition.description;
        template.domain = definition.domain;
        template.tags = definition.tags;
        template.iconName = definition.iconName;
        template.stageCount = version.stages.length;
        template.approvalCount = version.nodes.filter((node) => node.type === 'APPROVAL').length;
        template.automationCount = version.nodes.filter((node) => node.action).length;
        template.changeLog = version.changeLog;
        template.lifecycle = 'PUBLISHED';
        template.scope = definition.scope;
        template.departmentId = definition.departmentId;
      }
      const inputNode = version.nodes.find((node) => ['INPUT', 'TICKET_INPUT'].includes(node.type));
      if (inputNode) {
        db.data.formDefinitionsV2 ||= [];
        db.data.formVersions ||= [];
        db.data.requestTypesV2 ||= [];
        const formId = `form-${definition.key}`;
        const formVersionId = `${formId}-v${version.version}`;
        const requestTypeId = `request-${definition.key}`;
        const customFields: FormFieldDefinition[] = inputNode.inputConfig?.fields || [];
        const baseFields: FormFieldDefinition[] = [
          { id: `${definition.key}-summary`, key: 'summary', label: 'Request title', type: 'TEXT', required: true, validation: { min: 3, max: 160 }, placeholder: 'Brief summary of the request' },
          { id: `${definition.key}-description`, key: 'description', label: 'Description / Details', type: 'TEXTAREA', placeholder: 'Provide any additional context or instructions...' },
          { id: `${definition.key}-requester`, key: 'requesterId', label: 'Requester', type: 'USER', required: true },
          { id: `${definition.key}-department`, key: 'departmentId', label: 'Requester department / branch', type: 'DEPARTMENT', required: true },
        ];
        const combinedFields = [
          ...baseFields.filter((bf) => !customFields.some((cf) => cf.key === bf.key)),
          ...customFields,
        ];
        let formDef = db.data.formDefinitionsV2.find((f) => f.id === formId);
        if (!formDef) {
          formDef = {
            id: formId,
            key: `form-${definition.key}`,
            title: `${definition.name} Request Form`,
            description: inputNode.description || definition.description,
            domain: definition.domain,
            lifecycle: 'PUBLISHED',
            latestVersion: version.version,
            ownerId: definition.ownerId,
            maintainerIds: definition.maintainerIds,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          db.data.formDefinitionsV2.push(formDef);
        } else {
          formDef.latestVersion = version.version;
          formDef.updatedAt = new Date().toISOString();
        }
        const existingFormVer = db.data.formVersions.find((fv) => fv.formDefinitionId === formId && fv.version === version.version);
        const formVerObj: any = {
          id: formVersionId,
          formDefinitionId: formId,
          version: version.version,
          status: 'PUBLISHED',
          sections: [
            {
              id: `${formId}-section-main`,
              title: inputNode.title || 'Request details',
              description: inputNode.description || 'Fill in the required information to launch this workflow.',
              fields: combinedFields,
            },
          ],
          changeLog: `Generated from Ticket Input node in workflow version ${version.version}`,
          createdByUserId: actor.id,
          createdAt: new Date().toISOString(),
        };
        if (existingFormVer) {
          Object.assign(existingFormVer, formVerObj);
        } else {
          db.data.formVersions.push(formVerObj);
        }
        version.formDefinitionId = formId;
        version.formVersion = version.version;
        let reqType = db.data.requestTypesV2.find((r) => r.workflowDefinitionId === definition.id);
        if (!reqType) {
          reqType = {
            id: requestTypeId,
            key: `req-${definition.key}`,
            name: definition.name,
            description: definition.description,
            domain: definition.domain,
            workType: definition.defaultWorkType,
            category: 'Workflows',
            iconName: definition.iconName,
            formDefinitionId: formId,
            formVersion: version.version,
            workflowDefinitionId: definition.id,
            workflowVersion: version.version,
            policySetId: version.policySetId,
            supportedChannels: ['EMPLOYEE_PORTAL', 'AGENT', 'MANAGER', 'ADMIN', 'API'],
            visibility: 'INTERNAL',
            isActive: true,
            tags: definition.tags,
          };
          db.data.requestTypesV2.push(reqType);
        } else {
          reqType.formDefinitionId = formId;
          reqType.formVersion = version.version;
          reqType.workflowVersion = version.version;
          reqType.name = definition.name;
          reqType.description = definition.description;
          reqType.isActive = true;
        }
      }
      return { definition, version, template, preflight };
    });
  }
}
