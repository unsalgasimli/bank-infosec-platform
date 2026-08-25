import type { BankUser } from '../types/auth.js';
import type { PreflightIssue, PreflightResult, WorkflowVersion } from '../types/orchestration.js';

export interface PreflightValidationContext {
  actor?: BankUser;
  departments?: { id: string }[];
  sections?: { id: string; departmentId: string; isActive?: boolean }[];
  users?: { id: string; isActive?: boolean }[];
  teams?: { id: string }[];
  connectorDefinitions?: { id: string; status: string; actionKeys: string[]; credentialReferenceIds: string[]; name?: string }[];
  workflowDefinitions?: { id: string; latestVersion?: number }[];
  workflowVersions?: { workflowDefinitionId: string; version: number; status: string }[];
}

export function validateWorkflowPreflight(
  version: WorkflowVersion,
  context?: PreflightValidationContext,
): PreflightResult {
  const issues: PreflightIssue[] = [];
  const add = (
    severity: PreflightIssue['severity'],
    code: string,
    message: string,
    nodeId?: string,
    edgeId?: string,
    remediation?: string,
  ) => {
    issues.push({ severity, code, message, nodeId, edgeId, remediation });
  };

  if (!version.nodes || !version.nodes.length) {
    add('ERROR', 'EMPTY_GRAPH', 'Workflow must contain nodes.', undefined, undefined, 'Add a start, at least one activity, and a terminal node.');
    return {
      valid: false,
      issues,
      summary: { errors: 1, warnings: 0, recommendations: 0 },
    };
  }

  const nodeById = new Map(version.nodes.map((node) => [node.id, node]));
  if (nodeById.size !== version.nodes.length) {
    add('ERROR', 'DUPLICATE_NODE_ID', 'Node IDs must be unique.');
  }

  const variableKeys = new Set<string>();
  for (const variable of version.variables || []) {
    if (!variable.key?.trim()) {
      add('ERROR', 'MISSING_VARIABLE_KEY', 'Every workflow variable needs a key.');
    } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.key)) {
      add('ERROR', 'INVALID_VARIABLE_KEY', `Variable “${variable.key}” must start with a letter or underscore and contain only letters, numbers, or underscores.`);
    } else if (variableKeys.has(variable.key)) {
      add('ERROR', 'DUPLICATE_VARIABLE_KEY', `Variable key “${variable.key}” is duplicated.`);
    }
    if (variable.key) variableKeys.add(variable.key);
  }

  const starts = version.nodes.filter((node) => node.type === 'START');
  const ends = version.nodes.filter((node) => node.type.endsWith('_END'));
  if (starts.length !== 1) {
    add('ERROR', 'INVALID_START_COUNT', `Workflow requires exactly one start node; found ${starts.length}.`);
  }
  if (ends.length === 0) {
    add('ERROR', 'MISSING_END', 'Workflow requires at least one explicit terminal node.');
  }

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const id of nodeById.keys()) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }

  const edgeKeys = new Set<string>();
  for (const edge of version.edges || []) {
    if (!nodeById.has(edge.sourceNodeId)) {
      add('ERROR', 'MISSING_EDGE_SOURCE', `Edge source ${edge.sourceNodeId} does not exist.`, undefined, edge.id);
    }
    if (!nodeById.has(edge.destinationNodeId)) {
      add('ERROR', 'MISSING_EDGE_DESTINATION', `Edge destination ${edge.destinationNodeId} does not exist.`, undefined, edge.id);
    }
    if (edge.sourceNodeId === edge.destinationNodeId) {
      add('ERROR', 'SELF_LOOP', 'A node cannot connect to itself. Use a governed retry policy for retries.', edge.sourceNodeId, edge.id);
    }
    if (edge.dependencyType && edge.dependencyType !== 'FINISH_TO_START') {
      add('ERROR', 'UNSUPPORTED_DEPENDENCY_TYPE', 'Only finish-to-start connections are supported by the workflow runtime.', undefined, edge.id, 'Replace this edge with a finish-to-start connection.');
    }
    if (edge.delayMinutes !== undefined && (!Number.isFinite(edge.delayMinutes) || edge.delayMinutes < 0)) {
      add('ERROR', 'INVALID_EDGE_DELAY', 'Connection delay must be a non-negative number of minutes.', undefined, edge.id);
    }
    const edgeKey = `${edge.sourceNodeId}:${edge.destinationNodeId}:${edge.outcome || ''}`;
    if (edgeKeys.has(edgeKey)) {
      add('WARNING', 'DUPLICATE_EDGE', 'Duplicate edge semantics detected.', undefined, edge.id);
    }
    edgeKeys.add(edgeKey);
    if (nodeById.has(edge.sourceNodeId) && nodeById.has(edge.destinationNodeId)) {
      outgoing.get(edge.sourceNodeId)!.push(edge.destinationNodeId);
      incoming.get(edge.destinationNodeId)!.push(edge.sourceNodeId);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walkCycle = (id: string, path: string[]) => {
    if (visiting.has(id)) {
      add('ERROR', 'ILLEGAL_CYCLE', `Illegal graph cycle: ${[...path, id].join(' → ')}.`, id, undefined, 'Replace the circular edge with the node retry policy or an explicitly governed loop construct.');
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of outgoing.get(id) || []) walkCycle(next, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of nodeById.keys()) walkCycle(id, []);

  if (starts.length === 1) {
    const reachable = new Set<string>();
    const visit = (id: string) => {
      if (reachable.has(id)) return;
      reachable.add(id);
      for (const next of outgoing.get(id) || []) visit(next);
    };
    visit(starts[0].id);
    for (const node of version.nodes) {
      if (!reachable.has(node.id)) {
        add('ERROR', 'UNREACHABLE_NODE', `Node “${node.title || node.id}” cannot be reached from start.`, node.id);
      }
    }
  }

  for (const node of version.nodes) {
    if (!node.title?.trim()) {
      add('ERROR', 'MISSING_NODE_TITLE', 'Node title is required.', node.id);
    }
    if (!node.position || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) {
      add('ERROR', 'INVALID_NODE_POSITION', `Node “${node.title || node.id}” has no valid canvas position.`, node.id);
    }
    const inCount = incoming.get(node.id)?.length || 0;
    const outCount = outgoing.get(node.id)?.length || 0;
    if (node.type === 'START' && inCount > 0) {
      add('ERROR', 'START_HAS_INCOMING_PATH', 'The Start node cannot have an incoming connection.', node.id);
    }
    if (node.type.endsWith('_END') && outCount > 0) {
      add('ERROR', 'END_HAS_OUTGOING_PATH', `Terminal node “${node.title}” cannot have an outgoing connection.`, node.id);
    }
    if (node.type !== 'START' && inCount === 0) {
      add('ERROR', 'ORPHAN_NODE', `Node “${node.title}” has no incoming path.`, node.id);
    }
    if (!node.type.endsWith('_END') && outCount === 0) {
      add('ERROR', 'DEAD_END', `Node “${node.title}” has no outgoing path.`, node.id);
    }
    if (node.type === 'CONDITION' && !node.condition) {
      add('ERROR', 'INVALID_CONDITION', `Decision “${node.title}” has no governed condition.`, node.id);
    }
    if (node.type === 'CONDITION' && outCount < 2) {
      add('ERROR', 'INCOMPLETE_DECISION', `Decision “${node.title}” needs at least two outcome edges.`, node.id);
    }
    if (node.type === 'PARALLEL_SPLIT' && outCount < 2) {
      add('ERROR', 'INVALID_PARALLEL_SPLIT', `Parallel split “${node.title}” needs at least two branches.`, node.id);
    }
    if (node.type === 'PARALLEL_JOIN' && inCount < 2) {
      add('ERROR', 'INVALID_PARALLEL_JOIN', `Parallel join “${node.title}” needs at least two incoming branches.`, node.id);
    }
    if (node.type === 'PARALLEL_JOIN' && !node.join) {
      add('ERROR', 'MISSING_JOIN_POLICY', `Parallel join “${node.title}” needs ALL, ANY, quorum, or N-of-M semantics.`, node.id);
    }
    if (['INPUT', 'TICKET_INPUT'].includes(node.type)) {
      if (node.inputConfig?.fields?.length) {
        const fieldKeys = new Set<string>();
        for (const field of node.inputConfig.fields) {
          if (!field.key?.trim()) {
            add('ERROR', 'MISSING_FIELD_KEY', `Form field in “${node.title}” is missing a key.`, node.id);
          } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field.key)) {
            add('ERROR', 'INVALID_FIELD_KEY', `Field key “${field.key}” in “${node.title}” is invalid.`, node.id);
          } else if (fieldKeys.has(field.key)) {
            add('ERROR', 'DUPLICATE_FIELD_KEY', `Duplicate field key “${field.key}” in “${node.title}”.`, node.id);
          }
          if (field.key) fieldKeys.add(field.key);
          if (!field.label?.trim()) {
            add('ERROR', 'MISSING_FIELD_LABEL', `Field “${field.key || ''}” in “${node.title}” is missing a label.`, node.id);
          }
          if (['SELECT', 'MULTI_SELECT', 'RADIO'].includes(field.type) && (!field.options || field.options.length === 0)) {
            add('WARNING', 'CHOICE_FIELD_NO_OPTIONS', `Choice field “${field.label || field.key}” has no selectable options configured.`, node.id);
          }
        }
      }
    }
    if (node.type === 'APPROVAL') {
      if (!node.approval) {
        add('ERROR', 'APPROVAL_WITHOUT_APPROVER', `Approval “${node.title}” has no approver source.`, node.id);
      }
      const approvalEdges = (version.edges || []).filter((edge) => edge.sourceNodeId === node.id);
      const approvedEdges = approvalEdges.filter((edge) => edge.outcome === 'APPROVED');
      const rejectedEdges = approvalEdges.filter((edge) => edge.outcome === 'REJECTED');
      const invalidApprovalEdges = approvalEdges.filter((edge) => !['APPROVED', 'REJECTED'].includes(edge.outcome || ''));
      if (approvedEdges.length !== 1) {
        add('ERROR', 'APPROVAL_APPROVED_BRANCH_COUNT', `Approval “${node.title}” must have exactly one APPROVED output connection.`, node.id, undefined, 'Connect the Approved output to the next activity or success path.');
      }
      if (rejectedEdges.length !== 1) {
        add('ERROR', 'APPROVAL_REJECTED_BRANCH_COUNT', `Approval “${node.title}” must have exactly one REJECTED output connection.`, node.id, undefined, 'Connect the Rejected output to a rejected end or rejection handling path.');
      }
      for (const edge of invalidApprovalEdges) {
        add('ERROR', 'APPROVAL_INVALID_OUTCOME', `Approval “${node.title}” has an output that is not APPROVED or REJECTED.`, node.id, edge.id, 'Use the Approved and Rejected output ports for approval routing.');
      }
      if (context?.departments && (!node.approval?.departmentSource || node.approval.departmentSource === 'STATIC') && node.approval?.departmentId && !context.departments.some((department) => department.id === node.approval!.departmentId)) {
        add('ERROR', 'DELETED_APPROVER_DEPARTMENT', `Approval “${node.title}” references a deleted department or branch.`, node.id);
      }
      if (context?.users && node.approval?.specificUserIds?.some((id) => !context.users!.some((user) => user.id === id && (user.isActive ?? true)))) {
        add('ERROR', 'DELETED_APPROVER', `Approval “${node.title}” references a missing or inactive user.`, node.id);
      }
      if (node.approval?.departmentSource && node.approval.departmentSource !== 'STATIC' && (node.approval.approverSource === 'SPECIFIC_USER' || node.approval.specificUserIds?.length)) {
        add('ERROR', 'DYNAMIC_DEPARTMENT_FIXED_APPROVER', `Approval “${node.title}” routes by a runtime department or branch and cannot use a fixed user.`, node.id, undefined, 'Use department members or the department head.');
      }
      if (context?.teams && node.approval?.groupId && !context.teams.some((team) => team.id === node.approval!.groupId)) {
        add('ERROR', 'DELETED_APPROVER_GROUP', `Approval “${node.title}” references a deleted group.`, node.id);
      }
      if (!node.approval?.timeoutMinutes) {
        add('WARNING', 'APPROVAL_WITHOUT_TIMEOUT', `Approval “${node.title}” has no timeout.`, node.id);
      }
      if (!node.approval?.escalationSource) {
        add('WARNING', 'APPROVAL_WITHOUT_ESCALATION', `Approval “${node.title}” has no escalation path.`, node.id);
      }
      if (node.approval?.approverSource === 'SPECIFIC_USER') {
        add('WARNING', 'HARD_CODED_APPROVER', `Approval “${node.title}” uses named approvers instead of a role or relationship.`, node.id);
      }
    }
    if (['TASK', 'INFORMATION_REQUEST'].includes(node.type)) {
      if (!node.assignment) {
        add('WARNING', 'NO_EXPLICIT_OWNER', `Human activity “${node.title}” has no assignment strategy and may enter the workflow owner queue.`, node.id);
      }
      if (node.assignment?.strategy === 'FIXED_PERSON') {
        add('WARNING', 'HARD_CODED_ASSIGNEE', `Human activity “${node.title}” uses a fixed person.`, node.id);
      }
      if (context?.users && node.assignment?.assigneeId && !context.users.some((user) => user.id === node.assignment!.assigneeId && (user.isActive ?? true))) {
        add('ERROR', 'DELETED_ASSIGNEE', `Human activity “${node.title}” references a missing or inactive assignee.`, node.id);
      }
      if (node.assignment?.sectionId) {
        const section = context?.sections?.find((item) => item.id === node.assignment!.sectionId && item.isActive !== false);
        if (!section) {
          add('ERROR', 'DELETED_ASSIGNMENT_SECTION', `Human activity “${node.title}” references an inactive or deleted department section.`, node.id);
        } else if (node.assignment.departmentId !== section.departmentId) {
          add('ERROR', 'ASSIGNMENT_SECTION_PARENT_MISMATCH', `Human activity “${node.title}” has a section that does not belong to its selected department.`, node.id);
        }
      }
      if (context?.teams && node.assignment?.groupId && !context.teams.some((team) => team.id === node.assignment!.groupId)) {
        add('ERROR', 'DELETED_ASSIGNMENT_GROUP', `Human activity “${node.title}” references a deleted assignment group.`, node.id);
      }
      if (!node.timeoutMinutes && !node.stageId) {
        add('RECOMMENDATION', 'NO_DUE_POLICY', `Add a due-date or stage target to “${node.title}”.`, node.id);
      }
    }
    if (['INTEGRATION_ACTION', 'WEBHOOK_ACTION'].includes(node.type)) {
      if (!node.action?.connectorId) {
        add('ERROR', 'MISSING_CONNECTOR', `Automation “${node.title}” has no connector reference.`, node.id);
      }
      if (!node.action?.credentialReferenceId) {
        add('ERROR', 'MISSING_CREDENTIAL_REFERENCE', `Automation “${node.title}” has no credential reference. Secrets must not be embedded in the workflow.`, node.id);
      }
      if (context?.connectorDefinitions) {
        const connector = context.connectorDefinitions.find((candidate) => candidate.id === node.action?.connectorId);
        if (node.action?.connectorId && (!connector || connector.status !== 'ACTIVE')) {
          add('ERROR', 'INACCESSIBLE_CONNECTOR', `Automation “${node.title}” references an unavailable connector.`, node.id);
        }
        if (connector && node.action?.actionKey && !connector.actionKeys.includes(node.action.actionKey)) {
          add('ERROR', 'UNSUPPORTED_CONNECTOR_ACTION', `Connector “${connector.name || connector.id}” does not expose action ${node.action.actionKey}.`, node.id);
        }
        if (connector && node.action?.credentialReferenceId && !connector.credentialReferenceIds.includes(node.action.credentialReferenceId)) {
          add('ERROR', 'INVALID_CREDENTIAL_REFERENCE', `Credential reference is not authorized for connector “${connector.name || connector.id}”.`, node.id);
        }
      }
      if (!node.retryPolicy) {
        add('WARNING', 'NO_RETRY_POLICY', `External action “${node.title}” has no retry policy.`, node.id);
      }
      if (!node.compensation) {
        add('RECOMMENDATION', 'NO_COMPENSATION', `Consider defining compensation for “${node.title}”.`, node.id);
      }
    }
    if (node.type === 'SUBWORKFLOW') {
      if (context?.workflowDefinitions && context?.workflowVersions) {
        const target = context.workflowDefinitions.find((definition) => definition.id === node.subworkflow?.workflowDefinitionId);
        const targetVersion = target && context.workflowVersions.find((candidate) => candidate.workflowDefinitionId === target.id && candidate.version === (node.subworkflow?.version || target.latestVersion) && candidate.status === 'PUBLISHED');
        if (!targetVersion) {
          add('ERROR', 'UNPUBLISHED_SUBWORKFLOW', `Subworkflow “${node.title}” does not reference a published version.`, node.id);
        }
      }
    }
    if (node.type === 'SCRIPT_EXPRESSION' && !context?.actor?.roles.some((role) => ['PLATFORM_ADMIN', 'CISO'].includes(role))) {
      add('ERROR', 'SCRIPT_NOT_PERMITTED', `Script node “${node.title}” requires platform-governance authorization.`, node.id);
    }
  }

  for (const split of version.nodes.filter((node) => node.type === 'PARALLEL_SPLIT')) {
    const descendants = new Set<string>();
    const queue = [...(outgoing.get(split.id) || [])];
    while (queue.length) {
      const current = queue.shift()!;
      if (descendants.has(current)) continue;
      descendants.add(current);
      queue.push(...(outgoing.get(current) || []));
    }
    if (![...descendants].some((id) => nodeById.get(id)?.type === 'PARALLEL_JOIN')) {
      add('WARNING', 'PARALLEL_BRANCH_NEVER_REJOINS', `Parallel branches from “${split.title}” do not converge at an explicit join.`, split.id);
    }
  }

  if (!version.triggers || !version.triggers.some((trigger) => trigger.enabled)) {
    add('WARNING', 'NO_ACTIVE_TRIGGER', 'Workflow has no enabled trigger.');
  }
  if (!version.variables || !version.variables.some((variable) => variable.key === 'requesterId')) {
    add('RECOMMENDATION', 'NO_REQUESTER_CONTEXT', 'Declare requesterId for routing, notifications, and separation-of-duties decisions.');
  }

  return {
    valid: !issues.some((issue) => issue.severity === 'ERROR'),
    issues,
    summary: {
      errors: issues.filter((issue) => issue.severity === 'ERROR').length,
      warnings: issues.filter((issue) => issue.severity === 'WARNING').length,
      recommendations: issues.filter((issue) => issue.severity === 'RECOMMENDATION').length,
    },
  };
}
