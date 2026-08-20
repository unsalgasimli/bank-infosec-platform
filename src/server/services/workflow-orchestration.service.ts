import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { BankRole, BankUser } from '../../shared/types/auth.js';
import type {
  AssignmentConfiguration,
  FormFieldDefinition,
  PreflightResult,
  RequestTypeDefinition,
  SimulationResult,
  WorkflowCatalogTemplate,
  WorkflowDefinition,
  WorkflowNodeDefinition,
  WorkflowVersion,
} from '../../shared/types/orchestration.js';
import { calculatePriorityFromImpactUrgency } from '../../shared/types/ticket.js';
import { db } from '../db/database.js';
import { ApprovalService } from './approval.service.js';
import { BusinessCalendarService, OrchestrationExpressionService } from './orchestration-expression.service.js';
import { WorkflowPreflightService } from './workflow-preflight.service.js';

export class OrchestrationError extends Error {
  constructor(message: string, public readonly statusCode = 400, public readonly details?: unknown) { super(message); }
}

const designerRoles: BankRole[] = ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'IT_ADMIN', 'HR_ADMIN', 'CORE_BANK_ADMIN', 'LEGAL_ADMIN'];

export class WorkflowOrchestrationService {
  public static canDesign(actor: BankUser): boolean {
    return actor.roles.some((role) => designerRoles.includes(role));
  }

  public static listCatalog(actor: BankUser, query = '', category = ''): WorkflowCatalogTemplate[] {
    const normalized = query.trim().toLowerCase();
    return db.data.workflowCatalogTemplates.filter((template) => {
      if (template.lifecycle !== 'PUBLISHED' && !this.canDesign(actor)) return false;
      if (category && template.category !== category) return false;
      if (!normalized) return true;
      const definition = db.data.workflowDefinitions.find((item) => item.id === template.workflowDefinitionId);
      const version = definition && this.getVersion(definition.id, template.publishedWorkflowVersion);
      const owner = db.data.users.find((user) => user.id === template.ownerId);
      const searchable = [template.title, template.purpose, template.domain, template.category, owner?.fullName, ...(template.tags || []), ...(version?.nodes.map((node) => node.title) || [])].join(' ').toLowerCase();
      return searchable.includes(normalized);
    }).sort((left, right) => Number(right.favoriteUserIds.includes(actor.id)) - Number(left.favoriteUserIds.includes(actor.id)) || right.runCount - left.runCount);
  }

