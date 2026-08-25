import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';
import { WorkflowPreflightService } from '../server/services/workflow-preflight.service.js';
import { WorkflowOrchestrationService } from '../server/services/workflow-orchestration.service.js';
import { WorkflowRuntimeService } from '../server/services/workflow-runtime.service.js';
import type { BankDepartment, BankUser } from '../shared/types/auth.js';
import type { WorkflowVersion } from '../shared/types/orchestration.js';

const makeUser = (id: string, roles: BankUser['roles']): BankUser => ({
  id,
  username: id,
  email: `${id}@bank.test`,
  fullName: `Test User ${id}`,
  title: 'Platform Admin',
  divisionId: 'div-bank',
  departmentId: 'dept-secops',
  teamIds: ['team-soc'],
  roles,
  securityClearance: 'INTERNAL',
  ownedApplicationIds: [],
  ownedAssetIds: [],
  ownedRiskIds: [],
  isActive: true,
  distinguishedName: `CN=${id},OU=Users,DC=bank,DC=test`,
  directorySource: 'ACTIVE_DIRECTORY',
});

test('Ticket Input Node Workflow Integration', async (t) => {

  const author = makeUser('usr-input-author', ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'REQUESTER']);
  const department: BankDepartment = {
    id: 'dept-secops',
    divisionId: 'div-bank',
    name: 'Security Operations',
    code: 'SECOPS',
    managerId: author.id,
    isActive: true,
    directorySource: 'ACTIVE_DIRECTORY',
  };

  t.after(() => {
    db.data = structuredClone(initialSeedData);
  });

  const reset = () => {
    db.reset(structuredClone(initialSeedData));
    db.data.users.push(author);
    db.data.departments.push(department);
    db.persist();
  };

  await t.test('Preflight validation enforces valid field keys and catches duplicate keys in INPUT nodes', () => {
    reset();

    // 1. Invalid field key (e.g. spaces or symbols)
    const invalidKeyVersion: WorkflowVersion = {
      id: 'ver-test-input-invalid',
      workflowDefinitionId: 'wf-input-invalid',
      version: 1,
      status: 'DRAFT',
      variables: [{ key: 'summary', type: 'STRING', required: true }],
      triggers: [{ id: 'trig-1', type: 'MANUAL', enabled: true }],
      stages: [{ id: 'st-1', key: 'st-1', title: 'Main', order: 1, trigger: 'IMMEDIATE', nodeIds: ['n-start', 'n-input', 'n-end'] }],
      nodes: [
        { id: 'n-start', key: 'n-start', type: 'START', title: 'Start', stageId: 'st-1', position: { x: 0, y: 0 } },
        {
          id: 'n-input',
          key: 'n-input',
          type: 'INPUT',
          title: 'Intake Node',
          stageId: 'st-1',
          position: { x: 100, y: 0 },
          inputConfig: {
            fields: [
              { id: 'f-1', key: 'invalid key with spaces!', label: 'Field 1', type: 'TEXT' },
            ],
          },
        },
        { id: 'n-end', key: 'n-end', type: 'SUCCESS_END', title: 'End', stageId: 'st-1', position: { x: 200, y: 0 } },
      ],
      edges: [
        { id: 'e-1', sourceNodeId: 'n-start', destinationNodeId: 'n-input', dependencyType: 'FINISH_TO_START' },
        { id: 'e-2', sourceNodeId: 'n-input', destinationNodeId: 'n-end', dependencyType: 'FINISH_TO_START' },
      ],
      policySetId: 'policy-general-v1',
      policySetVersion: 1,
      formDefinitionId: 'form-universal-task',
      formVersion: 1,
      changeLog: 'Draft with invalid key',
      checksum: '',
      createdByUserId: author.id,
      createdAt: new Date().toISOString(),
    };

    const preflightInvalid = WorkflowPreflightService.validate(invalidKeyVersion);
    assert.equal(preflightInvalid.valid, false);
    assert.ok(preflightInvalid.issues.some((issue) => issue.code === 'INVALID_FIELD_KEY'));

    // 2. Duplicate field keys
    const duplicateKeyVersion: WorkflowVersion = {
      ...invalidKeyVersion,
      id: 'ver-test-input-dup',
      nodes: [
        { id: 'n-start', key: 'n-start', type: 'START', title: 'Start', stageId: 'st-1', position: { x: 0, y: 0 } },
        {
          id: 'n-input',
          key: 'n-input',
          type: 'INPUT',
          title: 'Intake Node',
          stageId: 'st-1',
          position: { x: 100, y: 0 },
          inputConfig: {
            fields: [
              { id: 'f-1', key: 'accessScope', label: 'Access Scope 1', type: 'TEXT' },
              { id: 'f-2', key: 'accessScope', label: 'Access Scope 2', type: 'TEXT' },
            ],
          },
        },
        { id: 'n-end', key: 'n-end', type: 'SUCCESS_END', title: 'End', stageId: 'st-1', position: { x: 200, y: 0 } },
      ],
    };

    const preflightDup = WorkflowPreflightService.validate(duplicateKeyVersion);
    assert.equal(preflightDup.valid, false);
    assert.ok(preflightDup.issues.some((issue) => issue.code === 'DUPLICATE_FIELD_KEY'));

    // 3. Dropdown without options produces a warning
    const noOptionsVersion: WorkflowVersion = {
      ...invalidKeyVersion,
      id: 'ver-test-input-no-options',
      nodes: [
        { id: 'n-start', key: 'n-start', type: 'START', title: 'Start', stageId: 'st-1', position: { x: 0, y: 0 } },
        {
          id: 'n-input',
          key: 'n-input',
          type: 'INPUT',
          title: 'Intake Node',
          stageId: 'st-1',
          position: { x: 100, y: 0 },
          inputConfig: {
            fields: [
              { id: 'f-1', key: 'dropdownChoice', label: 'Dropdown Choice', type: 'SELECT', options: [] },
            ],
          },
        },
        { id: 'n-end', key: 'n-end', type: 'SUCCESS_END', title: 'End', stageId: 'st-1', position: { x: 200, y: 0 } },
      ],
    };

    const preflightNoOpts = WorkflowPreflightService.validate(noOptionsVersion);
    assert.ok(preflightNoOpts.issues.some((issue) => issue.severity === 'WARNING' && issue.code === 'CHOICE_FIELD_NO_OPTIONS'));
  });

  await t.test('Publishing a workflow with an INPUT node generates synced FormDefinition and RequestTypeDefinition', () => {
    reset();

    const saved = WorkflowOrchestrationService.saveDraft({
      definition: {
        key: 'custom-vpn-intake-wf',
        name: 'Custom VPN Intake Workflow',
        description: 'VPN access with custom intake parameters.',
        domain: 'INFORMATION_SECURITY',
        defaultWorkType: 'SERVICE_REQUEST',
        scope: 'COMPANY',
        ownerId: author.id,
        tags: ['vpn', 'access', 'intake'],
        iconName: 'Network',
      },
      version: {
        status: 'DRAFT',
        variables: [{ key: 'summary', type: 'STRING', required: true }],
        triggers: [{ id: 'trig-1', type: 'MANUAL', enabled: true }],
        stages: [{ id: 'st-vpn', key: 'st-vpn', title: 'VPN Provisioning', order: 1, trigger: 'IMMEDIATE', nodeIds: ['vpn-start', 'vpn-input', 'vpn-task', 'vpn-end'] }],
        nodes: [
          { id: 'vpn-start', key: 'vpn-start', type: 'START', title: 'VPN Request Started', stageId: 'st-vpn', position: { x: 50, y: 100 } },
          {
            id: 'vpn-input',
            key: 'vpn-input',
            type: 'INPUT',
            title: 'VPN Intake Form',
            description: 'Capture VPN access level, token requirement, and expiry date.',
            stageId: 'st-vpn',
            position: { x: 250, y: 100 },
            inputConfig: {
              fields: [
                {
                  id: 'f-vpn-env',
                  key: 'targetEnvironment',
                  label: 'Target VPN Environment',
                  type: 'SELECT',
                  required: true,
                  options: [
                    { value: 'PROD', label: 'Production Network' },
                    { value: 'STAGING', label: 'Staging / UAT Network' },
                  ],
                },
                {
                  id: 'f-vpn-token',
                  key: 'hardwareTokenIssued',
                  label: 'Hardware OTP Token Issued',
                  type: 'CHECKBOX',
                  required: false,
                },
                {
                  id: 'f-vpn-expiry',
                  key: 'accessExpiryDate',
                  label: 'VPN Access Expiry Date',
                  type: 'DATE',
                  required: true,
                },
              ],
            },
          },
          {
            id: 'vpn-task',
            key: 'vpn-task',
            type: 'TASK',
            title: 'Configure VPN Profile',
            stageId: 'st-vpn',
            position: { x: 500, y: 100 },
            assignment: { strategy: 'UNASSIGNED_TEAM_QUEUE', departmentId: 'dept-secops' },
          },
          { id: 'vpn-end', key: 'vpn-end', type: 'SUCCESS_END', title: 'VPN Access Ready', stageId: 'st-vpn', position: { x: 750, y: 100 } },
        ],
        edges: [
          { id: 'e-1', sourceNodeId: 'vpn-start', destinationNodeId: 'vpn-input', dependencyType: 'FINISH_TO_START' },
          { id: 'e-2', sourceNodeId: 'vpn-input', destinationNodeId: 'vpn-task', dependencyType: 'FINISH_TO_START' },
          { id: 'e-3', sourceNodeId: 'vpn-task', destinationNodeId: 'vpn-end', dependencyType: 'FINISH_TO_START' },
        ],
        policySetId: 'policy-general-v1',
        policySetVersion: 1,
        formDefinitionId: 'form-universal-task',
        formVersion: 1,
        changeLog: 'Initial VPN intake workflow',
      },
    }, author);

    const published = WorkflowOrchestrationService.publish(saved.definition.id, saved.version.version, author);

    assert.equal(published.version.status, 'PUBLISHED');
    assert.ok(published.version.formDefinitionId, 'Must have auto-generated formDefinitionId');

    // Verify form definition in database
    const formDef = (db.data.formDefinitionsV2 || []).find((f: any) => f.id === published.version.formDefinitionId);
    assert.ok(formDef, 'FormDefinition must exist');

    const formVer = (db.data.formVersions || []).find((fv: any) => fv.formDefinitionId === formDef.id);
    assert.ok(formVer, 'FormVersion must exist');

    // Verify all fields are present in the form version
    const allFields = formVer.sections.flatMap((s: any) => s.fields);
    assert.ok(allFields.some((f: any) => f.key === 'summary'), 'Summary base field present');
    assert.ok(allFields.some((f: any) => f.key === 'targetEnvironment' && f.type === 'SELECT'), 'Target environment dropdown present');
    assert.ok(allFields.some((f: any) => f.key === 'hardwareTokenIssued' && f.type === 'CHECKBOX'), 'Hardware token checkbox present');
    assert.ok(allFields.some((f: any) => f.key === 'accessExpiryDate' && f.type === 'DATE'), 'Access expiry date present');

    // Verify RequestTypeDefinition was synced
    const requestType = (db.data.requestTypesV2 || []).find((rt: any) => rt.workflowDefinitionId === saved.definition.id);
    assert.ok(requestType, 'RequestTypeDefinition must exist');
    assert.equal(requestType.formDefinitionId, formDef.id);

    // Launch instance through WorkflowRuntimeService
    const launched = WorkflowRuntimeService.launchQuickWork({
      requestTypeId: requestType.id,
      actor: author,
      idempotencyKey: 'vpn-launch-test-001',
      values: {
        summary: 'Emergency Production VPN Access',
        description: 'Need access for database maintenance.',
        requesterId: author.id,
        departmentId: author.departmentId,
        targetEnvironment: 'PROD',
        hardwareTokenIssued: true,
        accessExpiryDate: '2026-12-31',
      },
    });

    assert.ok(launched.instance, 'Workflow instance launched');
    assert.equal(launched.instance.context.targetEnvironment, 'PROD');
    assert.equal(launched.instance.context.hardwareTokenIssued, true);
    assert.equal(launched.instance.context.accessExpiryDate, '2026-12-31');

    // Execution should have completed the INPUT node and moved to the TASK node
    const execution = WorkflowRuntimeService.getExecution(launched.instance.id, author);
    assert.ok(execution.workItems.some((w: any) => w.title === 'Configure VPN Profile'));
  });

  await t.test('Information Request is a persisted response work item that pauses the workflow', () => {
    reset();
    const saved = WorkflowOrchestrationService.saveDraft({
      definition: { key: 'info-response-workflow', name: 'Information response workflow', description: 'Collects an authenticated response.', domain: 'GENERAL', defaultWorkType: 'SERVICE_REQUEST', scope: 'PERSONAL', ownerId: author.id, tags: [], iconName: 'MessageCircle' },
      version: {
        status: 'DRAFT', variables: [], triggers: [{ id: 'info-trigger', type: 'MANUAL', enabled: true }],
        stages: [{ id: 'info-stage', key: 'info-stage', title: 'Information', order: 1, trigger: 'IMMEDIATE', nodeIds: ['info-start', 'info-request', 'info-end'] }],
        nodes: [
          { id: 'info-start', key: 'info-start', type: 'START', title: 'Start', stageId: 'info-stage', position: { x: 0, y: 0 } },
          { id: 'info-request', key: 'info-request', type: 'INFORMATION_REQUEST', title: 'Clarify business need', description: 'Provide the missing context.', stageId: 'info-stage', position: { x: 250, y: 0 }, assignment: { strategy: 'FIXED_PERSON', assigneeId: author.id } },
          { id: 'info-end', key: 'info-end', type: 'SUCCESS_END', title: 'Complete', stageId: 'info-stage', position: { x: 500, y: 0 } },
        ],
        edges: [{ id: 'info-e1', sourceNodeId: 'info-start', destinationNodeId: 'info-request' }, { id: 'info-e2', sourceNodeId: 'info-request', destinationNodeId: 'info-end' }],
        policySetId: 'policy-general-v1', policySetVersion: 1, changeLog: 'Initial information request workflow',
      },
    }, author);
    WorkflowOrchestrationService.publish(saved.definition.id, saved.version.version, author);
    const launched = WorkflowRuntimeService.launch({ workflowDefinitionId: saved.definition.id, actor: author, context: { summary: 'Need clarification' } });
    let execution = WorkflowRuntimeService.getExecution(launched.instance.id, author);
    const responseWork = execution.workItems.find((item: any) => item.title === 'Clarify business need')!;
    assert.ok(responseWork);
    assert.equal(execution.instance.status, 'WAITING');
    assert.equal(execution.nodes.find((node: any) => node.id === responseWork.nodeInstanceId)?.status, 'WAITING');

    execution = WorkflowRuntimeService.completeWorkItem(responseWork.id, author, { response: 'The access is needed for the regulator review.' });
    assert.equal(execution.instance.status, 'COMPLETED');
    assert.equal((execution.instance.context.informationResponses as any)['info-request'].response, 'The access is needed for the regulator review.');
    assert.equal((execution.instance.nodeOutputs['info-request'] as any).response, 'The access is needed for the regulator review.');
    assert.ok(execution.events.some((event: any) => event.type === 'INFORMATION_SHARED' && event.data.workItemId === responseWork.id));
  });
});
