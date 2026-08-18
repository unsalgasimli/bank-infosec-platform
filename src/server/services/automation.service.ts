import { Ticket } from '../../shared/types/ticket.js';
import { AutomationTrigger, AutomationRule } from '../../shared/types/automation.js';
import { BankUser } from '../../shared/types/auth.js';
import { db } from '../db/database.js';
import { AuditService } from './audit.service.js';

export class AutomationService {
  /**
   * Evaluates active automation rules against a triggered event and applies matching actions.
   */
  public static triggerEvent(
    trigger: AutomationTrigger,
    ticket: Ticket,
    actor?: BankUser
  ): { executedRules: string[] } {
    const executedRules: string[] = [];

    const activeRules = (db.data.automationRules || []).filter((r) => r.isActive && r.trigger === trigger);

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

    return { executedRules };
  }

  private static evaluateConditions(rule: AutomationRule, ticket: Ticket): boolean {
    return rule.conditions.every((cond) => {
      const actualValue = (ticket as any)[cond.field];
      if (actualValue === undefined) return false;

      switch (cond.operator) {
        case 'EQUALS':
          return String(actualValue).toLowerCase() === String(cond.value).toLowerCase();
        case 'NOT_EQUALS':
          return String(actualValue).toLowerCase() !== String(cond.value).toLowerCase();
        case 'IN':
          return Array.isArray(cond.value) && cond.value.includes(actualValue);
        case 'NOT_IN':
          return Array.isArray(cond.value) && !cond.value.includes(actualValue);
        case 'CONTAINS':
          return String(actualValue).toLowerCase().includes(String(cond.value).toLowerCase());
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
        case 'ASSIGN_USER':
          if (action.payload.userId) {
            ticket.assigneeId = action.payload.userId;
            ticket.assignedAt = new Date().toISOString();
          }
          break;
        case 'ASSIGN_TEAM':
          if (action.payload.teamId) {
            ticket.teamId = action.payload.teamId;
          }
          break;
        case 'ADD_TAG':
          if (action.payload.tag && !ticket.tags.includes(action.payload.tag)) {
            ticket.tags.push(action.payload.tag);
          }
          break;
        case 'ESCALATE_TO_CISO':
          if (!ticket.watcherIds.includes('usr-ciso')) {
            ticket.watcherIds.push('usr-ciso');
          }
          ticket.businessPriority = 'P1_URGENT';
          break;
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
