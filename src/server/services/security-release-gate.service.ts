import type { SecurityReleaseGateResult } from '../../shared/types/threat-model.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config/index.js';

export interface ReleaseGateState {
  applicable: boolean;
  threatModel?: { status: string; currentRevisionId?: string; approvedRevisionId?: string };
  threats: Array<{ id: string; key: string; inherentScore: number; status: string; residualScore?: number }>;
  controls: Array<{ id: string; title: string; status: string; requiredBeforeRelease: boolean; implementationTicketStatus?: string }>;
  verifications: Array<{ controlId: string; result: string; evidenceIds?: string[]; expiresAt?: string }>;
  approvals: Array<{ stage: string; decision: string }>;
  exceptions: Array<{ threatId: string; status: string; expiresAt: string }>;
  releaseBlockingSeverities?: string[];
  requiredApprovalStages?: string[];
}

/** A deterministic server-side policy evaluator. Controllers must never use UI state to allow release. */
export function evaluateSecurityReleaseGate(state: ReleaseGateState, now = new Date()): SecurityReleaseGateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!state.applicable) return { allowed: true, blockers, warnings, evaluatedAt: now.toISOString(), evidenceSnapshot: { applicable: false } };
  const model = state.threatModel;
  if (!model) blockers.push('Threat Model required but missing.');
  else {
    if (model.status !== 'APPROVED') blockers.push(`Threat Model status is ${model.status}, not APPROVED.`);
    if (!model.currentRevisionId || model.currentRevisionId !== model.approvedRevisionId) blockers.push('Current Threat Model revision is not the approved revision.');
  }
  const releaseBlockingSeverities = state.releaseBlockingSeverities?.length ? state.releaseBlockingSeverities : ['CRITICAL', 'HIGH'];
  for (const threat of state.threats) {
    if (threat.status === 'CLOSED' || threat.status === 'MITIGATED') continue;
    const severity = threat.inherentScore >= 16 ? 'CRITICAL' : threat.inherentScore >= 10 ? 'HIGH' : threat.inherentScore >= 5 ? 'MEDIUM' : 'LOW';
    if (severity === 'CRITICAL' && releaseBlockingSeverities.includes(severity)) blockers.push(`${threat.key}: unresolved critical threat.`);
    else if (severity === 'HIGH' && releaseBlockingSeverities.includes(severity)) {
      const accepted = state.exceptions.some((exception) => exception.threatId === threat.id && exception.status === 'APPROVED' && new Date(exception.expiresAt) > now);
      if (!accepted) blockers.push(`${threat.key}: unresolved high threat without a valid risk acceptance.`);
      else warnings.push(`${threat.key}: release relies on an approved time-bound exception.`);
    } else if (releaseBlockingSeverities.includes(severity)) blockers.push(`${threat.key}: unresolved ${severity.toLowerCase()} threat is release-blocking by policy.`);
  }
  for (const control of state.controls.filter((item) => item.requiredBeforeRelease)) {
    const verification = state.verifications.find((item) => item.controlId === control.id);
    if (control.status !== 'VERIFIED') blockers.push(`${control.title}: required control is not verified.`);
    if (!verification) blockers.push(`${control.title}: required verification is missing.`);
    else if (verification.result !== 'PASS') blockers.push(`${control.title}: verification result is ${verification.result}.`);
    else if (!verification.evidenceIds?.length) blockers.push(`${control.title}: passing verification has no linked evidence.`);
    else if (verification.expiresAt && new Date(verification.expiresAt) <= now) blockers.push(`${control.title}: verification has expired.`);
    if (control.implementationTicketStatus === 'CANCELLED') blockers.push(`${control.title}: required remediation ticket was cancelled.`);
  }
  for (const stage of state.requiredApprovalStages?.length ? state.requiredApprovalStages : ['APPSEC', 'SECURITY_ARCHITECTURE']) {
    if (!state.approvals.some((approval) => approval.stage === stage && approval.decision === 'APPROVED')) blockers.push(`Required ${stage} approval is missing.`);
  }
  for (const exception of state.exceptions) if (exception.status === 'APPROVED' && new Date(exception.expiresAt) <= now) blockers.push(`Risk acceptance for ${exception.threatId} has expired.`);
  return { allowed: blockers.length === 0, blockers, warnings, evaluatedAt: now.toISOString(), evidenceSnapshot: { threatCount: state.threats.length, requiredControlCount: state.controls.filter((item) => item.requiredBeforeRelease).length, approvalStages: state.approvals.filter((item) => item.decision === 'APPROVED').map((item) => item.stage), releaseBlockingSeverities, requiredApprovalStages: state.requiredApprovalStages?.length ? state.requiredApprovalStages : ['APPSEC', 'SECURITY_ARCHITECTURE'] } };
}

type ReleaseAuthorizationPayload = { modelId: string; revisionId: string; releaseId: string; expiresAt: string };

/** Opaque HMAC authorization consumed by the synchronous workflow runtime. */
export function issueReleaseAuthorization(payload: ReleaseAuthorizationPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', config.JWT_SECRET).update(`aegissec:release-gate:${encoded}`).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyReleaseAuthorization(token: unknown, expected: { modelId: string; releaseId: string }): ReleaseAuthorizationPayload {
  if (typeof token !== 'string' || !token.includes('.')) throw new Error('A server-issued security release authorization is required.');
  const [encoded, signature] = token.split('.', 2);
  if (!encoded || !signature) throw new Error('Security release authorization is malformed.');
  const expectedSignature = createHmac('sha256', config.JWT_SECRET).update(`aegissec:release-gate:${encoded}`).digest('base64url');
  const supplied = Buffer.from(signature); const actual = Buffer.from(expectedSignature);
  if (supplied.length !== actual.length || !timingSafeEqual(supplied, actual)) throw new Error('Security release authorization signature is invalid.');
  let payload: ReleaseAuthorizationPayload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ReleaseAuthorizationPayload; } catch { throw new Error('Security release authorization payload is invalid.'); }
  if (payload.modelId !== expected.modelId || payload.releaseId !== expected.releaseId) throw new Error('Security release authorization does not match this Threat Model and release.');
  if (!payload.revisionId || Number.isNaN(Date.parse(payload.expiresAt)) || new Date(payload.expiresAt) <= new Date()) throw new Error('Security release authorization has expired.');
  return payload;
}
