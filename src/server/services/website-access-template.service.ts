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

const DEFINITION_ID = 'wf-website-access';
const FORM_ID = 'form-website-access';
const REQUEST_TYPE_ID = 'request-website-access';
const TEMPLATE_ID = 'template-website-access';
const SYSTEM_OWNER_ID = 'platform-bank-infosec';
const INSTALLED_AT = '2026-08-24T00:00:00.000Z';

const checksum = (value: unknown) =>
  `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

/**
 * Installs a real, company-scoped Website Access Request definition. The
 * workflow deliberately stores no identity fixture: manager, InfoSec and Help
 * Desk identities are resolved from the live directory at execution time.
 */
export class WebsiteAccessTemplateService {
  public static ensureInstalled(): boolean {
    let changed = false;

    if (!db.data.formDefinitionsV2.some((item) => item.id === FORM_ID)) {
      const form: FormDefinition = {
        id: FORM_ID, key: 'website-access-request', title: 'Website Access Request',
        description: 'Request access to an external website for a business purpose.',
        domain: 'INFORMATION_SECURITY', lifecycle: 'PUBLISHED', latestVersion: 1,
        ownerId: SYSTEM_OWNER_ID, maintainerIds: [], createdAt: INSTALLED_AT, updatedAt: INSTALLED_AT,
      };
      db.data.formDefinitionsV2.push(form);
      changed = true;
    }

    if (!db.data.formVersions.some((item) => item.formDefinitionId === FORM_ID && item.version === 1)) {
      const formVersion: FormVersion = {
        id: `${FORM_ID}-v1`, formDefinitionId: FORM_ID, version: 1, status: 'PUBLISHED',
        sections: [{
          id: 'website-request-details', title: 'Request details',
          description: 'Provide the requested website and the business need.',
          fields: [
            { id: 'website-summary', key: 'summary', label: 'Request title', type: 'TEXT', required: true, validation: { min: 5, max: 160 } },
            { id: 'website-url', key: 'websiteUrl', label: 'Website URL', type: 'URL', required: true, validation: { pattern: '^https?://.+' }, placeholder: 'https://example.com' },
            { id: 'website-justification', key: 'businessJustification', label: 'Business justification', type: 'TEXTAREA', required: true, validation: { min: 10, max: 4000 } },
            { id: 'website-duration', key: 'requiredDuration', label: 'Required duration', type: 'SELECT', required: true, options: [
              { value: 'ONE_DAY', label: 'One day' }, { value: 'ONE_WEEK', label: 'One week' },
              { value: 'ONE_MONTH', label: 'One month' }, { value: 'ONGOING', label: 'Ongoing' },
            ] },
            { id: 'website-access-type', key: 'accessType', label: 'Access type', type: 'SELECT', required: true, options: [
              { value: 'STANDARD', label: 'Standard browsing' }, { value: 'ELEVATED', label: 'Elevated business access' },
            ] },
          ],
        }],
        changeLog: 'Initial company Website Access request form.', createdByUserId: SYSTEM_OWNER_ID, createdAt: INSTALLED_AT,
      };
      db.data.formVersions.push(formVersion);
      changed = true;
    }

    if (!db.data.workflowDefinitions.some((item) => item.id === DEFINITION_ID)) {
      const definition: WorkflowDefinition = {
        id: DEFINITION_ID, key: 'website-access', name: 'Website Access Request',
        description: 'Employee request with directory manager approval, InfoSec approval and Help Desk fulfilment.',
        domain: 'INFORMATION_SECURITY', defaultWorkType: 'SERVICE_REQUEST', lifecycle: 'PUBLISHED', scope: 'COMPANY',
        ownerId: SYSTEM_OWNER_ID, maintainerIds: [], latestVersion: 1,
        tags: ['website', 'access', 'directory-manager', 'infosec', 'help-desk'], iconName: 'Globe2',
        createdAt: INSTALLED_AT, updatedAt: INSTALLED_AT,
      };
      db.data.workflowDefinitions.push(definition);
      changed = true;
    }

    if (!db.data.workflowVersions.some((item) => item.workflowDefinitionId === DEFINITION_ID && item.version === 1)) {
      const payload: Omit<WorkflowVersion, 'checksum'> = {
        id: `${DEFINITION_ID}-v1`, workflowDefinitionId: DEFINITION_ID, version: 1, status: 'PUBLISHED',
        variables: [
          { key: 'summary', type: 'STRING', required: true }, { key: 'websiteUrl', type: 'STRING', required: true },
          { key: 'businessJustification', type: 'STRING', required: true }, { key: 'requesterId', type: 'USER_REF', required: true },
          { key: 'requesterIsDepartmentManager', type: 'BOOLEAN', required: true },
        ],
        triggers: [{ id: 'website-manual-trigger', type: 'MANUAL', enabled: true }],
        stages: [
          { id: 'website-stage-submission', key: 'submission', title: 'Submission', order: 1, trigger: 'IMMEDIATE', nodeIds: ['website-start', 'website-input', 'website-is-manager'] },
          { id: 'website-stage-manager', key: 'manager-approval', title: 'Management approval', order: 2, trigger: 'AFTER_PREVIOUS', nodeIds: ['website-manager-approval'] },
          { id: 'website-stage-infosec', key: 'infosec-review', title: 'Security review', order: 3, trigger: 'AFTER_PREVIOUS', nodeIds: ['website-infosec-approval'] },
          { id: 'website-stage-helpdesk', key: 'implementation', title: 'Implementation', order: 4, trigger: 'AFTER_PREVIOUS', nodeIds: ['website-helpdesk-task'] },
          { id: 'website-stage-completed', key: 'completed', title: 'Completed', order: 5, trigger: 'AFTER_PREVIOUS', nodeIds: ['website-complete', 'website-rejected'] },
        ],
        nodes: [
          { id: 'website-start', key: 'website-start', type: 'START', title: 'Website access request submitted', stageId: 'website-stage-submission', position: { x: 80, y: 220 } },
          { id: 'website-input', key: 'website-input', type: 'TICKET_INPUT', title: 'Website Access Request Form', description: 'Website URL, business justification, duration and access type.', stageId: 'website-stage-submission', position: { x: 320, y: 220 }, inputConfig: { fields: [
            { id: 'website-url', key: 'websiteUrl', label: 'Website URL', type: 'URL', required: true },
            { id: 'website-justification', key: 'businessJustification', label: 'Business justification', type: 'TEXTAREA', required: true },
          ] } },
          { id: 'website-is-manager', key: 'website-is-manager', type: 'CONDITION', title: 'Is requester the department manager?', stageId: 'website-stage-submission', position: { x: 580, y: 220 }, condition: { combinator: 'ALL', clauses: [{ left: { source: 'CONTEXT', path: 'requesterIsDepartmentManager' }, operator: 'EQUALS', right: { source: 'LITERAL', value: true } }] } },
          { id: 'website-manager-approval', key: 'website-manager-approval', type: 'APPROVAL', title: 'Department Manager Approval', description: 'Resolved from the requester department’s live manager relationship.', stageId: 'website-stage-manager', position: { x: 860, y: 340 }, approval: { approverSource: 'REQUESTER_MANAGER', approvalMode: 'ANY_ONE', timeoutMinutes: 480, reminderMinutes: 120, commentsMandatoryOnReject: true, preventSelfApproval: true, escalationSource: 'CAB_BOARD' } },
          { id: 'website-infosec-approval', key: 'website-infosec-approval', type: 'APPROVAL', title: 'InfoSec Approval', description: 'Resolved only to active InfoSec approvers from the directory-backed role mapping.', stageId: 'website-stage-infosec', position: { x: 1130, y: 220 }, approval: { approverSource: 'ROLE', role: 'INFOSEC_MANAGER', approvalMode: 'ANY_ONE', timeoutMinutes: 480, reminderMinutes: 120, commentsMandatoryOnReject: true, preventSelfApproval: true, escalationSource: 'CAB_BOARD' } },
          { id: 'website-helpdesk-task', key: 'website-helpdesk-task', type: 'TASK', title: 'Implement Website Access', description: 'Help Desk applies the approved website access and records implementation evidence.', instructions: 'Claim the task, implement the approved scope, record evidence and mark Done.', acceptanceCriteria: ['InfoSec approval is verified', 'Approved access is implemented', 'Implementation evidence is recorded'], checklist: ['Verify approval', 'Implement access', 'Record evidence', 'Notify requester'], stageId: 'website-stage-helpdesk', position: { x: 1390, y: 220 }, assignment: { strategy: 'UNASSIGNED_TEAM_QUEUE', role: 'IT_ADMIN' }, timeoutMinutes: 480 },
          { id: 'website-complete', key: 'website-complete', type: 'SUCCESS_END', title: 'Website access completed', stageId: 'website-stage-completed', position: { x: 1660, y: 180 } },
          { id: 'website-rejected', key: 'website-rejected', type: 'REJECTED_END', title: 'Website access rejected', stageId: 'website-stage-completed', position: { x: 1390, y: 430 } },
        ],
        edges: [
          { id: 'website-e1', sourceNodeId: 'website-start', destinationNodeId: 'website-input' },
          { id: 'website-e2', sourceNodeId: 'website-input', destinationNodeId: 'website-is-manager' },
          { id: 'website-e3', sourceNodeId: 'website-is-manager', destinationNodeId: 'website-infosec-approval', outcome: 'TRUE', branchLabel: 'Yes — skip self-approval' },
          { id: 'website-e4', sourceNodeId: 'website-is-manager', destinationNodeId: 'website-manager-approval', outcome: 'FALSE', branchLabel: 'No — manager approval' },
          { id: 'website-e5', sourceNodeId: 'website-manager-approval', destinationNodeId: 'website-infosec-approval', outcome: 'APPROVED', branchLabel: 'Approved' },
          { id: 'website-e6', sourceNodeId: 'website-manager-approval', destinationNodeId: 'website-rejected', outcome: 'REJECTED', branchLabel: 'Rejected' },
          { id: 'website-e7', sourceNodeId: 'website-infosec-approval', destinationNodeId: 'website-helpdesk-task', outcome: 'APPROVED', branchLabel: 'Approved' },
          { id: 'website-e8', sourceNodeId: 'website-infosec-approval', destinationNodeId: 'website-rejected', outcome: 'REJECTED', branchLabel: 'Rejected' },
          { id: 'website-e9', sourceNodeId: 'website-helpdesk-task', destinationNodeId: 'website-complete' },
        ],
        policySetId: 'policy-general-v1', policySetVersion: 1, formDefinitionId: FORM_ID, formVersion: 1,
        changeLog: 'Initial persisted Website Access workflow.', createdByUserId: SYSTEM_OWNER_ID, createdAt: INSTALLED_AT, publishedAt: INSTALLED_AT,
      };
      db.data.workflowVersions.push({ ...payload, checksum: checksum(payload) });
      changed = true;
    }

    if (!db.data.requestTypesV2.some((item) => item.id === REQUEST_TYPE_ID)) {
      const requestType: RequestTypeDefinition = {
        id: REQUEST_TYPE_ID, key: 'website-access', name: 'Website Access Request', description: 'Request access to an external website.',
        domain: 'INFORMATION_SECURITY', workType: 'SERVICE_REQUEST', category: 'Information Security', iconName: 'Globe2',
        formDefinitionId: FORM_ID, formVersion: 1, workflowDefinitionId: DEFINITION_ID, workflowVersion: 1, policySetId: 'policy-general-v1',
        supportedChannels: ['EMPLOYEE_PORTAL', 'MANAGER', 'ADMIN', 'API'], visibility: 'INTERNAL', isActive: true, tags: ['website', 'access'],
      };
      db.data.requestTypesV2.push(requestType);
      changed = true;
    }

    if (!db.data.workflowCatalogTemplates.some((item) => item.id === TEMPLATE_ID)) {
      const template: WorkflowCatalogTemplate = {
        id: TEMPLATE_ID, workflowDefinitionId: DEFINITION_ID, publishedWorkflowVersion: 1, title: 'Website Access Request',
        purpose: 'Employee → Department Manager → InfoSec → Help Desk → Completed.', domain: 'INFORMATION_SECURITY', category: 'Information Security', scope: 'COMPANY',
        ownerId: SYSTEM_OWNER_ID, maintainerIds: [], tags: ['website', 'access', 'infosec', 'help-desk'], iconName: 'Globe2', estimatedDurationMinutes: 1440,
        stageCount: 5, departmentCount: 3, approvalCount: 2, automationCount: 0, runCount: 0, successRate: 0, favoriteUserIds: [], lifecycle: 'PUBLISHED', changeLog: 'Initial governed company template.',
        kind: 'WORKFLOW', catalogGroup: 'IT · Access and approvals', requestTypeId: REQUEST_TYPE_ID,
      };
      db.data.workflowCatalogTemplates.push(template);
      changed = true;
    }
    return changed;
  }
}
