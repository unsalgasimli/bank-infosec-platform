import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { ApprovalMode, TicketApprovalChain } from '../../shared/types/approval.js';
import type { BankUser, ConfidentialityTier } from '../../shared/types/auth.js';
import type { Ticket, TicketProjectCode } from '../../shared/types/ticket.js';
import type {
  DeadLetterRecord,
  ExecutionEvent,
  NodeAttempt,
  NodeInstance,
  NodeInstanceStatus,
  WorkItem,
  WorkflowInstance,
  WorkflowNodeDefinition,
  WorkflowVersion,
} from '../../shared/types/orchestration.js';
import { db } from '../db/database.js';
import { ApprovalService } from './approval.service.js';
import { OrchestrationExpressionService } from './orchestration-expression.service.js';
import { OrchestrationError, WorkflowOrchestrationService } from './workflow-orchestration.service.js';
import { WorkflowPreflightService } from './workflow-preflight.service.js';
import { WorkflowGovernanceService } from './workflow-governance.service.js';
import { TicketLifecycleService } from './ticket-lifecycle.service.js';
import { SLAService } from './sla.service.js';
import { AuditService } from './audit.service.js';
import { verifyReleaseAuthorization } from './security-release-gate.service.js';

const terminalNodeStatuses: NodeInstanceStatus[] = ['COMPLETED', 'SKIPPED', 'CANCELLED', 'FAILED', 'COMPENSATED'];
const terminalInstanceStatuses: WorkflowInstance['status'][] = ['COMPLETED', 'REJECTED', 'CANCELLED', 'FAILED'];

export class WorkflowRuntimeService {
  private static locks = new Set<string>();

  public static launch(params: {
    workflowDefinitionId: string;
    workflowVersion?: number;
    requestTypeId?: string;
    context: Record<string, unknown>;
    actor: BankUser;
    idempotencyKey?: string;
    triggerType?: WorkflowInstance['triggerType'];
    triggerEventId?: string;
    title?: string;
  }) {
    const { actor } = params;
    if (!actor.isActive) throw new OrchestrationError('Inactive users cannot launch workflows.', 403);
    if (params.idempotencyKey) {
      const prior = db.data.workflowInstances.find((item) => item.idempotencyKey === params.idempotencyKey && item.requesterId === actor.id);
      if (prior) return { instance: prior, replayed: true, execution: this.getExecution(prior.id, actor) };
    }
    const definition = WorkflowOrchestrationService.getDefinition(params.workflowDefinitionId);
    if ((params.triggerType || 'MANUAL') === 'MANUAL') {
      WorkflowOrchestrationService.assertCanLaunchDefinition(definition, actor);
    }
    const version = WorkflowOrchestrationService.getVersion(definition.id, params.workflowVersion);
    if (version.status !== 'PUBLISHED') throw new OrchestrationError('Only a published workflow version can be launched.', 422);
    const preflight = WorkflowPreflightService.validate(version, actor);
    if (!preflight.valid) throw new OrchestrationError('Workflow failed preflight and cannot launch.', 422, preflight);
    let requestType = params.requestTypeId ? WorkflowOrchestrationService.getRequestType(params.requestTypeId) : undefined;
    let launchContext = { ...params.context };
    if (requestType && requestType.workflowDefinitionId !== definition.id) throw new OrchestrationError('Request type and workflow definition do not match.', 422);
    if (requestType) {
      const prepared = WorkflowOrchestrationService.prepareSubmission(requestType.id, params.context, actor);
      if (!prepared.valid) throw new OrchestrationError('Request form validation failed.', 400, prepared.errors);
      launchContext = prepared.values;
    }
    if (definition.id === 'wf-usb-access' && (params.triggerType || 'MANUAL') === 'MANUAL') {
      launchContext = { ...launchContext, requesterId: actor.id, departmentId: actor.departmentId };
    }
    if ((params.triggerType || 'MANUAL') === 'MANUAL') {
      launchContext = this.withAuthenticatedRequesterContext(actor, launchContext);
    }
    const policySetId = requestType?.policySetId || version.policySetId;
    const policy = db.data.workflowPolicySets.find((item) => item.id === policySetId && item.version === version.policySetVersion);
    if (!policy) throw new OrchestrationError('Pinned policy set version is unavailable.', 422);
    const now = new Date().toISOString();
    const instance = db.transaction(() => {
      const sequence = db.data.workflowInstances.length + 1;
      const id = `wfi-${uuidv4().slice(0, 8)}`;
      const context: Record<string, unknown> = { ...launchContext, requesterId: launchContext.requesterId || actor.id, domain: definition.domain };
      for (const approvalNode of version.nodes.filter((node) => node.approval?.approverSource === 'REQUESTER_MANAGER')) {
        // A condition may intentionally bypass a manager node when the
        // requester is that department's manager. Do not require a manager
        // relationship for a path that cannot become active.
        if (context.requesterIsDepartmentManager === true) continue;
        if (!WorkflowOrchestrationService.resolveApprovers(approvalNode, context, String(context.requesterId)).length) {
          throw new OrchestrationError('The requester has no exact manager relationship in Active Directory. Synchronize the LDAP manager attribute before launching this workflow.', 422);
        }
      }
      const confidentiality: ConfidentialityTier = policy.permissionPolicy?.visibility === 'CONFIDENTIAL' ? 'HIGHLY_RESTRICTED_HR_LEGAL' : policy.permissionPolicy?.visibility === 'RESTRICTED' ? 'RESTRICTED' : 'INTERNAL';
      const created: WorkflowInstance = {
        id,
        key: `WORK-${new Date().getUTCFullYear()}-${String(sequence).padStart(5, '0')}`,
        title: params.title || String(context.summary || definition.name),
        workflowDefinitionId: definition.id,
        workflowVersion: version.version,
        formDefinitionId: requestType?.formDefinitionId || version.formDefinitionId,
        formVersion: requestType?.formVersion || version.formVersion,
        policySetId,
        policySetVersion: policy.version,
        requestTypeId: requestType?.id,
        workType: requestType?.workType || definition.defaultWorkType,
        domain: definition.domain,
        triggerType: params.triggerType || 'MANUAL',
        triggerEventId: params.triggerEventId,
        status: 'RUNNING',
        currentStageId: version.stages[0]?.id,
        context,
        nodeOutputs: {},
        requesterId: String(context.requesterId),
        ownerId: definition.ownerId,
        allowedUserIds: [String(context.requesterId), definition.ownerId].filter(Boolean),
        allowedRoleIds: policy.permissionPolicy?.allowedRoles || [],
        allowedDepartmentIds: policy.permissionPolicy?.allowedDepartmentIds || [],
        confidentiality,
        idempotencyKey: params.idempotencyKey,
        version: 1,
        startedAt: now,
        updatedAt: now,
      };
      db.data.workflowInstances.push(created);
      for (const workflowNode of version.nodes) {
        db.data.nodeInstances.push({
          id: `ni-${uuidv4().slice(0, 8)}`,
          workflowInstanceId: created.id,
          nodeId: workflowNode.id,
          nodeKey: workflowNode.key,
          nodeType: workflowNode.type,
          stageId: workflowNode.stageId,
          status: 'PENDING',
          attemptCount: 0,
          logicalCompletionKey: `${created.id}:${workflowNode.id}:complete`,
          version: 1,
        });
      }
      this.appendEvent(created, 'WORKFLOW_STARTED', actor, { workflowDefinitionId: definition.id, workflowVersion: version.version, formVersion: created.formVersion, policySetVersion: created.policySetVersion, triggerType: created.triggerType });
      const targets = WorkflowOrchestrationService.resolveTargets(policySetId, context, new Date(now));
      this.appendEvent(created, 'SLA_RESOLVED', actor, targets as any);
      WorkflowGovernanceService.initializeClocks(created, policy, new Date(now));
      if (created.triggerType !== 'MANUAL') this.appendEvent(created, 'TRIGGER_MATCHED', actor, { triggerType: created.triggerType, triggerEventId: created.triggerEventId });
      return created;
    });
    this.advance(instance.id, new Date(), actor);
    const template = db.data.workflowCatalogTemplates.find((item) => item.workflowDefinitionId === definition.id);
    if (template) { template.runCount += 1; template.lastUsedAt = now; db.persist(); }
    return { instance: db.data.workflowInstances.find((item) => item.id === instance.id)!, replayed: false, execution: this.getExecution(instance.id, actor) };
  }

