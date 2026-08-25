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
   * Ensure default and generalized banking enterprise SLA policies are installed.
   */
  public static ensurePoliciesInstalled(): boolean {
    db.data.slaPolicies ||= [];
    let changed = false;

    const standardPolicies: SLAPolicy[] = [
      {
        id: 'sla-standard-business',
        name: 'Standard Business SLA (8x5)',
        description: 'Default operational turnaround for general requests and tasks during bank business hours (09:00-18:00 UTC+4).',
        isDefault: true,
        businessHoursOnly: true,
        businessStartTime: '09:00',
        businessEndTime: '18:00',
        timezone: 'Asia/Baku',
        excludeWeekends: true,
        excludeHolidays: true,
        thresholds: {
          CRITICAL: { acknowledgmentMinutes: 30, firstResponseMinutes: 60, remediationMinutes: 480, resolutionMinutes: 960 },
          HIGH: { acknowledgmentMinutes: 60, firstResponseMinutes: 120, remediationMinutes: 960, resolutionMinutes: 1440 },
          MEDIUM: { acknowledgmentMinutes: 120, firstResponseMinutes: 240, remediationMinutes: 2400, resolutionMinutes: 3360 },
          LOW: { acknowledgmentMinutes: 240, firstResponseMinutes: 480, remediationMinutes: 4800, resolutionMinutes: 6720 },
          INFORMATIONAL: { acknowledgmentMinutes: 480, firstResponseMinutes: 960, remediationMinutes: 9600, resolutionMinutes: 14400 },
        },
      },
      {
        id: 'sla-critical-24x7',
        name: 'Critical 24/7 (Emergency Outage)',
        description: 'Round-the-clock emergency response for critical system outages, major incidents, and urgent escalations.',
        isDefault: false,
        businessHoursOnly: false,
        businessStartTime: '00:00',
        businessEndTime: '23:59',
        timezone: 'Asia/Baku',
        excludeWeekends: false,
        excludeHolidays: false,
        thresholds: {
          CRITICAL: { acknowledgmentMinutes: 15, firstResponseMinutes: 15, remediationMinutes: 120, resolutionMinutes: 240 },
          HIGH: { acknowledgmentMinutes: 30, firstResponseMinutes: 30, remediationMinutes: 240, resolutionMinutes: 480 },
          MEDIUM: { acknowledgmentMinutes: 60, firstResponseMinutes: 120, remediationMinutes: 720, resolutionMinutes: 1440 },
          LOW: { acknowledgmentMinutes: 120, firstResponseMinutes: 240, remediationMinutes: 1440, resolutionMinutes: 2880 },
          INFORMATIONAL: { acknowledgmentMinutes: 240, firstResponseMinutes: 480, remediationMinutes: 2880, resolutionMinutes: 4320 },
        },
      },
      {
        id: 'sla-it-service-desk',
        name: 'IT Support & Workplace Services',
        description: 'SLA for user workstations, equipment provisioning, software licenses, and help desk requests.',
        isDefault: false,
        businessHoursOnly: true,
        businessStartTime: '09:00',
        businessEndTime: '18:00',
        timezone: 'Asia/Baku',
        excludeWeekends: true,
        excludeHolidays: true,
        thresholds: {
          CRITICAL: { acknowledgmentMinutes: 30, firstResponseMinutes: 60, remediationMinutes: 240, resolutionMinutes: 480 },
          HIGH: { acknowledgmentMinutes: 60, firstResponseMinutes: 120, remediationMinutes: 480, resolutionMinutes: 960 },
          MEDIUM: { acknowledgmentMinutes: 120, firstResponseMinutes: 240, remediationMinutes: 960, resolutionMinutes: 1440 },
          LOW: { acknowledgmentMinutes: 240, firstResponseMinutes: 480, remediationMinutes: 1920, resolutionMinutes: 2880 },
          INFORMATIONAL: { acknowledgmentMinutes: 480, firstResponseMinutes: 960, remediationMinutes: 2880, resolutionMinutes: 4320 },
        },
      },
      {
        id: 'sla-project-change',
        name: 'Project & Change Management',
        description: 'SLA for planned application releases, infrastructure changes, and project milestones.',
        isDefault: false,
        businessHoursOnly: true,
        businessStartTime: '09:00',
        businessEndTime: '18:00',
        timezone: 'Asia/Baku',
        excludeWeekends: true,
        excludeHolidays: true,
        thresholds: {
          CRITICAL: { acknowledgmentMinutes: 60, firstResponseMinutes: 120, remediationMinutes: 480, resolutionMinutes: 960 },
          HIGH: { acknowledgmentMinutes: 120, firstResponseMinutes: 240, remediationMinutes: 1440, resolutionMinutes: 2400 },
          MEDIUM: { acknowledgmentMinutes: 240, firstResponseMinutes: 480, remediationMinutes: 3360, resolutionMinutes: 4800 },
          LOW: { acknowledgmentMinutes: 480, firstResponseMinutes: 960, remediationMinutes: 6720, resolutionMinutes: 9600 },
          INFORMATIONAL: { acknowledgmentMinutes: 960, firstResponseMinutes: 1440, remediationMinutes: 14400, resolutionMinutes: 21600 },
        },
      },
      {
        id: 'sla-compliance-audit',
        name: 'Compliance, Legal & Audit Review',
        description: 'SLA for regulatory reporting, compliance sign-offs, legal reviews and audit findings.',
        isDefault: false,
        businessHoursOnly: true,
        businessStartTime: '09:00',
        businessEndTime: '18:00',
        timezone: 'Asia/Baku',
        excludeWeekends: true,
        excludeHolidays: true,
        thresholds: {
          CRITICAL: { acknowledgmentMinutes: 60, firstResponseMinutes: 120, remediationMinutes: 960, resolutionMinutes: 1440 },
          HIGH: { acknowledgmentMinutes: 120, firstResponseMinutes: 240, remediationMinutes: 2400, resolutionMinutes: 3360 },
          MEDIUM: { acknowledgmentMinutes: 240, firstResponseMinutes: 480, remediationMinutes: 4800, resolutionMinutes: 6720 },
          LOW: { acknowledgmentMinutes: 480, firstResponseMinutes: 960, remediationMinutes: 9600, resolutionMinutes: 14400 },
          INFORMATIONAL: { acknowledgmentMinutes: 960, firstResponseMinutes: 1440, remediationMinutes: 19200, resolutionMinutes: 28800 },
        },
      },
      {
        id: 'sla-security-infosec',
        name: 'Security & Vulnerability Remediation',
        description: 'SLA for security vulnerability remediation, exception approvals, and penetration testing findings.',
        isDefault: false,
        businessHoursOnly: false,
        businessStartTime: '00:00',
        businessEndTime: '23:59',
        timezone: 'Asia/Baku',
        excludeWeekends: false,
        excludeHolidays: false,
        thresholds: {
          CRITICAL: { acknowledgmentMinutes: 15, firstResponseMinutes: 30, remediationMinutes: 1440, resolutionMinutes: 2880 },
          HIGH: { acknowledgmentMinutes: 60, firstResponseMinutes: 120, remediationMinutes: 10080, resolutionMinutes: 14400 },
          MEDIUM: { acknowledgmentMinutes: 120, firstResponseMinutes: 240, remediationMinutes: 43200, resolutionMinutes: 64800 },
          LOW: { acknowledgmentMinutes: 240, firstResponseMinutes: 480, remediationMinutes: 129600, resolutionMinutes: 172800 },
          INFORMATIONAL: { acknowledgmentMinutes: 480, firstResponseMinutes: 960, remediationMinutes: 259200, resolutionMinutes: 259200 },
        },
      },
    ];

    for (const policy of standardPolicies) {
      const existing = db.data.slaPolicies.find((item) => item.id === policy.id);
      if (!existing) {
        db.data.slaPolicies.push(policy);
        changed = true;
      }
    }

    return changed;
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
