import { v4 as uuidv4 } from 'uuid';
import type { BankUser } from '../../shared/types/auth.js';
import type {
  NotificationDelivery,
  WorkRelation,
  WorkRelationType,
  WorkflowInstance,
  WorkflowNodeDefinition,
  WorkflowPolicySet,
  WorkflowSlaClock,
} from '../../shared/types/orchestration.js';
import { db } from '../db/database.js';
import { OrchestrationExpressionService } from './orchestration-expression.service.js';
import { OrchestrationError, WorkflowOrchestrationService } from './workflow-orchestration.service.js';
import { NotificationService } from './notification.service.js';

export class WorkflowGovernanceService {
  public static initializeClocks(instance: WorkflowInstance, policy: WorkflowPolicySet, start = new Date()): WorkflowSlaClock[] {
    const targets = WorkflowOrchestrationService.resolveTargets(policy.id, instance.context, start);
    const existing = db.data.workflowSlaClocks.filter((clock) => clock.workflowInstanceId === instance.id);
    if (existing.length) return existing;
    const clocks = targets.clocks.map((target, index) => {
      const targetAt = new Date(target.targetAt);
      const targetMinutes = Math.max(0, Math.ceil((targetAt.getTime() - start.getTime()) / 60_000));
      const warningPercent = policy.escalationPolicy?.warningPercent ?? 75;
      const warningAt = new Date(start.getTime() + targetMinutes * warningPercent / 100 * 60_000);
      const escalationMinutes = policy.escalationPolicy?.escalationBeforeBreachMinutes ?? 0;
      const escalationAt = new Date(Math.max(start.getTime(), targetAt.getTime() - escalationMinutes * 60_000));
      return {
        id: `wf-sla-${uuidv4().slice(0, 8)}`,
        workflowInstanceId: instance.id,
        clockType: target.metric as WorkflowSlaClock['clockType'],
        label: target.label,
        businessCalendarId: targets.businessCalendarId,
        targetAt: targetAt.toISOString(),
        status: 'RUNNING' as const,
        elapsedMinutes: 0,
        targetMinutes,
        totalPausedMinutes: 0,
        warningAt: warningAt.toISOString(),
        escalationAt: escalationAt.toISOString(),
      };
    });
    db.data.workflowSlaClocks.push(...clocks);
    return clocks;
  }

  public static evaluateClocks(instance: WorkflowInstance, now = new Date()) {
    const clocks = db.data.workflowSlaClocks.filter((clock) => clock.workflowInstanceId === instance.id);
    const start = new Date(instance.startedAt).getTime();
    const events: Array<{ type: 'SLA_WARNING' | 'SLA_BREACHED'; clock: WorkflowSlaClock }> = [];
    for (const clock of clocks) {
      if (['MET', 'CANCELLED', 'PAUSED'].includes(clock.status)) continue;
      clock.elapsedMinutes = Math.max(0, Math.floor((now.getTime() - start) / 60_000) - clock.totalPausedMinutes);
      if (now >= new Date(clock.targetAt) && clock.status !== 'BREACHED') {
        clock.status = 'BREACHED';
        events.push({ type: 'SLA_BREACHED', clock });
      } else if (clock.warningAt && now >= new Date(clock.warningAt) && clock.status === 'RUNNING') {
        clock.status = 'AT_RISK';
        events.push({ type: 'SLA_WARNING', clock });
      }
    }
    return events;
  }

  public static completeClocks(instanceId: string, now = new Date(), status: 'MET' | 'CANCELLED' = 'MET') {
    for (const clock of db.data.workflowSlaClocks.filter((item) => item.workflowInstanceId === instanceId && !['MET', 'CANCELLED', 'BREACHED'].includes(item.status))) {
      clock.status = status;
      clock.completedAt = now.toISOString();
    }
  }

  public static pauseClocks(instanceId: string, now = new Date()) {
    for (const clock of db.data.workflowSlaClocks.filter((item) => item.workflowInstanceId === instanceId && ['RUNNING', 'AT_RISK'].includes(item.status))) {
      clock.status = 'PAUSED';
      clock.pausedAt = now.toISOString();
    }
  }

