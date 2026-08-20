import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import type { BankRole, BankUser, SecurityDomain } from '../../shared/types/auth.js';
import type {
  BlueprintTaskTemplate,
  DependencyEdgeType,
  GraphDependencyEdge,
  GraphNodeDefinition,
  GraphNodeType,
  ProjectBlueprint,
  WorkflowRun,
} from '../../shared/types/blueprints.js';
import type { BusinessPriority, TechnicalSeverity, Ticket, TicketCategory, TicketProjectCode } from '../../shared/types/ticket.js';
import type { TicketApprovalChain, ApprovalStep, ApprovalMode } from '../../shared/types/approval.js';
import { db } from '../db/database.js';
import { AuditService } from './audit.service.js';
import { AutomationService } from './automation.service.js';
import { SLAService } from './sla.service.js';
import { TicketLifecycleService } from './ticket-lifecycle.service.js';
import { WorkflowTemplateError } from './workflow-template.service.js';

export interface GraphValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  nodeCount: number;
  edgeCount: number;
  criticalPathDays: number;
}

export class GraphOrchestratorService {
  /**
   * Pre-flight Graph Validation Engine
   * Validates cycles, unreachable nodes, dead ends, join topology, and routing viability before launch.
   */
  public static validateGraph(
    nodes: Array<GraphNodeDefinition | BlueprintTaskTemplate>,
    edges: GraphDependencyEdge[] = [],
    actor?: BankUser
  ): GraphValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!nodes || nodes.length === 0) {
      return {
        isValid: false,
        errors: ['Workflow graph must contain at least one node.'],
        warnings: [],
        nodeCount: 0,
        edgeCount: 0,
        criticalPathDays: 0,
      };
    }

    // Normalize node IDs and map
    const nodeIds = new Set<string>();
    const normalizedNodes: GraphNodeDefinition[] = nodes.map((node, index) => {
      const id = node.id || `node-${index + 1}`;
      nodeIds.add(id);
      return {
        ...node,
        id,
        type: (node as any).nodeType || (node as any).type || 'TASK',
      } as GraphNodeDefinition;
    });

    if (nodeIds.size !== nodes.length) {
      errors.push('Workflow graph contains duplicate node IDs.');
    }

    // Build Adjacency List for Dependency Graph
    const outgoingEdges = new Map<string, Array<{ to: string; edge: GraphDependencyEdge }>>();
    const incomingEdges = new Map<string, Array<{ from: string; edge: GraphDependencyEdge }>>();
    for (const id of nodeIds) {
      outgoingEdges.set(id, []);
      incomingEdges.set(id, []);
    }

    // Normalize explicit edges + legacy dependsOnTaskId / dependsOnIndex
    const allEdges: GraphDependencyEdge[] = [...edges];
    nodes.forEach((node, index) => {
      const currentNodeId = node.id || `node-${index + 1}`;
      const legacyDep = (node as any).dependsOnTaskId ||
        ((node as any).dependsOnIndex != null ? (nodes[(node as any).dependsOnIndex]?.id || `node-${(node as any).dependsOnIndex + 1}`) : undefined);
      
      if (legacyDep && !allEdges.some((e) => e.toNodeId === currentNodeId && e.fromNodeId === legacyDep)) {
        allEdges.push({
          id: `edge-legacy-${index}`,
          fromNodeId: legacyDep,
          toNodeId: currentNodeId,
          type: (node as any).dependencyType || 'FINISH_TO_START',
          lagDays: (node as any).lagDays || 0,
        });
      }
    });

    for (const edge of allEdges) {
      if (!nodeIds.has(edge.fromNodeId)) {
        errors.push(`Dependency references non-existent predecessor node "${edge.fromNodeId}".`);
      }
      if (!nodeIds.has(edge.toNodeId)) {
        errors.push(`Dependency references non-existent successor node "${edge.toNodeId}".`);
      }
      if (edge.fromNodeId === edge.toNodeId) {
        errors.push(`Node "${edge.fromNodeId}" cannot depend on itself.`);
      }
      if (nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId)) {
        outgoingEdges.get(edge.fromNodeId)!.push({ to: edge.toNodeId, edge });
        incomingEdges.get(edge.toNodeId)!.push({ from: edge.fromNodeId, edge });
      }
    }

    // 1. Cycle Detection (Tarjan / DFS)
    const visiting = new Set<string>();
    const visited = new Set<string>();
    let cycleFound = false;

    const detectCycles = (currentId: string, path: string[]) => {
      if (visiting.has(currentId)) {
        cycleFound = true;
        const cyclePath = [...path, currentId].join(' → ');
        errors.push(`Dependency cycle detected: ${cyclePath}`);
        return;
      }
      if (visited.has(currentId)) return;

      visiting.add(currentId);
      path.push(currentId);

      const nextNodes = outgoingEdges.get(currentId) || [];
      for (const { to } of nextNodes) {
        detectCycles(to, [...path]);
      }

      visiting.delete(currentId);
      visited.add(currentId);
    };

    for (const id of nodeIds) {
      if (!visited.has(id)) {
        detectCycles(id, []);
      }
    }

    // 2. Topology & Parallel Split / Join validation
    for (const node of normalizedNodes) {
      const inc = incomingEdges.get(node.id) || [];
      const out = outgoingEdges.get(node.id) || [];

      if (node.type === 'PARALLEL_SPLIT' && out.length < 2) {
        warnings.push(`Parallel Split node "${node.title}" should connect to at least 2 branches.`);
      }
      if (node.type === 'PARALLEL_JOIN' && inc.length < 2) {
        warnings.push(`Parallel Join node "${node.title}" should synchronize at least 2 predecessor branches.`);
      }
      if (node.type === 'CONDITION' && out.length < 2) {
        warnings.push(`Condition node "${node.title}" should have both True and False branches.`);
      }

      // 3. Routing & Assignee Validation for Task / Approval nodes
      if (node.type === 'TASK' || node.type === 'APPROVAL') {
        const deptId = node.targetDepartment || (actor?.departmentId);
        const dept = deptId ? db.data.departments.find((d) => d.id === deptId && d.isActive !== false) : undefined;
        
        if (node.targetDepartment && !dept) {
          errors.push(`Node "${node.title}" references an inactive or missing department.`);
        }

        if (node.teamId && dept) {
          const team = db.data.teams.find((t) => t.id === node.teamId && t.departmentId === dept.id);
          if (!team) {
            errors.push(`Node "${node.title}" references a team outside its assigned department.`);
          }
        }

        if (node.assigneeId) {
          const user = db.data.users.find((u) => u.id === node.assigneeId && u.isActive);
          if (!user) {
            errors.push(`Task "${node.title}" specifies an assignee who does not exist or is inactive.`);
          } else if (
            dept &&
            user.departmentId !== dept.id &&
            !user.roles.includes('PLATFORM_ADMIN') &&
            !user.roles.includes('CISO') &&
            !user.roles.includes('INFOSEC_ADMIN')
          ) {
            errors.push(`Task "${node.title}" has an explicit assignee who is inactive or outside ${dept.name}.`);
          }
        }
      }
    }

    // 4. Calculate Critical Path Duration (Days) if no cycles
    let maxDays = 0;
    if (errors.length === 0) {
      const durations = new Map<string, number>();
      for (const node of normalizedNodes) {
        durations.set(node.id, (node.durationDays || 1) + (node.offsetDays || 0));
      }

      const memoDist = new Map<string, number>();
      const getLongestPath = (nodeId: string): number => {
        if (memoDist.has(nodeId)) return memoDist.get(nodeId)!;
        const base = durations.get(nodeId) || 1;
        const successors = outgoingEdges.get(nodeId) || [];
        if (successors.length === 0) {
          memoDist.set(nodeId, base);
          return base;
        }
        let maxSucc = 0;
        for (const { to, edge } of successors) {
          const lag = edge.lagDays || 0;
          maxSucc = Math.max(maxSucc, lag + getLongestPath(to));
        }
        const total = base + maxSucc;
        memoDist.set(nodeId, total);
        return total;
      };

      for (const id of nodeIds) {
        maxDays = Math.max(maxDays, getLongestPath(id));
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      nodeCount: normalizedNodes.length,
      edgeCount: allEdges.length,
      criticalPathDays: maxDays,
    };
  }

  /**
   * Orchestrates and launches a multi-node workflow graph.
   * Executes atomic creation of tickets, approval chains, SLA instances, and dependency links.
   */
  public static launchGraph(params: {
    title: string;
    description: string;
    templateId?: string;
    templateVersion?: number;
    nodes: Array<GraphNodeDefinition | BlueprintTaskTemplate>;
    edges?: GraphDependencyEdge[];
    parameters?: Record<string, string>;
    projectCode?: TicketProjectCode;
    workflowId?: string;
    slaPolicyId?: string;
    actor: BankUser;
    idempotencyKey?: string;
  }) {
    const {
      title,
      description,
      templateId,
      templateVersion,
      nodes,
      edges = [],
      parameters = {},
      projectCode = 'SEC',
      workflowId,
      slaPolicyId: fallbackSlaPolicyId,
      actor,
      idempotencyKey,
    } = params;

    // 1. Pre-flight Validation
    const validation = this.validateGraph(nodes, edges, actor);
    if (!validation.isValid) {
      throw new WorkflowTemplateError(
        `Graph validation failed: ${validation.errors.join(' | ')}`,
        422,
        { errors: validation.errors, warnings: validation.warnings }
      );
    }

    // 2. Idempotency Check
    if (idempotencyKey) {
      const priorRun = (db.data.workflowRuns || []).find(
        (run) => run.idempotencyKey === idempotencyKey && run.createdByUserId === actor.id
      );
      if (priorRun) {
        const tickets = priorRun.createdTicketIds
          .map((id) => db.data.tickets.find((t) => t.id === id))
          .filter((t): t is Ticket => Boolean(t));
        return {
          run: priorRun,
          tickets,
          approvals: [],
          dependencies: [],
          replayed: true,
        };
      }
    }

    const now = new Date().toISOString();
    const year = new Date().getUTCFullYear();
    const activeWorkflow = db.data.workflows.find((w) => w.id === workflowId && w.isActive !== false) ||
      db.data.workflows.find((w) => w.isActive !== false) ||
      db.data.workflows[0];

    if (!activeWorkflow) {
      throw new WorkflowTemplateError('No active ticket workflow is configured in the system.', 422);
    }

    const initialStatus = activeWorkflow.states.find((s) => s.isInitial) || activeWorkflow.states[0];
    const defaultSlaPolicy = db.data.slaPolicies.find((p) => p.isDefault) || db.data.slaPolicies[0];

    let sequence = (db.data.tickets || []).reduce((highest, ticket) => {
      const match = ticket.key.match(new RegExp(`^${projectCode}-${year}-(\\d+)$`));
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);

    const createdTickets: Ticket[] = [];
    const createdApprovals: TicketApprovalChain[] = [];
    const createdGanttDependencies: any[] = [];
    const nodeIdToTicketId = new Map<string, string>();
    const subjectParam = parameters.subject?.trim();

    const runId = `run-${uuidv4().substring(0, 8)}`;

    // Normalize all edges
    const allEdges: GraphDependencyEdge[] = [...edges];
    nodes.forEach((node, idx) => {
      const cId = node.id || `node-${idx + 1}`;
      const legDep = (node as any).dependsOnTaskId ||
        ((node as any).dependsOnIndex != null ? (nodes[(node as any).dependsOnIndex]?.id || `node-${(node as any).dependsOnIndex + 1}`) : undefined);
      if (legDep && !allEdges.some((e) => e.toNodeId === cId && e.fromNodeId === legDep)) {
        allEdges.push({
          id: `edge-${uuidv4().substring(0, 8)}`,
          fromNodeId: legDep,
          toNodeId: cId,
          type: (node as any).dependencyType || 'FINISH_TO_START',
          lagDays: (node as any).lagDays || 0,
        });
      }
    });

    // 3. Resolve & Instantiate Nodes
    for (let i = 0; i < nodes.length; i++) {
      const rawNode = nodes[i];
      const nodeId = rawNode.id || `node-${i + 1}`;
      const nodeType: GraphNodeType = (rawNode as any).nodeType || (rawNode as any).type || 'TASK';
      const nodeTitle = rawNode.title || `Step ${i + 1}`;

      // Resolve Target Department
      const deptId = rawNode.targetDepartment || actor.departmentId || db.data.departments[0]?.id;
      const dept = db.data.departments.find((d) => d.id === deptId && d.isActive !== false) || db.data.departments[0];

      // Resolve Team
      const team = rawNode.teamId ? db.data.teams.find((t) => t.id === rawNode.teamId && t.departmentId === dept.id) : undefined;

      // Resolve Assignee
      const eligibleUsers = db.data.users.filter((u) => u.isActive && (u.departmentId === dept.id || u.roles.some((r) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN'].includes(r))) && (!team || u.teamIds.includes(team.id)));
      let resolvedAssignee = rawNode.assigneeId ? eligibleUsers.find((u) => u.id === rawNode.assigneeId) : undefined;
      
      if (!resolvedAssignee && rawNode.assigneeRole) {
        resolvedAssignee = eligibleUsers.find((u) => u.roles.includes(rawNode.assigneeRole as BankRole));
      }

      sequence += 1;
      const ticketId = `tick-${uuidv4().substring(0, 8)}`;
      nodeIdToTicketId.set(nodeId, ticketId);

      const assignedSlaPolicyId = rawNode.slaPolicyId || fallbackSlaPolicyId || defaultSlaPolicy?.id || 'sla-p1-emergency';
      const severity = rawNode.technicalSeverity || 'MEDIUM';
      const priority = rawNode.businessPriority || 'P2_HIGH';
      const category: TicketCategory = rawNode.category || 'SECURITY_REVIEW';
      const deadlines = TicketLifecycleService.calculateSlaDeadlines(assignedSlaPolicyId, severity, now);

      // Build Ticket Record
      const ticket: Ticket = {
        id: ticketId,
        key: `${projectCode}-${year}-${String(sequence).padStart(4, '0')}`,
        projectCode,
        ticketTypeId: category,
        ticketTypeName: category.replaceAll('_', ' '),
        type: category === 'INCIDENT' ? 'INCIDENT' : category === 'VULNERABILITY' ? 'VULNERABILITY' : 'SERVICE_REQUEST',
        intakeChannel: 'PORTAL',
        category,
        securityDomain: rawNode.securityDomain || team?.securityDomain || 'GENERAL_INFOSEC',
        title: subjectParam ? `[${subjectParam}] ${nodeTitle}` : nodeTitle,
        description: `${rawNode.description || nodeTitle}\n\nWorkflow Orchestration: ${title}${subjectParam ? `\nContext: ${subjectParam}` : ''}`,
        statusId: initialStatus.id,
        statusName: initialStatus.name,
        statusCategory: initialStatus.category,
        workflowId: activeWorkflow.id,
        workflowVersion: activeWorkflow.version,
        technicalSeverity: severity,
        businessPriority: priority,
        businessImpact: 'SIGNIFICANT',
        urgency: 'MEDIUM',
        inherentRisk: severity === 'CRITICAL' ? 'CRITICAL' : severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
        residualRisk: 'LOW',
        riskScore: severity === 'CRITICAL' ? 90 : severity === 'HIGH' ? 70 : 50,
        confidentiality: 'RESTRICTED',
        reporterId: actor.id,
        requesterId: actor.id,
        assigneeId: resolvedAssignee ? resolvedAssignee.id : undefined,
        assignedAt: resolvedAssignee ? now : undefined,
        assignmentGroupId: team?.id,
        teamId: team?.id,
        ownerId: actor.id,
        securityOwnerId: actor.id,
        departmentId: dept.id,
        targetDepartmentId: dept.id,
        watcherIds: resolvedAssignee ? Array.from(new Set([actor.id, resolvedAssignee.id])) : [actor.id],
        participantIds: resolvedAssignee ? [actor.id, resolvedAssignee.id] : [actor.id],
        customFields: [],
        createdAt: now,
        updatedAt: now,
        detectedAt: now,
        dueDate: deadlines.resolutionDeadline,
        remediationDeadline: deadlines.remediationDeadline,
        slaPolicyId: assignedSlaPolicyId,
        slaState: 'SAFE',
        version: 1,
        tags: Array.from(new Set([...(rawNode.tags || []), 'WORKFLOW_RUN', nodeType])),
        graphNodeId: nodeId,
        workflowRunId: runId,
      };

      const slaCalc = SLAService.calculateSLA(ticket);
      ticket.slaState = slaCalc.state;
      ticket.slaRemainingMinutes = slaCalc.remainingMinutes;

      createdTickets.push(ticket);

      // Handle Approval Gate Nodes
      if (nodeType === 'APPROVAL') {
        const approvalMode: ApprovalMode = (rawNode as any).approvalMode || 'ANY_ONE';
        const approver = resolvedAssignee || eligibleUsers.find((u) => u.roles.includes('CISO') || u.roles.includes('INFOSEC_ADMIN') || u.roles.includes('DEPARTMENT_ADMIN')) || eligibleUsers[0] || db.data.users[0];
        const approvalChain: TicketApprovalChain = {
          id: `appr-${uuidv4().substring(0, 8)}`,
          ticketId: ticket.id,
          title: `Gate Authorization: ${nodeTitle}`,
          status: 'PENDING',
          createdAt: now,
          mode: approvalMode,
          steps: [
            {
              id: `step-${uuidv4().substring(0, 8)}`,
              stepNumber: 1,
              name: nodeTitle,
              assignedApproverId: approver.id,
              assignedApproverName: approver.fullName,
              requiredRole: (rawNode as any).assigneeRole as BankRole,
              status: 'PENDING',
              isMandatory: true,
            },
          ],
        };
        createdApprovals.push(approvalChain);
        db.data.approvals.push(approvalChain);
      }
    }

    // 4. Create Dependency Edges
    for (const edge of allEdges) {
      const fromTicketId = nodeIdToTicketId.get(edge.fromNodeId);
      const toTicketId = nodeIdToTicketId.get(edge.toNodeId);
      if (fromTicketId && toTicketId) {
        const depId = `dep-${uuidv4().substring(0, 8)}`;
        const ganttDep = {
          id: depId,
          fromTaskId: fromTicketId,
          toTaskId: toTicketId,
          type: edge.type || 'FINISH_TO_START',
          lagDays: edge.lagDays || 0,
        };
        createdGanttDependencies.push(ganttDep);
        db.data.ganttDependencies.push(ganttDep);

        // Also add to ticket relationships
        db.data.ticketRelationships.push({
          id: `rel-${uuidv4().substring(0, 8)}`,
          sourceTicketId: fromTicketId,
          targetTicketId: toTicketId,
          type: 'BLOCKS',
          createdByUserId: actor.id,
          createdAt: now,
          note: `Graph dependency: ${edge.type}`,
        });
      }
    }

    // 5. Build WorkflowRun Record
    const run: WorkflowRun = {
      id: runId,
      templateId: templateId?.startsWith('custom-') ? undefined : templateId,
      templateVersion: templateVersion || 1,
      title: subjectParam ? `${title}: ${subjectParam}` : title,
      status: 'COMPLETED',
      idempotencyKey,
      parameters,
      createdTicketIds: createdTickets.map((t) => t.id),
      createdApprovalIds: createdApprovals.map((a) => a.id),
      dependencyEdges: allEdges,
      createdByUserId: actor.id,
      createdAt: now,
    };

    db.data.tickets.unshift(...createdTickets);
    db.data.workflowRuns ||= [];
    db.data.workflowRuns.push(run);

    // Initialize SLA clocks & audit events
    for (const ticket of createdTickets) {
      TicketLifecycleService.initializeSlaMetrics(ticket);
      AuditService.log({
        actor,
        action: 'TICKET_CREATED',
        entityType: 'TICKET',
        entityId: ticket.id,
        entityKey: ticket.key,
        metadata: {
          workflowRunId: run.id,
          templateId,
          graphNodeId: ticket.graphNodeId,
          assigneeId: ticket.assigneeId,
        },
      });
      AutomationService.triggerEvent('TICKET_CREATED', ticket, actor);
    }

    db.persist();

    return {
      run,
      tickets: createdTickets,
      approvals: createdApprovals,
      dependencies: createdGanttDependencies,
      replayed: false,
    };
  }
}
