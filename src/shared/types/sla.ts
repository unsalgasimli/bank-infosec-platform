import { TechnicalSeverity } from './ticket.js';

export interface SLAMetricThresholds {
  acknowledgmentMinutes: number;
  firstResponseMinutes: number;
  remediationMinutes: number;
  resolutionMinutes: number;
}

export interface SLAPolicy {
  id: string;
  name: string;
  description: string;
  isActive?: boolean;
  isDefault: boolean;
  businessHoursOnly: boolean;
  businessStartTime: string; // "09:00"
  businessEndTime: string;   // "18:00"
  timezone: string;
  excludeWeekends: boolean;
  excludeHolidays: boolean;
  thresholds: Record<TechnicalSeverity, SLAMetricThresholds>;
  createdAt?: string;
  updatedAt?: string;
}

export interface SLACalculationResult {
  policyId: string;
  state: 'SAFE' | 'AT_RISK' | 'BREACHED' | 'PAUSED' | 'MET';
  acknowledgmentDeadline: string;
  remediationDeadline: string;
  resolutionDeadline: string;
  remainingMinutes: number;
  elapsedMinutes: number;
  isPaused: boolean;
  pausedReason?: string;
  pausedAt?: string;
}
