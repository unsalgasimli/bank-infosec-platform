import { Ticket } from '../../shared/types/ticket.js';
import { AutomationTrigger, AutomationRule, AutomationAction } from '../../shared/types/automation.js';
import { BankUser } from '../../shared/types/auth.js';
import { db } from '../db/database.js';
import { AuditService } from './audit.service.js';

export class AutomationService {
  private static recursionDepthMap = new Map<string, number>();

  /**
   * Evaluates active automation rules against a triggered event and applies matching actions.
   * Enforces loop prevention and logs execution results.
   */
  public static triggerEvent(
    trigger: AutomationTrigger,
    ticket: Ticket,
    actor?: BankUser
  ): { executedRules: string[] } {
    const depthKey = `${ticket.id}:${trigger}`;
    const currentDepth = this.recursionDepthMap.get(depthKey) || 0;

    if (currentDepth >= 5) {
      console.warn(`[Automation Engine] Loop prevention tripped: max recursion depth reached for ${depthKey}`);
      return { executedRules: [] };
    }

    this.recursionDepthMap.set(depthKey, currentDepth + 1);

    const executedRules: string[] = [];
    const activeRules = (db.data.automationRules || []).filter((r) => r.isActive && r.trigger === trigger);

    try {
      for (const rule of activeRules) {
        if (AutomationService.evaluateConditions(rule, ticket)) {
          AutomationService.executeActions(rule, ticket, actor || db.data.users[0]);
          rule.executionCount = (rule.executionCount || 0) + 1;
          rule.lastExecutedAt = new Date().toISOString();
          executedRules.push(rule.name);
        }
      }

      if (executedRules.length > 0) {
        db.persist();
      }
    } finally {
      this.recursionDepthMap.set(depthKey, Math.max(0, (this.recursionDepthMap.get(depthKey) || 1) - 1));
    }

    return { executedRules };
  }

  private static evaluateConditions(rule: AutomationRule, ticket: Ticket): boolean {
    return rule.conditions.every((cond) => {
      const actualValue = (ticket as any)[cond.field];

      switch (cond.operator) {
        case 'EQUALS':
          return String(actualValue ?? '').toLowerCase() === String(cond.value ?? '').toLowerCase();
        case 'NOT_EQUALS':
          return String(actualValue ?? '').toLowerCase() !== String(cond.value ?? '').toLowerCase();
        case 'IN':
          return Array.isArray(cond.value) && cond.value.includes(actualValue);
        case 'NOT_IN':
          return Array.isArray(cond.value) && !cond.value.includes(actualValue);
        case 'CONTAINS':
          return String(actualValue ?? '').toLowerCase().includes(String(cond.value ?? '').toLowerCase());
        case 'STARTS_WITH':
          return String(actualValue ?? '').toLowerCase().startsWith(String(cond.value ?? '').toLowerCase());
        case 'GREATER_THAN':
          return Number(actualValue) > Number(cond.value);
        case 'LESS_THAN':
          return Number(actualValue) < Number(cond.value);
        case 'IS_EMPTY':
          return actualValue === undefined || actualValue === null || String(actualValue).trim() === '';
        case 'IS_NOT_EMPTY':
          return actualValue !== undefined && actualValue !== null && String(actualValue).trim() !== '';
        default:
          return true;
      }
    });
  }

  private static executeActions(rule: AutomationRule, ticket: Ticket, actor: BankUser): void {
    for (const action of rule.actions) {
      switch (action.type) {
        case 'SET_PRIORITY':
          if (action.payload.priority) {
            ticket.businessPriority = action.payload.priority;
          }
          break;
        case 'SET_SEVERITY':
          if (action.payload.severity) {
            ticket.technicalSeverity = action.payload.severity;
          }
          break;
        case 'ASSIGN_USER':
          if (action.payload.userId && !ticket.assigneeId) {
            ticket.assigneeId = action.payload.userId;
            ticket.assignedAt = new Date().toISOString();
          }
          break;
        case 'ASSIGN_TEAM':
          if (action.payload.teamId) {
            ticket.teamId = action.payload.teamId;
            ticket.assignmentGroupId = action.payload.teamId;
          }
          break;
        case 'ADD_TAG':
          if (action.payload.tag && !ticket.tags.includes(action.payload.tag)) {
            ticket.tags.push(action.payload.tag);
          }
          break;
        case 'ADD_WATCHER':
          if (action.payload.userId && !ticket.watcherIds.includes(action.payload.userId)) {
            ticket.watcherIds.push(action.payload.userId);
          }
          break;
        case 'ESCALATE_TO_CISO': {
          const cisoUser = db.data.users?.find((u) => u.roles?.includes('CISO'));
          if (cisoUser && !ticket.watcherIds.includes(cisoUser.id)) {
            ticket.watcherIds.push(cisoUser.id);
          }
          ticket.businessPriority = 'P1_URGENT';
          break;
        }
        case 'ADD_INTERNAL_NOTE':
          if (action.payload.note) {
            db.data.comments.unshift({
              id: `comm-${Date.now()}`,
              ticketId: ticket.id,
              authorId: actor.id,
              authorName: 'AegisSec Automation Engine',
              authorRole: 'AUTOMATION_BOT',
              content: action.payload.note,
              visibility: 'SECURITY_TEAM_ONLY',
              confidentiality: ticket.confidentiality,
              mentions: [],
              createdAt: new Date().toISOString(),
              isEdited: false,
              reactions: [],
            });
          }
          break;
        case 'CREATE_SUBTASK':
          if (action.payload.title) {
            db.data.ticketTasks.push({
              id: `task-${Date.now()}`,
              ticketId: ticket.id,
              title: action.payload.title,
              description: action.payload.description,
              status: 'TO_DO',
              dependencyTaskIds: [],
              createdByUserId: actor.id,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
          break;
        case 'PAUSE_SLA':
          ticket.slaState = 'PAUSED';
          ticket.slaPausedReason = action.payload.reason || 'Paused by automation rule';
          break;
        case 'RESUME_SLA':
          if (ticket.slaState === 'PAUSED') {
            ticket.slaState = 'SAFE';
            ticket.slaPausedReason = undefined;
          }
          break;
      }
    }

    AuditService.log({
      actor,
      action: 'TICKET_UPDATED',
      entityType: 'TICKET',
      entityId: ticket.id,
      entityKey: ticket.key,
      metadata: { automationRuleId: rule.id, automationRuleName: rule.name },
    });
  }
}
