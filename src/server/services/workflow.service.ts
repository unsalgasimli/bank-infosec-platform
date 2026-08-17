import { Ticket } from '../../shared/types/ticket.js';
import { BankUser } from '../../shared/types/auth.js';
import { Workflow, WorkflowTransition, WorkflowState } from '../../shared/types/workflow.js';
import { db } from '../db/database.js';
import { AuditService } from './audit.service.js';
import { SLAService } from './sla.service.js';

export class WorkflowService {
  public static getWorkflowById(workflowId: string): Workflow | undefined {
    return db.data.workflows.find((w) => w.id === workflowId);
  }

  public static getAvailableTransitions(ticket: Ticket, user: BankUser): WorkflowTransition[] {
    const workflow = WorkflowService.getWorkflowById(ticket.workflowId);
    if (!workflow) return [];

    const transitions = workflow.transitions.filter((t) => t.fromStateId === ticket.statusId);

    // Platform Admin and CISO can execute any transition
    if (user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO')) {
      return transitions;
    }

    // Filter by allowed roles
    return transitions.filter((t) => {
      return t.allowedRoles.some((role) => user.roles.includes(role));
    });
  }

  /**
   * Execute a state machine transition with validation and audit logging.
   */
  public static executeTransition(params: {
    ticketId: string;
    transitionId: string;
    user: BankUser;
    comment?: string;
    requiredFieldUpdates?: Record<string, any>;
  }): { success: boolean; ticket?: Ticket; error?: string } {
    const { ticketId, transitionId, user, comment, requiredFieldUpdates } = params;

    const ticketIndex = db.data.tickets.findIndex((t) => t.id === ticketId);
    if (ticketIndex === -1) {
      return { success: false, error: 'Ticket not found.' };
    }

    const ticket = db.data.tickets[ticketIndex];
    const workflow = WorkflowService.getWorkflowById(ticket.workflowId);
    if (!workflow) {
      return { success: false, error: 'Workflow not found for this ticket.' };
    }

    const transition = workflow.transitions.find((t) => t.id === transitionId);
    if (!transition) {
      return { success: false, error: 'Invalid transition ID.' };
    }

    if (transition.fromStateId !== ticket.statusId) {
      return {
        success: false,
        error: `Cannot transition from current state (${ticket.statusId}) using transition ${transition.name}.`,
      };
    }

    // Role verification
    const isSuper = user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO');
    const hasRole = transition.allowedRoles.some((r) => user.roles.includes(r));
    if (!isSuper && !hasRole) {
      return {
        success: false,
        error: `User does not have any of the required roles: ${transition.allowedRoles.join(', ')}`,
      };
    }

    // Comment requirement
    if (transition.requireComment && (!comment || comment.trim().length === 0)) {
      return { success: false, error: 'A comment is mandatory for this transition.' };
    }

    // Evidence requirement
    if (transition.requireEvidence) {
      const attachments = db.data.attachments.filter((a) => a.ticketId === ticket.id);
      if (attachments.length === 0) {
        return {
          success: false,
          error: 'Security evidence or test report attachment is mandatory before submitting for retest.',
        };
      }
    }

    const targetState = workflow.states.find((s) => s.id === transition.toStateId);
    if (!targetState) {
      return { success: false, error: 'Target workflow state not found.' };
    }

    const oldStatusId = ticket.statusId;
    const oldStatusName = ticket.statusName;

    // Apply updates
    ticket.statusId = targetState.id;
    ticket.statusName = targetState.name;
    ticket.statusCategory = targetState.category;
    ticket.updatedAt = new Date().toISOString();
    ticket.version += 1;

    if (requiredFieldUpdates) {
      Object.assign(ticket, requiredFieldUpdates);
    }

    if (targetState.category === 'DONE') {
      ticket.resolvedAt = new Date().toISOString();
      ticket.slaState = 'MET';
    }

    // Recalculate SLA
    const sla = SLAService.calculateSLA(ticket);
    ticket.slaState = sla.state;
    ticket.slaRemainingMinutes = sla.remainingMinutes;
    ticket.slaPausedReason = sla.pausedReason;

    // Add comment if provided
    if (comment && comment.trim().length > 0) {
      db.data.comments.unshift({
        id: `comm-${Date.now()}`,
        ticketId: ticket.id,
        authorId: user.id,
        authorName: user.fullName,
        authorRole: user.roles[0] || 'ANALYST',
        authorAvatar: user.avatarUrl,
        content: `[Status changed to ${targetState.name}] ${comment}`,
        visibility: 'PUBLIC',
        confidentiality: ticket.confidentiality,
        mentions: [],
        createdAt: new Date().toISOString(),
        isEdited: false,
        reactions: [],
      });
    }

    // Audit event
    AuditService.log({
      actor: user,
      action: 'STATUS_TRANSITIONED',
      entityType: 'TICKET',
      entityId: ticket.id,
      entityKey: ticket.key,
      fieldChanges: [
        { field: 'statusId', oldValue: oldStatusId, newValue: targetState.id },
        { field: 'statusName', oldValue: oldStatusName, newValue: targetState.name },
      ],
      metadata: { transitionName: transition.name, comment },
    });

    db.persist();
    return { success: true, ticket };
  }
}