  public static launchQuickWork(params: { requestTypeId: string; values: Record<string, unknown>; actor: BankUser; idempotencyKey?: string }) {
    const requestType = WorkflowOrchestrationService.getRequestType(params.requestTypeId);
    let launchValues = { ...params.values };
    const targetSectionId = typeof launchValues.targetSectionId === 'string' ? launchValues.targetSectionId : undefined;
    if (targetSectionId) {
      const section = db.data.departmentSections.find((candidate) => candidate.id === targetSectionId && candidate.isActive !== false && candidate.directorySource === 'ACTIVE_DIRECTORY');
      if (!section) throw new OrchestrationError('Target section does not exist, is inactive, or is not AD-confirmed.', 422);
      const targetDepartmentId = typeof launchValues.targetDepartmentId === 'string' ? launchValues.targetDepartmentId : undefined;
      if (targetDepartmentId && targetDepartmentId !== section.departmentId) {
        throw new OrchestrationError('Target section does not belong to the selected department.', 422);
      }
      launchValues = { ...launchValues, targetDepartmentId: targetDepartmentId || section.departmentId };
    }
    const result = this.launch({ workflowDefinitionId: requestType.workflowDefinitionId, workflowVersion: requestType.workflowVersion, requestTypeId: requestType.id, context: launchValues, actor: params.actor, idempotencyKey: params.idempotencyKey, title: String(launchValues.summary || requestType.name) });

    // Ensure corresponding Ticket entry exists in db.data.tickets for unified views
    const instance = result.instance;
    const existingTicket = db.data.tickets.find((t) => t.workflowRunId === instance.id || t.id === `tick-${instance.id.replace(/^wfi-/, '')}`);
    if (!existingTicket) {
      const now = new Date().toISOString();
      const projectCode = 'SEC';
      const year = new Date().getUTCFullYear();
      const highestSequence = (db.data.tickets || []).reduce((highest, ticket) => {
        const match = ticket.key.match(new RegExp(`^${projectCode}-${year}-(\\d+)$`));
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 0);
      const key = `${projectCode}-${year}-${String(highestSequence + 1).padStart(4, '0')}`;
      const defaultWorkflow = (db.data.workflows || [])[0];
      const initialStatus = defaultWorkflow?.states?.[0] || { id: 'OPEN', name: 'Open', category: 'TO_DO' };
      const defaultSlaPolicy = (db.data.slaPolicies || [])[0] || { id: 'sla-p1-emergency' };
      const slaPolicyId = (launchValues.slaPolicyId as string) || defaultSlaPolicy.id;
      const technicalSeverity = (launchValues.technicalSeverity as any) || 'MEDIUM';
      const slaDeadlines = TicketLifecycleService.calculateSlaDeadlines(slaPolicyId, technicalSeverity, now);
      const targetDepartmentId = (launchValues.targetDepartmentId as string) || undefined;
      const targetSectionId = (launchValues.targetSectionId as string) || undefined;
      const departmentId = targetDepartmentId || (launchValues.departmentId as string) || params.actor.departmentId;
      const assigneeId = (launchValues.assigneeId as string) || undefined;

      const ticket: Ticket = {
        id: `tick-${instance.id.replace(/^wfi-/, '')}`,
        key,
        projectCode,
        ticketTypeId: (launchValues.workType as any) || 'SERVICE_REQUEST',
        ticketTypeName: 'Standard Task',
        type: (launchValues.workType as any) || 'SERVICE_REQUEST',
        category: (launchValues.category as any) || 'GENERAL_REQUEST',
        securityDomain: 'GENERAL_INFOSEC',
        title: String(launchValues.summary || instance.title),
        description: String(launchValues.description || launchValues.summary || ''),
        statusId: initialStatus.id,
        statusName: initialStatus.name,
        statusCategory: (initialStatus.category || 'TO_DO') as any,
        workflowId: 'wf-standard-task',
        workflowVersion: 1,
        technicalSeverity,
        businessPriority: (launchValues.businessPriority as any) || 'P3_MEDIUM',
        businessImpact: (launchValues.businessImpact as any) || 'MODERATE',
        urgency: (launchValues.urgency as any) || 'MEDIUM',
        inherentRisk: 'MEDIUM',
        residualRisk: 'LOW',
        riskScore: 50,
        confidentiality: 'INTERNAL',
        restrictedUserIds: [],
        restrictedTeamIds: [],
        reporterId: (launchValues.reporterId as string) || params.actor.id,
        requesterId: (launchValues.requesterId as string) || params.actor.id,
        assigneeId,
        departmentId,
        targetDepartmentId,
        targetSectionId,
        assignmentGroupId: (launchValues.assignmentGroupId as string) || (launchValues.routingStrategy === 'TEAM_QUEUE' && !targetSectionId ? targetDepartmentId : undefined),
        watcherIds: [params.actor.id],
        participantIds: [params.actor.id],
        customFields: [],
        createdAt: now,
        updatedAt: now,
        detectedAt: now,
        dueDate: slaDeadlines.resolutionDeadline,
        remediationDeadline: slaDeadlines.remediationDeadline,
        slaPolicyId,
        slaState: 'SAFE',
        version: 1,
        tags: Array.isArray(launchValues.labels) ? (launchValues.labels as string[]) : ['quick-work'],
        workflowRunId: instance.id,
      };
      const sla = SLAService.calculateSLA(ticket);
      ticket.slaState = sla.state;
      ticket.slaRemainingMinutes = sla.remainingMinutes;
      db.data.tickets.unshift(ticket);
      TicketLifecycleService.initializeSlaMetrics(ticket);
      db.persist();
    }
    return result;
  }

  /**
   * Manual portal submissions are always tied to the authenticated employee.
   * The derived relationship values are server-owned, so a client cannot
   * submit as a different requester or choose a different department manager.
   */
  private static withAuthenticatedRequesterContext(actor: BankUser, context: Record<string, unknown>) {
    const department = db.data.departments.find((item) => item.id === actor.departmentId);
    const manager = department?.managerId
      ? db.data.users.find((item) => item.id === department.managerId && item.isActive)
      : undefined;
    return {
      ...context,
      requesterId: actor.id,
      departmentId: actor.departmentId,
      requesterIsDepartmentManager: Boolean(department?.managerId && department.managerId === actor.id),
      requester: {
        id: actor.id,
        name: actor.fullName,
        email: actor.email,
        departmentId: actor.departmentId,
        sectionId: actor.sectionId,
        departmentName: department?.name,
        managerId: manager?.id,
        roles: actor.roles,
        groups: actor.teamIds,
        department: { id: actor.departmentId, name: department?.name, manager: manager ? { id: manager.id, name: manager.fullName } : undefined },
      },
    };
  }

  public static advance(instanceId: string, now = new Date(), actor?: BankUser) {
    if (this.locks.has(instanceId)) return;
    this.locks.add(instanceId);
    try {
      return db.transaction(() => {
        const instance = this.requireInstance(instanceId);
        if (terminalInstanceStatuses.includes(instance.status)) return instance;
        const version = WorkflowOrchestrationService.getVersion(instance.workflowDefinitionId, instance.workflowVersion);
        let progressed = true;
        let guard = 0;
        while (progressed && guard < Math.max(20, version.nodes.length * 5)) {
          progressed = false;
          guard += 1;
          const nodeInstances = db.data.nodeInstances.filter((item) => item.workflowInstanceId === instance.id);
          for (const current of nodeInstances.filter((item) => ['WAITING', 'WAITING_RETRY'].includes(item.status))) {
            if (this.resumeWaitingNode(instance, version, current, now, actor)) progressed = true;
          }
          for (const current of nodeInstances.filter((item) => item.status === 'PENDING')) {
            const readiness = this.readiness(version, current, nodeInstances, instance, now);
            if (readiness === 'SKIP') {
              current.status = 'SKIPPED'; current.completedAt = now.toISOString(); current.version += 1;
              this.appendEvent(instance, 'NODE_COMPLETED', actor, { status: 'SKIPPED', reason: 'No incoming branch was selected.' }, current);
              progressed = true;
            } else if (readiness === 'READY') {
              current.status = 'READY'; current.activatedAt = now.toISOString(); current.version += 1;
              this.appendEvent(instance, 'NODE_READY', actor, {}, current);
              progressed = true;
            }
          }
          for (const current of nodeInstances.filter((item) => item.status === 'READY')) {
            this.executeNode(instance, version, current, now, actor);
            progressed = true;
          }
        }
        this.refreshInstanceState(instance, version, now, actor);
        if (instance.status === 'COMPLETED') {
          TicketLifecycleService.archiveForCompletedWorkflow(instance.id, actor);
        }
        for (const event of WorkflowGovernanceService.evaluateClocks(instance, now)) {
          this.appendEvent(instance, event.type, actor, { clockId: event.clock.id, clockType: event.clock.clockType, targetAt: event.clock.targetAt });
          const delivery = WorkflowGovernanceService.dispatchNotification(instance, event.type, undefined, now);
          this.appendEvent(instance, 'NOTIFICATION_DISPATCHED', actor, { deliveryId: delivery.id, eventType: event.type, status: delivery.status });
        }
        instance.updatedAt = now.toISOString();
        instance.version += 1;
        return instance;
      });
    } finally {
      this.locks.delete(instanceId);
    }
  }

  private static readiness(version: WorkflowVersion, nodeInstance: NodeInstance, instances: NodeInstance[], instance: WorkflowInstance, now: Date): 'WAIT' | 'READY' | 'SKIP' {
    const incoming = version.edges.filter((edge) => edge.destinationNodeId === nodeInstance.nodeId);
    if (incoming.length === 0) return 'READY';
    const sourceById = new Map(instances.map((item) => [item.nodeId, item]));
    const allSourcesTerminal = incoming.every((edge) => terminalNodeStatuses.includes(sourceById.get(edge.sourceNodeId)?.status || 'PENDING'));
    const activeIncoming = incoming.filter((edge) => {
      const source = sourceById.get(edge.sourceNodeId);
      if (!source) return false;
      if (source.status === 'SKIPPED') return false;
      if (edge.condition && !OrchestrationExpressionService.evaluate(edge.condition, instance.context, instance.nodeOutputs)) return false;
      if (edge.outcome && terminalNodeStatuses.includes(source.status) && source.outcome !== edge.outcome) return false;
      return source.status !== 'CANCELLED';
    });
    const allActiveSourcesTerminal = activeIncoming.every((edge) => terminalNodeStatuses.includes(sourceById.get(edge.sourceNodeId)?.status || 'PENDING'));
    if (allSourcesTerminal && activeIncoming.length === 0) return 'SKIP';
    const delayedUntil = activeIncoming.reduce((latest, edge) => {
      if (!edge.delayMinutes) return latest;
      const sourceCompletedAt = sourceById.get(edge.sourceNodeId)?.completedAt;
      if (!sourceCompletedAt) return latest;
      return Math.max(latest, new Date(sourceCompletedAt).getTime() + edge.delayMinutes * 60_000);
    }, 0);
    if (delayedUntil > now.getTime()) return 'WAIT';
    const node = version.nodes.find((item) => item.id === nodeInstance.nodeId);
    if (node?.type === 'PARALLEL_JOIN') {
      const satisfied = activeIncoming.filter((edge) => {
        const source = sourceById.get(edge.sourceNodeId);
        return source && ['COMPLETED', 'COMPENSATED'].includes(source.status) && (!edge.outcome || source.outcome === edge.outcome);
      }).length;
      const possible = activeIncoming.length;
      const strategy = node.join?.strategy || 'ALL';
      const required = strategy === 'ANY' ? 1 : strategy === 'N_OF_M' || strategy === 'QUORUM' ? Math.max(1, node.join?.requiredCount || Math.ceil(possible / 2)) : possible;
      return satisfied >= required ? 'READY' : allSourcesTerminal ? 'SKIP' : 'WAIT';
    }
    return activeIncoming.length > 0 && allActiveSourcesTerminal ? 'READY' : 'WAIT';
  }

  private static executeNode(instance: WorkflowInstance, version: WorkflowVersion, current: NodeInstance, now: Date, actor?: BankUser) {
    const workflowNode = version.nodes.find((item) => item.id === current.nodeId);
    if (!workflowNode) throw new OrchestrationError(`Node definition ${current.nodeId} is unavailable.`, 500);
    current.status = 'RUNNING'; current.startedAt ||= now.toISOString(); current.attemptCount += 1; current.version += 1;
    this.appendEvent(instance, 'NODE_STARTED', actor, { attempt: current.attemptCount, nodeType: workflowNode.type }, current);
    if (workflowNode.stageId) instance.currentStageId = workflowNode.stageId;
    switch (workflowNode.type) {
      case 'START': case 'INPUT': case 'TICKET_INPUT': case 'MILESTONE': case 'PARALLEL_SPLIT': case 'PARALLEL_JOIN':
        this.completeNode(instance, current, 'COMPLETED', 'COMPLETED', instance.context || {}, now, actor); return;
      case 'CONDITION': {
        const booleanResult = OrchestrationExpressionService.evaluate(workflowNode.condition, instance.context, instance.nodeOutputs);
        const firstClause = workflowNode.condition?.clauses[0];
        const scalar = firstClause && !('clauses' in firstClause) ? OrchestrationExpressionService.resolveOperand(firstClause.left, instance.context, instance.nodeOutputs) : undefined;
        const outcomes = version.edges.filter((edge) => edge.sourceNodeId === workflowNode.id).map((edge) => edge.outcome).filter(Boolean);
        const outcome = outcomes.includes(String(scalar)) ? String(scalar) : booleanResult ? 'TRUE' : 'FALSE';
        this.completeNode(instance, current, 'COMPLETED', outcome, { result: booleanResult, value: scalar }, now, actor); return;
      }
      case 'TASK':
      case 'INFORMATION_REQUEST':
        this.createHumanWork(instance, workflowNode, current, now, actor); return;
      case 'APPROVAL':
        this.createApproval(instance, workflowNode, current, now, actor); return;
      case 'WAIT_TIMER':
        this.scheduleTimer(instance, workflowNode, current, now, actor); return;
      case 'SUBWORKFLOW':
        this.startSubworkflow(instance, workflowNode, current, actor); return;
      case 'SYSTEM_ACTION': case 'WEBHOOK_ACTION': case 'INTEGRATION_ACTION': case 'CREATE_RECORD': case 'SCRIPT_EXPRESSION': case 'NOTIFICATION':
        this.executeAction(instance, workflowNode, current, now, actor); return;
      case 'SUCCESS_END':
        this.completeNode(instance, current, 'COMPLETED', 'SUCCESS', {}, now, actor); instance.status = 'COMPLETED'; instance.completedAt = now.toISOString(); WorkflowGovernanceService.completeClocks(instance.id, now); this.appendEvent(instance, 'WORKFLOW_COMPLETED', actor, {}, current); this.notify(instance, 'WORKFLOW_COMPLETED', actor, now, current); return;
      case 'REJECTED_END':
        this.completeNode(instance, current, 'COMPLETED', 'REJECTED', {}, now, actor); instance.status = 'REJECTED'; instance.completedAt = now.toISOString(); WorkflowGovernanceService.completeClocks(instance.id, now, 'CANCELLED'); this.notify(instance, 'APPROVAL_DECIDED', actor, now, current); return;
      case 'CANCELLED_END':
        this.completeNode(instance, current, 'COMPLETED', 'CANCELLED', {}, now, actor); instance.status = 'CANCELLED'; instance.completedAt = now.toISOString(); WorkflowGovernanceService.completeClocks(instance.id, now, 'CANCELLED'); return;
      case 'FAILED_END':
        this.completeNode(instance, current, 'FAILED', 'FAILED', {}, now, actor); instance.status = 'FAILED'; instance.completedAt = now.toISOString(); WorkflowGovernanceService.completeClocks(instance.id, now, 'CANCELLED'); this.appendEvent(instance, 'WORKFLOW_FAILED', actor, {}, current); this.notify(instance, 'WORKFLOW_FAILED', actor, now, current); return;
    }
  }

  private static createHumanWork(instance: WorkflowInstance, node: WorkflowNodeDefinition, current: NodeInstance, now: Date, actor?: BankUser) {
    if (current.workItemId) { current.status = 'WAITING'; return; }
    const isInformationRequest = node.type === 'INFORMATION_REQUEST';
    const route = WorkflowOrchestrationService.resolveAssignment(node.assignment, instance.context, node, instance.requesterId);
    if (!route.assigneeId && !route.groupId) {
      throw new OrchestrationError(`Assignment failed for “${node.title}”: no active user or queue resolved from its configured routing policy.`, 422);
    }
    const contextTargetSectionId = typeof instance.context.targetSectionId === 'string' && instance.context.targetSectionId
      ? instance.context.targetSectionId
      : undefined;
    const configuredSection = node.assignment?.sectionId
      ? db.data.departmentSections.find((section) => section.id === node.assignment?.sectionId && section.isActive !== false)
      : undefined;
    const targetSectionId = contextTargetSectionId || configuredSection?.id;
    const targetDepartmentId = (typeof instance.context.targetDepartmentId === 'string' && instance.context.targetDepartmentId)
      || node.assignment?.departmentId
      || configuredSection?.departmentId
      || undefined;
    const sequence = db.data.workItemsV2.length + 1;
    const workItem: WorkItem = {
      id: `wi-${uuidv4().slice(0, 8)}`, key: `WI-${new Date().getUTCFullYear()}-${String(sequence).padStart(5, '0')}`, workflowInstanceId: instance.id, nodeInstanceId: current.id,
      workType: isInformationRequest ? 'TASK' : instance.workType,
      title: node.title,
      description: node.description,
      instructions: node.instructions || (isInformationRequest ? 'Provide the requested information, then submit your response.' : undefined),
      acceptanceCriteria: node.acceptanceCriteria || (isInformationRequest ? ['Requested information is supplied'] : []),
      checklist: (node.checklist || []).map((label, index) => ({ id: `${current.id}-check-${index + 1}`, label, completed: false })), status: 'OPEN', assignmentGroupId: route.groupId, targetDepartmentId, targetSectionId, assigneeId: route.assigneeId, requesterId: instance.requesterId, createdAt: now.toISOString(), updatedAt: now.toISOString(),
      dueAt: node.timeoutMinutes ? new Date(now.getTime() + node.timeoutMinutes * 60_000).toISOString() : undefined,
    };
    db.data.workItemsV2.push(workItem);
    if (route.assigneeId && !instance.allowedUserIds.includes(route.assigneeId)) instance.allowedUserIds.push(route.assigneeId);
    current.workItemId = workItem.id; current.assignmentGroupId = route.groupId; current.assigneeId = route.assigneeId; current.routingExplanation = route.explanation; current.status = 'WAITING'; current.version += 1;
    this.appendEvent(instance, 'ROUTING_RESOLVED', actor, { groupId: route.groupId, assigneeId: route.assigneeId, explanation: route.explanation }, current);
    this.appendEvent(instance, 'WORK_ITEM_CREATED', actor, { workItemId: workItem.id, workItemKey: workItem.key, kind: isInformationRequest ? 'INFORMATION_REQUEST' : 'TASK' }, current);
    const delivery = WorkflowGovernanceService.dispatchNotification(instance, 'WORK_ITEM_CREATED', node, now);
    this.appendEvent(instance, 'NOTIFICATION_DISPATCHED', actor, { deliveryId: delivery.id, eventType: 'WORK_ITEM_CREATED', status: delivery.status }, current);
    this.appendEvent(instance, 'NODE_WAITING', actor, { reason: isInformationRequest ? 'Information response pending.' : 'Task confirmation pending.' }, current);
  }

  private static createApproval(instance: WorkflowInstance, node: WorkflowNodeDefinition, current: NodeInstance, now: Date, actor?: BankUser) {
    if (current.approvalChainId) { current.status = 'WAITING'; return; }
    const approvers = WorkflowOrchestrationService.resolveApprovers(node, instance.context, instance.requesterId);
    const approval = node.approval!;
    if (!approvers.length && approval.approverSource !== 'ROLE' && approval.approverSource !== 'CAB_BOARD') {
      throw new OrchestrationError(`No eligible approver resolved for “${node.title}”. Check the requester’s LDAP manager or the configured directory relationship.`, 422);
    }
    const chain: TicketApprovalChain = {
      id: `appr-${uuidv4().slice(0, 8)}`,
      ticketId: current.id,
      title: node.title,
      status: 'PENDING', createdAt: now.toISOString(), mode: approval.approvalMode as ApprovalMode, quorumCount: approval.quorumCount,
      workflowInstanceId: instance.id,
      nodeInstanceId: current.id,
      requesterId: instance.requesterId,
      preventSelfApproval: approval.preventSelfApproval !== false,
      commentsMandatoryOnReject: approval.commentsMandatoryOnReject,
      allowDelegation: approval.allowDelegation,
      steps: approvers.length
        ? approvers.map((user, index) => ({ id: `step-${uuidv4().slice(0, 8)}`, stepNumber: index + 1, name: `${node.title} — ${user.fullName}`, assignedApproverId: user.id, assignedApproverName: user.fullName, resolverType: approval.approverSource === 'REQUESTER_MANAGER' ? 'REQUESTER_MANAGER' : undefined, requiredRole: approval.role, status: 'PENDING' as const, isMandatory: true, deadlineAt: approval.timeoutMinutes ? new Date(now.getTime() + approval.timeoutMinutes * 60_000).toISOString() : undefined }))
        : [{ id: `step-${uuidv4().slice(0, 8)}`, stepNumber: 1, name: `${node.title} — ${approval.role || approval.approverSource} queue`, requiredRole: approval.role, status: 'PENDING', isMandatory: true, deadlineAt: approval.timeoutMinutes ? new Date(now.getTime() + approval.timeoutMinutes * 60_000).toISOString() : undefined }],
    };
    db.data.approvals.push(chain);
    const approvalWorkItem: WorkItem = {
      id: `wi-${uuidv4().slice(0, 8)}`,
      key: `WI-${new Date().getUTCFullYear()}-${String(db.data.workItemsV2.length + 1).padStart(5, '0')}`,
      workflowInstanceId: instance.id,
      nodeInstanceId: current.id,
      workType: 'APPROVAL_REQUEST',
      title: node.title,
      description: node.description,
      instructions: 'Review the request and record an approval decision through the approval action.',
      acceptanceCriteria: ['Authorized approver records a decision'],
      checklist: [],
      status: 'OPEN',
      assignmentGroupId: approval.groupId,
      assigneeId: approvers.length === 1 ? approvers[0].id : undefined,
      requesterId: instance.requesterId,
      dueAt: approval.timeoutMinutes ? new Date(now.getTime() + approval.timeoutMinutes * 60_000).toISOString() : undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    db.data.workItemsV2.push(approvalWorkItem);
    for (const approver of approvers) if (!instance.allowedUserIds.includes(approver.id)) instance.allowedUserIds.push(approver.id);
    current.approvalChainId = chain.id; current.workItemId = approvalWorkItem.id; current.assignmentGroupId = approvalWorkItem.assignmentGroupId; current.assigneeId = approvalWorkItem.assigneeId; current.status = 'WAITING'; current.waitingUntil = approval.timeoutMinutes ? new Date(now.getTime() + approval.timeoutMinutes * 60_000).toISOString() : undefined; current.nextReminderAt = approval.reminderMinutes ? new Date(now.getTime() + approval.reminderMinutes * 60_000).toISOString() : undefined; current.version += 1;
    this.appendEvent(instance, 'APPROVAL_CREATED', actor, { approvalChainId: chain.id, mode: chain.mode, approverIds: approvers.map((user) => user.id), unresolvedRoleQueue: approvers.length === 0 ? approval.role || approval.approverSource : undefined, selfApprovalExcluded: approval.preventSelfApproval !== false }, current);
    this.appendEvent(instance, 'WORK_ITEM_CREATED', actor, { workItemId: approvalWorkItem.id, workItemKey: approvalWorkItem.key, approvalChainId: chain.id, kind: 'APPROVAL' }, current);
    const delivery = WorkflowGovernanceService.dispatchNotification(instance, 'APPROVAL_CREATED', node, now);
    this.appendEvent(instance, 'NOTIFICATION_DISPATCHED', actor, { deliveryId: delivery.id, eventType: 'APPROVAL_CREATED', status: delivery.status }, current);
    this.appendEvent(instance, 'NODE_WAITING', actor, { reason: 'Approval pending.' }, current);
  }

  private static scheduleTimer(instance: WorkflowInstance, node: WorkflowNodeDefinition, current: NodeInstance, now: Date, actor?: BankUser) {
    const timer = node.timer;
    if (!timer) throw new OrchestrationError(`Timer node “${node.title}” has no timer configuration.`, 422);
    const rawDate = timer.datePath ? OrchestrationExpressionService.getPath(instance.context, timer.datePath) : undefined;
    const base = rawDate ? new Date(String(rawDate)) : now;
    if (Number.isNaN(base.getTime())) throw new OrchestrationError(`Timer node “${node.title}” resolved an invalid date.`, 422);
    const waitingUntil = new Date(base.getTime() + (timer.offsetMinutes || timer.durationMinutes || 0) * 60_000);
    if (waitingUntil <= now) { this.completeNode(instance, current, 'COMPLETED', 'ELAPSED', { scheduledFor: waitingUntil.toISOString() }, now, actor); return; }
    current.status = 'WAITING'; current.waitingUntil = waitingUntil.toISOString(); current.version += 1;
    this.appendEvent(instance, 'NODE_WAITING', actor, { reason: 'Timer scheduled.', waitingUntil: current.waitingUntil }, current);
  }

  private static startSubworkflow(instance: WorkflowInstance, node: WorkflowNodeDefinition, current: NodeInstance, actor?: BankUser) {
    if (!node.subworkflow) throw new OrchestrationError(`Subworkflow node “${node.title}” has no target.`, 422);
    if (current.childWorkflowInstanceId) { current.status = 'WAITING'; return; }
    const systemActor = actor || this.systemActor();
    const childContext = { ...OrchestrationExpressionService.mapInputs(node.subworkflow.inputMapping, instance), requesterId: instance.requesterId, summary: node.title, parentWorkflowInstanceId: instance.id };
    const child = this.launch({ workflowDefinitionId: node.subworkflow.workflowDefinitionId, workflowVersion: node.subworkflow.version, context: childContext, actor: systemActor, idempotencyKey: `${instance.id}:${node.id}:subworkflow`, triggerType: 'RECORD_EVENT', triggerEventId: instance.id });
    child.instance.parentWorkflowInstanceId = instance.id;
    const relation = WorkflowGovernanceService.addRelation({ sourceType: 'WORKFLOW_INSTANCE', sourceId: instance.id, targetType: 'WORKFLOW_INSTANCE', targetId: child.instance.id, relationType: 'PARENT', createdByUserId: systemActor.id, metadata: { nodeId: node.id } }, systemActor);
    current.childWorkflowInstanceId = child.instance.id; current.status = 'WAITING'; current.version += 1;
    this.appendEvent(instance, 'NODE_WAITING', actor, { reason: 'Subworkflow running.', childWorkflowInstanceId: child.instance.id }, current);
    this.appendEvent(instance, 'RELATION_CREATED', actor, { relationId: relation.id, relationType: relation.relationType, targetId: child.instance.id }, current);
  }

  private static executeAction(instance: WorkflowInstance, node: WorkflowNodeDefinition, current: NodeInstance, now: Date, actor?: BankUser) {
    const actionKey = node.action?.actionKey || node.notification?.event || node.key;
    if (['INTEGRATION_ACTION', 'WEBHOOK_ACTION'].includes(node.type)) {
      const connector = db.data.connectorDefinitions.find((candidate) => candidate.id === node.action?.connectorId);
      if (!connector || connector.status !== 'ACTIVE') throw new OrchestrationError(`Connector ${node.action?.connectorId || '(missing)'} is not active.`, 422);
      if (!connector.actionKeys.includes(actionKey)) throw new OrchestrationError(`Action ${actionKey} is not governed by connector ${connector.name}.`, 422);
      if (!node.action?.credentialReferenceId || !connector.credentialReferenceIds.includes(node.action.credentialReferenceId)) throw new OrchestrationError(`Credential reference is not authorized for connector ${connector.name}.`, 422);
    }
    const idempotencyKey = (node.action?.idempotencyKeyTemplate || `${instance.id}:${node.id}`).replace('{{instance.id}}', instance.id).replace('{{instance.key}}', instance.key);
    const succeededAttempt = db.data.nodeAttempts.find((attempt) => attempt.idempotencyKey === idempotencyKey && attempt.status === 'SUCCEEDED');
    if (succeededAttempt) { this.completeNode(instance, current, 'COMPLETED', 'SUCCEEDED', succeededAttempt.output || {}, now, actor); return; }
    const input = OrchestrationExpressionService.mapInputs(node.action?.inputMapping, instance);
    const attempt: NodeAttempt = { id: `attempt-${uuidv4().slice(0, 8)}`, workflowInstanceId: instance.id, nodeInstanceId: current.id, attempt: current.attemptCount, idempotencyKey, status: 'STARTED', dryRun: false, input, startedAt: now.toISOString() };
    db.data.nodeAttempts.push(attempt);
    try {
      const output: Record<string, unknown> = node.type === 'NOTIFICATION'
        ? (() => { const delivery = WorkflowGovernanceService.dispatchNotification(instance, actionKey, node, now); return { deliveryId: delivery.id, recipientUserIds: delivery.recipientUserIds, recipientGroupIds: delivery.recipientGroupIds, status: delivery.status }; })()
        : this.runGovernedAction(actionKey, instance, node, current, actor);
      attempt.status = 'SUCCEEDED'; attempt.output = output; attempt.completedAt = now.toISOString();
      for (const deadLetter of db.data.deadLetters.filter((entry) => entry.nodeInstanceId === current.id && entry.status !== 'RESOLVED')) {
        deadLetter.status = 'RESOLVED';
        deadLetter.resolvedAt = now.toISOString();
      }
      this.appendEvent(instance, node.type === 'NOTIFICATION' ? 'NOTIFICATION_DISPATCHED' : 'INTEGRATION_ACTION', actor, { actionKey, idempotencyKey, attempt: current.attemptCount, output }, current);
      if (actionKey === 'CREATE_INCIDENT' && output.recordId) {
        const relationActor = actor || this.systemActor();
        const relation = WorkflowGovernanceService.addRelation({ sourceType: 'WORKFLOW_INSTANCE', sourceId: instance.id, targetType: 'TICKET', targetId: String(output.recordId), relationType: 'CAUSED_BY', createdByUserId: relationActor.id, metadata: { nodeId: node.id } }, relationActor);
        this.appendEvent(instance, 'RELATION_CREATED', actor, { relationId: relation.id, relationType: relation.relationType, targetId: relation.targetId }, current);
      }
      this.completeNode(instance, current, 'COMPLETED', 'SUCCEEDED', output, now, actor);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempt.status = 'FAILED'; attempt.error = message; attempt.completedAt = now.toISOString();
      const retry = node.retryPolicy;
      if (retry && current.attemptCount < retry.maxAttempts) {
        const seconds = Math.min(retry.maxBackoffSeconds, retry.initialBackoffSeconds * Math.pow(retry.multiplier, Math.max(0, current.attemptCount - 1)));
        current.status = 'WAITING_RETRY'; current.nextAttemptAt = new Date(now.getTime() + seconds * 1000).toISOString(); current.error = message; current.version += 1;
        this.appendEvent(instance, 'NODE_RETRY_SCHEDULED', actor, { actionKey, error: message, nextAttemptAt: current.nextAttemptAt, attempt: current.attemptCount }, current);
      } else {
        current.status = 'FAILED'; current.outcome = 'FAILED'; current.error = message; current.completedAt = now.toISOString(); current.version += 1;
        this.appendEvent(instance, 'NODE_FAILED', actor, { actionKey, error: message, attempts: current.attemptCount }, current);
        const deadLetter: DeadLetterRecord = {
          id: `dlq-${uuidv4().slice(0, 8)}`,
          workflowInstanceId: instance.id,
          nodeInstanceId: current.id,
          nodeAttemptId: attempt.id,
          actionKey,
          idempotencyKey,
          error: message,
          status: 'OPEN',
          retryCount: 0,
          failedAt: now.toISOString(),
        };
        db.data.deadLetters.push(deadLetter);
        this.appendEvent(instance, 'DEAD_LETTER_CREATED', actor, { deadLetterId: deadLetter.id, actionKey, attemptId: attempt.id, error: message }, current);
        if (node.compensation?.onFailure) this.executeCompensation(instance, node, current, 'NODE_FAILURE', now, actor);
      }
    }
  }

  private static executeCompensation(instance: WorkflowInstance, node: WorkflowNodeDefinition, current: NodeInstance, reason: string, now: Date, actor?: BankUser) {
    const compensation = node.compensation;
    if (!compensation) return false;
    const idempotencyKey = `${instance.id}:${node.id}:compensation:${reason}`;
    const prior = db.data.nodeAttempts.find((attempt) => attempt.idempotencyKey === idempotencyKey && attempt.status === 'SUCCEEDED');
    if (prior) return true;
    const compensationNode: WorkflowNodeDefinition = { ...node, type: compensation.actionType, action: { connectorId: compensation.connectorId, credentialReferenceId: node.action?.credentialReferenceId, actionKey: compensation.actionKey, inputMapping: compensation.inputMapping, idempotencyKeyTemplate: idempotencyKey, dryRunSupported: node.action?.dryRunSupported } };
    const attempt: NodeAttempt = { id: `attempt-${uuidv4().slice(0, 8)}`, workflowInstanceId: instance.id, nodeInstanceId: current.id, attempt: current.attemptCount + 1, idempotencyKey, status: 'STARTED', dryRun: false, input: OrchestrationExpressionService.mapInputs(compensation.inputMapping, instance), startedAt: now.toISOString() };
    db.data.nodeAttempts.push(attempt);
    try {
      const output = this.runGovernedAction(compensation.actionKey, instance, compensationNode, current, actor);
      attempt.status = 'SUCCEEDED'; attempt.output = output; attempt.completedAt = now.toISOString();
      current.status = 'COMPENSATED'; current.outcome = reason === 'NODE_FAILURE' ? 'FAILED' : 'CANCELLED'; current.version += 1;
      this.appendEvent(instance, 'NODE_COMPENSATED', actor, { actionKey: compensation.actionKey, reason, idempotencyKey, output }, current);
      return true;
    } catch (error) {
      attempt.status = 'FAILED'; attempt.error = error instanceof Error ? error.message : String(error); attempt.completedAt = now.toISOString();
      this.appendEvent(instance, 'NODE_FAILED', actor, { actionKey: compensation.actionKey, compensation: true, reason, error: attempt.error }, current);
      return false;
    }
  }

  private static runGovernedAction(actionKey: string, instance: WorkflowInstance, node: WorkflowNodeDefinition, current: NodeInstance, actor?: BankUser): Record<string, unknown> {
    const configuredFailures = (instance.context.__testFailures || instance.context.simulatedActionOutcomes) as Record<string, unknown> | undefined;
    const configured = configuredFailures?.[actionKey];
    if (configured === 'FAIL' || configured === false || (typeof configured === 'number' && current.attemptCount <= configured)) throw new Error(`Configured ${actionKey} failure for durable retry validation.`);
    if (actionKey === 'DEPLOY') {
      const threatModelId = typeof instance.context.threatModelId === 'string' ? instance.context.threatModelId : '';
      const releaseId = typeof instance.context.releaseId === 'string' ? instance.context.releaseId : (typeof instance.context.changeId === 'string' ? instance.context.changeId : instance.id);
      const productionDeployment = String(instance.context.environment || '').toUpperCase() === 'PRODUCTION';
      if (productionDeployment || instance.context.threatModelRequired === true || threatModelId) {
        if (!threatModelId) throw new OrchestrationError('Production deployment is blocked: the deployment context does not identify an approved Threat Model.', 409);
        const authorization = verifyReleaseAuthorization(instance.context.securityReleaseAuthorization, { modelId: threatModelId, releaseId });
        return { actionKey, connectorId: node.action?.connectorId, logicalExecution: 'SUCCEEDED', securityReleaseGate: 'ALLOWED', threatModelId, revisionId: authorization.revisionId, releaseId, externalMutationId: `external-${crypto.createHash('sha256').update(`${instance.id}:${node.id}`).digest('hex').slice(0, 16)}` };
      }
    }
    if (actionKey === 'CALCULATE_CHANGE_RISK') {
      const environment = String(instance.context.environment || 'NON_PRODUCTION');
      const blastRadius = String(instance.context.blastRadius || 'LOW');
      const changeType = String(instance.context.changeType || 'NORMAL');
      const risk = changeType === 'EMERGENCY' || blastRadius === 'CRITICAL' ? 'CRITICAL' : environment === 'PRODUCTION' && blastRadius === 'HIGH' ? 'HIGH' : environment === 'PRODUCTION' || blastRadius === 'MEDIUM' ? 'MEDIUM' : 'LOW';
      instance.context.risk = risk;
      return { risk, explanation: `Risk ${risk} from environment ${environment}, blast radius ${blastRadius}, and change type ${changeType}.` };
    }
    if (actionKey === 'CALCULATE_SECURITY_PRIORITY') {
      const resolved = WorkflowOrchestrationService.resolvePriority(instance.policySetId, instance.context);
      instance.context.remediationPriority = resolved.priority;
      return resolved;
    }
    if (actionKey === 'VERIFY_ALL_ACCESS_REVOKED') {
      const active = Number(instance.context.activeAccessCount || 0);
      const allAccessRevoked = active === 0;
      instance.context.allAccessRevoked = allAccessRevoked;
      return { allAccessRevoked, activeAccessCount: active, machineVerified: true };
    }
    if (actionKey === 'ENRICH_FINDING') return { applicationOwnerId: instance.context.securityOwnerId || instance.ownerId, enriched: true };
    if (actionKey === 'DEDUPE_FINDING') return { duplicate: false, fingerprint: `finding-${crypto.createHash('sha256').update(JSON.stringify(instance.context)).digest('hex').slice(0, 16)}` };
    if (actionKey === 'CREATE_INCIDENT') return this.createIncidentTicket(instance, node, actor);
    if (actionKey === 'CALCULATE_ACCESS_DIFF') return { remove: instance.context.currentAccess || [], add: instance.context.requiredAccess || [], leastPrivilegeApplied: true };
    return { actionKey, connectorId: node.action?.connectorId, logicalExecution: 'SUCCEEDED', externalMutationId: `external-${crypto.createHash('sha256').update(`${instance.id}:${node.id}`).digest('hex').slice(0, 16)}` };
  }

  /** Create a normal, lifecycle-managed ticket instead of a synthetic incident id. */
  private static createIncidentTicket(instance: WorkflowInstance, node: WorkflowNodeDefinition, actor?: BankUser): Record<string, unknown> {
    const workflowActor = actor || db.data.users.find((user) => user.id === instance.requesterId) || this.systemActor();
    const allowedProjectCodes: TicketProjectCode[] = ['SEC', 'SOC', 'VM', 'APPSEC', 'GRC', 'DLP', 'IAM', 'ARCH', 'AUDIT', 'TPRM'];
    const requestedProjectCode = String(instance.context.projectCode || 'SEC');
    const projectCode = (allowedProjectCodes.includes(requestedProjectCode as TicketProjectCode) ? requestedProjectCode : 'SEC') as TicketProjectCode;
    const severity = ['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(instance.context.technicalSeverity))
      ? String(instance.context.technicalSeverity)
      : 'HIGH';
    const title = String(instance.context.incidentTitle || `Workflow incident: ${instance.title}`).trim();
    const sourceTicketId = typeof instance.context.ticketId === 'string' && db.data.tickets.some((ticket) => ticket.id === instance.context.ticketId)
      ? instance.context.ticketId
      : undefined;
    const body = TicketLifecycleService.validateAndNormalizeCreateInput({
      projectCode,
      category: 'INCIDENT',
      type: 'INCIDENT',
      title: title.length >= 3 ? title : `Workflow incident: ${instance.key}`,
      description: String(instance.context.incidentDescription || instance.context.description || `Created by workflow ${instance.key}, node ${node.title}.`),
      technicalSeverity: severity,
      businessImpact: instance.context.businessImpact || 'SIGNIFICANT',
      requesterId: instance.requesterId,
      reporterId: workflowActor.id,
      intakeChannel: 'AUTOMATION',
      applicationId: instance.context.applicationId,
      assetId: instance.context.assetId,
      departmentId: instance.context.departmentId,
      parentTicketId: sourceTicketId,
      tags: ['WORKFLOW_INCIDENT', instance.key, node.key],
    }, workflowActor);
    const now = new Date().toISOString();
    const year = new Date().getUTCFullYear();
    const sequence = db.data.tickets.reduce((highest, ticket) => {
      const match = ticket.key.match(new RegExp(`^${projectCode}-${year}-(\\d+)$`));
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1;
    const workflow = db.data.workflows.find((item) => item.isActive !== false) || db.data.workflows[0];
    if (!workflow) throw new OrchestrationError('No active ticket workflow is configured for incident creation.', 422);
    const initialStatus = workflow.states.find((state) => state.isInitial) || workflow.states[0];
    if (!initialStatus) throw new OrchestrationError('The active ticket workflow has no initial state.', 422);
    const slaPolicyId = body.slaPolicyId || db.data.slaPolicies.find((item) => item.isDefault)?.id || db.data.slaPolicies[0]?.id;
    const deadlines = TicketLifecycleService.calculateSlaDeadlines(slaPolicyId, severity as Ticket['technicalSeverity'], now);
    const ticket: Ticket = {
      id: `tick-${uuidv4().slice(0, 8)}`,
      key: `${projectCode}-${year}-${String(sequence).padStart(4, '0')}`,
      projectCode,
      ticketTypeId: body.ticketTypeId || 'INCIDENT',
      ticketTypeName: body.ticketTypeName || 'Workflow incident',
      type: 'INCIDENT',
      requestTypeId: body.requestTypeId,
      requestTypeName: body.requestTypeName,
      intakeChannel: 'AUTOMATION',
      category: 'INCIDENT',
      securityDomain: body.securityDomain || 'GENERAL_INFOSEC',
      title: body.title,
      description: body.description,
      statusId: initialStatus.id,
      statusName: initialStatus.name,
      statusCategory: initialStatus.category,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      technicalSeverity: severity as Ticket['technicalSeverity'],
      businessPriority: body.businessPriority,
      businessImpact: body.businessImpact,
      urgency: body.urgency,
      inherentRisk: severity === 'CRITICAL' ? 'CRITICAL' : severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
      residualRisk: 'LOW',
      riskScore: severity === 'CRITICAL' ? 90 : severity === 'HIGH' ? 70 : 50,
      confidentiality: body.confidentiality || instance.confidentiality,
      restrictedUserIds: body.restrictedUserIds || [],
      restrictedTeamIds: body.restrictedTeamIds || [],
      reporterId: workflowActor.id,
      requesterId: body.requesterId,
      assigneeId: body.assigneeId,
      assignmentGroupId: body.assignmentGroupId,
      ownerId: body.ownerId || instance.ownerId,
      securityOwnerId: body.securityOwnerId || instance.ownerId,
      departmentId: body.departmentId,
      applicationId: body.applicationId,
      assetId: body.assetId,
      affectedAssetIds: body.affectedAssetIds,
      parentTicketId: sourceTicketId,
      watcherIds: Array.from(new Set([workflowActor.id, instance.requesterId].filter(Boolean))),
      participantIds: body.participantIds,
      customFields: body.customFields || [],
      createdAt: now,
      updatedAt: now,
      detectedAt: now,
      dueDate: deadlines.resolutionDeadline,
      remediationDeadline: deadlines.remediationDeadline,
      slaPolicyId,
      slaState: 'SAFE',
      version: 1,
      tags: body.tags,
    };
    const sla = SLAService.calculateSLA(ticket);
    ticket.slaState = sla.state;
    ticket.slaRemainingMinutes = sla.remainingMinutes;
    db.data.tickets.unshift(ticket);
    TicketLifecycleService.initializeSlaMetrics(ticket);
    if (sourceTicketId) {
      db.data.ticketRelationships.push({
        id: `rel-${uuidv4().slice(0, 8)}`,
        sourceTicketId,
        targetTicketId: ticket.id,
        type: 'INCIDENT_OF',
        createdByUserId: workflowActor.id,
        createdAt: now,
        note: `Created by workflow ${instance.key}.`,
      });
    }
    AuditService.log({
      actor: workflowActor,
      action: 'TICKET_CREATED',
      entityType: 'TICKET',
      entityId: ticket.id,
      entityKey: ticket.key,
      metadata: { source: 'WORKFLOW_CREATE_INCIDENT', workflowInstanceId: instance.id, workflowNodeId: node.id },
    });
    return { recordId: ticket.id, recordKey: ticket.key, relation: 'CAUSED_BY', created: true };
  }

  private static resumeWaitingNode(instance: WorkflowInstance, version: WorkflowVersion, current: NodeInstance, now: Date, actor?: BankUser): boolean {
    if (current.status === 'WAITING_RETRY' && current.nextAttemptAt && new Date(current.nextAttemptAt) <= now) {
      current.status = 'READY'; current.nextAttemptAt = undefined; current.version += 1; return true;
    }
    if (current.nodeType === 'WAIT_TIMER' && current.waitingUntil && new Date(current.waitingUntil) <= now) {
      this.completeNode(instance, current, 'COMPLETED', 'ELAPSED', { scheduledFor: current.waitingUntil }, now, actor); return true;
    }
    if (current.approvalChainId) {
      const chain = db.data.approvals.find((item) => item.id === current.approvalChainId);
      const node = version.nodes.find((item) => item.id === current.nodeId);
      if (chain?.status === 'APPROVED') { this.completeNode(instance, current, 'COMPLETED', 'APPROVED', { approvalChainId: chain.id }, now, actor); return true; }
      if (chain?.status === 'REJECTED') { this.completeNode(instance, current, 'COMPLETED', 'REJECTED', { approvalChainId: chain.id }, now, actor); return true; }
      if (chain?.status === 'PENDING' && current.nextReminderAt && new Date(current.nextReminderAt) <= now) {
        const delivery = WorkflowGovernanceService.dispatchNotification(instance, 'APPROVAL_REMINDER', node, now);
        this.appendEvent(instance, 'NOTIFICATION_DISPATCHED', actor, { deliveryId: delivery.id, eventType: 'APPROVAL_REMINDER', status: delivery.status, approvalChainId: chain.id }, current);
        current.nextReminderAt = undefined;
        current.version += 1;
        return true;
      }
      if (chain?.status === 'PENDING' && current.waitingUntil && new Date(current.waitingUntil) <= now) {
        const escalation = node?.approval?.escalationSource;
        if (escalation) {
          const escalated = WorkflowOrchestrationService.resolveApprovers({ ...node!, approval: { ...node!.approval!, approverSource: escalation } }, instance.context, instance.requesterId);
          for (const user of escalated) if (!chain.steps.some((step) => step.assignedApproverId === user.id)) chain.steps.push({ id: `step-${uuidv4().slice(0, 8)}`, stepNumber: chain.steps.length + 1, name: `${node!.title} escalation — ${user.fullName}`, assignedApproverId: user.id, assignedApproverName: user.fullName, status: 'PENDING', isMandatory: true });
          current.waitingUntil = new Date(now.getTime() + Math.max(60, node?.approval?.timeoutMinutes || 240) * 60_000).toISOString();
          this.appendEvent(instance, 'APPROVAL_CREATED', actor, { approvalChainId: chain.id, escalation: true, approverIds: escalated.map((user) => user.id) }, current);
          return true;
        }
        chain.status = 'REJECTED';
        chain.completedAt = now.toISOString();
        for (const step of chain.steps.filter((item) => item.status === 'PENDING')) step.status = 'ESCALATED';
        this.appendEvent(instance, 'APPROVAL_DECIDED', actor, { approvalChainId: chain.id, status: 'TIMED_OUT', automatic: true }, current);
        this.completeNode(instance, current, 'COMPLETED', 'TIMED_OUT', { approvalChainId: chain.id, timedOutAt: now.toISOString() }, now, actor);
        return true;
      }
    }
    if (current.childWorkflowInstanceId) {
      const child = db.data.workflowInstances.find((item) => item.id === current.childWorkflowInstanceId);
      if (child && terminalInstanceStatuses.includes(child.status)) {
        const outcome = child.status === 'COMPLETED' ? 'SUCCEEDED' : child.status;
        this.completeNode(instance, current, child.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED', outcome, { childWorkflowInstanceId: child.id, childStatus: child.status }, now, actor); return true;
      }
    }
    return false;
  }

  private static completeNode(instance: WorkflowInstance, current: NodeInstance, status: 'COMPLETED' | 'FAILED', outcome: string, output: Record<string, unknown>, now: Date, actor?: BankUser) {
    if (current.completedAt && terminalNodeStatuses.includes(current.status)) return;
    current.status = status; current.outcome = outcome; current.output = output; current.completedAt = now.toISOString(); current.error = status === 'COMPLETED' ? undefined : current.error; current.version += 1;
    instance.nodeOutputs[current.nodeId] = output;
    this.appendEvent(instance, status === 'COMPLETED' ? 'NODE_COMPLETED' : 'NODE_FAILED', actor, { outcome, output, logicalCompletionKey: current.logicalCompletionKey }, current);
  }

  private static refreshInstanceState(instance: WorkflowInstance, version: WorkflowVersion, now: Date, actor?: BankUser) {
    if (terminalInstanceStatuses.includes(instance.status)) return;
    const nodes = db.data.nodeInstances.filter((item) => item.workflowInstanceId === instance.id);
    const active = nodes.some((item) => ['READY', 'RUNNING'].includes(item.status));
    const waiting = nodes.some((item) => ['WAITING', 'WAITING_RETRY'].includes(item.status));
    const pending = nodes.some((item) => item.status === 'PENDING');
    if (active) instance.status = 'RUNNING';
    else if (waiting || pending) instance.status = 'WAITING';
    else if (nodes.some((item) => item.status === 'FAILED')) {
      instance.status = 'FAILED'; instance.completedAt = now.toISOString(); instance.failureReason = nodes.find((item) => item.status === 'FAILED')?.error || 'Workflow ended with failed nodes.';
      this.appendEvent(instance, 'WORKFLOW_FAILED', actor, { failureReason: instance.failureReason });
      WorkflowGovernanceService.completeClocks(instance.id, now, 'CANCELLED');
      this.notify(instance, 'WORKFLOW_FAILED', actor, now);
    } else if (nodes.every((node) => terminalNodeStatuses.includes(node.status))) {
      if (!version.nodes.some((node) => node.type.endsWith('_END'))) {
        instance.status = 'COMPLETED'; instance.completedAt = now.toISOString(); WorkflowGovernanceService.completeClocks(instance.id, now); this.appendEvent(instance, 'WORKFLOW_COMPLETED', actor, { implicit: true }); this.notify(instance, 'WORKFLOW_COMPLETED', actor, now);
      } else {
        instance.status = 'FAILED'; instance.completedAt = now.toISOString(); instance.failureReason = 'No valid terminal path was reached.'; WorkflowGovernanceService.completeClocks(instance.id, now, 'CANCELLED'); this.appendEvent(instance, 'WORKFLOW_FAILED', actor, { failureReason: instance.failureReason }); this.notify(instance, 'WORKFLOW_FAILED', actor, now);
      }
    }
  }

  public static completeWorkItem(workItemId: string, actor: BankUser, output: Record<string, unknown> = {}) {
    const workItem = db.data.workItemsV2.find((item) => item.id === workItemId);
    if (!workItem) throw new OrchestrationError('Work item not found.', 404);
    const instance = this.requireInstance(workItem.workflowInstanceId);
    const isAdmin = actor.roles.some((role) => ['PLATFORM_ADMIN', 'CISO', 'DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER'].includes(role));
    const nodeInstance = db.data.nodeInstances.find((item) => item.id === workItem.nodeInstanceId);
    const node = nodeInstance && WorkflowOrchestrationService.getVersion(instance.workflowDefinitionId, instance.workflowVersion).nodes.find((item) => item.id === nodeInstance.nodeId);
    const targetSectionId = workItem.targetSectionId || (typeof instance.context.targetSectionId === 'string' ? instance.context.targetSectionId : undefined) || node?.assignment?.sectionId;
    const targetDepartmentId = workItem.targetDepartmentId || (typeof instance.context.targetDepartmentId === 'string' ? instance.context.targetDepartmentId : undefined) || node?.assignment?.departmentId;
    const sectionEligible = !targetSectionId || targetSectionId === actor.sectionId;
    const inGroup = Boolean(workItem.assignmentGroupId && actor.teamIds.includes(workItem.assignmentGroupId) && sectionEligible);
    if (node?.type === 'APPROVAL') throw new OrchestrationError('Approval work items must be decided through the approval action.', 409);
    const isRoleEligible = Boolean(node?.assignment?.strategy === 'ROLE_BASED' && node.assignment.role && actor.roles.includes(node.assignment.role));
    const isDepartmentEligible = Boolean(targetDepartmentId && targetDepartmentId === actor.departmentId && sectionEligible);
    if (node?.assignment?.strategy === 'UNASSIGNED_TEAM_QUEUE' && node.assignment.role && !workItem.assigneeId) {
      throw new OrchestrationError('Claim this queue ticket before completing it.', 409);
    }
    if (!isAdmin && workItem.assigneeId !== actor.id && !inGroup && !isRoleEligible && !isDepartmentEligible) throw new OrchestrationError('You are not authorized to confirm this task.', 403);
    db.transaction(() => {
      if (workItem.status === 'COMPLETED') return;
      const now = new Date();
      workItem.status = 'COMPLETED'; workItem.completedAt = now.toISOString(); workItem.updatedAt = now.toISOString();
      const current = db.data.nodeInstances.find((item) => item.id === workItem.nodeInstanceId)!;
      const confirmed = node?.type === 'TASK' && output.confirmation === 'APPROVED';
      this.completeNode(instance, current, 'COMPLETED', confirmed ? 'APPROVED' : 'COMPLETED', output, now, actor);
      this.appendEvent(instance, 'WORK_ITEM_COMPLETED', actor, { workItemId: workItem.id, output }, current);
      if (node?.type === 'INFORMATION_REQUEST') {
        const existingResponses = (instance.context.informationResponses && typeof instance.context.informationResponses === 'object')
          ? instance.context.informationResponses as Record<string, unknown>
          : {};
        instance.context.informationResponses = { ...existingResponses, [node.key]: { ...output, respondedByUserId: actor.id, respondedAt: now.toISOString() } };
        this.appendEvent(instance, 'INFORMATION_SHARED', actor, { workItemId: workItem.id, response: output }, current);
        this.notify(instance, 'INFORMATION_SHARED', actor, now, current);
      }
      if (confirmed) this.appendEvent(instance, 'TASK_CONFIRMED', actor, { workItemId: workItem.id, confirmation: 'APPROVED' }, current);
      this.notify(instance, 'WORK_ITEM_COMPLETED', actor, now, current);
    });
    this.advance(instance.id, new Date(), actor);
    return this.getExecution(instance.id, actor);
  }

  public static claimWorkItem(workItemId: string, actor: BankUser) {
    const workItem = db.data.workItemsV2.find((item) => item.id === workItemId);
    if (!workItem) throw new OrchestrationError('Work item not found.', 404);
    const instance = this.requireInstance(workItem.workflowInstanceId);
    if (workItem.status === 'COMPLETED' || workItem.status === 'CANCELLED') throw new OrchestrationError('A completed or cancelled work item cannot be claimed.', 409);
    const nodeInstance = db.data.nodeInstances.find((item) => item.id === workItem.nodeInstanceId);
    const node = nodeInstance && WorkflowOrchestrationService.getVersion(instance.workflowDefinitionId, instance.workflowVersion).nodes.find((item) => item.id === nodeInstance.nodeId);
    if (node?.type === 'APPROVAL' || workItem.workType === 'APPROVAL_REQUEST') {
      throw new OrchestrationError('Approval work items must be decided through the approval action.', 409);
    }
    const isAdmin = actor.roles.some((role) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER'].includes(role));
    const targetSectionId = workItem.targetSectionId || (typeof instance.context.targetSectionId === 'string' ? instance.context.targetSectionId : undefined) || node?.assignment?.sectionId;
    const targetDepartmentId = workItem.targetDepartmentId || (typeof instance.context.targetDepartmentId === 'string' ? instance.context.targetDepartmentId : undefined) || node?.assignment?.departmentId;
    const sectionEligible = !targetSectionId || targetSectionId === actor.sectionId;
    const inGroup = Boolean(workItem.assignmentGroupId && actor.teamIds.includes(workItem.assignmentGroupId) && sectionEligible);
    const roleEligible = Boolean((node?.assignment?.role && actor.roles.includes(node.assignment.role)) || (node?.approval?.role && actor.roles.includes(node.approval.role)));
    const departmentEligible = Boolean(targetDepartmentId && targetDepartmentId === actor.departmentId && sectionEligible);
    if (!isAdmin && !inGroup && !roleEligible && !departmentEligible && workItem.assigneeId !== actor.id) throw new OrchestrationError('You are not authorized to claim this work item.', 403);
    db.transaction(() => {
      const now = new Date();
      workItem.assigneeId = actor.id;
      workItem.status = 'IN_PROGRESS';
      workItem.updatedAt = now.toISOString();
      if (nodeInstance) { nodeInstance.assigneeId = actor.id; nodeInstance.version += 1; }
      instance.context.currentAssigneeId = actor.id;
      if (node) instance.context[`${node.key}AssigneeId`] = actor.id;
      if (!instance.allowedUserIds.includes(actor.id)) instance.allowedUserIds.push(actor.id);
      this.appendEvent(instance, 'WORK_ITEM_CLAIMED', actor, { workItemId: workItem.id, assigneeId: actor.id }, nodeInstance);
      this.notify(instance, 'WORK_ITEM_CLAIMED', actor, now, nodeInstance);
    });
    return this.getExecution(instance.id, actor);
  }

  public static synchronizeApproval(chainId: string, actor: BankUser) {
    const node = db.data.nodeInstances.find((item) => item.approvalChainId === chainId);
    if (!node) throw new OrchestrationError('Approval is not linked to a workflow node.', 404);
    const instance = this.requireInstance(node.workflowInstanceId);
    const chain = db.data.approvals.find((item) => item.id === chainId)!;
    db.transaction(() => {
      if (['APPROVED', 'REJECTED'].includes(chain.status)) {
        const approvalWorkItem = node.workItemId && db.data.workItemsV2.find((item) => item.id === node.workItemId);
        if (approvalWorkItem && !['COMPLETED', 'CANCELLED'].includes(approvalWorkItem.status)) {
          approvalWorkItem.status = 'COMPLETED';
          approvalWorkItem.completedAt = new Date().toISOString();
          approvalWorkItem.updatedAt = approvalWorkItem.completedAt;
          this.appendEvent(instance, 'WORK_ITEM_COMPLETED', actor, { workItemId: approvalWorkItem.id, approvalChainId: chain.id, decision: chain.status }, node);
        }
      }
      this.appendEvent(instance, 'APPROVAL_DECIDED', actor, { approvalChainId: chain.id, status: chain.status, decisions: chain.steps.map((step) => ({ stepId: step.id, status: step.status, decisionByUserId: step.decisionByUserId, signature: step.immutableSignatureHash })) }, node);
      this.notify(instance, 'APPROVAL_DECIDED', actor, new Date(), node);
    });
    this.advance(instance.id, new Date(), actor);
    return this.getExecution(instance.id, actor);
  }

  public static addComment(instanceId: string, actor: BankUser, body: string) {
    const instance = this.requireInstance(instanceId);
    if (!this.canAccess(instance, actor, 'WRITE')) throw new OrchestrationError('You are not authorized to comment on this workflow.', 403);
    const normalized = body.trim();
    if (!normalized) throw new OrchestrationError('Comment is required.', 400);
    if (normalized.length > 5_000) throw new OrchestrationError('Comment cannot exceed 5000 characters.', 400);
    db.transaction(() => {
      this.appendEvent(instance, 'COMMENT_ADDED', actor, { body: normalized });
      this.notify(instance, 'COMMENT_ADDED', actor, new Date());
      instance.updatedAt = new Date().toISOString();
      instance.version += 1;
    });
    return this.getExecution(instance.id, actor);
  }

  public static cancel(instanceId: string, actor: BankUser, reason: string) {
    const instance = this.requireInstance(instanceId);
    if (!this.canAccess(instance, actor, 'WRITE')) throw new OrchestrationError('You are not authorized to cancel this workflow.', 403);
    if (terminalInstanceStatuses.includes(instance.status)) throw new OrchestrationError('Workflow is already in a terminal state.', 409);
    const version = WorkflowOrchestrationService.getVersion(instance.workflowDefinitionId, instance.workflowVersion);
    db.transaction(() => {
      const now = new Date();
      const completed = db.data.nodeInstances.filter((item) => item.workflowInstanceId === instance.id && item.status === 'COMPLETED').reverse();
      for (const current of completed) {
        const node = version.nodes.find((item) => item.id === current.nodeId);
        if (node?.compensation?.onCancel) {
          this.executeCompensation(instance, node, current, 'WORKFLOW_CANCELLED', now, actor);
        }
      }
      for (const current of db.data.nodeInstances.filter((item) => item.workflowInstanceId === instance.id && !terminalNodeStatuses.includes(item.status))) { current.status = 'CANCELLED'; current.completedAt = now.toISOString(); current.version += 1; }
      for (const item of db.data.workItemsV2.filter((candidate) => candidate.workflowInstanceId === instance.id && !['COMPLETED', 'CANCELLED'].includes(candidate.status))) { item.status = 'CANCELLED'; item.updatedAt = now.toISOString(); }
      instance.status = 'CANCELLED'; instance.completedAt = now.toISOString(); instance.updatedAt = now.toISOString(); instance.failureReason = reason; instance.version += 1;
      WorkflowGovernanceService.completeClocks(instance.id, now, 'CANCELLED');
      this.appendEvent(instance, 'WORKFLOW_CANCELLED', actor, { reason });
    });
    return this.getExecution(instance.id, actor);
  }

  public static migrateInstance(instanceId: string, targetVersionNumber: number, actor: BankUser) {
    if (!WorkflowOrchestrationService.canDesign(actor)) throw new OrchestrationError('Workflow designer permission is required.', 403);
    const instance = this.requireInstance(instanceId);
    if (terminalInstanceStatuses.includes(instance.status)) throw new OrchestrationError('Terminal workflow instances cannot be migrated.', 409);
    if (!this.canAccess(instance, actor, 'WRITE')) throw new OrchestrationError('You are not authorized to migrate this workflow.', 403);
    const target = WorkflowOrchestrationService.getVersion(instance.workflowDefinitionId, targetVersionNumber);
    if (target.status !== 'PUBLISHED') throw new OrchestrationError('Only a published target version can be used for migration.', 422);
    const preflight = WorkflowPreflightService.validate(target, actor);
    if (!preflight.valid) throw new OrchestrationError('Target workflow version failed preflight.', 422, preflight);
    const currentNodes = db.data.nodeInstances.filter((node) => node.workflowInstanceId === instance.id);
    const targetIds = new Set(target.nodes.map((node) => node.id));
    const incompatible = currentNodes.filter((node) => !targetIds.has(node.nodeId) && !['PENDING', 'SKIPPED'].includes(node.status));
    if (incompatible.length) throw new OrchestrationError('Target version removes nodes that have already participated in this run.', 409, incompatible.map((node) => ({ nodeId: node.nodeId, status: node.status })));
    const fromVersion = instance.workflowVersion;
    db.transaction(() => {
      for (const removed of currentNodes.filter((node) => !targetIds.has(node.nodeId))) {
        removed.status = 'SKIPPED'; removed.completedAt ||= new Date().toISOString(); removed.version += 1;
      }
      const existingIds = new Set(currentNodes.map((node) => node.nodeId));
      for (const node of target.nodes.filter((candidate) => !existingIds.has(candidate.id))) {
        db.data.nodeInstances.push({ id: `ni-${uuidv4().slice(0, 8)}`, workflowInstanceId: instance.id, nodeId: node.id, nodeKey: node.key, nodeType: node.type, stageId: node.stageId, status: 'PENDING', attemptCount: 0, logicalCompletionKey: `${instance.id}:${node.id}:complete`, version: 1 });
      }
      instance.workflowVersion = target.version;
      instance.formDefinitionId = target.formDefinitionId;
      instance.formVersion = target.formVersion;
      instance.policySetId = target.policySetId;
      instance.policySetVersion = target.policySetVersion;
      instance.updatedAt = new Date().toISOString();
      instance.version += 1;
      this.appendEvent(instance, 'INSTANCE_MIGRATED', actor, { fromVersion, toVersion: target.version, targetChecksum: target.checksum });
    });
    this.advance(instance.id, new Date(), actor);
    return this.getExecution(instance.id, actor);
  }

  public static addRelation(instanceId: string, input: { targetType: 'WORKFLOW_INSTANCE' | 'WORK_ITEM' | 'TICKET' | 'ASSET' | 'APPLICATION'; targetId: string; relationType: import('../../shared/types/orchestration.js').WorkRelationType; metadata?: Record<string, unknown> }, actor: BankUser) {
    const instance = this.requireInstance(instanceId);
    if (!this.canAccess(instance, actor, 'WRITE')) throw new OrchestrationError('You are not authorized to relate this workflow.', 403);
    const relation = db.transaction(() => {
      const created = WorkflowGovernanceService.addRelation({ sourceType: 'WORKFLOW_INSTANCE', sourceId: instance.id, targetType: input.targetType, targetId: input.targetId, relationType: input.relationType, createdByUserId: actor.id, metadata: input.metadata }, actor);
      this.appendEvent(instance, 'RELATION_CREATED', actor, { relationId: created.id, relationType: created.relationType, targetType: created.targetType, targetId: created.targetId });
      return created;
    });
    return { relation, execution: this.getExecution(instance.id, actor) };
  }

  public static requeueDeadLetter(instanceId: string, deadLetterId: string, actor: BankUser) {
    const instance = this.requireInstance(instanceId);
    if (!this.canAccess(instance, actor, 'WRITE')) throw new OrchestrationError('You are not authorized to retry this workflow action.', 403);
    const deadLetter = db.data.deadLetters.find((entry) => entry.id === deadLetterId && entry.workflowInstanceId === instance.id);
    if (!deadLetter) throw new OrchestrationError('Dead-letter record not found.', 404);
    if (deadLetter.status === 'RESOLVED') throw new OrchestrationError('This dead-letter record is already resolved.', 409);
    const node = db.data.nodeInstances.find((entry) => entry.id === deadLetter.nodeInstanceId);
    if (!node) throw new OrchestrationError('Dead-letter node instance is unavailable.', 409);
    const version = WorkflowOrchestrationService.getVersion(instance.workflowDefinitionId, instance.workflowVersion);
    const downstreamNodeIds = new Set<string>();
    let frontier = [node.nodeId];
    while (frontier.length) {
      const next = version.edges.filter((edge) => frontier.includes(edge.sourceNodeId)).map((edge) => edge.destinationNodeId).filter((id) => !downstreamNodeIds.has(id));
      for (const id of next) downstreamNodeIds.add(id);
      frontier = next;
    }
    const downstream = db.data.nodeInstances.filter((entry) => entry.workflowInstanceId === instance.id && downstreamNodeIds.has(entry.nodeId));
    const committed = downstream.filter((entry) => ['COMPLETED', 'FAILED', 'COMPENSATED'].includes(entry.status));
    if (committed.length) throw new OrchestrationError('This failed action already produced downstream effects; start a governed replay instead of requeueing it in place.', 409, committed.map((entry) => ({ nodeId: entry.nodeId, status: entry.status })));
    const now = new Date();
    db.transaction(() => {
      deadLetter.status = 'REQUEUED';
      deadLetter.retryCount += 1;
      deadLetter.lastRetriedAt = now.toISOString();
      node.status = 'READY';
      node.completedAt = undefined;
      node.outcome = undefined;
      node.error = undefined;
      node.nextAttemptAt = undefined;
      node.version += 1;
      for (const entry of downstream.filter((candidate) => candidate.status === 'SKIPPED')) {
        entry.status = 'PENDING';
        entry.completedAt = undefined;
        entry.outcome = undefined;
        entry.output = undefined;
        entry.error = undefined;
        entry.version += 1;
      }
      instance.status = 'RUNNING';
      instance.completedAt = undefined;
      instance.failureReason = undefined;
      instance.updatedAt = now.toISOString();
      instance.version += 1;
      WorkflowGovernanceService.resumeClocks(instance.id, now);
      this.appendEvent(instance, 'DEAD_LETTER_REQUEUED', actor, { deadLetterId: deadLetter.id, actionKey: deadLetter.actionKey, retryCount: deadLetter.retryCount }, node);
    });
    this.advance(instance.id, now, actor);
    return this.getExecution(instance.id, actor);
  }

  public static resumeDueInstances(now = new Date()) {
    const ids = db.data.workflowInstances.filter((item) => !terminalInstanceStatuses.includes(item.status)).map((item) => item.id);
    for (const id of ids) {
      try { this.advance(id, now); }
      catch (error) {
        const instance = db.data.workflowInstances.find((item) => item.id === id);
        if (instance) { instance.failureReason = error instanceof Error ? error.message : String(error); instance.updatedAt = now.toISOString(); db.persist(); }
      }
    }
    return ids.length;
  }

  public static listInstances(actor: BankUser) {
    return db.data.workflowInstances.filter((instance) => this.canAccess(instance, actor, 'READ')).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  public static getExecution(instanceId: string, actor: BankUser) {
    const instance = this.requireInstance(instanceId);
    if (!this.canAccess(instance, actor, 'READ')) {
      this.appendEvent(instance, 'PERMISSION_DECISION', actor, { action: 'READ', allowed: false }); db.persist();
      throw new OrchestrationError('You are not authorized to view this workflow.', 403);
    }
    const version = WorkflowOrchestrationService.getVersion(instance.workflowDefinitionId, instance.workflowVersion);
    const nodes = db.data.nodeInstances.filter((item) => item.workflowInstanceId === instance.id);
    const workItems = db.data.workItemsV2.filter((item) => item.workflowInstanceId === instance.id);
    const approvals = db.data.approvals
      .filter((item) => item.workflowInstanceId === instance.id)
      .map((chain) => ({
        ...chain,
        steps: chain.steps.map((step) => ({
          ...step,
          canDecide: ApprovalService.canUserDecideStep(chain, step, actor),
        })),
      }));
    const events = db.data.executionEvents.filter((item) => item.workflowInstanceId === instance.id).sort((left, right) => left.sequence - right.sequence);
    const comments = events.filter((event) => event.type === 'COMMENT_ADDED').map((event) => ({ id: event.id, body: String(event.data.body || ''), authorId: event.actorId, authorName: event.actorName, createdAt: event.timestamp }));
    const slaClocks = db.data.workflowSlaClocks.filter((item) => item.workflowInstanceId === instance.id);
    const relations = WorkflowGovernanceService.relationsFor(instance.id);
    const notifications = db.data.notificationDeliveries.filter((item) => item.workflowInstanceId === instance.id);
    const deadLetters = db.data.deadLetters.filter((item) => item.workflowInstanceId === instance.id);
    const stages = version.stages.map((stage) => {
      const stageNodes = nodes.filter((node) => node.stageId === stage.id && !['START', 'SUCCESS_END', 'FAILED_END', 'CANCELLED_END', 'REJECTED_END', 'PARALLEL_SPLIT', 'PARALLEL_JOIN', 'MILESTONE'].includes(node.nodeType));
      const completed = stageNodes.filter((node) => ['COMPLETED', 'SKIPPED', 'COMPENSATED'].includes(node.status)).length;
      return { ...stage, totalActivities: stageNodes.length, completedActivities: completed, progressLabel: `${completed} / ${stageNodes.length} ${stage.title} activities completed`, status: completed === stageNodes.length && stageNodes.length ? 'COMPLETED' : stage.id === instance.currentStageId ? 'CURRENT' : 'PENDING' };
    });
    const currentStage = stages.find((stage) => stage.id === instance.currentStageId);
    const blockers = workItems.filter((item) => item.status === 'BLOCKED' || (item.status !== 'COMPLETED' && nodes.find((node) => node.id === item.nodeInstanceId)?.status === 'WAITING'));
    const pendingApprovals = nodes.filter((node) => node.approvalChainId && db.data.approvals.find((chain) => chain.id === node.approvalChainId)?.status === 'PENDING');
    const participantIds = [...new Set([
      ...instance.allowedUserIds,
      ...nodes.map((node) => node.assigneeId),
      ...approvals.flatMap((approval) => approval.steps.map((step) => step.assignedApproverId)),
    ].filter(Boolean) as string[])];
    const participants = participantIds.map((id) => db.data.users.find((user) => user.id === id)).filter(Boolean).map((user) => ({ id: user!.id, fullName: user!.fullName, title: user!.title, departmentId: user!.departmentId }));
    return { instance, definition: this.publicDefinition(instance.workflowDefinitionId), pinnedVersion: { workflow: instance.workflowVersion, form: instance.formVersion, policy: instance.policySetVersion }, stages, currentStage, progress: { completed: nodes.filter((node) => ['COMPLETED', 'SKIPPED', 'COMPENSATED'].includes(node.status)).length, total: nodes.length }, blockers, pendingApprovals: pendingApprovals.length, nodes, workItems, approvals, comments, participants, slaClocks, relations, notifications, deadLetters, events };
  }

  public static analytics(actor: BankUser) {
    const instances = this.listInstances(actor);
    const completed = instances.filter((item) => item.status === 'COMPLETED');
    const durations = completed.map((item) => new Date(item.completedAt!).getTime() - new Date(item.startedAt).getTime());
    const nodes = db.data.nodeInstances.filter((node) => instances.some((instance) => instance.id === node.workflowInstanceId));
    const nodeDurations = nodes.filter((node) => node.startedAt && node.completedAt).map((node) => ({ nodeKey: node.nodeKey, durationMs: new Date(node.completedAt!).getTime() - new Date(node.startedAt!).getTime() }));
    const bottlenecks = [...new Map(nodeDurations.map((entry) => [entry.nodeKey, { nodeKey: entry.nodeKey, total: 0, count: 0 }])).values()];
    for (const item of nodeDurations) { const bucket = bottlenecks.find((entry) => entry.nodeKey === item.nodeKey)!; bucket.total += item.durationMs; bucket.count += 1; }
    const instanceIds = new Set(instances.map((item) => item.id));
    const approvals = db.data.approvals.filter((approval) => approval.workflowInstanceId && instanceIds.has(approval.workflowInstanceId));
    const approvalDecisions = approvals.flatMap((approval) => approval.steps).filter((step) => step.decisionAt);
    const approvalLatency = approvalDecisions.map((step) => Math.max(0, new Date(step.decisionAt!).getTime() - new Date(approvals.find((chain) => chain.steps.some((candidate) => candidate.id === step.id))?.createdAt || step.decisionAt!).getTime()));
    const clocks = db.data.workflowSlaClocks.filter((clock) => instanceIds.has(clock.workflowInstanceId));
    const attempts = db.data.nodeAttempts.filter((attempt) => instanceIds.has(attempt.workflowInstanceId));
    const automatedNodes = nodes.filter((node) => ['SYSTEM_ACTION', 'WEBHOOK_ACTION', 'INTEGRATION_ACTION', 'NOTIFICATION', 'CREATE_RECORD', 'SCRIPT_EXPRESSION'].includes(node.nodeType));
    const manualNodes = nodes.filter((node) => ['TASK', 'INFORMATION_REQUEST', 'APPROVAL'].includes(node.nodeType));
    const hrInstances = instances.filter((item) => item.domain === 'HR');
    const devInstances = instances.filter((item) => ['DEVOPS', 'SOFTWARE_DEVELOPMENT'].includes(item.domain));
    const successfulDeployments = attempts.filter((attempt) => attempt.status === 'SUCCEEDED' && nodes.find((node) => node.id === attempt.nodeInstanceId)?.nodeKey.includes('deploy')).length;
    const failedDeployments = attempts.filter((attempt) => attempt.status === 'FAILED' && nodes.find((node) => node.id === attempt.nodeInstanceId)?.nodeKey.includes('deploy')).length;
    return {
      workflowExecutions: instances.length,
      completionRate: instances.length ? Math.round((completed.length / instances.length) * 1000) / 10 : 0,
      averageLeadTimeMinutes: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length / 60_000) : 0,
      automationSuccessRate: attempts.length ? Math.round((attempts.filter((attempt) => attempt.status === 'SUCCEEDED').length / attempts.length) * 1000) / 10 : 100,
      pendingApprovals: approvals.filter((approval) => approval.status === 'PENDING').length,
      averageApprovalLatencyMinutes: approvalLatency.length ? Math.round(approvalLatency.reduce((sum, value) => sum + value, 0) / approvalLatency.length / 60_000) : 0,
      rejectionRate: approvalDecisions.length ? Math.round((approvalDecisions.filter((step) => step.status === 'REJECTED').length / approvalDecisions.length) * 1000) / 10 : 0,
      slaAttainmentRate: clocks.length ? Math.round((clocks.filter((clock) => clock.status !== 'BREACHED').length / clocks.length) * 1000) / 10 : 100,
      manualVsAutomated: { manualActivities: manualNodes.length, automatedActivities: automatedNodes.length },
      reworkFrequency: nodes.length ? Math.round((nodes.filter((node) => node.attemptCount > 1).length / nodes.length) * 1000) / 10 : 0,
      overdueWorkItems: db.data.workItemsV2.filter((item) => instanceIds.has(item.workflowInstanceId) && item.dueAt && new Date(item.dueAt) < new Date() && item.status !== 'COMPLETED').length,
      bottleneckNodes: bottlenecks.map((item) => ({ nodeKey: item.nodeKey, averageDurationMinutes: Math.round(item.total / item.count / 60_000), executions: item.count })).sort((left, right) => right.averageDurationMinutes - left.averageDurationMinutes).slice(0, 10),
      templateAdoption: db.data.workflowCatalogTemplates.map((template) => ({ templateId: template.id, title: template.title, runCount: template.runCount, successRate: template.successRate })).sort((left, right) => right.runCount - left.runCount),
      onboarding: {
        executions: hrInstances.filter((item) => item.workflowDefinitionId === 'wf-employee-onboarding').length,
        readyBeforeStartPercent: this.readinessMetric(hrInstances, 'wf-employee-onboarding', ['onboard-identity', 'onboard-laptop', 'onboard-facilities']),
        averageCompletionMinutes: this.averageCompletionMinutes(hrInstances.filter((item) => item.workflowDefinitionId === 'wf-employee-onboarding')),
      },
      devops: {
        executions: devInstances.length,
        averageChangeLeadTimeMinutes: this.averageCompletionMinutes(devInstances),
        failedChangeRate: successfulDeployments + failedDeployments ? Math.round((failedDeployments / (successfulDeployments + failedDeployments)) * 1000) / 10 : 0,
        rollbackRate: attempts.length ? Math.round((attempts.filter((attempt) => nodes.find((node) => node.id === attempt.nodeInstanceId)?.nodeKey.includes('rollback') && attempt.status === 'SUCCEEDED').length / Math.max(1, successfulDeployments + failedDeployments)) * 1000) / 10 : 0,
        deploymentSuccessRate: successfulDeployments + failedDeployments ? Math.round((successfulDeployments / (successfulDeployments + failedDeployments)) * 1000) / 10 : 100,
      },
    };
  }

  private static averageCompletionMinutes(instances: WorkflowInstance[]) {
    const complete = instances.filter((item) => item.completedAt);
    return complete.length ? Math.round(complete.reduce((sum, item) => sum + new Date(item.completedAt!).getTime() - new Date(item.startedAt).getTime(), 0) / complete.length / 60_000) : 0;
  }

  private static readinessMetric(instances: WorkflowInstance[], workflowDefinitionId: string, requiredNodeKeys: string[]) {
    const relevant = instances.filter((item) => item.workflowDefinitionId === workflowDefinitionId);
    if (!relevant.length) return 0;
    const ready = relevant.filter((instance) => requiredNodeKeys.every((key) => db.data.nodeInstances.some((node) => node.workflowInstanceId === instance.id && node.nodeKey === key && node.status === 'COMPLETED'))).length;
    return Math.round((ready / relevant.length) * 1000) / 10;
  }

  private static canAccess(instance: WorkflowInstance, actor: BankUser, action: 'READ' | 'WRITE') {
    if (!actor.isActive) return false;
    if (actor.roles.some((role) => ['PLATFORM_ADMIN', 'CISO', 'AUDITOR'].includes(role))) return action === 'READ' || !actor.roles.includes('AUDITOR');
    if (instance.requesterId === actor.id || instance.ownerId === actor.id || instance.allowedUserIds.includes(actor.id)) return true;
    if (instance.allowedRoleIds.some((role) => actor.roles.includes(role))) return true;
    if (instance.allowedDepartmentIds.includes(actor.departmentId)) return true;
    const version = WorkflowOrchestrationService.getVersion(instance.workflowDefinitionId, instance.workflowVersion);
    const assigned = db.data.nodeInstances.some((node) => {
      if (node.workflowInstanceId !== instance.id || node.assigneeId === actor.id) return node.workflowInstanceId === instance.id && node.assigneeId === actor.id;
      if (!node.assignmentGroupId || !actor.teamIds.includes(node.assignmentGroupId)) return false;
      const definitionNode = version.nodes.find((candidate) => candidate.id === node.nodeId);
      return !definitionNode?.assignment?.sectionId || definitionNode.assignment.sectionId === actor.sectionId;
    });
    const assignedByRole = db.data.nodeInstances.some((node) => {
      if (node.workflowInstanceId !== instance.id || !['WAITING', 'READY', 'RUNNING'].includes(node.status)) return false;
      const definitionNode = version.nodes.find((candidate) => candidate.id === node.nodeId);
      return Boolean(definitionNode?.assignment?.role && actor.roles.includes(definitionNode.assignment.role));
    });
    const isApprover = db.data.nodeInstances.some((node) => node.workflowInstanceId === instance.id && node.approvalChainId && db.data.approvals.find((chain) => chain.id === node.approvalChainId)?.steps.some((step) => step.assignedApproverId === actor.id || step.candidateUserIds?.includes(actor.id) || (step.requiredRole && actor.roles.includes(step.requiredRole))));
    if (isApprover) return true;
    if (!assigned && !assignedByRole) return false;
    return instance.confidentiality !== 'HIGHLY_RESTRICTED_HR_LEGAL' || actor.roles.some((role) => ['HR_ADMIN', 'DEPARTMENT_MANAGER'].includes(role));
  }

  private static appendEvent(instance: WorkflowInstance, type: ExecutionEvent['type'], actor: BankUser | undefined, data: Record<string, unknown>, node?: NodeInstance) {
    const prior = [...db.data.executionEvents].filter((item) => item.workflowInstanceId === instance.id).sort((left, right) => right.sequence - left.sequence)[0];
    const timestamp = new Date().toISOString();
    const sequence = (prior?.sequence || 0) + 1;
    const eventActor = actor || this.systemActor();
    const payload = JSON.stringify({ sequence, workflowInstanceId: instance.id, nodeInstanceId: node?.id, type, actorId: eventActor.id, timestamp, data, previousHash: prior?.hash || '' });
    const event: ExecutionEvent = { id: `evt-${uuidv4()}`, sequence, workflowInstanceId: instance.id, nodeInstanceId: node?.id, type, actorId: eventActor.id, actorName: eventActor.fullName, timestamp, data, previousHash: prior?.hash, hash: `sha256-${crypto.createHash('sha256').update(payload).digest('hex')}` };
    db.data.executionEvents.push(event);
    return event;
  }

  private static notify(instance: WorkflowInstance, eventType: string, actor: BankUser | undefined, now: Date, node?: NodeInstance) {
    const delivery = WorkflowGovernanceService.dispatchNotification(instance, eventType, undefined, now);
    this.appendEvent(instance, 'NOTIFICATION_DISPATCHED', actor, { deliveryId: delivery.id, eventType, status: delivery.status }, node);
    return delivery;
  }

  private static requireInstance(id: string) {
    const instance = db.data.workflowInstances.find((item) => item.id === id);
    if (!instance) throw new OrchestrationError('Workflow instance not found.', 404);
    return instance;
  }

  private static systemActor() {
    return db.data.users.find((user) => user.roles.includes('PLATFORM_ADMIN')) || db.data.users[0];
  }

  private static publicDefinition(id: string) {
    const definition = WorkflowOrchestrationService.getDefinition(id);
    return { id: definition.id, key: definition.key, name: definition.name, description: definition.description, domain: definition.domain, iconName: definition.iconName };
  }
}
