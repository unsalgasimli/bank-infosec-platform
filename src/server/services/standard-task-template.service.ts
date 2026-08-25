import crypto from 'crypto';
import type {
  FormDefinition,
  FormVersion,
  RequestTypeDefinition,
  WorkflowCatalogTemplate,
  WorkflowDefinition,
  WorkflowVersion,
} from '../../shared/types/orchestration.js';
import { db } from '../db/database.js';

const DEFINITION_ID = 'wf-standard-task';
const FORM_ID = 'form-standard-task';
const REQUEST_TYPE_ID = 'request-standard-task';
const TEMPLATE_ID = 'template-standard-task';
const SYSTEM_OWNER_ID = 'platform-bank-infosec';

const checksum = (value: unknown) =>
  `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

/**
 * Installs the standard single-task enterprise workflow and request type.
 * This powers Quick Work Item creation and ad-hoc task orchestration.
 */
export class StandardTaskTemplateService {
  public static ensureInstalled(): boolean {
    let changed = false;
    const now = '2026-08-20T00:00:00.000Z';

    db.data.formDefinitionsV2 ||= [];
    db.data.formVersions ||= [];
    db.data.workflowDefinitions ||= [];
    db.data.workflowVersions ||= [];
    db.data.requestTypesV2 ||= [];
    db.data.workflowCatalogTemplates ||= [];

    if (!db.data.formDefinitionsV2.some((item) => item.id === FORM_ID)) {
      const form: FormDefinition = {
        id: FORM_ID,
        key: 'standard-task',
        title: 'Standard Task / Work Item',
        description: 'Enterprise task intake form.',
        domain: 'GENERAL',
        lifecycle: 'PUBLISHED',
        latestVersion: 1,
        ownerId: SYSTEM_OWNER_ID,
        maintainerIds: [],
        createdAt: now,
        updatedAt: now,
      };
      db.data.formDefinitionsV2.push(form);
      changed = true;
    }

    if (!db.data.formVersions.some((item) => item.formDefinitionId === FORM_ID && item.version === 1)) {
      const formVersion: FormVersion = {
        id: `${FORM_ID}-v1`,
        formDefinitionId: FORM_ID,
        version: 1,
        status: 'PUBLISHED',
        sections: [
          {
            id: 'section-standard-task-main',
            title: 'Task Details',
            description: 'General task summary and assignment details.',
            fields: [
              { id: 'std-summary', key: 'summary', label: 'Summary', type: 'TEXT', required: true, validation: { min: 3, max: 160 }, placeholder: 'Clear, actionable task summary' },
              { id: 'std-description', key: 'description', label: 'Description', type: 'TEXTAREA', required: false, placeholder: 'Detailed description, business context, expected outcome' },
              { id: 'std-requester', key: 'requesterId', label: 'Requester', type: 'USER', required: true },
              { id: 'std-department', key: 'targetDepartmentId', label: 'Target Department', type: 'DEPARTMENT', required: false },
              { id: 'std-assignee', key: 'assigneeId', label: 'Assignee', type: 'USER', required: false },
              { id: 'std-work-type', key: 'workType', label: 'Work Type', type: 'SELECT', required: false, defaultValue: 'NORMAL_TASK' },
              { id: 'std-category', key: 'category', label: 'Category', type: 'SELECT', required: false, defaultValue: 'GENERAL_REQUEST' },
              { id: 'std-severity', key: 'technicalSeverity', label: 'Severity', type: 'SELECT', required: false, defaultValue: 'MEDIUM' },
              { id: 'std-impact', key: 'businessImpact', label: 'Business Impact', type: 'SELECT', required: false, defaultValue: 'MODERATE' },
              { id: 'std-urgency', key: 'urgency', label: 'Urgency', type: 'SELECT', required: false, defaultValue: 'MEDIUM' },
              { id: 'std-priority', key: 'businessPriority', label: 'Business Priority', type: 'SELECT', required: false, defaultValue: 'P3_MEDIUM' },
              { id: 'std-sla-policy', key: 'slaPolicyId', label: 'SLA Policy', type: 'SELECT', required: false },
            ],
          },
        ],
        changeLog: 'Initial standard task intake form.',
        createdByUserId: SYSTEM_OWNER_ID,
        createdAt: now,
      };
      db.data.formVersions.push(formVersion);
      changed = true;
    }

    if (!db.data.workflowDefinitions.some((item) => item.id === DEFINITION_ID)) {
      const definition: WorkflowDefinition = {
        id: DEFINITION_ID,
        key: 'standard-task',
        name: 'Standard Task / Work Item',
        description: 'Single-task ad-hoc and operational enterprise work item.',
        domain: 'GENERAL',
        defaultWorkType: 'TASK',
        lifecycle: 'PUBLISHED',
        scope: 'COMPANY',
        ownerId: SYSTEM_OWNER_ID,
        maintainerIds: [],
        latestVersion: 1,
        tags: ['task', 'standard', 'general', 'quick-work'],
        iconName: 'CheckSquare',
        createdAt: now,
        updatedAt: now,
      };
      db.data.workflowDefinitions.push(definition);
      changed = true;
    }

    if (!db.data.workflowVersions.some((item) => item.workflowDefinitionId === DEFINITION_ID && item.version === 1)) {
      const payload: Omit<WorkflowVersion, 'checksum'> = {
        id: `${DEFINITION_ID}-v1`,
        workflowDefinitionId: DEFINITION_ID,
        version: 1,
        status: 'PUBLISHED',
        variables: [
          { key: 'summary', type: 'STRING', required: true },
          { key: 'description', type: 'STRING', required: false },
          { key: 'requesterId', type: 'USER_REF', required: true },
          { key: 'targetDepartmentId', type: 'RECORD_REF', required: false },
          { key: 'assigneeId', type: 'USER_REF', required: false },
          { key: 'workType', type: 'STRING', required: false },
          { key: 'category', type: 'STRING', required: false },
          { key: 'technicalSeverity', type: 'STRING', required: false },
          { key: 'businessImpact', type: 'STRING', required: false },
          { key: 'urgency', type: 'STRING', required: false },
          { key: 'businessPriority', type: 'STRING', required: false },
          { key: 'slaPolicyId', type: 'STRING', required: false },
        ],
        triggers: [{ id: 'std-task-manual-trigger', type: 'MANUAL', enabled: true }],
        stages: [
          { id: 'std-task-stage-work', key: 'work', title: 'Work', order: 1, trigger: 'IMMEDIATE', nodeIds: ['std-task-start', 'std-task-work', 'std-task-success'] },
        ],
        nodes: [
          { id: 'std-task-start', key: 'task-start', type: 'START', title: 'Task created', stageId: 'std-task-stage-work', position: { x: 80, y: 220 } },
          {
            id: 'std-task-work',
            key: 'task-work',
            type: 'TASK',
            title: 'Standard task execution',
            description: 'Execute and complete the assigned task.',
            instructions: 'Review requirements and perform the requested operational work.',
            stageId: 'std-task-stage-work',
            position: { x: 380, y: 220 },
            assignment: { strategy: 'RULE_ENGINE' },
            timeoutMinutes: 1440,
          },
          { id: 'std-task-success', key: 'task-success', type: 'SUCCESS_END', title: 'Task completed', stageId: 'std-task-stage-work', position: { x: 680, y: 220 } },
        ],
        edges: [
          { id: 'std-task-edge-0', sourceNodeId: 'std-task-start', destinationNodeId: 'std-task-work', dependencyType: 'FINISH_TO_START' },
          { id: 'std-task-edge-1', sourceNodeId: 'std-task-work', destinationNodeId: 'std-task-success', dependencyType: 'FINISH_TO_START' },
        ],
        policySetId: 'policy-general-v1',
        policySetVersion: 1,
        formDefinitionId: FORM_ID,
        formVersion: 1,
        changeLog: 'Standard single-node enterprise task workflow.',
        createdByUserId: SYSTEM_OWNER_ID,
        createdAt: now,
        publishedAt: now,
      };
      db.data.workflowVersions.push({ ...payload, checksum: checksum(payload) });
      changed = true;
    }

    let requestType = db.data.requestTypesV2.find((item) => item.id === REQUEST_TYPE_ID);
    if (!requestType) {
      requestType = {
        id: REQUEST_TYPE_ID,
        key: 'standard-task',
        name: 'Standard Task / Subtask',
        description: 'Ad-hoc single-step enterprise work item or operational subtask.',
        domain: 'GENERAL',
        workType: 'TASK',
        category: 'General',
        iconName: 'CheckSquare',
        formDefinitionId: FORM_ID,
        formVersion: 1,
        workflowDefinitionId: DEFINITION_ID,
        workflowVersion: 1,
        policySetId: 'policy-general-v1',
        supportedChannels: ['EMPLOYEE_PORTAL', 'AGENT', 'MANAGER', 'ADMIN', 'API'],
        visibility: 'INTERNAL',
        isActive: true,
        tags: ['task', 'subtask', 'general', 'standard'],
      };
      db.data.requestTypesV2.push(requestType);
      changed = true;
    } else if (!requestType.isActive) {
      requestType.isActive = true;
      changed = true;
    }

    if (!db.data.workflowCatalogTemplates.some((item) => item.id === TEMPLATE_ID)) {
      const template: WorkflowCatalogTemplate = {
        id: TEMPLATE_ID,
        workflowDefinitionId: DEFINITION_ID,
        publishedWorkflowVersion: 1,
        title: 'Standard Task',
        purpose: 'Standard single-step enterprise work item.',
        domain: 'GENERAL',
        category: 'General',
        scope: 'COMPANY',
        ownerId: SYSTEM_OWNER_ID,
        maintainerIds: [],
        tags: ['task', 'general', 'standard'],
        iconName: 'CheckSquare',
        estimatedDurationMinutes: 1440,
        stageCount: 1,
        departmentCount: 1,
        approvalCount: 0,
        automationCount: 0,
        runCount: 0,
        successRate: 0,
        favoriteUserIds: [],
        lifecycle: 'PUBLISHED',
        changeLog: 'Initial governed standard task template.',
        kind: 'BASIC_TICKET',
        catalogGroup: 'General · Quick work',
        requestTypeId: REQUEST_TYPE_ID,
      };
      db.data.workflowCatalogTemplates.push(template);
      changed = true;
    }

    return changed;
  }
}
