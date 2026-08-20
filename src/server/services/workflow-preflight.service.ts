import type { BankUser } from '../../shared/types/auth.js';
import type { PreflightIssue, PreflightResult, WorkflowVersion } from '../../shared/types/orchestration.js';
import { db } from '../db/database.js';

export class WorkflowPreflightService {
  public static validate(version: WorkflowVersion, actor?: BankUser): PreflightResult {
    const issues: PreflightIssue[] = [];
    const add = (severity: PreflightIssue['severity'], code: string, message: string, nodeId?: string, edgeId?: string, remediation?: string) => {
      issues.push({ severity, code, message, nodeId, edgeId, remediation });
    };

    if (!version.nodes.length) add('ERROR', 'EMPTY_GRAPH', 'Workflow must contain nodes.', undefined, undefined, 'Add a start, at least one activity, and a terminal node.');

    const nodeById = new Map(version.nodes.map((node) => [node.id, node]));
    if (nodeById.size !== version.nodes.length) add('ERROR', 'DUPLICATE_NODE_ID', 'Node IDs must be unique.');

    const starts = version.nodes.filter((node) => node.type === 'START');
    const ends = version.nodes.filter((node) => node.type.endsWith('_END'));
    if (starts.length !== 1) add('ERROR', 'INVALID_START_COUNT', `Workflow requires exactly one start node; found ${starts.length}.`);
    if (ends.length === 0) add('ERROR', 'MISSING_END', 'Workflow requires at least one explicit terminal node.');

    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();
    for (const id of nodeById.keys()) { outgoing.set(id, []); incoming.set(id, []); }

    const edgeKeys = new Set<string>();
    for (const edge of version.edges) {
      if (!nodeById.has(edge.sourceNodeId)) add('ERROR', 'MISSING_EDGE_SOURCE', `Edge source ${edge.sourceNodeId} does not exist.`, undefined, edge.id);
      if (!nodeById.has(edge.destinationNodeId)) add('ERROR', 'MISSING_EDGE_DESTINATION', `Edge destination ${edge.destinationNodeId} does not exist.`, undefined, edge.id);
      if (edge.sourceNodeId === edge.destinationNodeId) add('ERROR', 'SELF_LOOP', 'A node cannot connect to itself. Use a governed retry policy for retries.', edge.sourceNodeId, edge.id);
      if (edge.dependencyType && edge.dependencyType !== 'FINISH_TO_START') add('ERROR', 'UNSUPPORTED_DEPENDENCY_TYPE', 'Only finish-to-start connections are supported by the workflow runtime.', undefined, edge.id, 'Replace this edge with a finish-to-start connection.');
      if (edge.delayMinutes !== undefined && (!Number.isFinite(edge.delayMinutes) || edge.delayMinutes < 0)) add('ERROR', 'INVALID_EDGE_DELAY', 'Connection delay must be a non-negative number of minutes.', undefined, edge.id);
      const edgeKey = `${edge.sourceNodeId}:${edge.destinationNodeId}:${edge.outcome || ''}`;
      if (edgeKeys.has(edgeKey)) add('WARNING', 'DUPLICATE_EDGE', 'Duplicate edge semantics detected.', undefined, edge.id);
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
        if (!reachable.has(node.id)) add('ERROR', 'UNREACHABLE_NODE', `Node “${node.title || node.id}” cannot be reached from start.`, node.id);
      }
    }

