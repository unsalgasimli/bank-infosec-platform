import { Ticket, TechnicalSeverity } from '../../shared/types/ticket.js';
import { SLAPolicy, SLACalculationResult } from '../../shared/types/sla.js';
import { BusinessCalendarConfig, TicketSLAInstance } from '../../shared/types/itsm.js';
import { db } from '../db/database.js';
import { AutomationService } from './automation.service.js';

export class SLAService {
  /**
   * Default Banking 8x5 Business Calendar
   */
  public static defaultBusinessCalendar: BusinessCalendarConfig = {
    id: 'cal-bank-8x5',
    name: 'Banking Core Working Hours (8x5)',
    timezone: 'UTC',
    workdays: [1, 2, 3, 4, 5], // Monday - Friday
    startHour: 9, // 09:00
    endHour: 18, // 18:00
    holidays: ['2026-01-01', '2026-12-25'],
    is24x7: false,
  };

  /**
   * Calculate future deadline taking business hours into account (or 24x7 for emergency).
   */
  public static calculateBusinessDeadline(
    start: Date,
    durationMinutes: number,
    calendar: BusinessCalendarConfig = SLAService.defaultBusinessCalendar
  ): Date {
    if (calendar.is24x7) {
      return new Date(start.getTime() + durationMinutes * 60000);
    }

    let remainingMinutes = durationMinutes;
    let current = new Date(start);

    while (remainingMinutes > 0) {
      const dayOfWeek = current.getUTCDay();
      const isWorkday = calendar.workdays.includes(dayOfWeek);
      const dateStr = current.toISOString().slice(0, 10);
      const isHoliday = calendar.holidays.includes(dateStr);

      if (!isWorkday || isHoliday) {
        // Advance to next day 09:00 UTC
        current.setUTCDate(current.getUTCDate() + 1);
        current.setUTCHours(calendar.startHour, 0, 0, 0);
        continue;
      }

      const currentHour = current.getUTCHours();
      const currentMinute = current.getUTCMinutes();

      if (currentHour < calendar.startHour) {
        current.setUTCHours(calendar.startHour, 0, 0, 0);
        continue;
      }

      if (currentHour >= calendar.endHour) {
        current.setUTCDate(current.getUTCDate() + 1);
        current.setUTCHours(calendar.startHour, 0, 0, 0);
        continue;
      }

      // Minutes left in today's business window
      const minutesLeftToday = (calendar.endHour - currentHour) * 60 - currentMinute;
      if (remainingMinutes <= minutesLeftToday) {
        current.setUTCMinutes(current.getUTCMinutes() + remainingMinutes);
        remainingMinutes = 0;
      } else {
        remainingMinutes -= minutesLeftToday;
        current.setUTCDate(current.getUTCDate() + 1);
        current.setUTCHours(calendar.startHour, 0, 0, 0);
      }
    }

    return current;
  }

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

    // Check warning threshold triggers (e.g. 50%, 75%, 90% consumption)
    const consumptionPercent = Math.min(100, Math.round((elapsedMinutes / totalAllowedMinutes) * 100));
    if (consumptionPercent >= 75 && state === 'AT_RISK') {
      AutomationService.triggerEvent('SLA_WARNING_THRESHOLD', ticket);
    } else if (state === 'BREACHED') {
      AutomationService.triggerEvent('SLA_BREACHED', ticket);
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