  public static resumeClocks(instanceId: string, now = new Date()) {
    for (const clock of db.data.workflowSlaClocks.filter((item) => item.workflowInstanceId === instanceId && item.status === 'PAUSED')) {
      if (clock.pausedAt) clock.totalPausedMinutes += Math.max(0, Math.floor((now.getTime() - new Date(clock.pausedAt).getTime()) / 60_000));
      clock.pausedAt = undefined;
      clock.status = now >= new Date(clock.targetAt) ? 'BREACHED' : clock.warningAt && now >= new Date(clock.warningAt) ? 'AT_RISK' : 'RUNNING';
    }
  }

  public static dispatchNotification(instance: WorkflowInstance, eventType: string, node?: WorkflowNodeDefinition, now = new Date()): NotificationDelivery {
    const policySet = db.data.workflowPolicySets.find((policy) => policy.id === instance.policySetId && policy.version === instance.policySetVersion);
    const configuredPolicy = policySet?.notificationPolicyId ? db.data.notificationPoliciesV2.find((policy) => policy.id === policySet.notificationPolicyId && policy.enabled) : undefined;
    const policy = configuredPolicy?.eventTypes.includes(eventType) ? configuredPolicy : undefined;
    const explicitRecipients = node?.notification?.recipients || [];
    const resolvers = policy?.recipientResolvers || explicitRecipients;
    const userIds = new Set<string>();
    const groupIds = new Set<string>();
    const addPath = (path: string) => {
      const value = OrchestrationExpressionService.getPath(instance.context, path);
      for (const id of Array.isArray(value) ? value : value ? [value] : []) userIds.add(String(id));
    };
    for (const resolver of resolvers) {
      switch (resolver) {
        case 'REQUESTER': userIds.add(instance.requesterId); break;
        case 'EMPLOYEE': addPath('employeeId'); addPath('employee.id'); break;
        case 'MANAGER': addPath('managerId'); addPath('employee.managerId'); break;
        case 'WORKFLOW_OWNER': userIds.add(instance.ownerId); break;
        case 'ASSIGNEE':
          db.data.nodeInstances.filter((item) => item.workflowInstanceId === instance.id && item.assigneeId).forEach((item) => userIds.add(item.assigneeId!));
          break;
        case 'ASSIGNMENT_GROUP':
          db.data.nodeInstances.filter((item) => item.workflowInstanceId === instance.id && item.assignmentGroupId).forEach((item) => groupIds.add(item.assignmentGroupId!));
          break;
        case 'APPROVER':
          db.data.approvals.filter((chain) => chain.workflowInstanceId === instance.id).flatMap((chain) => chain.steps).forEach((step) => { if (step.assignedApproverId) userIds.add(step.assignedApproverId); });
          break;
        case 'DYNAMIC_ROLE':
          for (const user of db.data.users.filter((candidate) => candidate.isActive && instance.allowedRoleIds.some((role) => candidate.roles.includes(role)))) userIds.add(user.id);
          break;
        default:
          if (String(resolver).startsWith('context.')) addPath(String(resolver).slice(8));
      }
    }
    // Information requests are notifications, not work items.  Resolve the
    // selected department / branch directly so every intended recipient sees
    // the information even though there is no claim or completion status.
    if (eventType === 'INFORMATION_SHARED' && node?.assignment) {
      const assignment = node.assignment;
      if (assignment.assigneeId) userIds.add(assignment.assigneeId);
      if (assignment.groupId) groupIds.add(assignment.groupId);
      if (assignment.departmentId) {
        for (const user of db.data.users.filter((user) => user.isActive && user.departmentId === assignment.departmentId)) userIds.add(user.id);
      }
      if (assignment.strategy === 'DEPARTMENT_OWNER') {
        const managerId = db.data.departments.find((department) => department.id === assignment.departmentId)?.managerId;
        if (managerId) userIds.add(managerId);
      }
      if (assignment.strategy === 'ROLE_BASED' && assignment.role) {
        for (const user of db.data.users.filter((user) => user.isActive && user.roles.includes(assignment.role!))) userIds.add(user.id);
      }
    }
    const deduplicationKey = `${instance.id}:${node?.id || 'workflow'}:${eventType}:${[...userIds].sort().join(',')}:${[...groupIds].sort().join(',')}`;
    const windowMinutes = node?.notification?.deduplicationWindowMinutes ?? policy?.deduplicationWindowMinutes ?? 30;
    const duplicate = db.data.notificationDeliveries.find((delivery) => delivery.deduplicationKey === deduplicationKey && now.getTime() - new Date(delivery.createdAt).getTime() < windowMinutes * 60_000);
    const delivery: NotificationDelivery = {
      id: `wf-notification-${uuidv4().slice(0, 8)}`,
      workflowInstanceId: instance.id,
      policyId: policy?.id,
      eventType,
      recipientUserIds: [...userIds].filter(Boolean),
      recipientGroupIds: [...groupIds].filter(Boolean),
      channels: policy?.channels || ['IN_APP'],
      deduplicationKey,
      status: duplicate ? 'SUPPRESSED' : 'SENT',
      createdAt: now.toISOString(),
      sentAt: duplicate ? undefined : now.toISOString(),
    };
    db.data.notificationDeliveries.push(delivery);
    if (!duplicate && delivery.channels.includes('IN_APP')) {
      for (const groupId of groupIds) {
        db.data.users.filter((user) => user.isActive && user.teamIds.includes(groupId)).forEach((user) => userIds.add(user.id));
      }
      const notificationType = eventType.startsWith('APPROVAL') ? 'APPROVAL' : eventType.startsWith('WORK_ITEM') ? 'ASSIGNMENT' : eventType.startsWith('SLA') ? 'SLA_WARNING' : 'SYSTEM';
      const titleByEvent: Record<string, string> = {
        APPROVAL_CREATED: 'Approval required',
        APPROVAL_DECIDED: 'Approval updated',
        APPROVAL_REMINDER: 'Approval reminder',
        WORK_ITEM_CREATED: 'New workflow ticket',
        WORK_ITEM_CLAIMED: 'Workflow ticket claimed',
        WORK_ITEM_COMPLETED: 'Workflow ticket completed',
        INFORMATION_SHARED: 'Workflow information',
        COMMENT_ADDED: 'New workflow comment',
        WORKFLOW_COMPLETED: 'Workflow completed',
        WORKFLOW_FAILED: 'Workflow failed',
        SLA_WARNING: 'Workflow SLA warning',
        SLA_BREACHED: 'Workflow SLA breached',
      };
      for (const userId of userIds) {
        NotificationService.create({
          userId,
          title: titleByEvent[eventType] || 'Workflow updated',
          message: `${instance.key} · ${instance.title}`,
          type: notificationType,
          severity: eventType.includes('FAILED') || eventType.includes('BREACHED') ? 'HIGH' : eventType.includes('WARNING') ? 'MEDIUM' : 'INFO',
          ticketId: instance.id,
          ticketKey: instance.key,
          actionUrl: `/work-management/workflows?instance=${encodeURIComponent(instance.id)}`,
        }, false);
      }
    }
    return delivery;
  }

  public static addRelation(input: Omit<WorkRelation, 'id' | 'createdAt'>, actor: BankUser): WorkRelation {
    if (!actor.isActive) throw new OrchestrationError('Inactive users cannot create work relations.', 403);
    const duplicate = db.data.workRelations.find((relation) => relation.sourceType === input.sourceType && relation.sourceId === input.sourceId && relation.targetType === input.targetType && relation.targetId === input.targetId && relation.relationType === input.relationType);
    if (duplicate) return duplicate;
    const relation: WorkRelation = { ...input, id: `relation-${uuidv4().slice(0, 8)}`, createdAt: new Date().toISOString() };
    db.data.workRelations.push(relation);
    return relation;
  }

  public static relationsFor(recordId: string) {
    return db.data.workRelations.filter((relation) => relation.sourceId === recordId || relation.targetId === recordId);
  }

  public static inverseRelation(type: WorkRelationType): WorkRelationType {
    const inverse: Partial<Record<WorkRelationType, WorkRelationType>> = { PARENT: 'CHILD', CHILD: 'PARENT', BLOCKS: 'BLOCKED_BY', BLOCKED_BY: 'BLOCKS' };
    return inverse[type] || type;
  }
}