    for (const node of version.nodes) {
      if (!node.title.trim()) add('ERROR', 'MISSING_NODE_TITLE', 'Node title is required.', node.id);
      if (!node.position || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) add('ERROR', 'INVALID_NODE_POSITION', `Node “${node.title}” has no valid canvas position.`, node.id);
      const inCount = incoming.get(node.id)?.length || 0;
      const outCount = outgoing.get(node.id)?.length || 0;
      if (node.type === 'START' && inCount > 0) add('ERROR', 'START_HAS_INCOMING_PATH', 'The Start node cannot have an incoming connection.', node.id);
      if (node.type.endsWith('_END') && outCount > 0) add('ERROR', 'END_HAS_OUTGOING_PATH', `Terminal node “${node.title}” cannot have an outgoing connection.`, node.id);
      if (node.type !== 'START' && inCount === 0) add('ERROR', 'ORPHAN_NODE', `Node “${node.title}” has no incoming path.`, node.id);
      if (!node.type.endsWith('_END') && outCount === 0) add('ERROR', 'DEAD_END', `Node “${node.title}” has no outgoing path.`, node.id);
      if (node.type === 'CONDITION' && !node.condition) add('ERROR', 'INVALID_CONDITION', `Decision “${node.title}” has no governed condition.`, node.id);
      if (node.type === 'CONDITION' && outCount < 2) add('ERROR', 'INCOMPLETE_DECISION', `Decision “${node.title}” needs at least two outcome edges.`, node.id);
      if (node.type === 'PARALLEL_SPLIT' && outCount < 2) add('ERROR', 'INVALID_PARALLEL_SPLIT', `Parallel split “${node.title}” needs at least two branches.`, node.id);
      if (node.type === 'PARALLEL_JOIN' && inCount < 2) add('ERROR', 'INVALID_PARALLEL_JOIN', `Parallel join “${node.title}” needs at least two incoming branches.`, node.id);
      if (node.type === 'PARALLEL_JOIN' && !node.join) add('ERROR', 'MISSING_JOIN_POLICY', `Parallel join “${node.title}” needs ALL, ANY, quorum, or N-of-M semantics.`, node.id);
      if (node.type === 'APPROVAL') {
        if (!node.approval) add('ERROR', 'APPROVAL_WITHOUT_APPROVER', `Approval “${node.title}” has no approver source.`, node.id);
        if (node.approval?.specificUserIds?.some((id) => !db.data.users.some((user) => user.id === id && user.isActive))) add('ERROR', 'DELETED_APPROVER', `Approval “${node.title}” references a missing or inactive user.`, node.id);
        if (node.approval?.groupId && !db.data.teams.some((team) => team.id === node.approval!.groupId)) add('ERROR', 'DELETED_APPROVER_GROUP', `Approval “${node.title}” references a deleted group.`, node.id);
        if (!node.approval?.timeoutMinutes) add('WARNING', 'APPROVAL_WITHOUT_TIMEOUT', `Approval “${node.title}” has no timeout.`, node.id);
        if (!node.approval?.escalationSource) add('WARNING', 'APPROVAL_WITHOUT_ESCALATION', `Approval “${node.title}” has no escalation path.`, node.id);
        if (node.approval?.approverSource === 'SPECIFIC_USER') add('WARNING', 'HARD_CODED_APPROVER', `Approval “${node.title}” uses named approvers instead of a role or relationship.`, node.id);
      }
      if (['TASK', 'INFORMATION_REQUEST'].includes(node.type)) {
        if (!node.assignment) add('WARNING', 'NO_EXPLICIT_OWNER', `Human activity “${node.title}” has no assignment strategy and may enter the workflow owner queue.`, node.id);
        if (node.assignment?.strategy === 'FIXED_PERSON') add('WARNING', 'HARD_CODED_ASSIGNEE', `Human activity “${node.title}” uses a fixed person.`, node.id);
        if (node.assignment?.assigneeId && !db.data.users.some((user) => user.id === node.assignment!.assigneeId && user.isActive)) add('ERROR', 'DELETED_ASSIGNEE', `Human activity “${node.title}” references a missing or inactive assignee.`, node.id);
        if (node.assignment?.groupId && !db.data.teams.some((team) => team.id === node.assignment!.groupId)) add('ERROR', 'DELETED_ASSIGNMENT_GROUP', `Human activity “${node.title}” references a deleted assignment group.`, node.id);
        if (!node.timeoutMinutes && !node.stageId) add('RECOMMENDATION', 'NO_DUE_POLICY', `Add a due-date or stage target to “${node.title}”.`, node.id);
      }
      if (['INTEGRATION_ACTION', 'WEBHOOK_ACTION'].includes(node.type)) {
        if (!node.action?.connectorId) add('ERROR', 'MISSING_CONNECTOR', `Automation “${node.title}” has no connector reference.`, node.id);
        if (!node.action?.credentialReferenceId) add('ERROR', 'MISSING_CREDENTIAL_REFERENCE', `Automation “${node.title}” has no credential reference. Secrets must not be embedded in the workflow.`, node.id);
        const connector = db.data.connectorDefinitions.find((candidate) => candidate.id === node.action?.connectorId);
        if (node.action?.connectorId && (!connector || connector.status !== 'ACTIVE')) add('ERROR', 'INACCESSIBLE_CONNECTOR', `Automation “${node.title}” references an unavailable connector.`, node.id);
        if (connector && node.action?.actionKey && !connector.actionKeys.includes(node.action.actionKey)) add('ERROR', 'UNSUPPORTED_CONNECTOR_ACTION', `Connector “${connector.name}” does not expose action ${node.action.actionKey}.`, node.id);
        if (connector && node.action?.credentialReferenceId && !connector.credentialReferenceIds.includes(node.action.credentialReferenceId)) add('ERROR', 'INVALID_CREDENTIAL_REFERENCE', `Credential reference is not authorized for connector “${connector.name}”.`, node.id);
        if (!node.retryPolicy) add('WARNING', 'NO_RETRY_POLICY', `External action “${node.title}” has no retry policy.`, node.id);
        if (!node.compensation) add('RECOMMENDATION', 'NO_COMPENSATION', `Consider defining compensation for “${node.title}”.`, node.id);
      }
      if (node.type === 'SUBWORKFLOW') {
        const target = db.data.workflowDefinitions.find((definition) => definition.id === node.subworkflow?.workflowDefinitionId);
        const targetVersion = target && db.data.workflowVersions.find((candidate) => candidate.workflowDefinitionId === target.id && candidate.version === (node.subworkflow?.version || target.latestVersion) && candidate.status === 'PUBLISHED');
        if (!targetVersion) add('ERROR', 'UNPUBLISHED_SUBWORKFLOW', `Subworkflow “${node.title}” does not reference a published version.`, node.id);
      }
      if (node.type === 'SCRIPT_EXPRESSION' && !actor?.roles.some((role) => ['PLATFORM_ADMIN', 'CISO'].includes(role))) {
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

    if (!version.triggers.some((trigger) => trigger.enabled)) add('WARNING', 'NO_ACTIVE_TRIGGER', 'Workflow has no enabled trigger.');
    if (!version.variables.some((variable) => variable.key === 'requesterId')) add('RECOMMENDATION', 'NO_REQUESTER_CONTEXT', 'Declare requesterId for routing, notifications, and separation-of-duties decisions.');

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
}
