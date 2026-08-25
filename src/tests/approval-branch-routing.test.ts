import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflowPreflight } from '../shared/utils/workflow-preflight.js';
import type { WorkflowVersion } from '../shared/types/orchestration.js';

const makeVersion = (outcomes: Array<string | undefined>): WorkflowVersion => ({
  id: 'approval-branch-version',
  workflowDefinitionId: 'approval-branch-workflow',
  version: 1,
  status: 'DRAFT',
  variables: [],
  triggers: [{ id: 'manual-trigger', type: 'MANUAL', enabled: true }],
  stages: [{ id: 'stage-main', key: 'main', title: 'Main', order: 1, trigger: 'IMMEDIATE', nodeIds: ['start', 'approval', 'approved-end', 'rejected-end'] }],
  nodes: [
    { id: 'start', key: 'start', type: 'START', title: 'Start', position: { x: 0, y: 0 } },
    {
      id: 'approval',
      key: 'approval',
      type: 'APPROVAL',
      title: 'Manager approval',
      position: { x: 200, y: 0 },
      approval: { approverSource: 'DEPARTMENT_MEMBERS', approvalMode: 'ANY_ONE' },
    },
    { id: 'approved-end', key: 'approved-end', type: 'SUCCESS_END', title: 'Approved end', position: { x: 400, y: -80 } },
    { id: 'rejected-end', key: 'rejected-end', type: 'REJECTED_END', title: 'Rejected end', position: { x: 400, y: 80 } },
  ],
  edges: [
    { id: 'start-to-approval', sourceNodeId: 'start', destinationNodeId: 'approval' },
    { id: 'approval-out-1', sourceNodeId: 'approval', destinationNodeId: 'approved-end', outcome: outcomes[0] },
    { id: 'approval-out-2', sourceNodeId: 'approval', destinationNodeId: 'rejected-end', outcome: outcomes[1] },
  ],
  policySetId: 'policy-general-v1',
  policySetVersion: 1,
  changeLog: 'Approval branch routing test',
  checksum: '',
  createdByUserId: 'test-user',
  createdAt: new Date().toISOString(),
});

test('approval nodes require exactly APPROVED and REJECTED output connections', () => {
  const valid = validateWorkflowPreflight(makeVersion(['APPROVED', 'REJECTED']));
  assert.equal(valid.issues.some((issue) => issue.code === 'APPROVAL_APPROVED_BRANCH_COUNT'), false);
  assert.equal(valid.issues.some((issue) => issue.code === 'APPROVAL_REJECTED_BRANCH_COUNT'), false);

  const missingRejected = validateWorkflowPreflight(makeVersion(['APPROVED', undefined]));
  assert.ok(missingRejected.issues.some((issue) => issue.code === 'APPROVAL_REJECTED_BRANCH_COUNT'));

  const invalidOutcome = validateWorkflowPreflight(makeVersion(['TRUE', 'REJECTED']));
  assert.ok(invalidOutcome.issues.some((issue) => issue.code === 'APPROVAL_INVALID_OUTCOME'));
  assert.ok(invalidOutcome.issues.some((issue) => issue.code === 'APPROVAL_APPROVED_BRANCH_COUNT'));
});

test('directory-backed approval and task routes validate canonical IDs', () => {
  const version = makeVersion(['APPROVED', 'REJECTED']);
  version.nodes[1].approval = {
    approverSource: 'DEPARTMENT_MEMBERS',
    approvalMode: 'ANY_ONE',
    departmentSource: 'REQUESTER_DEPARTMENT',
    departmentId: 'deleted-department',
    escalationSource: 'DEPARTMENT_HEAD',
  };
  version.nodes.push({
    id: 'task',
    key: 'task',
    type: 'TASK',
    title: 'Task',
    position: { x: 600, y: 0 },
    assignment: { strategy: 'UNASSIGNED_TEAM_QUEUE', departmentId: 'dept-live', sectionId: 'section-deleted' },
  });
  version.nodes[0].position = { x: -200, y: 0 };
  version.nodes[2].position = { x: 800, y: -80 };
  version.nodes[3].position = { x: 800, y: 80 };
  version.edges.push({ id: 'rejected-to-task', sourceNodeId: 'rejected-end', destinationNodeId: 'task' });

  const result = validateWorkflowPreflight(version, {
    departments: [{ id: 'dept-live' }],
    sections: [{ id: 'section-live', departmentId: 'dept-live', isActive: true }],
  });

  assert.equal(result.issues.some((issue) => issue.code === 'DELETED_APPROVER_DEPARTMENT'), false, 'dynamic approval routes must not validate a stale static department ID');
  assert.ok(result.issues.some((issue) => issue.code === 'DELETED_ASSIGNMENT_SECTION'));
});
