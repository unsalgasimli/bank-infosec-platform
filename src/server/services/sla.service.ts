import { Ticket, TechnicalSeverity } from '../../shared/types/ticket.js';
import { SLAPolicy, SLACalculationResult } from '../../shared/types/sla.js';
import { db } from '../db/database.js';

export class SLAService {
  /**
   * Recalculate SLA countdown, elapsed minutes, and state for a ticket.
   */
  public static calculateSLA(ticket: Ticket): SLACalculationResult {
    const policy = db.data.slaPolicies.find((p) => p.id === ticket.slaPolicyId) || db.data.slaPolicies[0];
    const thresholds = policy.thresholds[ticket.technicalSeverity] || policy.thresholds['MEDIUM'];

    const createdAt = new Date(ticket.createdAt).getTime();
    const now = Date.now();

    // If ticket is already closed or remediated
    if (ticket.statusCategory === 'DONE' || ticket.statusCategory === 'CANCELLED') {
      return {
        policyId: policy.id,
        state: 'MET',
        acknowledgmentDeadline: new Date(createdAt + thresholds.acknowledgmentMinutes * 60000).toISOString(),
        remediationDeadline: ticket.remediationDeadline,
        resolutionDeadline: ticket.dueDate,
        remainingMinutes: 0,
        elapsedMinutes: Math.floor((now - createdAt) / 60000),
        isPaused: false,
      };
    }

    // Check if current workflow state pauses SLA
    const workflow = db.data.workflows.find((w) => w.id === ticket.workflowId);
    const currentState = workflow?.states.find((s) => s.id === ticket.statusId);
    const isPaused = currentState?.isPausedSLA || ticket.slaState === 'PAUSED';

    const deadlineMs = new Date(ticket.remediationDeadline).getTime();
    const remainingMs = deadlineMs - now;
    const remainingMinutes = Math.round(remainingMs / 60000);
    const totalAllowedMinutes = thresholds.remediationMinutes;
    const elapsedMinutes = Math.floor((now - createdAt) / 60000);

    let state: 'SAFE' | 'AT_RISK' | 'BREACHED' | 'PAUSED' | 'MET' = 'SAFE';

    if (isPaused) {
      state = 'PAUSED';
    } else if (remainingMinutes <= 0) {
      state = 'BREACHED';
    } else if (remainingMinutes <= totalAllowedMinutes * 0.25 || remainingMinutes <= 120) {
      state = 'AT_RISK';
    } else {
      state = 'SAFE';
    }

    return {
      policyId: policy.id,
      state,
      acknowledgmentDeadline: new Date(createdAt + thresholds.acknowledgmentMinutes * 60000).toISOString(),
      remediationDeadline: ticket.remediationDeadline,
      resolutionDeadline: ticket.dueDate,
      remainingMinutes: Math.max(0, remainingMinutes),
      elapsedMinutes,
      isPaused,
      pausedReason: currentState?.pauseReason || ticket.slaPausedReason,
    };
  }

  /**
   * Automatically refresh SLA statuses across all active tickets.
   */
  public static refreshAllTicketSLAs(): void {
    let changed = false;
    for (const ticket of db.data.tickets) {
      if (ticket.statusCategory !== 'DONE' && ticket.statusCategory !== 'CANCELLED') {
        const sla = SLAService.calculateSLA(ticket);
        if (ticket.slaState !== sla.state || ticket.slaRemainingMinutes !== sla.remainingMinutes) {
          ticket.slaState = sla.state;
          ticket.slaRemainingMinutes = sla.remainingMinutes;
          ticket.slaPausedReason = sla.pausedReason;
          changed = true;
        }
      }
    }
    if (changed) {
      db.persist();
    }
  }
}
