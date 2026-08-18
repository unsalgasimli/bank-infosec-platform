import { Ticket, TechnicalSeverity } from '../../shared/types/ticket.js';
import { SLAPolicy, SLACalculationResult } from '../../shared/types/sla.js';
import { db } from '../db/database.js';

export class SLAService {
  /**
   * Recalculate SLA countdown, elapsed minutes, and state for a ticket.
   */
  public static calculateSLA(ticket: Ticket): SLACalculationResult {
    const defaultThreshold = {
      acknowledgmentMinutes: 60,
      firstResponseMinutes: 120,
      remediationMinutes: 1440,
      resolutionMinutes: 2880,
    };

    const policies = db.data.slaPolicies || [];
    const policy = policies.find((p) => p.id === ticket.slaPolicyId) || policies[0] || {
      id: 'sla-p1-emergency',
      thresholds: {
        CRITICAL: { acknowledgmentMinutes: 15, firstResponseMinutes: 15, remediationMinutes: 120, resolutionMinutes: 120 },
        HIGH: { acknowledgmentMinutes: 30, firstResponseMinutes: 60, remediationMinutes: 1440, resolutionMinutes: 2880 },
        MEDIUM: { acknowledgmentMinutes: 60, firstResponseMinutes: 240, remediationMinutes: 4320, resolutionMinutes: 10080 },
        LOW: { acknowledgmentMinutes: 120, firstResponseMinutes: 480, remediationMinutes: 10080, resolutionMinutes: 20160 },
        INFORMATIONAL: { acknowledgmentMinutes: 240, firstResponseMinutes: 1440, remediationMinutes: 20160, resolutionMinutes: 43200 },
      },
    };

    const thresholds = policy?.thresholds
      ? policy.thresholds[ticket.technicalSeverity] || policy.thresholds['MEDIUM'] || defaultThreshold
      : defaultThreshold;

    const createdAt = new Date(ticket.createdAt || Date.now()).getTime();
    const now = Date.now();

    // If ticket is already closed or remediated
    if (ticket.statusCategory === 'DONE' || ticket.statusCategory === 'CANCELLED') {
      return {
        policyId: policy?.id || 'default-sla',
        state: 'MET',
        acknowledgmentDeadline: new Date(createdAt + thresholds.acknowledgmentMinutes * 60000).toISOString(),
        remediationDeadline: ticket.remediationDeadline || new Date().toISOString(),
        resolutionDeadline: ticket.dueDate || new Date().toISOString(),
        remainingMinutes: 0,
        elapsedMinutes: Math.floor((now - createdAt) / 60000),
        isPaused: false,
      };
    }

    // Check if current workflow state pauses SLA
    const workflows = db.data.workflows || [];
    const workflow = workflows.find((w) => w.id === ticket.workflowId) || workflows[0];
    const currentState = workflow?.states?.find((s) => s.id === ticket.statusId);
    const isPaused = currentState?.isPausedSLA || ticket.slaState === 'PAUSED';

    const deadlineMs = new Date(ticket.remediationDeadline || createdAt + thresholds.remediationMinutes * 60000).getTime();
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
      policyId: policy?.id || 'default-sla',
      state,
      acknowledgmentDeadline: new Date(createdAt + thresholds.acknowledgmentMinutes * 60000).toISOString(),
      remediationDeadline: ticket.remediationDeadline || new Date(deadlineMs).toISOString(),
      resolutionDeadline: ticket.dueDate || new Date(createdAt + thresholds.resolutionMinutes * 60000).toISOString(),
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
    for (const ticket of (db.data.tickets || [])) {
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
