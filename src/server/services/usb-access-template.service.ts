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

const DEFINITION_ID = 'wf-usb-access';
const FORM_ID = 'form-usb-access';
const REQUEST_TYPE_ID = 'request-usb-access';
const TEMPLATE_ID = 'template-usb-access';
const SYSTEM_OWNER_ID = 'platform-bank-infosec';

const checksum = (value: unknown) =>
  `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

/**
 * Installs the governed bank-wide USB access starter. This is product
 * configuration, not demo business data: no users, approvals or tickets are
 * fabricated. Runtime identities are always resolved from the live directory.
 */
export class UsbAccessTemplateService {
  public static ensureInstalled(): boolean {
    let changed = false;
    const now = '2026-08-20T00:00:00.000Z';

    if (!db.data.formDefinitionsV2.some((item) => item.id === FORM_ID)) {
      const form: FormDefinition = {
        id: FORM_ID,
        key: 'usb-access-request',
        title: 'USB Access Request',
        description: 'Business request for controlled USB access.',
        domain: 'INFORMATION_SECURITY',
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
            id: 'usb-request-details',
            title: 'Request details',
            description: 'Describe the device, business purpose and requested access period.',
            fields: [
              { id: 'usb-summary', key: 'summary', label: 'Request title', type: 'TEXT', required: true, validation: { min: 5, max: 160 }, placeholder: 'USB access for approved business activity' },
              { id: 'usb-justification', key: 'businessJustification', label: 'Business justification', type: 'TEXTAREA', required: true, validation: { min: 10, max: 4000 }, placeholder: 'Explain why removable media is required and why an approved alternative is insufficient.' },
              { id: 'usb-device', key: 'deviceSerial', label: 'USB device serial / asset tag (if known)', type: 'TEXT', required: false, validation: { min: 2, max: 120 }, placeholder: 'Optional — add it if available' },
              { id: 'usb-scope', key: 'accessScope', label: 'Access scope', type: 'SELECT', required: true, options: [
                { value: 'READ_ONLY', label: 'Read only' },
                { value: 'READ_WRITE', label: 'Read and write' },
              ] },
              { id: 'usb-until', key: 'requestedUntil', label: 'Access required until', type: 'DATE', required: true, validation: { min: 'today' } },
              { id: 'usb-classification', key: 'dataClassification', label: 'Highest data classification', type: 'SELECT', required: true, options: [
                { value: 'INTERNAL', label: 'Internal' },
                { value: 'RESTRICTED', label: 'Restricted' },
                { value: 'CONFIDENTIAL', label: 'Confidential' },
              ] },
              { id: 'usb-requester', key: 'requesterId', label: 'Requester', type: 'USER', required: true },
              { id: 'usb-department', key: 'departmentId', label: 'Requester department / branch', type: 'DEPARTMENT', required: true },
            ],
          },
          {
            id: 'usb-controls',
            title: 'Security controls',
            description: 'Confirm the handling controls that apply to the requested device.',
            fields: [
              { id: 'usb-encryption', key: 'encryptedDevice', label: 'The device is bank-approved and encrypted', type: 'CHECKBOX', required: true },
            ],
          },
        ],
        changeLog: 'Initial governed USB access intake.',
        createdByUserId: SYSTEM_OWNER_ID,
        createdAt: now,
      };
      db.data.formVersions.push(formVersion);
      changed = true;
    }

    if (!db.data.workflowDefinitions.some((item) => item.id === DEFINITION_ID)) {
      const definition: WorkflowDefinition = {
        id: DEFINITION_ID,
        key: 'usb-access',
        name: 'USB Access',
        description: 'Employee request, exact LDAP manager approval, InfoSec decision and Help Desk fulfilment.',
        domain: 'INFORMATION_SECURITY',
        defaultWorkType: 'SERVICE_REQUEST',
        lifecycle: 'PUBLISHED',
        scope: 'COMPANY',
        ownerId: SYSTEM_OWNER_ID,
        maintainerIds: [],
        latestVersion: 1,
        tags: ['usb', 'access', 'ldap-manager', 'infosec', 'help-desk'],
        iconName: 'ShieldCheck',
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
          { key: 'businessJustification', type: 'STRING', required: true },
          { key: 'requesterId', type: 'USER_REF', required: true },
          { key: 'departmentId', type: 'RECORD_REF', required: true },
          { key: 'currentAssigneeId', type: 'USER_REF', description: 'Set by an authorized queue claim and used for decision ownership.' },
        ],
        triggers: [{ id: 'usb-manual-trigger', type: 'MANUAL', enabled: true }],
        stages: [
          { id: 'usb-stage-submission', key: 'submission', title: 'Request details', order: 1, trigger: 'IMMEDIATE', nodeIds: ['usb-start', 'usb-input', 'usb-manager-check'] },
          { id: 'usb-stage-manager', key: 'manager-approval', title: 'Department / branch manager approval', order: 2, trigger: 'AFTER_PREVIOUS', nodeIds: ['usb-manager-approval'] },
          { id: 'usb-stage-infosec', key: 'infosec-review', title: 'InfoSec approval', order: 3, trigger: 'AFTER_PREVIOUS', nodeIds: ['usb-infosec-ticket', 'usb-infosec-decision'] },
          { id: 'usb-stage-helpdesk', key: 'help-desk-fulfilment', title: 'Help Desk fulfilment', order: 4, trigger: 'AFTER_PREVIOUS', nodeIds: ['usb-helpdesk-ticket'] },
          { id: 'usb-stage-closed', key: 'closed', title: 'Closed', order: 5, trigger: 'AFTER_PREVIOUS', nodeIds: ['usb-fulfilled', 'usb-rejected'] },
        ],
        nodes: [
          { id: 'usb-start', key: 'usb-start', type: 'START', title: 'USB request submitted', stageId: 'usb-stage-submission', position: { x: 80, y: 220 } },
          {
            id: 'usb-input',
            key: 'usb-input',
            type: 'INPUT',
            title: 'USB Request Form',
            description: 'Customizable intake fields: access scope, device encryption, duration, and device tag.',
            stageId: 'usb-stage-submission',
            position: { x: 260, y: 220 },
            inputConfig: {
              fields: [
                { id: 'usb-scope', key: 'accessScope', label: 'Access scope', type: 'SELECT', required: true, options: [{ value: 'READ_ONLY', label: 'Read only' }, { value: 'READ_WRITE', label: 'Read and write' }] },
                { id: 'usb-device', key: 'deviceSerial', label: 'USB device serial / asset tag (if known)', type: 'TEXT', required: false, placeholder: 'Optional — add it if available' },
                { id: 'usb-until', key: 'requestedUntil', label: 'Access required until', type: 'DATE', required: true, validation: { min: 'today' } },
                { id: 'usb-encryption', key: 'encryptedDevice', label: 'Device is bank-approved and hardware encrypted', type: 'CHECKBOX', required: true },
              ],
            },
          },
          { id: 'usb-manager-check', key: 'usb-manager-check', type: 'CONDITION', title: 'Is the requester the department manager?', description: 'Managers do not approve their own request.', stageId: 'usb-stage-submission', position: { x: 470, y: 220 }, condition: { combinator: 'ALL', clauses: [{ left: { source: 'CONTEXT', path: 'requesterIsDepartmentManager' }, operator: 'EQUALS', right: { source: 'LITERAL', value: true } }] } },
          { id: 'usb-manager-approval', key: 'usb-manager-approval', type: 'APPROVAL', title: 'Manager approval', description: 'The requester’s exact Active Directory manager approves or rejects with an auditable decision.', stageId: 'usb-stage-manager', position: { x: 700, y: 220 }, approval: { approverSource: 'REQUESTER_MANAGER', approvalMode: 'ANY_ONE', timeoutMinutes: 1440, reminderMinutes: 240, commentsMandatoryOnReject: true, allowDelegation: true, preventSelfApproval: true } },
          { id: 'usb-infosec-ticket', key: 'usb-infosec-ticket', type: 'TASK', title: 'InfoSec USB access review ticket', description: 'An eligible InfoSec analyst claims this queue ticket, reviews the request and records comments/evidence.', instructions: 'Claim the ticket before review. Validate business purpose, device control, requested duration and data classification.', acceptanceCriteria: ['Ticket is claimed by the reviewing analyst', 'Review findings and supporting evidence are recorded'], stageId: 'usb-stage-infosec', position: { x: 780, y: 220 }, assignment: { strategy: 'UNASSIGNED_TEAM_QUEUE', role: 'SECURITY_ANALYST' }, timeoutMinutes: 480 },
          { id: 'usb-infosec-decision', key: 'usb-infosec-decision', type: 'APPROVAL', title: 'InfoSec decision', description: 'The analyst who claimed the InfoSec ticket accepts or rejects the request.', stageId: 'usb-stage-infosec', position: { x: 1060, y: 220 }, approval: { approverSource: 'DYNAMIC_EXPRESSION', dynamicPath: 'currentAssigneeId', approvalMode: 'ANY_ONE', timeoutMinutes: 480, reminderMinutes: 120, commentsMandatoryOnReject: true, allowDelegation: false, preventSelfApproval: false } },
          { id: 'usb-helpdesk-ticket', key: 'usb-helpdesk-ticket', type: 'TASK', title: 'Help Desk USB access fulfilment ticket', description: 'Issue the approved access, capture implementation evidence and close the ticket.', instructions: 'Claim the ticket, apply the approved scope and expiry, record device/endpoint evidence, then complete.', acceptanceCriteria: ['Approved scope and expiry are applied', 'Implementation evidence is recorded', 'Requester is informed'], checklist: ['Verify InfoSec approval', 'Apply access scope and expiry', 'Record implementation evidence', 'Confirm completion to requester'], stageId: 'usb-stage-helpdesk', position: { x: 1340, y: 140 }, assignment: { strategy: 'UNASSIGNED_TEAM_QUEUE', role: 'IT_ADMIN' }, timeoutMinutes: 480 },
          { id: 'usb-fulfilled', key: 'usb-fulfilled', type: 'SUCCESS_END', title: 'USB access fulfilled', stageId: 'usb-stage-closed', position: { x: 1640, y: 140 } },
          { id: 'usb-rejected', key: 'usb-rejected', type: 'REJECTED_END', title: 'USB access rejected', stageId: 'usb-stage-closed', position: { x: 1340, y: 340 } },
        ],
        edges: [
          { id: 'usb-edge-0', sourceNodeId: 'usb-start', destinationNodeId: 'usb-input', dependencyType: 'FINISH_TO_START' },
          { id: 'usb-edge-1', sourceNodeId: 'usb-input', destinationNodeId: 'usb-manager-check', dependencyType: 'FINISH_TO_START' },
          { id: 'usb-edge-2', sourceNodeId: 'usb-manager-check', destinationNodeId: 'usb-infosec-ticket', outcome: 'TRUE', branchLabel: 'Yes — requester is manager', dependencyType: 'FINISH_TO_START' },
          { id: 'usb-edge-3', sourceNodeId: 'usb-manager-check', destinationNodeId: 'usb-manager-approval', outcome: 'FALSE', branchLabel: 'No — manager approval required', dependencyType: 'FINISH_TO_START' },
          { id: 'usb-edge-3a', sourceNodeId: 'usb-manager-approval', destinationNodeId: 'usb-infosec-ticket', outcome: 'APPROVED', branchLabel: 'Approved', dependencyType: 'FINISH_TO_START' },
          { id: 'usb-edge-3b', sourceNodeId: 'usb-manager-approval', destinationNodeId: 'usb-rejected', outcome: 'REJECTED', branchLabel: 'Rejected', dependencyType: 'FINISH_TO_START' },
          { id: 'usb-edge-4', sourceNodeId: 'usb-infosec-ticket', destinationNodeId: 'usb-infosec-decision', dependencyType: 'FINISH_TO_START' },
          { id: 'usb-edge-5', sourceNodeId: 'usb-infosec-decision', destinationNodeId: 'usb-helpdesk-ticket', outcome: 'APPROVED', branchLabel: 'Accepted', dependencyType: 'FINISH_TO_START' },
          { id: 'usb-edge-6', sourceNodeId: 'usb-infosec-decision', destinationNodeId: 'usb-rejected', outcome: 'REJECTED', branchLabel: 'Rejected', dependencyType: 'FINISH_TO_START' },
          { id: 'usb-edge-7', sourceNodeId: 'usb-helpdesk-ticket', destinationNodeId: 'usb-fulfilled', dependencyType: 'FINISH_TO_START' },
        ],
        policySetId: 'policy-general-v1',
        policySetVersion: 1,
        formDefinitionId: FORM_ID,
        formVersion: 1,
        changeLog: 'Initial company USB access workflow with customizable input, LDAP manager, InfoSec and Help Desk stages.',
        createdByUserId: SYSTEM_OWNER_ID,
        createdAt: now,
        publishedAt: now,
      };
      db.data.workflowVersions.push({ ...payload, checksum: checksum(payload) });
      changed = true;
    }

    // Upgrade the previously installed v1 in place so the old always-manager
    // path disappears from the active catalog without deleting execution history.
    const installedVersion = db.data.workflowVersions.find((item) => item.workflowDefinitionId === DEFINITION_ID && item.version === 1);
    if (installedVersion && !installedVersion.nodes.some((node) => node.id === 'usb-manager-check')) {
      const input = installedVersion.nodes.find((node) => node.id === 'usb-input');
      const managerApproval = installedVersion.nodes.find((node) => node.id === 'usb-manager-approval');
      if (input && managerApproval) {
        input.stageId = 'usb-stage-submission';
        managerApproval.stageId = 'usb-stage-manager';
        installedVersion.nodes.splice(installedVersion.nodes.indexOf(managerApproval), 0, {
          id: 'usb-manager-check', key: 'usb-manager-check', type: 'CONDITION', title: 'Is the requester the department manager?', description: 'Managers do not approve their own request.', stageId: 'usb-stage-submission', position: { x: 470, y: 220 },
          condition: { combinator: 'ALL', clauses: [{ left: { source: 'CONTEXT', path: 'requesterIsDepartmentManager' }, operator: 'EQUALS', right: { source: 'LITERAL', value: true } }] },
        });
        installedVersion.stages = [
          { id: 'usb-stage-submission', key: 'submission', title: 'Request details', order: 1, trigger: 'IMMEDIATE', nodeIds: ['usb-start', 'usb-input', 'usb-manager-check'] },
          { id: 'usb-stage-manager', key: 'manager-approval', title: 'Department / branch manager approval', order: 2, trigger: 'AFTER_PREVIOUS', nodeIds: ['usb-manager-approval'] },
          { id: 'usb-stage-infosec', key: 'infosec-review', title: 'InfoSec approval', order: 3, trigger: 'AFTER_PREVIOUS', nodeIds: ['usb-infosec-ticket', 'usb-infosec-decision'] },
          { id: 'usb-stage-helpdesk', key: 'help-desk-fulfilment', title: 'Help Desk fulfilment', order: 4, trigger: 'AFTER_PREVIOUS', nodeIds: ['usb-helpdesk-ticket'] },
          { id: 'usb-stage-closed', key: 'closed', title: 'Closed', order: 5, trigger: 'AFTER_PREVIOUS', nodeIds: ['usb-fulfilled', 'usb-rejected'] },
        ];
        installedVersion.edges = installedVersion.edges.filter((edge) => !['usb-edge-1', 'usb-edge-2', 'usb-edge-3'].includes(edge.id));
        installedVersion.edges.push(
          { id: 'usb-edge-1', sourceNodeId: 'usb-input', destinationNodeId: 'usb-manager-check', dependencyType: 'FINISH_TO_START' },
          { id: 'usb-edge-2', sourceNodeId: 'usb-manager-check', destinationNodeId: 'usb-infosec-ticket', outcome: 'TRUE', branchLabel: 'Yes — requester is manager', dependencyType: 'FINISH_TO_START' },
          { id: 'usb-edge-3', sourceNodeId: 'usb-manager-check', destinationNodeId: 'usb-manager-approval', outcome: 'FALSE', branchLabel: 'No — manager approval required', dependencyType: 'FINISH_TO_START' },
          { id: 'usb-edge-3a', sourceNodeId: 'usb-manager-approval', destinationNodeId: 'usb-infosec-ticket', outcome: 'APPROVED', branchLabel: 'Approved', dependencyType: 'FINISH_TO_START' },
          { id: 'usb-edge-3b', sourceNodeId: 'usb-manager-approval', destinationNodeId: 'usb-rejected', outcome: 'REJECTED', branchLabel: 'Rejected', dependencyType: 'FINISH_TO_START' },
        );
        installedVersion.checksum = checksum({ ...installedVersion, checksum: undefined });
        changed = true;
      }
    }

    // Keep the published USB starter compatible with requests where a
    // non-technical requester does not know the device identifier yet.
    const installedFormVersion = db.data.formVersions.find((item) => item.formDefinitionId === FORM_ID && item.version === 1);
    const installedFormField = installedFormVersion?.sections.flatMap((section) => section.fields).find((field) => field.key === 'deviceSerial');
    if (installedFormField && (installedFormField.required || installedFormField.label !== 'USB device serial / asset tag (if known)')) {
      installedFormField.required = false;
      installedFormField.label = 'USB device serial / asset tag (if known)';
      installedFormField.placeholder = 'Optional — add it if available';
      changed = true;
    }

    const installedUntilField = installedFormVersion?.sections.flatMap((section) => section.fields).find((field) => field.key === 'requestedUntil');
    if (installedUntilField && installedUntilField.validation?.min !== 'today') {
      installedUntilField.validation = { ...installedUntilField.validation, min: 'today' };
      changed = true;
    }

    if (installedFormVersion) {
      const sectionsWithoutEvidence = installedFormVersion.sections.map((section) => ({
        ...section,
        fields: section.fields.filter((field) => field.key !== 'supportingEvidence'),
      }));
      if (sectionsWithoutEvidence.some((section, index) => section.fields.length !== installedFormVersion.sections[index].fields.length)) {
        installedFormVersion.sections = sectionsWithoutEvidence;
        changed = true;
      }
    }

    const installedInput = installedVersion?.nodes.find((node) => node.id === 'usb-input');
    const installedInputField = installedInput?.inputConfig?.fields?.find((field) => field.key === 'deviceSerial');
    if (installedInputField && (installedInputField.required || installedInputField.label !== 'USB device serial / asset tag (if known)')) {
      installedInputField.required = false;
      installedInputField.label = 'USB device serial / asset tag (if known)';
      installedInputField.placeholder = 'Optional — add it if available';
      installedVersion!.checksum = checksum({ ...installedVersion, checksum: undefined });
      changed = true;
    }

    const installedInputUntilField = installedInput?.inputConfig?.fields?.find((field) => field.key === 'requestedUntil');
    if (installedInputUntilField && installedInputUntilField.validation?.min !== 'today') {
      installedInputUntilField.validation = { ...installedInputUntilField.validation, min: 'today' };
      installedVersion!.checksum = checksum({ ...installedVersion, checksum: undefined });
      changed = true;
    }

    if (!db.data.requestTypesV2.some((item) => item.id === REQUEST_TYPE_ID)) {
      const requestType: RequestTypeDefinition = {
        id: REQUEST_TYPE_ID,
        key: 'usb-access',
        name: 'USB Access',
        description: 'Request controlled removable-media access.',
        domain: 'INFORMATION_SECURITY',
        workType: 'SERVICE_REQUEST',
        category: 'Information Security',
        iconName: 'ShieldCheck',
        formDefinitionId: FORM_ID,
        formVersion: 1,
        workflowDefinitionId: DEFINITION_ID,
        workflowVersion: 1,
        policySetId: 'policy-general-v1',
        supportedChannels: ['EMPLOYEE_PORTAL', 'MANAGER', 'ADMIN', 'API'],
        visibility: 'INTERNAL',
        isActive: true,
        tags: ['usb', 'access'],
      };
      db.data.requestTypesV2.push(requestType);
      changed = true;
    }

    if (!db.data.workflowCatalogTemplates.some((item) => item.id === TEMPLATE_ID)) {
      const template: WorkflowCatalogTemplate = {
        id: TEMPLATE_ID,
        workflowDefinitionId: DEFINITION_ID,
        publishedWorkflowVersion: 1,
        title: 'USB Access',
        purpose: 'Employee → LDAP manager approval → InfoSec review → Help Desk fulfilment.',
        domain: 'INFORMATION_SECURITY',
        category: 'Information Security',
        scope: 'COMPANY',
        ownerId: SYSTEM_OWNER_ID,
        maintainerIds: [],
        tags: ['usb', 'access', 'ldap', 'infosec', 'help-desk'],
        iconName: 'ShieldCheck',
        estimatedDurationMinutes: 1440,
        stageCount: 4,
        departmentCount: 3,
        approvalCount: 2,
        automationCount: 0,
        runCount: 0,
        successRate: 0,
        favoriteUserIds: [],
        lifecycle: 'PUBLISHED',
        changeLog: 'Initial governed company template.',
        kind: 'WORKFLOW',
        catalogGroup: 'IT · Access and approvals',
        requestTypeId: REQUEST_TYPE_ID,
      };
      db.data.workflowCatalogTemplates.push(template);
      changed = true;
    }

    return changed;
  }
}
