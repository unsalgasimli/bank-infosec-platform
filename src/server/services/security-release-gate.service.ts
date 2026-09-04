import type { SecurityReleaseGateResult } from '../../shared/types/threat-model.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config/index.js';
import { riskRating } from '../../shared/risk-matrix.js';

export interface ReleaseGateState {
  applicable: boolean;
  threatModel?: { status: string; currentRevisionId?: string; approvedRevisionId?: string; nextReviewAt?: string; screeningComplete?: boolean; snapshotPresent?: boolean; architectureVersion?: number };
  threats: Array<{ id: string; key: string; inherentScore: number; status: string; residualScore?: number; contentVersion?: number }>;
  controls: Array<{ id: string; threatId?: string; threatIds?: string[]; scopeVersion?: number; title: string; status: string; requiredBeforeRelease: boolean; implementationTicketStatus?: string }>;
  verifications: Array<{ controlId: string; controlScopeVersion?: number; result: string; evidenceIds?: string[]; expiresAt?: string }>;
  approvals: Array<{ stage: string; decision: string }>;
  exceptions: Array<{ threatId: string; status: string; expiresAt: string; threatContentVersion?: number; architectureVersion?: number }>;
  releaseBlockingSeverities?: string[];
  requiredApprovalStages?: string[];
  requirementBlockers?: string[];
  invalidEvidenceIds?: string[];
}

/** A deterministic server-side policy evaluator. Controllers must never use UI state to allow release. */
export function evaluateSecurityReleaseGate(state: ReleaseGateState, now = new Date()): SecurityReleaseGateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!state.applicable) return { securityGate: 'PASS', allowed: true, blockers, warnings, evaluatedAt: now.toISOString(), evidenceSnapshot: { applicable: false } };
  const model = state.threatModel;
  const architectureMatches=(exception:ReleaseGateState['exceptions'][number])=>model?.architectureVersion===undefined||exception.architectureVersion===model.architectureVersion;
  if (!model) blockers.push('Threat Model required but missing.');
  else {
    if (model.status !== 'APPROVED') blockers.push(`Threat Model status is ${model.status}, not APPROVED.`);
    if (!model.currentRevisionId || model.currentRevisionId !== model.approvedRevisionId) blockers.push('Current Threat Model revision is not the approved revision.');
    if (model.nextReviewAt && (!Number.isFinite(Date.parse(model.nextReviewAt)) || new Date(model.nextReviewAt) <= now)) blockers.push('Periodic Threat Model review is overdue.');
    if (model.screeningComplete === false) blockers.push('Current revision requires security impact screening.');
    if (model.snapshotPresent === false) blockers.push('Immutable approval snapshot is missing; legacy approval requires revalidation.');
  }
  blockers.push(...(state.requirementBlockers || []));
  if (state.invalidEvidenceIds?.length) blockers.push('Required evidence is missing, unretained or not clean.');
  const releaseBlockingSeverities = [...new Set(['CRITICAL','HIGH', ...(state.releaseBlockingSeverities || [])])];
  for (const threat of state.threats) {
    if (threat.status === 'CLOSED' || threat.status === 'MITIGATED') {
      if (state.threatModel?.screeningComplete !== undefined && (threat.residualScore === undefined || !state.controls.some(control => (control.threatIds || [control.threatId]).includes(threat.id) && control.requiredBeforeRelease))) blockers.push(`${threat.key}: mitigation lacks verified residual risk and controls.`);
      if (threat.residualScore === undefined || threat.residualScore < 10) continue;
    }
    const severity = riskRating((threat.status === 'MITIGATED' || threat.status === 'CLOSED') && threat.residualScore ? threat.residualScore : threat.inherentScore);
    if (severity === 'CRITICAL' && releaseBlockingSeverities.includes(severity)) blockers.push(`${threat.key}: unresolved critical threat.`);
    else if (severity === 'HIGH' && releaseBlockingSeverities.includes(severity)) {
      const accepted = state.exceptions.some((exception) => exception.threatId === threat.id && exception.status === 'APPROVED' && architectureMatches(exception) && (threat.contentVersion === undefined || exception.threatContentVersion === threat.contentVersion) && new Date(exception.expiresAt) > now);
      if (!accepted) blockers.push(`${threat.key}: unresolved high threat without a valid risk acceptance.`);
      else warnings.push(`${threat.key}: release relies on an approved time-bound exception.`);
    } else if (releaseBlockingSeverities.includes(severity)) blockers.push(`${threat.key}: unresolved ${severity.toLowerCase()} threat is release-blocking by policy.`);
  }
  for (const control of state.controls.filter((item) => item.requiredBeforeRelease)) {
    const verification = state.verifications.find((item) => item.controlId === control.id);
    if (control.status !== 'VERIFIED') blockers.push(`${control.title}: required control is not verified.`);
    if (!verification) blockers.push(`${control.title}: required verification is missing.`);
    else if (control.scopeVersion !== undefined && verification.controlScopeVersion !== control.scopeVersion) blockers.push(`${control.title}: verification does not cover the current control scope.`);
    else if (verification.result !== 'PASS') blockers.push(`${control.title}: verification result is ${verification.result}.`);
    else if (!verification.evidenceIds?.length) blockers.push(`${control.title}: passing verification has no linked evidence.`);
    else if (!verification.expiresAt || !Number.isFinite(Date.parse(verification.expiresAt)) || new Date(verification.expiresAt) <= now) blockers.push(`${control.title}: verification has expired or has no valid freshness date.`);
    if (control.implementationTicketStatus === 'CANCELLED') blockers.push(`${control.title}: required remediation ticket was cancelled.`);
  }
  for (const stage of state.requiredApprovalStages?.length ? state.requiredApprovalStages : ['APPSEC', 'SECURITY_ARCHITECTURE']) {
    if (!state.approvals.some((approval) => approval.stage === stage && approval.decision === 'APPROVED')) blockers.push(`Required ${stage} approval is missing.`);
  }
  for (const exception of state.exceptions) {
    const threat=state.threats.find(item=>item.id===exception.threatId);
    if (exception.status === 'APPROVED' && architectureMatches(exception) && (threat?.contentVersion === undefined || exception.threatContentVersion === threat.contentVersion) && new Date(exception.expiresAt) <= now) blockers.push(`Risk acceptance for ${exception.threatId} has expired.`);
  }
  return { securityGate: blockers.length ? 'BLOCK' : warnings.length ? 'CONDITIONAL' : 'PASS', allowed: blockers.length === 0, blockers, warnings, evaluatedAt: now.toISOString(), evidenceSnapshot: { threatCount: state.threats.length, requiredControlCount: state.controls.filter((item) => item.requiredBeforeRelease).length, approvalStages: state.approvals.filter((item) => item.decision === 'APPROVED').map((item) => item.stage), releaseBlockingSeverities, requiredApprovalStages: state.requiredApprovalStages?.length ? state.requiredApprovalStages : ['APPSEC', 'SECURITY_ARCHITECTURE'] } };
}

type ReleaseAuthorizationPayload = { modelId: string; revisionId: string; releaseId: string; expiresAt: string; authorizationId?: string };

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
