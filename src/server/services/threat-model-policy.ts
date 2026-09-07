import { z } from 'zod';
import type { BankUser } from '../../shared/types/auth.js';
import { canonicalJson } from '../../shared/canonical-json.js';

export const exceptionLimits = { CRITICAL: 7, HIGH: 30, MEDIUM: 90, LOW: 180 } as const;
export const reviewMonths = { 0: 24, 1: 12, 2: 12, 3: 6 } as const;
export const screeningRuleSchema = z.object({
  signal: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,63}$/),
  reason: z.string().trim().min(1).max(500),
  weight: z.number().int().min(0).max(100),
  minimumTier: z.number().int().min(0).max(3),
}).strict();
export type ScreeningRule = z.infer<typeof screeningRuleSchema>;
export const screeningRules: ScreeningRule[] = [
  ...['paymentRelated', 'financialTransactions', 'authenticationChange', 'iamPamRelated', 'cryptography', 'bankSecrecy', 'sensitivePersonalData', 'privilegedCapability', 'criticalInfrastructure', 'coreBankingRelated', 'criticalThirdParty', 'highValueBusinessLogic'].map(signal => ({ signal, reason: `Critical security capability: ${signal}`, weight: 10, minimumTier: 3 })),
  ...['internetExposed', 'customerData', 'confidentialData', 'authorizationChange', 'externalApi', 'trustBoundary', 'thirdPartyIntegration', 'cloudDeployment', 'newDataStore', 'secretsHandling', 'materialArchitectureChange', 'highCriticalAsset', 'securityIncidentDriven', 'criticalVulnerability', 'aiIntegration', 'newMobileFunctionality', 'newMessageBroker'].map(signal => ({ signal, reason: `Security impact: ${signal}`, weight: 5, minimumTier: 2 })),
  { signal: 'internalChange', reason: 'Internal application/change requires lite analysis', weight: 1, minimumTier: 1 },
];

/** Directory-backed security roles, deliberately excluding platform administration. */
export const securityReviewer = (actor: BankUser): boolean => !actor.roles.includes('AUDITOR') && actor.roles.some(role => ['CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'APPSEC_ANALYST'].includes(role));
export const seniorRiskAuthority = (actor: BankUser): boolean => !actor.roles.includes('AUDITOR') && actor.roles.includes('CISO');

/** Descriptive changes and observation timestamps are not security architecture changes. */
export function hasMaterialSecurityChange(fields: string[]): boolean {
  const material = new Set(['scope','relatedAssetIds','businessCriticality','typeId','environment','criticality','details','network','networkInterfaces','storage','relationships','hosting','authentication','authorization','dataClassification','internetExposed','trustBoundary','cryptography','thirdPartyIntegration','operatingSystem','osVersion','hostname','fqdn','ipAddress','classification']);
  const harmlessDetails=new Set(['description','notes','displayName','tags','lastObservedAt','lastSeenAt','lastSyncAt','updatedAt']);
  return fields.some(field => material.has(field) || /^(network|security|identity|relationships|hosting)\./.test(field) || field.startsWith('details.')&&!harmlessDetails.has(field.split('.')[1]));
}

/** Preserve exact changed metadata paths; unknown detail fields remain conservatively material. */
export function threatMaterialChangeFields(changes:{field:string;oldValue:unknown;newValue:unknown}[]):string[]{
  return changes.flatMap(change=>{
    if(change.field!=='details')return [change.field];
    const before=change.oldValue,after=change.newValue;
    if(!before||!after||typeof before!=='object'||typeof after!=='object'||Array.isArray(before)||Array.isArray(after))return ['details'];
    return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().filter(key=>canonicalJson((before as Record<string,unknown>)[key]??null)!==canonicalJson((after as Record<string,unknown>)[key]??null)).map(key=>`details.${key}`);
  });
}

export function evaluateScreening(answers: Record<string, unknown>, rules: ScreeningRule[], thresholds = { 1: 1, 2: 5, 3: 20 }) {
  if (!rules.length) throw new Error('Screening rules are required.');
  for (const rule of rules) if (typeof answers[rule.signal] !== 'boolean') throw new Error(`Screening answer required: ${rule.signal}.`);
  const triggered = rules.filter(rule => answers[rule.signal] === true);
  const score = triggered.reduce((sum, rule) => sum + rule.weight, 0);
  const hardMinimum = Math.max(0, ...triggered.map(rule => rule.minimumTier));
  const tier = Math.max(hardMinimum, score >= thresholds[3] ? 3 : score >= thresholds[2] ? 2 : score >= thresholds[1] ? 1 : 0);
  return { tier, score, hardMinimum, triggeredConditions: triggered.map(rule => ({ signal: rule.signal, reason: rule.reason, weight: rule.weight, minimumTier: rule.minimumTier })) };
}

export function assertExceptionDecision(current: string, decision: string, expiresAt: string, now = new Date()) {
  const allowed: Record<string, string[]> = { REQUESTED: ['APPROVED', 'REJECTED'], UNDER_REVIEW: ['APPROVED', 'REJECTED'], APPROVED: ['REVOKED'] };
  if (!allowed[current]?.includes(decision)) throw new Error('Invalid exception transition; renewal requires a new assessment and approval.');
  if (decision === 'APPROVED' && (!Number.isFinite(Date.parse(expiresAt)) || new Date(expiresAt) <= now)) throw new Error('Expired risk acceptance cannot be approved.');
}

export function nextReviewDate(tier: number, now = new Date(), configuredMonths?: number): string {
  const maximum = reviewMonths[tier as keyof typeof reviewMonths];
  const months = configuredMonths === undefined ? maximum : Math.min(maximum, configuredMonths);
  if (!months) throw new Error('Invalid screening tier.');
  const result = new Date(now);
  const day = result.getUTCDate();
  result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result.toISOString();
}
