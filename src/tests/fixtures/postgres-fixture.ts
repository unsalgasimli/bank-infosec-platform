import type { DatabaseSchema } from '../../server/db/database.js';
import { SLAService } from '../../server/services/sla.service.js';
import { WorkflowOrchestrationService } from '../../server/services/workflow-orchestration.service.js';

const now = '2026-08-20T00:00:00.000Z';

const cloneUser = (source: any, overrides: Record<string, unknown>) => ({
  ...structuredClone(source),
  ...overrides,
  ownedApplicationIds: [],
  ownedAssetIds: [],
  ownedRiskIds: [],
  teamIds: [],
  isActive: true,
  directorySource: 'ACTIVE_DIRECTORY',
});

const ticket = (source: any, overrides: Record<string, unknown>) => ({
  ...structuredClone(source),
  ...overrides,
  restrictedUserIds: [],
  restrictedTeamIds: [],
  watcherIds: [],
  tags: [],
  customFields: [],
  version: 1,
  createdAt: now,
  updatedAt: now,
  detectedAt: now,
  dueDate: '2026-09-01T00:00:00.000Z',
  remediationDeadline: '2026-09-01T00:00:00.000Z',
});

/**
 * Test-only records needed by legacy behavioral tests. They are deliberately
 * kept outside the runtime seed and are rebuilt in memory after PostgreSQL
 * hydration, so deleting operational JSON does not reintroduce a data source.
 */