  public static catalogPayload(actor: BankUser, query = '') {
    const templates = this.listCatalog(actor, query);
    const sections = ['Recommended', 'Recently Used', 'Favorites', 'IT & Operations', 'Development & DevOps', 'Information Security', 'HR & Employee Lifecycle', 'Finance', 'Procurement', 'Legal', 'Facilities'];
    return {
      sections: sections.map((name) => ({
        name,
        templates: name === 'Recommended'
          ? templates.slice(0, 6)
          : name === 'Recently Used'
            ? [...templates].filter((item) => item.lastUsedAt).sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt))).slice(0, 6)
            : name === 'Favorites'
              ? templates.filter((item) => item.favoriteUserIds.includes(actor.id))
              : templates.filter((item) => item.category === name),
      })).filter((section) => section.templates.length > 0 || ['Recommended', 'Favorites'].includes(section.name)),
      templates,
      requestTypes: db.data.requestTypesV2.filter((requestType) => requestType.isActive),
    };
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

  public static getTemplate(id: string): { template: WorkflowCatalogTemplate; definition: WorkflowDefinition; version: WorkflowVersion; preflight: PreflightResult } {
    const template = db.data.workflowCatalogTemplates.find((item) => item.id === id);
    if (!template) throw new OrchestrationError('Catalog template not found.', 404);
    const definition = this.getDefinition(template.workflowDefinitionId);
    const version = this.getVersion(definition.id, template.publishedWorkflowVersion);
    return { template, definition, version, preflight: WorkflowPreflightService.validate(version) };
  }

  public static compareVersions(definitionId: string, fromVersion: number, toVersion: number, actor: BankUser) {
    const definition = this.getDefinition(definitionId);
    if (!this.canDesign(actor) && definition.lifecycle !== 'PUBLISHED') throw new OrchestrationError('Workflow comparison is not authorized.', 403);
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
    const source = this.getTemplate(templateId);
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
    if (definition.ownerId !== actor.id && !actor.roles.some((role) => ['PLATFORM_ADMIN', 'CISO'].includes(role))) throw new OrchestrationError('Only the owner or platform administrator may change lifecycle.', 403);
    const allowed: Record<WorkflowDefinition['lifecycle'], WorkflowDefinition['lifecycle'][]> = { DRAFT: ['REVIEW', 'ARCHIVED'], REVIEW: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], PUBLISHED: ['DEPRECATED'], DEPRECATED: ['PUBLISHED', 'ARCHIVED'], ARCHIVED: [] };
    if (!allowed[definition.lifecycle].includes(lifecycle)) throw new OrchestrationError(`Lifecycle transition ${definition.lifecycle} â†’ ${lifecycle} is not allowed.`, 409);
    definition.lifecycle = lifecycle;
    definition.updatedAt = new Date().toISOString();
    const template = db.data.workflowCatalogTemplates.find((item) => item.workflowDefinitionId === definition.id);
    if (template) template.lifecycle = lifecycle;
    db.persist();
    return { definition, template };
  }

  public static getRequestType(id: string): RequestTypeDefinition {
    const requestType = db.data.requestTypesV2.find((item) => item.id === id && item.isActive);
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
    if (formField.type === 'NUMBER') {
      const number = Number(value);
      if (!Number.isFinite(number)) errors.push({ fieldKey: formField.key, message: `${formField.label} must be a number.` });
      if (validation?.min != null && number < validation.min) errors.push({ fieldKey: formField.key, message: `${formField.label} must be at least ${validation.min}.` });
      if (validation?.max != null && number > validation.max) errors.push({ fieldKey: formField.key, message: `${formField.label} must be at most ${validation.max}.` });
    }
    if (validation?.pattern && !new RegExp(validation.pattern).test(String(value))) errors.push({ fieldKey: formField.key, message: `${formField.label} has an invalid format.` });
    if (validation?.allowedValues && !validation.allowedValues.includes(value)) errors.push({ fieldKey: formField.key, message: `${formField.label} contains an unsupported value.` });
    if (formField.type === 'TABLE' && validation?.maxRows && Array.isArray(value) && value.length > validation.maxRows) errors.push({ fieldKey: formField.key, message: `${formField.label} allows at most ${validation.maxRows} rows.` });
  }

  public static resolveAssignment(configuration: AssignmentConfiguration | undefined, context: Record<string, unknown>, node: WorkflowNodeDefinition, requesterId: string): { groupId?: string; assigneeId?: string; explanation: string } {
    const fallbackGroupId = node.stageId?.includes('onboard') || node.stageId?.includes('offboard') ? 'team-hr-ops' : undefined;
    if (!configuration) return { groupId: fallbackGroupId, explanation: fallbackGroupId ? `Assigned to HR Operations because stage “${node.stageId}” is an employee lifecycle stage.` : `No explicit routing policy matched; “${node.title}” remains in the workflow owner queue.` };
    let groupId = configuration.groupId;
    let assigneeId = configuration.assigneeId;
    const requester = db.data.users.find((user) => user.id === requesterId);
    if (configuration.strategy === 'REQUESTER_MANAGER') assigneeId = requester?.managerId;
    if (configuration.strategy === 'EMPLOYEE_MANAGER') assigneeId = String(OrchestrationExpressionService.getPath(context, 'managerId') || OrchestrationExpressionService.getPath(context, 'employee.managerId') || '');
    if (configuration.strategy === 'DEPARTMENT_OWNER') {
      const departmentId = String(OrchestrationExpressionService.getPath(context, 'departmentId') || requester?.departmentId || '');
      assigneeId = db.data.departments.find((department) => department.id === departmentId)?.managerId;
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
    if (configuration.strategy === 'ON_CALL' && groupId) assigneeId = db.data.teams.find((team) => team.id === groupId)?.leadId;
    if (configuration.strategy === 'SKILL_BASED' && groupId) assigneeId = db.data.users.find((user) => user.isActive && user.teamIds.includes(groupId!))?.id;
    if (configuration.strategy === 'RULE_ENGINE') {
      const rule = db.data.assignmentRulesV2.filter((candidate) => candidate.isActive && (!configuration.ruleSetId || candidate.id === configuration.ruleSetId)).sort((left, right) => left.priority - right.priority).find((candidate) => !candidate.condition || OrchestrationExpressionService.evaluate(candidate.condition, { ...context, capability: configuration.capability }));
      if (rule) {
        const resolved: { groupId?: string; assigneeId?: string; explanation: string } = this.resolveAssignment(rule.assignment, context, node, requesterId);
        return { ...resolved, explanation: `${rule.explanation} ${resolved.explanation}` };
      }
    }
    if (['ROUND_ROBIN', 'LOWEST_WORKLOAD'].includes(configuration.strategy) && groupId) {
      const candidates = db.data.users.filter((user) => user.isActive && user.teamIds.includes(groupId!));
      const counts = new Map(candidates.map((user) => [user.id, db.data.workItemsV2.filter((item) => item.assigneeId === user.id && !['COMPLETED', 'CANCELLED'].includes(item.status)).length]));
      assigneeId = [...candidates].sort((left, right) => (counts.get(left.id) || 0) - (counts.get(right.id) || 0) || left.id.localeCompare(right.id))[0]?.id;
    }
    if (assigneeId) {
      const user = db.data.users.find((candidate) => candidate.id === assigneeId && candidate.isActive);
      if (!user) assigneeId = undefined;
      else if (!groupId) groupId = user.teamIds[0];
    }
    const group = db.data.teams.find((team) => team.id === groupId);
    const assignee = db.data.users.find((user) => user.id === assigneeId);
    const capability = configuration.capability ? ` using capability “${configuration.capability}”` : '';
    const explanation = assignee
      ? `Assigned to ${assignee.fullName}${group ? ` in ${group.name}` : ''} because node “${node.title}” uses ${configuration.strategy.replaceAll('_', ' ').toLowerCase()}${capability}.`
      : group
        ? `Assigned to ${group.name} because node “${node.title}” uses ${configuration.strategy.replaceAll('_', ' ').toLowerCase()}${capability}.`
        : `No eligible user or group resolved for node “${node.title}”; it remains in the workflow owner queue.`;
    return { groupId, assigneeId, explanation };
  }

  public static resolveApprovers(node: WorkflowNodeDefinition, context: Record<string, unknown>, requesterId: string): BankUser[] {
    const approval = node.approval;
    if (!approval) return [];
    let users: BankUser[] = [];
    if (approval.specificUserIds?.length) users = db.data.users.filter((user) => approval.specificUserIds!.includes(user.id) && user.isActive);
    if (!users.length && approval.groupId) users = db.data.users.filter((user) => user.isActive && user.teamIds.includes(approval.groupId!));
    if (!users.length && approval.approverSource === 'DYNAMIC_EXPRESSION' && approval.dynamicPath) {
      const ids = OrchestrationExpressionService.getPath(context, approval.dynamicPath);
      users = db.data.users.filter((user) => user.isActive && (Array.isArray(ids) ? ids.includes(user.id) : ids === user.id));
    }
    if (!users.length && approval.approverSource === 'MANAGERS_MANAGER') {
      const requester = db.data.users.find((user) => user.id === requesterId);
      const manager = db.data.users.find((user) => user.id === requester?.managerId);
      users = db.data.users.filter((user) => user.isActive && user.id === manager?.managerId);
    }
    if (!users.length) {
      const ticketLike: any = { requesterId, reporterId: requesterId, departmentId: String(context.departmentId || ''), applicationId: context.applicationId, assetId: context.assetId };
      const resolver = approval.approverSource === 'APPLICATION_OWNER' || approval.approverSource === 'CI_OWNER' ? (approval.approverSource === 'APPLICATION_OWNER' ? 'SERVICE_OWNER' : 'ASSET_OWNER') : approval.approverSource;
      if (['SPECIFIC_USER', 'ROLE', 'REQUESTER_MANAGER', 'DEPARTMENT_HEAD', 'SERVICE_OWNER', 'ASSET_OWNER', 'CAB_BOARD'].includes(resolver)) users = ApprovalService.resolveApprovers(resolver as any, ticketLike, approval.role);
    }
    if (approval.preventSelfApproval !== false) users = users.filter((user) => user.id !== requesterId);
    return [...new Map(users.map((user) => [user.id, user])).values()];
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
      let definition: WorkflowDefinition;
      if (input.workflowDefinitionId) definition = this.getDefinition(input.workflowDefinitionId);
      else {
        const now = new Date().toISOString();
        definition = {
          id: `wf-${uuidv4().slice(0, 8)}`,
          key: input.definition?.key || `workflow-${uuidv4().slice(0, 8)}`,
          name: input.definition?.name || 'Untitled Workflow',
          description: input.definition?.description || '',
          domain: input.definition?.domain || 'GENERAL',
          defaultWorkType: input.definition?.defaultWorkType || 'TASK',
          lifecycle: 'DRAFT', scope: input.definition?.scope || 'PERSONAL', ownerId: actor.id, maintainerIds: [actor.id], latestVersion: 0,
          tags: input.definition?.tags || [], iconName: input.definition?.iconName || 'Workflow', createdAt: now, updatedAt: now,
        };
        db.data.workflowDefinitions.push(definition);
      }
      if (definition.ownerId !== actor.id && !actor.roles.some((role) => ['PLATFORM_ADMIN', 'CISO'].includes(role))) throw new OrchestrationError('Only the owner or platform administrator may edit this workflow.', 403);
      const nextVersion = Math.max(0, ...db.data.workflowVersions.filter((item) => item.workflowDefinitionId === definition.id).map((item) => item.version)) + 1;
      const payload = { ...input.version, status: 'DRAFT' as const };
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
        template = { id: `template-${definition.key}`, workflowDefinitionId: definition.id, publishedWorkflowVersion: version.version, title: definition.name, purpose: definition.description, domain: definition.domain, category: 'Recommended', scope: definition.scope, ownerId: definition.ownerId, maintainerIds: definition.maintainerIds, tags: definition.tags, iconName: definition.iconName, estimatedDurationMinutes: 1440, stageCount: version.stages.length, departmentCount: new Set(version.nodes.map((node) => node.assignment?.groupId).filter(Boolean)).size || 1, approvalCount: version.nodes.filter((node) => node.type === 'APPROVAL').length, automationCount: version.nodes.filter((node) => node.action).length, runCount: 0, successRate: 0, favoriteUserIds: [], lifecycle: 'PUBLISHED', changeLog: version.changeLog };
        db.data.workflowCatalogTemplates.push(template);
      } else {
        template.publishedWorkflowVersion = version.version;
        template.stageCount = version.stages.length;
        template.approvalCount = version.nodes.filter((node) => node.type === 'APPROVAL').length;
        template.automationCount = version.nodes.filter((node) => node.action).length;
        template.changeLog = version.changeLog;
        template.lifecycle = 'PUBLISHED';
      }
      return { definition, version, template, preflight };
    });
  }
}
