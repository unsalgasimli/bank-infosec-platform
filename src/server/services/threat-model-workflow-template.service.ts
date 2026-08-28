import crypto from 'crypto';
import type { WorkflowCatalogTemplate, WorkflowDefinition, WorkflowVersion } from '../../shared/types/orchestration.js';
import { db } from '../db/database.js';

const DEFINITION_ID = 'wf-threat-model-governance';
const TEMPLATE_ID = 'template-threat-model-governance';
const SYSTEM_OWNER_ID = 'platform-bank-infosec';

const checksum = (value: unknown) =>
  `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

/**
 * The workflow catalogue expresses the accountable, bank-wide Threat Model
 * lifecycle. It intentionally does not replace the normalized Threat Model
 * aggregate: policy checks, immutable revisions, approvals and release
 * authorization remain server-enforced by ThreatModelService.
 */
export class ThreatModelWorkflowTemplateService {
  public static ensureInstalled(): boolean {
    let changed = false;
    const now = '2026-08-28T00:00:00.000Z';

    if (!db.data.workflowDefinitions.some((item) => item.id === DEFINITION_ID)) {
      const definition: WorkflowDefinition = {
        id: DEFINITION_ID,
        key: 'threat-model-governance',
        name: 'Threat Model Governance',
        description: 'Policy-driven architecture, threat, control, verification, risk and release governance lifecycle.',
        domain: 'INFORMATION_SECURITY',
        defaultWorkType: 'SECURITY_CASE',
        lifecycle: 'PUBLISHED',
        scope: 'COMPANY',
        ownerId: SYSTEM_OWNER_ID,
        maintainerIds: [],
        latestVersion: 1,
        tags: ['threat-model', 'stride', 'appsec', 'security-architecture', 'release-gate', 'risk'],
        iconName: 'ShieldCheck',
        createdAt: now,
        updatedAt: now,
      };
      db.data.workflowDefinitions.push(definition);
      changed = true;
    }

    if (!db.data.workflowVersions.some((item) => item.workflowDefinitionId === DEFINITION_ID && item.version === 1)) {
      const payload: Omit<WorkflowVersion, 'checksum'> = {
        id: `${DEFINITION_ID}-v1`, workflowDefinitionId: DEFINITION_ID, version: 1, status: 'PUBLISHED',
        variables: [
          { key: 'threatModelId', type: 'RECORD_REF', required: true, description: 'Normalized Threat Model identifier.' },
          { key: 'releaseId', type: 'RECORD_REF', description: 'Release, change or deployment identifier.' },
          { key: 'residualRiskRequiresAcceptance', type: 'BOOLEAN', description: 'Server-derived policy result; it determines whether the optional risk-acceptance approval is routed.' },
          { key: 'securityReleaseAuthorization', type: 'STRING', sensitive: true, description: 'Short-lived authorization issued only by the server release gate.' },
          { key: 'environment', type: 'STRING', description: 'Target environment; production requires the release guard.' },
        ],
        triggers: [{ id: 'threat-model-manual-trigger', type: 'MANUAL', enabled: true }, { id: 'threat-model-created-trigger', type: 'RECORD_EVENT', eventName: 'threat-model.created', recordType: 'THREAT_MODEL', enabled: true }],
        stages: [
          { id: 'tm-stage-intake', key: 'intake', title: 'Applicability and architecture', order: 1, trigger: 'IMMEDIATE', nodeIds: ['tm-start', 'tm-applicability', 'tm-architecture'] },
          { id: 'tm-stage-analysis', key: 'analysis', title: 'Threat analysis', order: 2, trigger: 'AFTER_PREVIOUS', nodeIds: ['tm-threat-analysis', 'tm-security-architecture'] },
          { id: 'tm-stage-treatment', key: 'treatment', title: 'Treatment and verification', order: 3, trigger: 'AFTER_PREVIOUS', nodeIds: ['tm-mitigation', 'tm-verification'] },
          { id: 'tm-stage-risk', key: 'risk', title: 'Residual-risk governance', order: 4, trigger: 'AFTER_PREVIOUS', nodeIds: ['tm-risk-review', 'tm-risk-acceptance-required', 'tm-risk-acceptance'] },
          { id: 'tm-stage-release', key: 'release', title: 'Release decision', order: 5, trigger: 'AFTER_PREVIOUS', nodeIds: ['tm-appsec-approval', 'tm-release-gate', 'tm-complete', 'tm-rejected'] },
        ],
        nodes: [
          { id: 'tm-start', key: 'threat-model-start', type: 'START', title: 'Threat Model initiated', stageId: 'tm-stage-intake', position: { x: 40, y: 260 } },
          { id: 'tm-applicability', key: 'applicability-assessment', type: 'TASK', title: 'Assess Threat Model applicability', description: 'Record the tier, trigger signals, scope and evidence before architecture work begins.', instructions: 'Use the policy version pinned to the Threat Model. Non-applicability requires a reason and evidence.', acceptanceCriteria: ['Applicability decision is persisted', 'Tier and trigger signals are recorded'], assignment: { strategy: 'UNASSIGNED_TEAM_QUEUE', role: 'APPSEC_ANALYST' }, stageId: 'tm-stage-intake', position: { x: 220, y: 260 }, timeoutMinutes: 1440 },
          { id: 'tm-architecture', key: 'architecture-and-dfd', type: 'TASK', title: 'Model architecture, DFD and trust boundaries', description: 'Document components, data classification, integrations, data flows and trust boundaries.', acceptanceCriteria: ['Components and ownership are recorded', 'Data flows and classifications are recorded', 'Trust boundaries are explicit'], assignment: { strategy: 'UNASSIGNED_TEAM_QUEUE', role: 'APPLICATION_OWNER' }, stageId: 'tm-stage-intake', position: { x: 470, y: 260 }, timeoutMinutes: 2880 },
          { id: 'tm-threat-analysis', key: 'stride-and-bank-abuse-analysis', type: 'TASK', title: 'Analyze STRIDE and bank abuse cases', description: 'Assess STRIDE plus credential, payment, PII, privileged-access, insider and third-party abuse paths.', acceptanceCriteria: ['Threats are linked to components, flows or boundaries', 'Inherent likelihood and impact are justified'], assignment: { strategy: 'UNASSIGNED_TEAM_QUEUE', role: 'APPSEC_ANALYST' }, stageId: 'tm-stage-analysis', position: { x: 720, y: 260 }, timeoutMinutes: 2880 },
          { id: 'tm-security-architecture', key: 'security-architecture-review', type: 'APPROVAL', title: 'Security Architecture approval', description: 'An independent security architecture reviewer validates the modelled boundaries and architecture.', approval: { approverSource: 'ROLE', approvalMode: 'ANY_ONE', role: 'INFOSEC_MANAGER', timeoutMinutes: 1440, reminderMinutes: 240, commentsMandatoryOnReject: true, allowDelegation: false, preventSelfApproval: true }, stageId: 'tm-stage-analysis', position: { x: 980, y: 260 } },
          { id: 'tm-mitigation', key: 'mitigation-and-remediation', type: 'TASK', title: 'Plan mitigation and remediation', description: 'Link controls to threats and create owned remediation work with policy-driven due dates.', acceptanceCriteria: ['Controls are mapped to threats', 'Open remediation is assigned and due-dated', 'Exceptions include compensating controls and expiry'], assignment: { strategy: 'UNASSIGNED_TEAM_QUEUE', role: 'SECURITY_ANALYST' }, stageId: 'tm-stage-treatment', position: { x: 1210, y: 260 }, timeoutMinutes: 2880 },
          { id: 'tm-verification', key: 'control-verification', type: 'TASK', title: 'Verify controls and security testing', description: 'Attach evidence from code review, SAST, SCA, DAST, penetration testing or control testing.', acceptanceCriteria: ['Control verification result is recorded', 'Evidence is immutable and traceable', 'Failed verification reopens remediation'], assignment: { strategy: 'UNASSIGNED_TEAM_QUEUE', role: 'APPSEC_ANALYST' }, stageId: 'tm-stage-treatment', position: { x: 1450, y: 260 }, timeoutMinutes: 2880 },
          { id: 'tm-risk-review', key: 'residual-risk-review', type: 'TASK', title: 'Review residual risk', description: 'Recalculate residual risk after verification and link material exposure to the enterprise Risk Register.', acceptanceCriteria: ['Residual score and rationale are recorded', 'Risk Register linkage is recorded where material'], assignment: { strategy: 'UNASSIGNED_TEAM_QUEUE', role: 'GRC_ANALYST' }, stageId: 'tm-stage-risk', position: { x: 1690, y: 260 }, timeoutMinutes: 1440 },
          { id: 'tm-risk-acceptance-required', key: 'risk-acceptance-required', type: 'CONDITION', title: 'Does residual risk require acceptance?', description: 'The normalized Threat Model service sets this from residual risk and policy; a UI workflow cannot waive it.', condition: { combinator: 'ALL', clauses: [{ left: { source: 'CONTEXT', path: 'residualRiskRequiresAcceptance' }, operator: 'IS_TRUE' }] }, stageId: 'tm-stage-risk', position: { x: 1910, y: 260 } },
          { id: 'tm-risk-acceptance', key: 'risk-acceptance', type: 'APPROVAL', title: 'Risk acceptance decision', description: 'Required only for residual risks that cannot be remediated before release; the Threat Model service validates owner, expiry and compensating controls.', approval: { approverSource: 'ROLE', approvalMode: 'ANY_ONE', role: 'RISK_OWNER', timeoutMinutes: 1440, reminderMinutes: 240, commentsMandatoryOnReject: true, allowDelegation: false, preventSelfApproval: true }, stageId: 'tm-stage-risk', position: { x: 2130, y: 160 } },
          { id: 'tm-appsec-approval', key: 'appsec-review', type: 'APPROVAL', title: 'AppSec approval', description: 'Independent AppSec approval of the completed Threat Model revision.', approval: { approverSource: 'ROLE', approvalMode: 'ANY_ONE', role: 'APPSEC_ANALYST', timeoutMinutes: 1440, reminderMinutes: 240, commentsMandatoryOnReject: true, allowDelegation: false, preventSelfApproval: true }, stageId: 'tm-stage-release', position: { x: 2370, y: 260 } },
          { id: 'tm-release-gate', key: 'server-release-gate', type: 'SYSTEM_ACTION', title: 'Server-enforced security release gate', description: 'For production, the deployment action accepts only a current, server-issued Threat Model release authorization.', action: { actionKey: 'DEPLOY', idempotencyKeyTemplate: 'threat-model-release-{{threatModelId}}-{{releaseId}}' }, stageId: 'tm-stage-release', position: { x: 2390, y: 260 } },
          { id: 'tm-complete', key: 'governance-complete', type: 'SUCCESS_END', title: 'Threat Model governance complete', stageId: 'tm-stage-release', position: { x: 2640, y: 200 } },
          { id: 'tm-rejected', key: 'governance-rejected', type: 'REJECTED_END', title: 'Threat Model requires remediation', stageId: 'tm-stage-release', position: { x: 2390, y: 390 } },
        ],
        edges: [
          { id: 'tm-e1', sourceNodeId: 'tm-start', destinationNodeId: 'tm-applicability', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e2', sourceNodeId: 'tm-applicability', destinationNodeId: 'tm-architecture', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e3', sourceNodeId: 'tm-architecture', destinationNodeId: 'tm-threat-analysis', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e4', sourceNodeId: 'tm-threat-analysis', destinationNodeId: 'tm-security-architecture', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e5', sourceNodeId: 'tm-security-architecture', destinationNodeId: 'tm-mitigation', outcome: 'APPROVED', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e6', sourceNodeId: 'tm-security-architecture', destinationNodeId: 'tm-rejected', outcome: 'REJECTED', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e7', sourceNodeId: 'tm-mitigation', destinationNodeId: 'tm-verification', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e8', sourceNodeId: 'tm-verification', destinationNodeId: 'tm-risk-review', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e9', sourceNodeId: 'tm-risk-review', destinationNodeId: 'tm-risk-acceptance-required', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e10', sourceNodeId: 'tm-risk-acceptance-required', destinationNodeId: 'tm-risk-acceptance', outcome: 'TRUE', branchLabel: 'Acceptance required', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e11', sourceNodeId: 'tm-risk-acceptance-required', destinationNodeId: 'tm-appsec-approval', outcome: 'FALSE', branchLabel: 'No acceptance required', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e12', sourceNodeId: 'tm-risk-acceptance', destinationNodeId: 'tm-appsec-approval', outcome: 'APPROVED', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e13', sourceNodeId: 'tm-risk-acceptance', destinationNodeId: 'tm-rejected', outcome: 'REJECTED', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e14', sourceNodeId: 'tm-appsec-approval', destinationNodeId: 'tm-release-gate', outcome: 'APPROVED', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e15', sourceNodeId: 'tm-appsec-approval', destinationNodeId: 'tm-rejected', outcome: 'REJECTED', dependencyType: 'FINISH_TO_START' },
          { id: 'tm-e16', sourceNodeId: 'tm-release-gate', destinationNodeId: 'tm-complete', dependencyType: 'FINISH_TO_START' },
        ],
        policySetId: 'policy-general-v1', policySetVersion: 1,
        changeLog: 'Initial Threat Model governance lifecycle with independent architecture/AppSec approvals and a server-enforced release gate.',
        createdByUserId: SYSTEM_OWNER_ID, createdAt: now, publishedAt: now,
      };
      db.data.workflowVersions.push({ ...payload, checksum: checksum(payload) });
      changed = true;
    }

    if (!db.data.workflowCatalogTemplates.some((item) => item.id === TEMPLATE_ID)) {
      const template: WorkflowCatalogTemplate = {
        id: TEMPLATE_ID, workflowDefinitionId: DEFINITION_ID, publishedWorkflowVersion: 1,
        title: 'Threat Model Governance', purpose: 'Architecture → STRIDE → controls → verification → risk → independent approvals → server release gate.',
        domain: 'INFORMATION_SECURITY', category: 'Information Security', scope: 'COMPANY', ownerId: SYSTEM_OWNER_ID, maintainerIds: [],
        tags: ['threat-model', 'appsec', 'security-architecture', 'risk', 'release-gate'], iconName: 'ShieldCheck',
        estimatedDurationMinutes: 12960, stageCount: 5, departmentCount: 3, approvalCount: 3, automationCount: 1,
        runCount: 0, successRate: 0, favoriteUserIds: [], lifecycle: 'PUBLISHED',
        changeLog: 'Initial bank-wide Threat Model governance template.', kind: 'WORKFLOW', catalogGroup: 'Information Security · Governance',
      };
      db.data.workflowCatalogTemplates.push(template);
      changed = true;
    }
    return changed;
  }
}