export function installPostgresTestFixture(data: DatabaseSchema): void {
  data.teams ||= [];
  data.workflows ||= [];
  data.tickets ||= [];
  data.ideas ||= [];
  data.requestForms ||= [];
  data.automationRules ||= [];
  data.blueprints ||= [];
  data.proofingDocuments ||= [];
  data.notifications ||= [];
  data.ganttDependencies ||= [];
  data.slaPolicies ||= [];

  const ciso = data.users.find((user) => user.roles.includes('CISO')) || data.users[0];
  if (!ciso) throw new Error('PostgreSQL test fixture requires at least one active directory user.');

  const department = (id: string) => data.departments.find((item) => item.id === id);
  const ensureDepartment = (id: string, name: string) => {
    const existing = department(id);
    if (existing) {
      existing.isActive = true;
      if (!existing.managerId) existing.managerId = ciso.id;
    } else {
      data.departments.push({
        id, divisionId: ciso.divisionId, name, code: id.toUpperCase().replaceAll('-', '_'),
        managerId: ciso.id,
        isActive: true, directorySource: 'ACTIVE_DIRECTORY', settings: {},
      });
    }
    return id;
  };
  ensureDepartment('dept-secops', 'Security Operations');
  ensureDepartment('dept-it', 'Information Technology');
  ensureDepartment('dept-core', 'Core Banking Operations');
  ensureDepartment('HR_LEGAL', 'HR and Legal');
  ensureDepartment('IT_OPERATIONS', 'IT Operations');
  ensureDepartment('CISO_EXECUTIVE', 'CISO Executive Office');

  const ensureTeam = (id: string, departmentId: string, name: string, securityDomain?: string) => {
    if (!data.teams.some((item) => item.id === id)) {
      data.teams.push({ id, departmentId, name, code: id.toUpperCase().replaceAll('-', '_'), leadId: ciso.id, securityDomain: securityDomain as any });
    }
  };
  ensureTeam('team-it-infra', 'dept-it', 'IT Infrastructure');
  ensureTeam('team-soc', 'dept-secops', 'Security Operations Center', 'SOC');
  ensureTeam('team-appsec', 'dept-secops', 'Application Security', 'APPSEC');
  ensureTeam('team-hr-ops', 'HR_LEGAL', 'HR Operations', 'AUDIT_COMPLIANCE');
  ensureTeam('team-grc', 'dept-secops', 'GRC', 'GRC');
  ensureTeam('team-dlp', 'dept-secops', 'DLP', 'DLP');
  ensureTeam('team-vuln', 'dept-secops', 'Vulnerability Management', 'VULNERABILITY_MGMT');

  const ensureUser = (id: string, overrides: Record<string, unknown>) => {
    if (!data.users.some((user) => user.id === id)) data.users.push(cloneUser(ciso, { id, ...overrides }));
    return data.users.find((user) => user.id === id)!;
  };
  const cisoUser = ensureUser('usr-ciso', {
    username: 'ciso', email: 'ciso@example.test', fullName: 'Chief Information Security Officer', title: 'CISO',
    roles: ['CISO', 'APPROVER'], departmentId: 'dept-secops', teamIds: ['team-appsec'],
  });
  ensureUser('usr-appsec-spec', {
    username: 'appsec.spec', email: 'appsec.spec@example.test', fullName: 'Application Security Specialist', title: 'AppSec Specialist',
    roles: ['APPSEC_ANALYST', 'REQUESTER'], departmentId: 'dept-secops', teamIds: ['team-appsec'],
  });
  ensureUser('usr-it-infra', {
    username: 'it.infra', email: 'it.infra@example.test', fullName: 'Infrastructure Engineer', title: 'Infrastructure Engineer',
    roles: ['IT_ADMIN', 'REQUESTER'], departmentId: 'dept-it', teamIds: ['team-it-infra'],
  });
  ensureUser('usr-hr-ops', {
    username: 'hr.ops', email: 'hr.ops@example.test', fullName: 'HR Operations Analyst', title: 'HR Operations Analyst',
    roles: ['HR_ADMIN', 'REQUESTER'], departmentId: 'HR_LEGAL', teamIds: ['team-hr-ops'],
  });
  const cisoIndex = data.users.indexOf(ciso);
  if (cisoIndex > 0) data.users.unshift(...data.users.splice(cisoIndex, 1));
  cisoUser.managerId ||= cisoUser.id;
  for (const user of data.users) {
    if (!user.teamIds?.length) {
      if (user.departmentId === 'dept-it') user.teamIds = ['team-it-infra'];
      else if (user.departmentId === 'dept-secops') user.teamIds = ['team-appsec'];
    }
  }

  const defaultWorkflow = data.workflows.find((item) => item.id === 'wf-secops-default') || (() => {
    const created = {
      id: 'wf-secops-default', name: 'Security Operations Workflow', description: 'Test-only standard ticket state machine.', projectCode: 'SEC', version: 1,
      isActive: true, initialStateId: 'OPEN',
      states: [
        { id: 'OPEN', name: 'Open', category: 'TO_DO', color: '#657694', isInitial: true },
        { id: 'UNDER_REVIEW', name: 'Under Review', category: 'IN_PROGRESS', color: '#657694' },
        { id: 'RESOLVED', name: 'Resolved', category: 'DONE', color: '#38a169' },
        { id: 'CLOSED', name: 'Closed', category: 'DONE', color: '#276749' },
      ],
      transitions: [
        { id: 'tr-resolve', name: 'Resolve', fromStateId: 'UNDER_REVIEW', toStateId: 'RESOLVED', allowedRoles: ['CISO', 'INFOSEC_MANAGER', 'ASSIGNEE'], requiredFields: ['resolutionCode', 'resolutionSummary'] },
        { id: 'tr-close', name: 'Close', fromStateId: 'RESOLVED', toStateId: 'CLOSED', allowedRoles: ['CISO', 'INFOSEC_MANAGER', 'ASSIGNEE'] },
      ],
    } as any;
    data.workflows.push(created);
    return created;
  })();
  // Some imported historical workflows are metadata-only projections. Keep a
  // complete state machine first for legacy controller paths that still use
  // the default workflow position.
  defaultWorkflow.states ||= [];
  defaultWorkflow.transitions ||= [];
  if (!defaultWorkflow.states.length || !defaultWorkflow.transitions.length) {
    Object.assign(defaultWorkflow, {
      initialStateId: 'OPEN',
      states: [
        { id: 'OPEN', name: 'Open', category: 'TO_DO', color: '#657694', isInitial: true },
        { id: 'UNDER_REVIEW', name: 'Under Review', category: 'IN_PROGRESS', color: '#657694' },
        { id: 'RESOLVED', name: 'Resolved', category: 'DONE', color: '#38a169' },
        { id: 'CLOSED', name: 'Closed', category: 'DONE', color: '#276749' },
      ],
      transitions: [
        { id: 'tr-resolve', name: 'Resolve', fromStateId: 'UNDER_REVIEW', toStateId: 'RESOLVED', allowedRoles: ['CISO', 'INFOSEC_MANAGER', 'ASSIGNEE'], requiredFields: ['resolutionCode', 'resolutionSummary'] },
        { id: 'tr-close', name: 'Close', fromStateId: 'RESOLVED', toStateId: 'CLOSED', allowedRoles: ['CISO', 'INFOSEC_MANAGER', 'ASSIGNEE'] },
      ],
    });
  }
  const defaultIndex = data.workflows.indexOf(defaultWorkflow);
  if (defaultIndex > 0) data.workflows.unshift(...data.workflows.splice(defaultIndex, 1));
  const base = data.tickets[0] || ticket({}, {});
  const ensureTicket = (id: string, overrides: Record<string, unknown>) => {
    if (!data.tickets.some((item) => item.id === id)) data.tickets.push(ticket(base, { id, workflowId: 'wf-secops-default', statusId: 'OPEN', statusName: 'Open', statusCategory: 'TO_DO', reporterId: ciso.id, requesterId: ciso.id, assigneeId: undefined, ...overrides }));
  };
  ensureTicket('tick-soc-101', { key: 'SOC-2026-0101', title: 'SWIFT SOC monitoring hardening', projectCode: 'SOC', tags: ['SWIFT'] });
  ensureTicket('tick-appsec-102', { key: 'APPSEC-2026-0102', title: 'SWIFT application security review', projectCode: 'DLP', tags: ['SWIFT'] });
  ensureTicket('tick-swift-103', { key: 'SEC-2026-0103', title: 'SWIFT gateway control review', projectCode: 'SEC', tags: ['SWIFT'] });
  // Keep the JQL fixture representative: the search contract includes a
  // high-priority record regardless of what the hydrated development data has.
  Object.assign(data.tickets.find((item) => item.id === 'tick-soc-101')!, {
    businessPriority: 'P2_HIGH', technicalSeverity: 'HIGH', businessImpact: 'SIGNIFICANT',
  });

  SLAService.ensurePoliciesInstalled();
  installOrchestrationFixture(data, cisoUser);

  if (!data.ideas.length) data.ideas.push({ id: 'idea-zero-trust', title: 'Zero Trust baseline', description: 'Initial security architecture idea.', category: 'ZERO_TRUST', color: 'blue', x: 120, y: 120, priority: 'P2_HIGH', tags: ['ZERO_TRUST'], status: 'IDEA', authorId: ciso.id, createdAt: now, updatedAt: now } as any);
  if (!data.requestForms.length) {
    data.requestForms.push(
      { id: 'form-exception', name: 'Security Exception', title: 'Security Exception', description: 'Request a controlled security exception.', category: 'SOC Security Exception', destinationFolder: 'Security Exceptions', defaultSeverity: 'HIGH', defaultPriority: 'P2_HIGH', defaultTicketType: 'SECURITY_EXCEPTION', fields: [{ id: 'title', key: 'title', label: 'Title', type: 'TEXT', required: true }, { id: 'targetSystem', key: 'targetSystem', label: 'Target system', type: 'TEXT', required: true }, { id: 'urgency', key: 'urgency', label: 'Urgency', type: 'SELECT', required: true }, { id: 'durationDays', key: 'durationDays', label: 'Duration', type: 'NUMBER', required: true }, { id: 'justification', key: 'justification', label: 'Justification', type: 'TEXTAREA', required: true }], isActive: true } as any,
      { id: 'form-access', name: 'Application Access', title: 'Application Access', description: 'Request application access.', fields: [], isActive: true } as any,
      { id: 'form-onboarding', name: 'Employee Onboarding', title: 'Employee Onboarding', description: 'Onboard an employee.', fields: [], isActive: true } as any,
      { id: 'form-standard', name: 'Standard Task', title: 'Standard Task', description: 'Create a standard task.', fields: [], isActive: true } as any,
    );
  }
  for (const rule of data.automationRules as any[]) {
    rule.conditions ||= [];
    rule.actions ||= [];
    rule.isActive = rule.isActive !== false;
  }
  while (data.automationRules.length < 4) data.automationRules.push({ id: `automation-test-${data.automationRules.length + 1}`, name: `Governed automation ${data.automationRules.length + 1}`, description: 'Test-only automation rule.', trigger: 'TICKET_CREATED', isActive: true, conditions: [], actions: [] } as any);

  const makeTasks = (first: string, second: string, third: string) => [
    { id: `${first}-1`, title: `${first} review`, description: 'Review and validate.', targetDepartment: 'dept-secops', assigneeId: cisoUser.id, technicalSeverity: 'HIGH', businessPriority: 'P2_HIGH', category: 'SECURITY_REVIEW', durationDays: 1, offsetDays: 0, tags: [] },
    { id: `${first}-2`, title: `${second} implementation`, description: 'Implement the approved work.', targetDepartment: 'dept-it', assigneeId: data.users.find((u) => u.id === 'usr-it-infra')?.id || ciso.id, technicalSeverity: 'HIGH', businessPriority: 'P2_HIGH', category: 'GENERAL_REQUEST', durationDays: 2, offsetDays: 0, dependsOnTaskId: `${first}-1`, tags: [] },
    { id: `${first}-3`, title: `${third} sign-off`, description: 'Complete final sign-off.', targetDepartment: 'dept-secops', assigneeId: cisoUser.id, technicalSeverity: 'CRITICAL', businessPriority: 'P1_URGENT', category: 'SECURITY_REVIEW', durationDays: 1, offsetDays: 0, dependsOnTaskId: `${first}-2`, tags: [] },
  ];
  const ensureBlueprint = (id: string, title: string, scope: string, tasks: any[]) => {
    if (!data.blueprints.some((item) => item.id === id)) data.blueprints.push({ id, title, domain: 'INFORMATION_SECURITY', scope, status: 'PUBLISHED', ownerId: ciso.id, taskCount: tasks.length, estimatedDays: tasks.length, description: `${title} governed workflow.`, iconName: 'Shield', projectCode: 'SEC', isActive: true, version: 1, defaultTasks: tasks, createdAt: now, updatedAt: now } as any);
  };
  ensureBlueprint('bp-cross-onboarding', 'Employee Onboarding', 'COMPANY', makeTasks('onboarding', 'Provisioning', 'Security'));
  ensureBlueprint('bp-cross-swift', 'SWIFT Production Release', 'COMPANY', makeTasks('swift', 'Deployment', 'Release'));
  ensureBlueprint('bp-dept-secops', 'Security Operations Review', 'DEPARTMENT', makeTasks('secops', 'Analysis', 'Approval'));
  ensureBlueprint('bp-dept-it', 'Infrastructure Change Review', 'DEPARTMENT', makeTasks('infra', 'Change', 'Approval'));
  ensureBlueprint('bp-personal-task', 'Personal Security Task', 'PERSONAL', makeTasks('personal', 'Work', 'Close'));
  ensureBlueprint('bp-personal-review', 'Personal Control Review', 'PERSONAL', makeTasks('control', 'Evidence', 'Close'));

  if (!data.proofingDocuments.length) data.proofingDocuments.push({ id: 'proofing-swift-001', name: 'SWIFT security architecture', title: 'SWIFT security architecture', fileName: 'swift-security.pdf', status: 'IN_REVIEW', annotations: [], createdBy: ciso.id, createdAt: now, updatedAt: now, isSignedOff: false } as any);
  if (!data.notifications.some((item) => item.userId === ciso.id)) data.notifications.push({ id: 'notification-test-001', userId: ciso.id, type: 'WORKFLOW', title: 'Workflow participant update', message: 'A governed workflow requires your attention.', isRead: false, createdAt: now } as any);
}

