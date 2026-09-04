import type { RiskRating } from './types/ticket.js';

/** Canonical enterprise 5x5 matrix, shared by risk registration and AppSec. */
export function riskRating(score: number): RiskRating {
  if (!Number.isInteger(score) || score < 1 || score > 25) throw new Error('Risk score must be an integer from 1 to 25.');
  return score >= 16 ? 'CRITICAL' : score >= 10 ? 'HIGH' : score >= 5 ? 'MEDIUM' : 'LOW';
}