function installOrchestrationFixture(data: DatabaseSchema, owner: any): void {
  data.workflowDefinitions ||= [];
  data.workflowVersions ||= [];
  data.workflowCatalogTemplates ||= [];
  data.formDefinitionsV2 ||= [];
  data.formVersions ||= [];
  data.requestTypesV2 ||= [];
  data.formFieldGroupsV2 ||= [];

  // This invokes the product-owned bootstrap for the two real starter
  // templates. Everything below is test-only behavior data, not runtime seed.
  WorkflowOrchestrationService.catalogPayload(owner);

  const condition = (path: string, value: unknown, operator: any = 'EQUALS') => ({ combinator: 'ALL', clauses: [{ left: { source: 'CONTEXT', path }, operator, right: { source: 'LITERAL', value } }] });
  const node = (id: string, key: string, type: any, extra: Record<string, unknown> = {}) => ({ id, key, type, title: key, position: { x: 100, y: 100 }, ...extra });
  const edge = (id: string, sourceNodeId: string, destinationNodeId: string, extra: Record<string, unknown> = {}) => ({ id, sourceNodeId, destinationNodeId, dependencyType: 'FINISH_TO_START', ...extra });
  const stage = (id: string, nodeIds: string[], title = id) => ({ id, key: id, title, order: 1, trigger: 'IMMEDIATE', nodeIds });
  const checksum = (payload: unknown) => `sha256-${Buffer.from(JSON.stringify(payload)).toString('base64').slice(0, 48)}`;

  const addForm = (id: string, title: string, domain: any, sections: any[]) => {
    if (!data.formDefinitionsV2.some((item) => item.id === id)) data.formDefinitionsV2.push({ id, key: id, title, description: title, domain, lifecycle: 'PUBLISHED', latestVersion: 1, ownerId: owner.id, maintainerIds: [], createdAt: now, updatedAt: now } as any);
    if (!data.formVersions.some((item) => item.formDefinitionId === id && item.version === 1)) data.formVersions.push({ id: `${id}-v1`, formDefinitionId: id, version: 1, status: 'PUBLISHED', sections, changeLog: 'Test fixture form.', createdByUserId: owner.id, createdAt: now } as any);
  };
  const field = (key: string, label: string, extra: Record<string, unknown> = {}) => ({ id: `field-${key}`, key, label, type: 'TEXT', ...extra });
  addForm('form-onboard-employee', 'Employee Onboarding', 'HR', [
    { id: 'onboard-employee', title: 'Employee', fields: [field('employeeId', 'Employee'), field('legalEntity', 'Legal entity'), field('departmentId', 'Department'), field('managerId', 'Manager'), field('jobTitle', 'Job title')] },
    { id: 'onboard-role', title: 'Employment', fields: [field('employmentType', 'Employment type'), field('location', 'Location'), field('startDate', 'Start date'), field('costCenter', 'Cost center')] },
    { id: 'onboard-access', title: 'Access and equipment', fields: [field('accessProfile', 'Access profile'), field('remote', 'Remote', { type: 'CHECKBOX' }), field('privilegedRole', 'Privileged role', { type: 'CHECKBOX' }), field('hardwareProfile', 'Hardware profile', { type: 'SELECT', dependsOnFieldKey: 'location', options: [{ value: 'REMOTE_KIT', label: 'Remote kit', parentValue: 'REMOTE_AZ' }, { value: 'ENGINEERING', label: 'Engineering', parentValue: 'Baku HQ' }] })] },
  ]);
  addForm('form-production-deployment', 'Production Deployment', 'DEVOPS', [{ id: 'deployment', title: 'Deployment', fields: [field('summary', 'Summary', { required: true }), field('serviceId', 'Service'), field('version', 'Version'), field('environment', 'Environment'), field('changeType', 'Change type'), field('implementationPlan', 'Implementation plan'), field('testingEvidence', 'Testing evidence', { type: 'MULTI_SELECT' }), field('rollbackPlan', 'Rollback plan'), field('requestedWindow', 'Requested window'), field('blastRadius', 'Blast radius'), field('risk', 'Risk', { type: 'TEXT', calculatedValue: { function: 'changeRisk', arguments: [] } })] }]);
  addForm('form-procurement', 'Procurement Request', 'PROCUREMENT', [{ id: 'procurement', title: 'Procurement', fields: [field('summary', 'Summary', { required: true }), field('items', 'Items', { type: 'TABLE', required: true }), field('amount', 'Amount', { type: 'NUMBER', required: true }), field('costCenter', 'Cost center', { required: true }), field('businessReason', 'Business reason', { required: true }), field('confidentialVendorReference', 'Confidential vendor reference', { type: 'SECURE_TEXT', sensitive: true, fieldAcl: { writeRoles: ['CISO', 'PLATFORM_ADMIN'] } })] }]);
  addForm('form-application-access', 'Application Access', 'INFORMATION_SECURITY', [{ id: 'access', title: 'Access', fields: [field('summary', 'Summary', { required: true }), field('employeeId', 'Employee'), field('applicationId', 'Application'), field('role', 'Role'), field('businessReason', 'Business reason'), field('privileged', 'Privileged', { type: 'CHECKBOX' }), field('requesterId', 'Requester')] }]);
  addForm('form-offboard-employee', 'Employee Offboarding', 'HR', [{ id: 'offboard', title: 'Offboarding', fields: [field('summary', 'Summary', { required: true }), field('employeeId', 'Employee'), field('managerId', 'Manager'), field('lastWorkingDate', 'Last working date'), field('terminationType', 'Termination type'), field('emergency', 'Emergency', { type: 'CHECKBOX' }), field('legalHold', 'Legal hold', { type: 'CHECKBOX' }), field('activeAccessCount', 'Active access count', { type: 'NUMBER' })] }]);

  const forms = new Map<string, string>([
    ['request-onboard-employee', 'form-onboard-employee'], ['request-production-deployment', 'form-production-deployment'],
    ['request-procurement', 'form-procurement'], ['request-application-access', 'form-application-access'], ['request-offboard-employee', 'form-offboard-employee'],
  ]);
  const addRequest = (id: string, name: string, formId: string, workflowId: string, domain: any, workType: any = 'SERVICE_REQUEST') => {
    if (!data.requestTypesV2.some((item) => item.id === id)) data.requestTypesV2.push({ id, key: id, name, description: name, domain, workType, category: name, iconName: 'Workflow', formDefinitionId: formId, formVersion: 1, workflowDefinitionId: workflowId, workflowVersion: 1, policySetId: 'policy-general-v1', supportedChannels: ['EMPLOYEE_PORTAL', 'MANAGER', 'ADMIN', 'API'], visibility: 'INTERNAL', isActive: true, tags: [] } as any);
  };

  const definitions: Record<string, { name: string; nodes: any[]; edges: any[]; domain: any; scope?: any; triggers?: any[] }> = {};
  const basic = (id: string, name: string, domain: any, nodes: any[], edges: any[], triggers?: any[]) => {
    definitions[id] = { name, domain, nodes, edges, triggers };
  };
  const start = node('start', 'start', 'START');
  const finish = node('finish', 'finish', 'SUCCESS_END');
  basic('wf-remote-equipment', 'Remote Equipment', 'IT_OPERATIONS', [start, node('remote-task', 'remote-task', 'TASK', { assignment: { strategy: 'FIXED_PERSON', assigneeId: owner.id } }), finish], [edge('e1', 'start', 'remote-task'), edge('e2', 'remote-task', 'finish')]);
  basic('wf-standard-compat', 'Compatibility Workflow', 'GENERAL', [start, finish], [edge('e1', 'start', 'finish')]);

  basic('wf-software-feature-delivery', 'Software Feature Delivery', 'SOFTWARE_DEVELOPMENT', [
    start, node('feature-qa', 'feature-qa', 'TASK', { assignment: { strategy: 'FIXED_PERSON', assigneeId: owner.id } }), node('feature-security', 'feature-security', 'TASK', { assignment: { strategy: 'FIXED_PERSON', assigneeId: owner.id } }), node('feature-join', 'feature-join', 'PARALLEL_JOIN', { join: { strategy: 'ALL' } }), node('feature-approval', 'feature-approval', 'APPROVAL', { approval: { approverSource: 'ROLE', role: 'INFOSEC_MANAGER', approvalMode: 'ANY_ONE', timeoutMinutes: 60, reminderMinutes: 15, escalationSource: 'CAB_BOARD', preventSelfApproval: true } }), node('feature-deploy', 'feature-deploy', 'SYSTEM_ACTION', { action: { actionKey: 'DEPLOY' } }), node('feature-rejected', 'feature-rejected', 'REJECTED_END'), finish,
  ], [edge('e1', 'start', 'feature-qa'), edge('e2', 'start', 'feature-security'), edge('e3', 'feature-qa', 'feature-join'), edge('e4', 'feature-security', 'feature-join'), edge('e5', 'feature-join', 'feature-approval'), edge('e6', 'feature-approval', 'feature-deploy', { outcome: 'APPROVED' }), edge('e6-rejected', 'feature-approval', 'feature-rejected', { outcome: 'REJECTED' }), edge('e7', 'feature-deploy', 'finish')]);

  basic('wf-production-deployment', 'Production Deployment', 'DEVOPS', [
    start, node('change-gate', 'change-gate', 'CONDITION', { condition: { combinator: 'ALL', clauses: [{ left: { source: 'CONTEXT', path: '__testFailures' }, operator: 'EXISTS' }] } }), node('change-approval', 'change-approval', 'APPROVAL', { approval: { approverSource: 'ROLE', role: 'INFOSEC_MANAGER', approvalMode: 'ANY_ONE', timeoutMinutes: 60 } }), node('change-risk', 'change-risk', 'SYSTEM_ACTION', { action: { actionKey: 'CALCULATE_CHANGE_RISK' } }), node('change-deploy', 'change-deploy', 'SYSTEM_ACTION', { action: { actionKey: 'DEPLOY' }, retryPolicy: { maxAttempts: 2, initialBackoffSeconds: 1, multiplier: 1, maxBackoffSeconds: 1 }, compensation: { onFailure: true, actionType: 'SYSTEM_ACTION', actionKey: 'ROLLBACK' } }), node('change-rollback', 'change-rollback', 'SYSTEM_ACTION', { action: { actionKey: 'ROLLBACK' } }), node('change-incident', 'change-incident', 'SYSTEM_ACTION', { action: { actionKey: 'CREATE_INCIDENT' } }), node('change-finalize', 'change-finalize', 'TASK', { assignment: { strategy: 'FIXED_PERSON', assigneeId: owner.id } }), node('change-failed', 'change-failed', 'FAILED_END'), finish,
  ], [edge('e1', 'start', 'change-gate'), edge('e2', 'change-gate', 'change-approval', { outcome: 'FALSE' }), edge('e3', 'change-gate', 'change-risk', { outcome: 'TRUE' }), edge('e4', 'change-approval', 'change-risk', { outcome: 'APPROVED' }), edge('e4-rejected', 'change-approval', 'change-failed', { outcome: 'REJECTED' }), edge('e5', 'change-risk', 'change-deploy'), edge('e6', 'change-deploy', 'change-rollback', { outcome: 'FAILED' }), edge('e7', 'change-rollback', 'change-incident'), edge('e8', 'change-incident', 'change-finalize'), edge('e9', 'change-finalize', 'change-failed'), edge('e10', 'change-deploy', 'finish', { outcome: 'SUCCEEDED' })]);

  basic('wf-application-access', 'Application Access', 'INFORMATION_SECURITY', [start, node('access-work', 'access-work', 'TASK', { assignment: { strategy: 'FIXED_PERSON', assigneeId: owner.id } }), node('access-approval', 'access-approval', 'APPROVAL', { approval: { approverSource: 'REQUESTER_MANAGER', approvalMode: 'ANY_ONE', timeoutMinutes: 60, preventSelfApproval: true, commentsMandatoryOnReject: true } }), node('wf-access-request-rejected', 'wf-access-request-rejected', 'REJECTED_END'), finish], [edge('e1', 'start', 'access-work'), edge('e2', 'access-work', 'access-approval'), edge('e3', 'access-approval', 'wf-access-request-rejected', { outcome: 'REJECTED' }), edge('e4', 'access-approval', 'finish', { outcome: 'APPROVED' })]);

  basic('wf-employee-onboarding', 'Employee Onboarding', 'HR', [
    start, node('onboard-identity', 'onboard-identity', 'TASK', { assignment: { strategy: 'FIXED_PERSON', assigneeId: owner.id } }), node('onboard-laptop', 'onboard-laptop', 'TASK', { assignment: { strategy: 'FIXED_PERSON', assigneeId: owner.id } }), node('onboard-employment', 'onboard-employment', 'CONDITION', { condition: condition('employmentType', 'CONTRACTOR') }), node('onboard-contractor-approval', 'onboard-contractor-approval', 'APPROVAL', { approval: { approverSource: 'ROLE', role: 'INFOSEC_MANAGER', approvalMode: 'ANY_ONE', timeoutMinutes: 60 } }), node('onboard-contractor-rejected', 'onboard-contractor-rejected', 'REJECTED_END'), node('onboard-remote', 'onboard-remote', 'INFORMATION_REQUEST', { assignment: { strategy: 'FIXED_PERSON', assigneeId: owner.id } }), node('onboard-location', 'onboard-location', 'CONDITION', { condition: condition('remote', true) }), node('onboard-remote-equipment', 'onboard-remote-equipment', 'SUBWORKFLOW', { subworkflow: { workflowDefinitionId: 'wf-remote-equipment', version: 1 } }), node('onboard-facilities', 'onboard-facilities', 'TASK', { assignment: { strategy: 'FIXED_PERSON', assigneeId: owner.id } }), node('onboard-dayone-wait', 'onboard-dayone-wait', 'WAIT_TIMER', { stageId: 'onboard-dayone', timer: { mode: 'ABSOLUTE', datePath: 'startDate' } }), node('onboard-activate', 'onboard-activate', 'TASK', { stageId: 'onboard-dayone', assignment: { strategy: 'FIXED_PERSON', assigneeId: owner.id } }), finish,
  ], [edge('e1', 'start', 'onboard-identity'), edge('e2', 'onboard-identity', 'onboard-laptop'), edge('e3', 'onboard-laptop', 'onboard-employment'), edge('e4', 'onboard-employment', 'onboard-contractor-approval', { outcome: 'CONTRACTOR' }), edge('e5', 'onboard-employment', 'onboard-location', { outcome: 'EMPLOYEE' }), edge('e6', 'onboard-location', 'onboard-remote-equipment', { outcome: 'true' }), edge('e7', 'onboard-location', 'onboard-facilities', { outcome: 'false' }), edge('e8', 'onboard-facilities', 'onboard-dayone-wait'), edge('e9', 'onboard-remote-equipment', 'onboard-dayone-wait'), edge('e10', 'onboard-contractor-approval', 'onboard-remote', { outcome: 'APPROVED' }), edge('e10-rejected', 'onboard-contractor-approval', 'onboard-contractor-rejected', { outcome: 'REJECTED' }), edge('e11', 'onboard-remote', 'onboard-dayone-wait'), edge('e12', 'onboard-dayone-wait', 'onboard-activate'), edge('e13', 'onboard-activate', 'finish')], [{ id: 'employee-hired', type: 'HR_EVENT', eventName: 'employee.hired', recordType: 'employee', enabled: true }]);

  basic('wf-employee-offboarding', 'Employee Offboarding', 'HR', [start, node('offboard-emergency', 'offboard-emergency', 'CONDITION', { condition: condition('emergency', true) }), node('offboard-precheck', 'offboard-precheck', 'TASK', { assignment: { strategy: 'FIXED_PERSON', assigneeId: owner.id } }), node('offboard-wait', 'offboard-wait', 'WAIT_TIMER', { timer: { mode: 'ABSOLUTE', datePath: 'lastWorkingDate' } }), node('offboard-identity', 'offboard-identity', 'SYSTEM_ACTION', { action: { actionKey: 'CALCULATE_ACCESS_DIFF' } }), node('offboard-legal', 'offboard-legal', 'CONDITION', { condition: condition('legalHold', true) }), node('offboard-cleanup', 'offboard-cleanup', 'SYSTEM_ACTION', { action: { actionKey: 'DELETE_ACCESS' } }), node('offboard-verify', 'offboard-verify', 'SYSTEM_ACTION', { action: { actionKey: 'VERIFY_ALL_ACCESS_REVOKED' } }), node('offboard-access-check', 'offboard-access-check', 'CONDITION', { condition: condition('allAccessRevoked', true) }), node('offboard-finalize', 'offboard-finalize', 'TASK', { assignment: { strategy: 'FIXED_PERSON', assigneeId: owner.id } }), node('offboard-failure-review', 'offboard-failure-review', 'TASK', { assignment: { strategy: 'FIXED_PERSON', assigneeId: owner.id } }), node('offboard-failed', 'offboard-failed', 'FAILED_END'), finish], [edge('e1', 'start', 'offboard-emergency'), edge('e2', 'offboard-emergency', 'offboard-identity', { outcome: 'true' }), edge('e3', 'offboard-emergency', 'offboard-precheck', { outcome: 'false' }), edge('e4', 'offboard-precheck', 'offboard-wait'), edge('e5', 'offboard-wait', 'offboard-identity'), edge('e6', 'offboard-identity', 'offboard-legal'), edge('e7', 'offboard-legal', 'offboard-cleanup', { outcome: 'false' }), edge('e8', 'offboard-legal', 'offboard-verify', { outcome: 'true' }), edge('e9', 'offboard-cleanup', 'offboard-verify'), edge('e10', 'offboard-verify', 'offboard-access-check'), edge('e11', 'offboard-access-check', 'offboard-finalize', { outcome: 'true' }), edge('e12', 'offboard-access-check', 'offboard-failure-review', { outcome: 'false' }), edge('e13', 'offboard-failure-review', 'offboard-failed'), edge('e14', 'offboard-finalize', 'finish')]);

  for (const [id, spec] of Object.entries(definitions)) {
    if (!data.workflowDefinitions.some((item) => item.id === id)) data.workflowDefinitions.push({ id, key: id, name: spec.name, description: spec.name, domain: spec.domain, defaultWorkType: 'SERVICE_REQUEST', lifecycle: 'PUBLISHED', scope: spec.scope || 'COMPANY', ownerId: owner.id, maintainerIds: [], latestVersion: 1, tags: ['test-fixture'], iconName: 'Workflow', createdAt: now, updatedAt: now } as any);
    if (!data.workflowVersions.some((item) => item.workflowDefinitionId === id && item.version === 1)) {
      const payload: any = { workflowDefinitionId: id, version: 1, status: 'PUBLISHED', variables: [], triggers: spec.triggers || [{ id: `${id}-manual`, type: 'MANUAL', enabled: true }], stages: [stage(`${id}-stage`, spec.nodes.map((item) => item.id))], nodes: spec.nodes, edges: spec.edges, policySetId: 'policy-general-v1', policySetVersion: 1, changeLog: 'Test fixture workflow.', createdByUserId: owner.id, createdAt: now, publishedAt: now };
      data.workflowVersions.push({ ...payload, id: `${id}-v1`, checksum: checksum(payload) } as any);
    }
  }
  const onboardingVersion = data.workflowVersions.find((item) => item.workflowDefinitionId === 'wf-employee-onboarding' && item.version === 1);
  if (onboardingVersion) {
    onboardingVersion.stages = [
      { id: 'onboard-preboarding', key: 'preboarding', title: 'Preboarding', order: 1, trigger: 'IMMEDIATE', nodeIds: ['start', 'onboard-identity', 'onboard-laptop', 'onboard-employment', 'onboard-contractor-approval', 'onboard-contractor-rejected', 'onboard-remote', 'onboard-location', 'onboard-remote-equipment', 'onboard-facilities'] },
      { id: 'onboard-dayone', key: 'day-one', title: 'Day One', order: 2, trigger: 'DATE_RELATIVE', nodeIds: ['onboard-dayone-wait', 'onboard-activate'] },
    ] as any;
  }
  addRequest('request-onboard-employee', 'Employee Onboarding', 'form-onboard-employee', 'wf-employee-onboarding', 'HR', 'HR_CASE');
  addRequest('request-production-deployment', 'Production Deployment', 'form-production-deployment', 'wf-production-deployment', 'DEVOPS', 'CHANGE');
  addRequest('request-procurement', 'Procurement Request', 'form-procurement', 'wf-standard-compat', 'PROCUREMENT', 'PROCUREMENT_REQUEST');
  addRequest('request-application-access', 'Application Access', 'form-application-access', 'wf-application-access', 'INFORMATION_SECURITY', 'SERVICE_REQUEST');
  addRequest('request-offboard-employee', 'Employee Offboarding', 'form-offboard-employee', 'wf-employee-offboarding', 'HR', 'HR_CASE');

  const existingTemplates = data.workflowCatalogTemplates.length;
  const requiredTemplateIds = new Set(['template-standard-task', 'template-usb-access', 'template-software-feature', 'template-production-deployment', 'template-application-access', 'template-employee-onboarding', 'template-employee-offboarding']);
  const addTemplate = (id: string, workflowDefinitionId: string, title: string, scope: any = 'COMPANY', departmentId?: string) => {
    if (!data.workflowCatalogTemplates.some((item) => item.id === id)) data.workflowCatalogTemplates.push({ id, workflowDefinitionId, publishedWorkflowVersion: 1, title, purpose: title, domain: 'GENERAL', category: 'Test', scope, departmentId, ownerId: owner.id, maintainerIds: [], tags: ['test-fixture'], iconName: 'Workflow', estimatedDurationMinutes: 60, stageCount: 1, departmentCount: 1, approvalCount: 0, automationCount: 0, runCount: 0, successRate: 0, favoriteUserIds: [], lifecycle: 'PUBLISHED', changeLog: 'Test fixture template.' } as any);
  };
  addTemplate('template-software-feature', 'wf-software-feature-delivery', 'Software Feature Delivery');
  addTemplate('template-production-deployment', 'wf-production-deployment', 'Production Deployment');
  addTemplate('template-application-access', 'wf-application-access', 'Application Access');
  addTemplate('template-employee-onboarding', 'wf-employee-onboarding', 'Employee Onboarding');
  addTemplate('template-employee-offboarding', 'wf-employee-offboarding', 'Employee Offboarding');
  addTemplate('template-remote-equipment', 'wf-remote-equipment', 'Remote Equipment');
  addTemplate('template-standard-compat', 'wf-standard-compat', 'Compatibility Workflow');
  let filler = 1;
  while (data.workflowCatalogTemplates.length < 18) {
    const id = `template-fixture-${filler}`;
    const workflowId = `wf-fixture-${filler}`;
    basic(workflowId, `Fixture Workflow ${filler}`, 'GENERAL', [start, finish], [edge(`${workflowId}-e1`, 'start', 'finish')]);
    if (!data.workflowDefinitions.some((item) => item.id === workflowId)) data.workflowDefinitions.push({ id: workflowId, key: workflowId, name: `Fixture Workflow ${filler}`, description: 'Test fixture.', domain: 'GENERAL', defaultWorkType: 'TASK', lifecycle: 'PUBLISHED', scope: filler % 3 === 0 ? 'PERSONAL' : filler % 2 === 0 ? 'DEPARTMENT' : 'COMPANY', departmentId: filler % 2 === 0 ? owner.departmentId : undefined, ownerId: owner.id, maintainerIds: [], latestVersion: 1, tags: ['test-fixture'], iconName: 'Workflow', createdAt: now, updatedAt: now } as any);
    if (!data.workflowVersions.some((item) => item.workflowDefinitionId === workflowId)) data.workflowVersions.push({ id: `${workflowId}-v1`, workflowDefinitionId: workflowId, version: 1, status: 'PUBLISHED', variables: [], triggers: [{ id: `${workflowId}-manual`, type: 'MANUAL', enabled: true }], stages: [stage(`${workflowId}-stage`, ['start', 'finish'])], nodes: [start, finish], edges: [edge(`${workflowId}-e1`, 'start', 'finish')], policySetId: 'policy-general-v1', policySetVersion: 1, changeLog: 'Test fixture.', checksum: 'sha256-fixture', createdByUserId: owner.id, createdAt: now, publishedAt: now } as any);
    addTemplate(id, workflowId, `Fixture Workflow ${filler}`, filler % 3 === 0 ? 'PERSONAL' : filler % 2 === 0 ? 'DEPARTMENT' : 'COMPANY', filler % 2 === 0 ? owner.departmentId : undefined);
    filler += 1;
  }
}
