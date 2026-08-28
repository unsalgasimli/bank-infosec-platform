import { v4 as uuidv4 } from 'uuid';
import type { PoolClient } from 'pg';
import type { BankUser } from '../../shared/types/auth.js';
import { ThreatModelRepository } from '../db/postgres/threat-model-repository.js';
import { pgClient } from '../db/postgres/client.js';
import { db } from '../db/database.js';
import { AuthService } from './auth.service.js';
import { evaluateSecurityReleaseGate, issueReleaseAuthorization, type ReleaseGateState } from './security-release-gate.service.js';

type Input = Record<string, any>;
type QueryClient = { query<T extends Input = Input>(statement: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }> };
type ThreatModelPolicy = {
  requiredSignals: string[];
  reviewFrequencyDays: number;
  maxExceptionDays: Record<string, number>;
  requiredApprovalStages: string[];
  releaseBlockingSeverities: string[];
  verificationExpirationDays: Record<string, number>;
  remediationSlaDays: Record<string, number>;
};
const id = (prefix: string) => `${prefix}-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
const privileged = (user: BankUser) => user.roles.some((role) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER'].includes(role));
const appSec = (user: BankUser) => privileged(user) || user.roles.includes('APPSEC_ANALYST');
const securityArchitecture = (user: BankUser) => privileged(user) || user.roles.includes('APPSEC_ANALYST') || user.roles.includes('INFOSEC_MANAGER');
const riskAuthority = (user: BankUser) => user.roles.includes('CISO') || user.roles.includes('PLATFORM_ADMIN');
const releaseAuthority = (user: BankUser) => privileged(user) || user.roles.includes('APPSEC_ANALYST') || user.roles.includes('INFOSEC_MANAGER');
const risk = (score: number) => score >= 16 ? 'CRITICAL' : score >= 10 ? 'HIGH' : score >= 5 ? 'MEDIUM' : 'LOW';
const score = (value: unknown, label: string) => { const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error(`${label} must be an integer from 1 to 5.`); return n; };
const text = (value: unknown, label: string, required = true) => { const result = String(value ?? '').trim(); if (required && !result) throw new Error(`${label} is required.`); return result; };
const list = (value: unknown) => Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
const defaultPolicy: ThreatModelPolicy = {
  requiredSignals: ['internetExposed', 'customerData', 'confidentialData', 'financialTransactions', 'authenticationChange', 'authorizationChange', 'privilegedCapability', 'externalApi', 'trustBoundary', 'thirdPartyIntegration', 'cloudDeployment', 'newDataStore', 'cryptography', 'secretsHandling', 'paymentRelated', 'coreBankingRelated', 'iamPamRelated', 'criticalInfrastructure', 'materialArchitectureChange', 'highCriticalAsset', 'securityIncidentDriven'],
  reviewFrequencyDays: 365,
  maxExceptionDays: { CRITICAL: 30, HIGH: 90, MEDIUM: 180, LOW: 365 },
  requiredApprovalStages: ['APPSEC', 'SECURITY_ARCHITECTURE'],
  releaseBlockingSeverities: ['CRITICAL', 'HIGH'],
  verificationExpirationDays: { DEFAULT: 90, SAST: 30, SCA: 30, DAST: 30, PENETRATION_TEST: 180 },
  remediationSlaDays: { CRITICAL: 1, HIGH: 14, MEDIUM: 30, LOW: 90 },
};
const enqueueOutbox = async (client: PoolClient, topic: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>, correlationId?: string) => {
  await client.query(`INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload,correlation_id,occurred_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,NOW())`, [id('out'), topic, aggregateType, aggregateId, JSON.stringify(payload), correlationId || null]);
};

export class ThreatModelService {
  static async policy(actor: BankUser, organizationId = 'org-bank') {
    if (!(privileged(actor) || appSec(actor) || actor.roles.includes('GRC_ANALYST') || actor.roles.includes('AUDITOR'))) throw new Error('Threat Model policy access requires security, GRC, or audit authority.');
    return this.loadPolicy(organizationId);
  }

  /** Shared by outbox automation so remediation timing is policy-driven, never hard-coded. */
  static async remediationDueDate(organizationId: string | undefined, severity: string): Promise<string> {
    const policy = await this.loadPolicy(organizationId || 'org-bank');
    const days = policy.remediationSlaDays[severity] || defaultPolicy.remediationSlaDays[severity] || defaultPolicy.remediationSlaDays.MEDIUM;
    return new Date(Date.now() + days * 86400000).toISOString();
  }

  static async updatePolicy(input: Input, actor: BankUser) {
    if (!privileged(actor)) throw new Error('Threat Model policy changes require platform or CISO authority.');
    const organizationId = text(input.organizationId || 'org-bank', 'Organization'); const candidate = input.policy;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('A Threat Model policy object is required.');
    const requiredSignals = candidate.requiredSignals === undefined ? defaultPolicy.requiredSignals : list(candidate.requiredSignals);
    const reviewFrequencyDays = Number(candidate.reviewFrequencyDays ?? defaultPolicy.reviewFrequencyDays);
    const maxExceptionDays = { ...defaultPolicy.maxExceptionDays, ...(candidate.maxExceptionDays && typeof candidate.maxExceptionDays === 'object' ? candidate.maxExceptionDays : {}) };
    const requiredApprovalStages = candidate.requiredApprovalStages === undefined ? defaultPolicy.requiredApprovalStages : list(candidate.requiredApprovalStages);
    const releaseBlockingSeverities = candidate.releaseBlockingSeverities === undefined ? defaultPolicy.releaseBlockingSeverities : list(candidate.releaseBlockingSeverities);
    const verificationExpirationDays = { ...defaultPolicy.verificationExpirationDays, ...(candidate.verificationExpirationDays && typeof candidate.verificationExpirationDays === 'object' ? candidate.verificationExpirationDays : {}) };
    const remediationSlaDays = { ...defaultPolicy.remediationSlaDays, ...(candidate.remediationSlaDays && typeof candidate.remediationSlaDays === 'object' ? candidate.remediationSlaDays : {}) };
    const validApprovalStages = ['APPSEC', 'SECURITY_ARCHITECTURE', 'RISK_AUTHORITY']; const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const validDays = (values: Record<string, unknown>, maximum = 730) => Object.values(values).every((value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= maximum);
    if (!requiredSignals.length || !Number.isInteger(reviewFrequencyDays) || reviewFrequencyDays < 1 || reviewFrequencyDays > 730 || !requiredApprovalStages.length || requiredApprovalStages.some((stage) => !validApprovalStages.includes(stage)) || releaseBlockingSeverities.some((severity) => !validSeverities.includes(severity)) || !validDays(maxExceptionDays) || !validDays(verificationExpirationDays) || !validDays(remediationSlaDays)) throw new Error('Threat Model policy contains invalid governance thresholds.');
    const policy: ThreatModelPolicy = { requiredSignals, reviewFrequencyDays, maxExceptionDays: Object.fromEntries(Object.entries(maxExceptionDays).map(([key, value]) => [key, Number(value)])), requiredApprovalStages, releaseBlockingSeverities, verificationExpirationDays: Object.fromEntries(Object.entries(verificationExpirationDays).map(([key, value]) => [key, Number(value)])), remediationSlaDays: Object.fromEntries(Object.entries(remediationSlaDays).map(([key, value]) => [key, Number(value)])) };
    return pgClient.transaction(async (client) => {
      const existing = await client.query<Input>('SELECT * FROM threat_model_policies WHERE organization_id=$1 FOR UPDATE', [organizationId]);
      const policyId = existing.rows[0]?.id || id('tmpol'); const version = Number(existing.rows[0]?.version || 0) + 1;
      await client.query(`INSERT INTO threat_model_policies(id,organization_id,policy,version,updated_by_user_id,updated_at) VALUES($1,$2,$3::jsonb,$4,$5,NOW()) ON CONFLICT(organization_id) DO UPDATE SET policy=EXCLUDED.policy,version=EXCLUDED.version,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=NOW()`, [policyId, organizationId, JSON.stringify(policy), version, actor.id]);
      await client.query(`INSERT INTO threat_model_policy_audit_events(id,policy_id,organization_id,actor_id,old_policy,new_policy,version) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`, [id('tmpae'), policyId, organizationId, actor.id, existing.rows[0] ? JSON.stringify(existing.rows[0].policy) : null, JSON.stringify(policy), version]);
      return { id: policyId, organizationId, policy, version };
    });
  }

  static async list(actor: BankUser) {
    return ThreatModelRepository.list({ userId: actor.id, departmentId: actor.departmentId, elevated: privileged(actor) || appSec(actor) || actor.roles.includes('AUDITOR') });
  }

  static async governanceReport(actor: BankUser) {
    if (!(privileged(actor) || appSec(actor) || actor.roles.includes('GRC_ANALYST') || actor.roles.includes('AUDITOR'))) throw new Error('Threat Model governance reporting requires AppSec, GRC, audit, or security authority.');
    const [models, threats, controls, exceptions, timing, migrationBacklog] = await Promise.all([
      pgClient.query<Input>(`SELECT criticality, count(*)::int AS total, count(*) FILTER (WHERE status='APPROVED')::int AS approved, count(*) FILTER (WHERE status='REVIEW_REQUIRED')::int AS review_required, count(*) FILTER (WHERE next_review_at < NOW())::int AS overdue FROM threat_models GROUP BY criticality`),
      pgClient.query<Input>(`SELECT count(*) FILTER (WHERE t.status NOT IN ('MITIGATED','CLOSED'))::int AS open_total, count(*) FILTER (WHERE t.status NOT IN ('MITIGATED','CLOSED') AND t.inherent_score >= 16)::int AS critical_open, count(*) FILTER (WHERE t.status NOT IN ('MITIGATED','CLOSED') AND t.inherent_score BETWEEN 10 AND 15)::int AS high_open, count(*) FILTER (WHERE t.status NOT IN ('MITIGATED','CLOSED') AND t.inherent_score BETWEEN 5 AND 9)::int AS medium_open, count(*) FILTER (WHERE t.status NOT IN ('MITIGATED','CLOSED') AND t.inherent_score < 5)::int AS low_open FROM threats t JOIN threat_model_revisions r ON r.id=t.revision_id JOIN threat_models tm ON tm.current_revision_id=r.id`),
      pgClient.query<Input>(`SELECT count(*) FILTER (WHERE c.status='VERIFIED')::int AS verified, count(*) FILTER (WHERE c.status='FAILED')::int AS failed, count(*) FILTER (WHERE c.status NOT IN ('VERIFIED','NOT_APPLICABLE','ACCEPTED_RISK'))::int AS unverified, count(*) FILTER (WHERE v.expires_at IS NOT NULL AND v.expires_at < NOW())::int AS expired_verifications FROM threat_controls c JOIN threats t ON t.id=c.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id JOIN threat_models tm ON tm.current_revision_id=r.id LEFT JOIN LATERAL (SELECT expires_at FROM control_verifications WHERE control_id=c.id ORDER BY executed_at DESC LIMIT 1) v ON TRUE`),
      pgClient.query<Input>(`SELECT count(*) FILTER (WHERE e.status='APPROVED' AND e.expires_at > NOW())::int AS active, count(*) FILTER (WHERE e.status='APPROVED' AND e.expires_at > NOW() AND e.expires_at <= NOW() + INTERVAL '30 days')::int AS expiring, count(*) FILTER (WHERE e.status='APPROVED' AND e.expires_at <= NOW())::int AS expired FROM threat_model_exceptions e JOIN threats t ON t.id=e.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id JOIN threat_models tm ON tm.current_revision_id=r.id`),
      pgClient.query<Input>(`SELECT COALESCE(round(avg(extract(epoch FROM (approved_at-created_at))/3600)::numeric, 1),0) AS average_approval_hours FROM threat_model_revisions WHERE approved_at IS NOT NULL`),
      pgClient.query<Input>(`SELECT tier,count(*)::int AS total,count(*) FILTER (WHERE status='APPROVED')::int AS approved,count(*) FILTER (WHERE status='OVERDUE')::int AS overdue FROM threat_model_migration_backlog GROUP BY tier`),
    ]);
    const coverage = Object.fromEntries(models.rows.map((row) => [row.criticality, { total: Number(row.total), approved: Number(row.approved), reviewRequired: Number(row.review_required), overdue: Number(row.overdue), percent: Number(row.total) ? Math.round(Number(row.approved) / Number(row.total) * 100) : 0 }]));
    const migrationCoverage = Object.fromEntries(['TIER_1', 'TIER_2', 'TIER_3'].map((tier) => {
      const row = migrationBacklog.rows.find((item) => item.tier === tier); const total = Number(row?.total || 0); const approved = Number(row?.approved || 0);
      return [tier, { total, approved, overdue: Number(row?.overdue || 0), percent: total ? Math.round(approved / total * 100) : 0 }];
    }));
    return { coverage, migrationCoverage, threats: threats.rows[0] || {}, controls: controls.rows[0] || {}, exceptions: exceptions.rows[0] || {}, averageApprovalHours: Number(timing.rows[0]?.average_approval_hours || 0), generatedAt: new Date().toISOString() };
  }

  static async listMigrationBacklog(actor: BankUser, organizationId = 'org-bank') {
    if (!(privileged(actor) || appSec(actor) || actor.roles.includes('GRC_ANALYST') || actor.roles.includes('AUDITOR'))) throw new Error('Threat Model migration backlog access requires security, GRC, or audit authority.');
    const result = await pgClient.query<Input>(`SELECT b.*,tm.key AS threat_model_key FROM threat_model_migration_backlog b LEFT JOIN threat_models tm ON tm.id=b.current_threat_model_id WHERE b.organization_id=$1 ORDER BY b.tier,b.target_date NULLS LAST,b.system_name`, [organizationId]);
    return result.rows.map((row) => ({ id: row.id, organizationId: row.organization_id, systemName: row.system_name, serviceId: row.service_id || undefined, assetId: row.asset_id || undefined, projectId: row.project_id || undefined, tier: row.tier, status: row.status, criticality: row.criticality, ownerId: row.owner_id || undefined, targetDate: row.target_date?.toISOString?.().slice(0, 10) || row.target_date, currentThreatModelId: row.current_threat_model_id || undefined, currentThreatModelKey: row.threat_model_key || undefined, notes: row.notes || undefined }));
  }

  static async upsertMigrationBacklog(input: Input, actor: BankUser) {
    if (!(privileged(actor) || appSec(actor) || actor.roles.includes('GRC_ANALYST'))) throw new Error('Threat Model migration backlog changes require AppSec, GRC, or security authority.');
    const organizationId = text(input.organizationId || 'org-bank', 'Organization'); const systemName = text(input.systemName, 'System name');
    const tier = text(input.tier, 'Tier'); const status = text(input.status, 'Migration status'); const criticality = text(input.criticality || 'HIGH', 'Criticality');
    if (!['TIER_1', 'TIER_2', 'TIER_3'].includes(tier) || !['NOT_STARTED', 'PLANNED', 'IN_PROGRESS', 'APPROVED', 'OVERDUE'].includes(status) || !['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(criticality)) throw new Error('Invalid migration backlog tier, status, or criticality.');
    return pgClient.transaction(async (client) => {
      const currentModelId = text(input.currentThreatModelId, '', false) || null;
      if (currentModelId) {
        const model = await client.query('SELECT 1 FROM threat_models WHERE id=$1', [currentModelId]);
        if (!model.rowCount) throw new Error('The linked Threat Model does not exist.');
      }
      const existing = await client.query<Input>('SELECT id FROM threat_model_migration_backlog WHERE organization_id=$1 AND system_name=$2 FOR UPDATE', [organizationId, systemName]);
      const backlogId = existing.rows[0]?.id || id('tmbl');
      await client.query(`INSERT INTO threat_model_migration_backlog(id,organization_id,system_name,service_id,asset_id,project_id,tier,status,criticality,owner_id,target_date,current_threat_model_id,notes,created_by_user_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT(organization_id,system_name) DO UPDATE SET service_id=EXCLUDED.service_id,asset_id=EXCLUDED.asset_id,project_id=EXCLUDED.project_id,tier=EXCLUDED.tier,status=EXCLUDED.status,criticality=EXCLUDED.criticality,owner_id=EXCLUDED.owner_id,target_date=EXCLUDED.target_date,current_threat_model_id=EXCLUDED.current_threat_model_id,notes=EXCLUDED.notes,updated_at=NOW()`, [backlogId, organizationId, systemName, text(input.serviceId, '', false) || null, text(input.assetId, '', false) || null, text(input.projectId, '', false) || null, tier, status, criticality, text(input.ownerId, '', false) || null, text(input.targetDate, '', false) || null, currentModelId, text(input.notes, '', false) || null, actor.id]);
      return { id: backlogId, systemName, tier, status, criticality, currentThreatModelId: currentModelId };
    });
  }

  static async detail(modelId: string, actor: BankUser) {
    const detail = await ThreatModelRepository.modelDetail(modelId);
    if (!detail) throw new Error('Threat Model not found.');
    this.assertRead(detail.model as Input, actor);
    return detail;
  }

  /** Historical revisions remain readable with their original structured architecture and evidence context. */
  static async revisionDetail(modelId: string, revisionId: string, actor: BankUser) {
    const model = await ThreatModelRepository.findById(modelId);
    if (!model) throw new Error('Threat Model not found.'); this.assertRead(model, actor);
    const revisionResult = await pgClient.query<Input>('SELECT * FROM threat_model_revisions WHERE id=$1 AND threat_model_id=$2', [revisionId, modelId]);
    const revision = revisionResult.rows[0]; if (!revision) throw new Error('Threat Model revision not found.');
    const [components, boundaries, dataFlows, threats, controls, verifications, approvals] = await Promise.all([
      pgClient.query<Input>('SELECT * FROM threat_model_components WHERE revision_id=$1 ORDER BY name', [revisionId]),
      pgClient.query<Input>('SELECT * FROM threat_model_trust_boundaries WHERE revision_id=$1 ORDER BY name', [revisionId]),
      pgClient.query<Input>('SELECT * FROM threat_model_data_flows WHERE revision_id=$1 ORDER BY name', [revisionId]),
      pgClient.query<Input>('SELECT * FROM threats WHERE revision_id=$1 ORDER BY inherent_score DESC,key', [revisionId]),
      pgClient.query<Input>('SELECT c.* FROM threat_controls c JOIN threats t ON t.id=c.threat_id WHERE t.revision_id=$1 ORDER BY c.created_at', [revisionId]),
      pgClient.query<Input>('SELECT v.* FROM control_verifications v JOIN threat_controls c ON c.id=v.control_id JOIN threats t ON t.id=c.threat_id WHERE t.revision_id=$1 ORDER BY v.executed_at DESC', [revisionId]),
      pgClient.query<Input>('SELECT * FROM threat_model_approvals WHERE revision_id=$1 ORDER BY decided_at DESC', [revisionId]),
    ]);
    return { model, revision: ThreatModelRepository.revision(revision), components: components.rows.map(ThreatModelRepository.component), trustBoundaries: boundaries.rows.map(ThreatModelRepository.boundary), dataFlows: dataFlows.rows.map(ThreatModelRepository.flow), threats: threats.rows.map(ThreatModelRepository.threat), controls: controls.rows.map(ThreatModelRepository.control), verifications: verifications.rows.map(ThreatModelRepository.verification), approvals: approvals.rows.map(ThreatModelRepository.approval) };
  }

  static async create(input: Input, actor: BankUser, request: { correlationId?: string; ip?: string; userAgent?: string } = {}) {
    const title = text(input.title, 'Title');
    const scope = ['serviceId', 'assetId', 'projectId', 'changeId', 'releaseId'].some((field) => text(input[field], '', false));
    if (!scope) throw new Error('Link the Threat Model to a service, asset, project, change, or release.');
    const criticality = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(input.criticality) ? input.criticality : 'HIGH';
    this.assertScopeReferences(input, actor);
    return pgClient.transaction(async (client) => {
      const now = new Date();
      const year = now.getUTCFullYear();
      const sequence = await client.query<{ next: number }>(`SELECT count(*)::int + 1 AS next FROM threat_models WHERE key LIKE $1`, [`TM-${year}-%`]);
      const modelId = id('tm'); const revisionId = id('tmr'); const key = `TM-${year}-${String(sequence.rows[0].next).padStart(4, '0')}`;
      const businessOwnerId = text(input.businessOwnerId || actor.id, 'Business owner');
      const technicalOwnerId = text(input.technicalOwnerId || actor.id, 'Technical owner');
      const departmentId = text(input.departmentId || actor.departmentId, '', false) || null;
      if (!appSec(actor) && !privileged(actor) && (businessOwnerId !== actor.id || technicalOwnerId !== actor.id || (departmentId && departmentId !== actor.departmentId))) throw new Error('Delivery users may create Threat Models only for their own ownership and department scope.');
      await client.query(
        `INSERT INTO threat_models(id,key,organization_id,service_id,asset_id,project_id,change_id,release_id,title,description,criticality,data_classification,business_owner_id,technical_owner_id,security_owner_id,department_id,current_revision_id,status,created_by_user_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NULL,'DRAFT',$17)`,
        [modelId, key, text(input.organizationId || 'org-bank', 'Organization'), text(input.serviceId, '', false) || null, text(input.assetId, '', false) || null, text(input.projectId, '', false) || null, text(input.changeId, '', false) || null, text(input.releaseId, '', false) || null, title, text(input.description, '', false), criticality, text(input.dataClassification || 'CONFIDENTIAL_SECURITY_ONLY', 'Data classification'), businessOwnerId, technicalOwnerId, text(input.securityOwnerId, '', false) || null, departmentId, actor.id]
      );
      await client.query(
        `INSERT INTO threat_model_revisions(id,threat_model_id,revision_number,status,scope_summary,architecture_summary,assumptions,security_objectives,in_scope,out_of_scope,created_by_user_id)
         VALUES($1,$2,1,'DRAFT',$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
        [revisionId, modelId, text(input.scopeSummary, '', false), text(input.architectureSummary, '', false), text(input.assumptions, '', false), text(input.securityObjectives, '', false), JSON.stringify(list(input.inScope)), JSON.stringify(list(input.outOfScope)), actor.id]
      );
      await client.query(`UPDATE threat_models SET current_revision_id=$1,updated_at=NOW() WHERE id=$2`, [revisionId, modelId]);
      await ThreatModelRepository.audit(client, { id: id('tma'), modelId, revisionId, actorId: actor.id, action: 'THREAT_MODEL_CREATED', entityType: 'THREAT_MODEL', entityId: modelId, newValue: { key, title }, ...request });
      await enqueueOutbox(client, 'threat-model.created', 'THREAT_MODEL', modelId, { threatModelId: modelId, revisionId, createdBy: actor.id }, request.correlationId);
      return { model: await ThreatModelRepository.findById(modelId, client), revision: await client.query('SELECT * FROM threat_model_revisions WHERE id=$1', [revisionId]).then((result) => ThreatModelRepository.revision(result.rows[0])) };
    });
  }

  static async assessApplicability(input: Input, actor: BankUser, request: { correlationId?: string; ip?: string; userAgent?: string } = {}) {
    const answers = input.answers && typeof input.answers === 'object' && !Array.isArray(input.answers) ? input.answers as Record<string, boolean> : {};
    const organizationId = text(input.organizationId || 'org-bank', 'Organization'); const policy = await this.loadPolicy(organizationId);
    const required = policy.requiredSignals.some((field) => answers[field] === true);
    const requested = input.decision;
    const decision = required ? 'REQUIRED' : requested === 'SECURITY_REVIEW_REQUIRED' ? 'SECURITY_REVIEW_REQUIRED' : 'NOT_REQUIRED';
    const justification = text(input.justification, '', false);
    if (decision === 'NOT_REQUIRED' && !justification) throw new Error('A justification is required when Threat Modeling is not required.');
    if (requested === 'NOT_REQUIRED' && required && !appSec(actor)) throw new Error('A security-sensitive change cannot be self-exempted from Threat Modeling.');
    const assessmentId = id('tma'); const modelId = text(input.threatModelId, '', false) || undefined;
    await pgClient.transaction(async (client) => {
      if (modelId) this.assertWrite(await this.lockModel(modelId, client), actor);
      await client.query(`INSERT INTO threat_model_applicability(id,threat_model_id,organization_id,project_id,change_id,service_id,asset_id,answers,decision,justification,assessed_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`, [assessmentId, modelId || null, organizationId, text(input.projectId, '', false) || null, text(input.changeId, '', false) || null, text(input.serviceId, '', false) || null, text(input.assetId, '', false) || null, JSON.stringify(answers), decision, justification || null, actor.id]);
      if (modelId) await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, actorId: actor.id, action: 'APPLICABILITY_ASSESSED', entityType: 'THREAT_MODEL_APPLICABILITY', entityId: assessmentId, newValue: { decision, answers }, ...request });
    });
    return { id: assessmentId, decision, answers, justification: justification || undefined };
  }

  static async createRevision(modelId: string, input: Input, actor: BankUser, request: { correlationId?: string; ip?: string; userAgent?: string } = {}) {
    return pgClient.transaction(async (client) => {
      const model = await this.lockModel(modelId, client); this.assertWrite(model, actor);
      const current = await client.query<Input>('SELECT * FROM threat_model_revisions WHERE id=$1 FOR UPDATE', [model.currentRevisionId]);
      const previous = current.rows[0]; if (!previous || previous.status !== 'APPROVED') throw new Error('A new revision can be created only from the current approved revision.');
      const revisionId = id('tmr'); const revisionNumber = Number(previous.revision_number) + 1;
      await client.query(`INSERT INTO threat_model_revisions(id,threat_model_id,revision_number,status,scope_summary,architecture_summary,assumptions,security_objectives,in_scope,out_of_scope,supersedes_revision_id,change_reason,created_by_user_id) VALUES($1,$2,$3,'DRAFT',$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)`, [revisionId, modelId, revisionNumber, text(input.scopeSummary, '', false), text(input.architectureSummary, '', false), text(input.assumptions, '', false), text(input.securityObjectives, '', false), JSON.stringify(list(input.inScope)), JSON.stringify(list(input.outOfScope)), previous.id, text(input.changeReason, 'Change reason'), actor.id]);
      await client.query(`UPDATE threat_models SET current_revision_id=$1,status='DRAFT',updated_at=NOW(),version=version+1 WHERE id=$2`, [revisionId, modelId]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId, actorId: actor.id, action: 'REVISION_CREATED', entityType: 'THREAT_MODEL_REVISION', entityId: revisionId, oldValue: { revisionId: previous.id }, newValue: { revisionNumber }, ...request });
      return (await client.query<Input>('SELECT * FROM threat_model_revisions WHERE id=$1', [revisionId])).rows.map(ThreatModelRepository.revision)[0];
    });
  }

  static async addComponent(modelId: string, input: Input, actor: BankUser) { return this.addArchitecture('component', modelId, input, actor); }
  static async addTrustBoundary(modelId: string, input: Input, actor: BankUser) { return this.addArchitecture('boundary', modelId, input, actor); }
  static async addDataFlow(modelId: string, input: Input, actor: BankUser) { return this.addArchitecture('flow', modelId, input, actor); }

  static async addThreat(modelId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async (client) => {
      const model = await this.lockModel(modelId, client); this.assertWrite(model, actor); const revision = await ThreatModelRepository.requireMutableRevision(model.currentRevisionId, client);
      const references: Array<[string, string, string]> = [['affectedComponentId', 'threat_model_components', 'component'], ['affectedDataFlowId', 'threat_model_data_flows', 'data flow'], ['affectedTrustBoundaryId', 'threat_model_trust_boundaries', 'trust boundary']];
      for (const [field, table, label] of references) {
        const referenceId = text(input[field], '', false); if (!referenceId) continue;
        const reference = await client.query(`SELECT 1 FROM ${table} WHERE id=$1 AND revision_id=$2`, [referenceId, revision.id]);
        if (!reference.rowCount) throw new Error(`Affected ${label} must belong to the current Threat Model revision.`);
      }
      const likelihood = score(input.inherentLikelihood, 'Inherent likelihood'); const impact = score(input.inherentImpact, 'Inherent impact'); const threatId = id('th');
      const count = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM threats WHERE revision_id=$1', [revision.id]);
      const categories = list(input.categories); if (!categories.length) throw new Error('At least one STRIDE or abuse-case category is required.');
      const key = `${model.key}-T${String(count.rows[0].count + 1).padStart(3, '0')}`;
      await client.query(`INSERT INTO threats(id,revision_id,key,title,description,categories,attack_scenario,attacker_type,attacker_capability,preconditions,attack_path,affected_component_id,affected_data_flow_id,affected_trust_boundary_id,affected_asset_id,cwe_ids,capec_ids,inherent_likelihood,inherent_impact,inherent_score,status,owner_id,due_date,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,$20,'OPEN',$21,$22,$23)`, [threatId, revision.id, key, text(input.title, 'Threat title'), text(input.description, 'Threat description'), JSON.stringify(categories), text(input.attackScenario, 'Attack scenario'), text(input.attackerType, '', false) || null, text(input.attackerCapability, '', false) || null, text(input.preconditions, '', false) || null, text(input.attackPath, '', false) || null, text(input.affectedComponentId, '', false) || null, text(input.affectedDataFlowId, '', false) || null, text(input.affectedTrustBoundaryId, '', false) || null, text(input.affectedAssetId, '', false) || null, JSON.stringify(list(input.cweIds)), JSON.stringify(list(input.capecIds)), likelihood, impact, likelihood * impact, text(input.ownerId, '', false) || null, text(input.dueDate, '', false) || null, actor.id]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId: revision.id, actorId: actor.id, action: 'THREAT_CREATED', entityType: 'THREAT', entityId: threatId, newValue: { key, inherentRisk: risk(likelihood * impact) } });
      if (likelihood * impact >= 10) await enqueueOutbox(client, 'threat-model.high-risk-threat.created', 'THREAT', threatId, { threatModelId: modelId, threatId, severity: risk(likelihood * impact) });
      return (await client.query<Input>('SELECT * FROM threats WHERE id=$1', [threatId])).rows.map(ThreatModelRepository.threat)[0];
    });
  }

  static async addControl(threatId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async (client) => {
      const context = await this.lockThreatContext(threatId, client); this.assertWrite(context.model, actor); await ThreatModelRepository.requireMutableRevision(context.revisionId, client);
      const policy = await this.loadPolicy(context.model.organizationId, client); const threatSeverity = risk(Number(context.inherentScore || 0));
      const configuredDueDate = new Date(Date.now() + (policy.remediationSlaDays[threatSeverity] || defaultPolicy.remediationSlaDays[threatSeverity]) * 86400000).toISOString();
      const controlId = id('ctl');
      await client.query(`INSERT INTO threat_controls(id,threat_id,title,description,control_type,implementation_owner_id,status,required_before_release,due_date,effectiveness_status) VALUES($1,$2,$3,$4,$5,$6,'PROPOSED',$7,$8,$9)`, [controlId, threatId, text(input.title, 'Control title'), text(input.description, 'Control description'), text(input.controlType || 'TECHNICAL', 'Control type'), text(input.implementationOwnerId, '', false) || null, input.requiredBeforeRelease !== false, text(input.dueDate, '', false) || configuredDueDate, text(input.effectivenessStatus, '', false) || null]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: context.model.id, revisionId: context.revisionId, actorId: actor.id, action: 'CONTROL_CREATED', entityType: 'THREAT_CONTROL', entityId: controlId, newValue: { threatId, requiredBeforeRelease: input.requiredBeforeRelease !== false } });
      await enqueueOutbox(client, 'threat-control.created', 'THREAT_CONTROL', controlId, { threatModelId: context.model.id, threatId, controlId, createdBy: actor.id });
      return (await client.query<Input>('SELECT * FROM threat_controls WHERE id=$1', [controlId])).rows.map(ThreatModelRepository.control)[0];
    });
  }

  static async recordVerification(controlId: string, input: Input, actor: BankUser) {
    if (!appSec(actor)) throw new Error('Only AppSec or an authorized security authority may verify controls.');
    return pgClient.transaction(async (client) => {
      const context = await this.lockControlContext(controlId, client); if (context.implementerId === actor.id) throw new Error('Control implementer cannot independently verify this security control.');
      const verificationId = id('ver'); const result = text(input.result, 'Verification result');
      if (!['NOT_RUN', 'PASS', 'FAIL', 'PARTIAL', 'EXPIRED'].includes(result)) throw new Error('Invalid verification result.');
      const evidenceIds = list(input.evidenceIds);
      if (result === 'PASS' && !evidenceIds.length) throw new Error('A passing control verification must reference linked evidence.');
      if (evidenceIds.length) {
        const evidence = await client.query<{ id: string }>(`SELECT id FROM threat_model_evidence WHERE control_id=$1 AND id = ANY($2::varchar[])`, [controlId, evidenceIds]);
        if (evidence.rows.length !== evidenceIds.length) throw new Error('Verification evidence must already be linked to this control and Threat Model.');
      }
      const verificationType = text(input.verificationType, 'Verification type'); const policy = await this.loadPolicy(context.model.organizationId, client);
      const expiresAt = text(input.expiresAt, '', false) || new Date(Date.now() + (policy.verificationExpirationDays[verificationType] || policy.verificationExpirationDays.DEFAULT || defaultPolicy.verificationExpirationDays.DEFAULT) * 86400000).toISOString();
      await client.query(`INSERT INTO control_verifications(id,control_id,verification_type,test_case,expected_result,result,evidence_ids,executed_by_user_id,executed_at,reviewer_id,reviewed_at,expires_at,notes) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,NOW(),$9,NOW(),$10,$11)`, [verificationId, controlId, verificationType, text(input.testCase, 'Test case'), text(input.expectedResult, 'Expected result'), result, JSON.stringify(evidenceIds), actor.id, text(input.reviewerId, '', false) || actor.id, expiresAt, text(input.notes, '', false) || null]);
      await client.query(`UPDATE threat_controls SET status=$1,updated_at=NOW() WHERE id=$2`, [result === 'PASS' ? 'VERIFIED' : result === 'FAIL' ? 'FAILED' : 'VERIFICATION_REQUIRED', controlId]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: context.model.id, revisionId: context.revisionId, actorId: actor.id, action: 'CONTROL_VERIFIED', entityType: 'CONTROL_VERIFICATION', entityId: verificationId, newValue: { controlId, result } });
      if (result === 'FAIL') await enqueueOutbox(client, 'threat-control.verification.failed', 'THREAT_CONTROL', controlId, { threatModelId: context.model.id, controlId, verificationId });
      return (await client.query<Input>('SELECT * FROM control_verifications WHERE id=$1', [verificationId])).rows.map(ThreatModelRepository.verification)[0];
    });
  }

  static async calculateResidualRisk(threatId: string, input: Input, actor: BankUser) {
    if (!appSec(actor)) throw new Error('Only AppSec may confirm residual risk.');
    return pgClient.transaction(async (client) => {
      const context = await this.lockThreatContext(threatId, client); const controls = await client.query<Input>('SELECT * FROM threat_controls WHERE threat_id=$1', [threatId]);
      const required = controls.rows.filter((control) => control.required_before_release);
      if (!required.length || required.some((control) => control.status !== 'VERIFIED')) throw new Error('Residual risk cannot change until every required control is independently verified.');
      const likelihood = score(input.residualLikelihood, 'Residual likelihood'); const impact = score(input.residualImpact, 'Residual impact'); const rationale = text(input.residualRiskRationale, 'Residual risk rationale');
      await client.query(`UPDATE threats SET residual_likelihood=$1,residual_impact=$2,residual_score=$3,residual_risk_rationale=$4,residual_risk_calculated_at=NOW(),residual_risk_calculated_by_user_id=$5,updated_at=NOW() WHERE id=$6`, [likelihood, impact, likelihood * impact, rationale, actor.id, threatId]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: context.model.id, revisionId: context.revisionId, actorId: actor.id, action: 'RESIDUAL_RISK_CONFIRMED', entityType: 'THREAT', entityId: threatId, newValue: { residualRisk: risk(likelihood * impact), rationale } });
      return (await client.query<Input>('SELECT * FROM threats WHERE id=$1', [threatId])).rows.map(ThreatModelRepository.threat)[0];
    });
  }

  /** Create or synchronize the linked enterprise risk without conflating the two domains. */
  static async linkEnterpriseRisk(threatId: string, input: Input, actor: BankUser) {
    if (!(appSec(actor) || actor.roles.includes('GRC_ANALYST') || actor.roles.includes('RISK_OWNER'))) throw new Error('Enterprise risk linkage requires AppSec, GRC, or risk-owner authority.');
    return pgClient.transaction(async (client) => {
      const context = await this.lockThreatContext(threatId, client); this.assertRead(context.model, actor);
      const threatResult = await client.query<Input>('SELECT * FROM threats WHERE id=$1 FOR UPDATE', [threatId]); const threat = threatResult.rows[0];
      if (!threat) throw new Error('Threat not found.');
      const existing = await client.query<Input>('SELECT l.*,rr.risk_id FROM threat_model_risk_links l JOIN risk_register_items rr ON rr.id=l.risk_register_item_id WHERE l.threat_id=$1 FOR UPDATE', [threatId]);
      const inherentRisk = risk(Number(threat.inherent_score)); const residualRisk = threat.residual_score ? risk(Number(threat.residual_score)) : inherentRisk;
      const title = text(input.title || `Threat Model ${threat.key}: ${threat.title}`, 'Risk title'); const description = text(input.description || threat.description, 'Risk description'); const mitigation = text(input.mitigationPlan || 'Track mitigation through linked Threat Model controls and independent verification.', 'Mitigation plan');
      const reviewDate = text(input.reviewDate || new Date(Date.now() + 90 * 86400000).toISOString(), 'Review date'); const ownerId = text(input.ownerId || threat.owner_id || context.model.securityOwnerId || actor.id, 'Risk owner');
      let riskId: string; let riskCode: string;
      if (existing.rows[0]) {
        riskId = existing.rows[0].risk_register_item_id; riskCode = existing.rows[0].risk_id;
        await client.query(`UPDATE risk_register_items SET title=$1,description=$2,inherent_risk=$3,residual_risk=$4,status='OPEN',risk_owner_id=$5,mitigation_plan=$6,review_date=$7,updated_at=NOW() WHERE id=$8`, [title, description, inherentRisk, residualRisk, ownerId, mitigation, reviewDate, riskId]);
      } else {
        const sequence = await client.query<Input>(`SELECT count(*)::int + 1 AS next FROM risk_register_items WHERE risk_id LIKE $1`, [`RISK-${new Date().getUTCFullYear()}-%`]);
        riskId = id('risk'); riskCode = `RISK-${new Date().getUTCFullYear()}-${String(sequence.rows[0].next).padStart(4, '0')}`;
        await client.query(`INSERT INTO risk_register_items(id,risk_id,title,description,category,inherent_risk,residual_risk,status,risk_owner_id,mitigation_plan,review_date,source_payload) VALUES($1,$2,$3,$4,'THREAT_MODEL',$5,$6,'OPEN',$7,$8,$9,$10::jsonb)`, [riskId, riskCode, title, description, inherentRisk, residualRisk, ownerId, mitigation, reviewDate, JSON.stringify({ source: 'THREAT_MODEL', threatId, threatModelId: context.model.id, revisionId: context.revisionId })]);
        await client.query(`INSERT INTO threat_model_risk_links(id,threat_model_id,threat_id,risk_register_item_id,link_reason,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6)`, [id('tmrl'), context.model.id, threatId, riskId, text(input.linkReason || 'Enterprise risk tracking required for this structured Threat Model threat.', 'Link reason'), actor.id]);
      }
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: context.model.id, revisionId: context.revisionId, actorId: actor.id, action: 'ENTERPRISE_RISK_LINKED', entityType: 'RISK_REGISTER_ITEM', entityId: riskId, newValue: { threatId, riskCode, inherentRisk, residualRisk } });
      return { id: riskId, riskCode, threatId, inherentRisk, residualRisk };
    });
  }

  static async submit(modelId: string, actor: BankUser) {
    return pgClient.transaction(async (client) => {
      const model = await this.lockModel(modelId, client); this.assertWrite(model, actor); const revision = await ThreatModelRepository.requireMutableRevision(model.currentRevisionId, client);
      const components = await client.query('SELECT 1 FROM threat_model_components WHERE revision_id=$1 LIMIT 1', [revision.id]);
      const threats = await client.query('SELECT 1 FROM threats WHERE revision_id=$1 LIMIT 1', [revision.id]);
      if (!components.rowCount || !threats.rowCount) throw new Error('Architecture and at least one structured threat are required before submission.');
      await client.query(`UPDATE threat_model_revisions SET status='IN_REVIEW',submitted_by_user_id=$1,submitted_at=NOW(),version=version+1 WHERE id=$2`, [actor.id, revision.id]);
      await client.query(`UPDATE threat_models SET status='IN_REVIEW',updated_at=NOW(),version=version+1 WHERE id=$1`, [modelId]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId: revision.id, actorId: actor.id, action: 'REVISION_SUBMITTED', entityType: 'THREAT_MODEL_REVISION', entityId: revision.id });
      await enqueueOutbox(client, 'threat-model.review.submitted', 'THREAT_MODEL_REVISION', revision.id, { threatModelId: modelId, revisionId: revision.id, submittedBy: actor.id });
      return { status: 'IN_REVIEW', revisionId: revision.id };
    });
  }

  static async decideApproval(modelId: string, input: Input, actor: BankUser) {
    const stage = text(input.stage, 'Approval stage'); if (!['APPSEC', 'SECURITY_ARCHITECTURE', 'RISK_AUTHORITY'].includes(stage)) throw new Error('Invalid approval stage.');
    if (stage === 'APPSEC' && !appSec(actor)) throw new Error('AppSec authority is required.');
    if (stage === 'SECURITY_ARCHITECTURE' && !securityArchitecture(actor)) throw new Error('Security Architecture authority is required.');
    if (stage === 'RISK_AUTHORITY' && !riskAuthority(actor)) throw new Error('Risk authority is required.');
    const decision = text(input.decision, 'Decision'); if (!['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'].includes(decision)) throw new Error('Invalid approval decision.');
    return pgClient.transaction(async (client) => {
      const model = await this.lockModel(modelId, client); const revisionResult = await client.query<Input>('SELECT * FROM threat_model_revisions WHERE id=$1 FOR UPDATE', [model.currentRevisionId]); const revision = revisionResult.rows[0];
      if (!revision || revision.status !== 'IN_REVIEW') throw new Error('Only an in-review revision may be approved.');
      if ([revision.created_by_user_id, model.businessOwnerId, model.technicalOwnerId, model.securityOwnerId].includes(actor.id)) throw new Error('Author or owner cannot approve the Threat Model.');
      if (decision === 'APPROVED') {
        const otherStageBySameReviewer = await client.query(`SELECT 1 FROM threat_model_approvals WHERE revision_id=$1 AND decided_by_user_id=$2 AND stage<>$3 AND decision='APPROVED' LIMIT 1`, [revision.id, actor.id, stage]);
        if (otherStageBySameReviewer.rowCount) throw new Error('AppSec and Security Architecture approvals require separate authorized reviewers.');
      }
      const approvalId = id('appr'); await client.query(`INSERT INTO threat_model_approvals(id,revision_id,stage,decision,decided_by_user_id,comments) VALUES($1,$2,$3,$4,$5,$6)`, [approvalId, revision.id, stage, decision, actor.id, text(input.comments, '', false) || null]);
      if (decision !== 'APPROVED') { await client.query(`UPDATE threat_model_revisions SET status='CHANGES_REQUIRED',reviewed_by_user_id=$1,reviewed_at=NOW(),version=version+1 WHERE id=$2`, [actor.id, revision.id]); await client.query(`UPDATE threat_models SET status='CHANGES_REQUIRED',updated_at=NOW(),version=version+1 WHERE id=$1`, [modelId]); }
      else {
        const approvals = await client.query<Input>(`SELECT stage FROM threat_model_approvals WHERE revision_id=$1 AND decision='APPROVED'`, [revision.id]); const approvedStages = new Set(approvals.rows.map((approval) => approval.stage));
        const policy = await this.loadPolicy(model.organizationId, client);
        if (policy.requiredApprovalStages.every((requiredStage) => approvedStages.has(requiredStage))) { await client.query(`UPDATE threat_model_revisions SET status='APPROVED',approved_by_user_id=$1,approved_at=NOW(),reviewed_by_user_id=$1,reviewed_at=NOW(),version=version+1 WHERE id=$2`, [actor.id, revision.id]); await client.query(`UPDATE threat_models SET status='APPROVED',last_approved_at=NOW(),next_review_at=NOW()+($1 * INTERVAL '1 day'),updated_at=NOW(),version=version+1 WHERE id=$2`, [policy.reviewFrequencyDays, modelId]); }
      }
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId: revision.id, actorId: actor.id, action: `APPROVAL_${decision}`, entityType: 'THREAT_MODEL_APPROVAL', entityId: approvalId, newValue: { stage, decision } });
      return { approvalId, decision, status: (await client.query<Input>('SELECT status FROM threat_models WHERE id=$1', [modelId])).rows[0].status };
    });
  }

  static async requestChanges(modelId: string, input: Input, actor: BankUser) {
    return this.decideApproval(modelId, { ...input, decision: 'CHANGES_REQUESTED' }, actor);
  }

  static async releaseGate(modelId: string, actor: BankUser) {
    await this.detail(modelId, actor);
    const detail = await ThreatModelRepository.modelDetail(modelId) as Input; const revision = (detail.revisions as Input[]).find((item) => item.id === detail.model.currentRevisionId);
    const currentRevisionId = detail.model.currentRevisionId as string | undefined;
    const policy = await this.loadPolicy(String(detail.model.organizationId || 'org-bank'));
    const state: ReleaseGateState = { applicable: true, threatModel: { status: detail.model.status, currentRevisionId, approvedRevisionId: revision?.status === 'APPROVED' ? revision.id : undefined }, threats: detail.threats as ReleaseGateState['threats'], controls: detail.controls as ReleaseGateState['controls'], verifications: detail.verifications as ReleaseGateState['verifications'], approvals: (detail.approvals as Input[]).filter((approval) => approval.revisionId === currentRevisionId) as ReleaseGateState['approvals'], exceptions: detail.exceptions as ReleaseGateState['exceptions'], releaseBlockingSeverities: policy.releaseBlockingSeverities, requiredApprovalStages: policy.requiredApprovalStages };
    // This is a read-only endpoint used by the workspace on every model open.
    // Do not append audit rows for passive UI reads; the actual authorization
    // operation below records the auditable release decision.
    return evaluateSecurityReleaseGate(state);
  }

  static async authorizeRelease(modelId: string, releaseId: string, actor: BankUser) {
    if (!releaseAuthority(actor)) throw new Error('Security release authorization requires AppSec, Security Architecture, CISO, or platform security authority.');
    const gate = await this.releaseGate(modelId, actor);
    if (!gate.allowed) throw new Error(`Release is blocked: ${gate.blockers.join(' ')}`);
    const detail = await this.detail(modelId, actor);
    const model = detail.model as Input;
    const revisionId = String(model.currentRevisionId || '');
    if (!revisionId) throw new Error('Current approved Threat Model revision is unavailable.');
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const authorization = issueReleaseAuthorization({ modelId, revisionId, releaseId, expiresAt });
    await pgClient.transaction(async (client) => ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId, actorId: actor.id, action: 'RELEASE_AUTHORIZED', entityType: 'RELEASE_AUTHORIZATION', entityId: releaseId, newValue: { revisionId, expiresAt, gate } }));
    return { authorization, expiresAt, revisionId, gate };
  }

  static async requestRiskAcceptance(threatId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async (client) => {
      const context = await this.lockThreatContext(threatId, client); this.assertRead(context.model, actor);
      const controlId = text(input.controlId, '', false) || null;
      if (controlId) { const control = await client.query('SELECT 1 FROM threat_controls WHERE id=$1 AND threat_id=$2', [controlId, threatId]); if (!control.rowCount) throw new Error('Risk acceptance control must mitigate the selected threat.'); }
      const expiresAt = new Date(text(input.expiresAt, 'Exception expiry')); if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) throw new Error('Exception expiry must be a future date.');
      const exceptionId = id('tmx'); const riskLevel = text(input.riskLevel, 'Risk level'); if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(riskLevel)) throw new Error('Invalid risk level.');
      const policy = await this.loadPolicy(context.model.organizationId, client);
      if ((expiresAt.getTime() - Date.now()) / 86400000 > (policy.maxExceptionDays[riskLevel] || defaultPolicy.maxExceptionDays[riskLevel])) throw new Error(`Exception duration exceeds the configured ${riskLevel} maximum.`);
      await client.query(`INSERT INTO threat_model_exceptions(id,threat_id,control_id,reason,business_justification,risk_level,compensating_controls,requested_by_user_id,expires_at,review_date,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'REQUESTED')`, [exceptionId, threatId, controlId, text(input.reason, 'Reason'), text(input.businessJustification, 'Business justification'), riskLevel, text(input.compensatingControls, '', false) || null, actor.id, expiresAt.toISOString(), text(input.reviewDate, '', false) || null]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: context.model.id, revisionId: context.revisionId, actorId: actor.id, action: 'RISK_ACCEPTANCE_REQUESTED', entityType: 'THREAT_MODEL_EXCEPTION', entityId: exceptionId, newValue: { threatId, riskLevel, expiresAt: expiresAt.toISOString() } });
      return (await client.query<Input>('SELECT * FROM threat_model_exceptions WHERE id=$1', [exceptionId])).rows.map(ThreatModelRepository.exception)[0];
    });
  }

  static async decideRiskAcceptance(exceptionId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async (client) => {
      const result = await client.query<Input>(`SELECT e.*,tm.id AS threat_model_id,tm.business_owner_id,tm.technical_owner_id,tm.security_owner_id,tm.department_id,t.revision_id FROM threat_model_exceptions e JOIN threats t ON t.id=e.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id JOIN threat_models tm ON tm.id=r.threat_model_id WHERE e.id=$1 FOR UPDATE`, [exceptionId]); const exception = result.rows[0]; if (!exception) throw new Error('Threat Model exception not found.');
      const model = ThreatModelRepository.model({ id: exception.threat_model_id, business_owner_id: exception.business_owner_id, technical_owner_id: exception.technical_owner_id, security_owner_id: exception.security_owner_id, department_id: exception.department_id }); this.assertRead(model, actor); if (exception.requested_by_user_id === actor.id) throw new Error('Risk requester cannot approve their own exception.');
      const decision = text(input.decision, 'Decision'); if (!['APPROVED', 'REJECTED', 'REVOKED'].includes(decision)) throw new Error('Invalid exception decision.');
      if (['CRITICAL', 'HIGH'].includes(exception.risk_level) && !riskAuthority(actor)) throw new Error('CISO or delegated risk authority is required for high or critical risk acceptance.');
      if (!['CRITICAL', 'HIGH'].includes(exception.risk_level) && !(riskAuthority(actor) || appSec(actor) || actor.roles.includes('GRC_ANALYST'))) throw new Error('GRC, AppSec, or risk authority is required for this exception decision.');
      await client.query(`UPDATE threat_model_exceptions SET status=$1,approver_id=$2,approved_at=CASE WHEN $1='APPROVED' THEN NOW() ELSE approved_at END WHERE id=$3`, [decision, actor.id, exceptionId]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: exception.threat_model_id, revisionId: exception.revision_id, actorId: actor.id, action: `RISK_ACCEPTANCE_${decision}`, entityType: 'THREAT_MODEL_EXCEPTION', entityId: exceptionId, newValue: { decision } });
      return (await client.query<Input>('SELECT * FROM threat_model_exceptions WHERE id=$1', [exceptionId])).rows.map(ThreatModelRepository.exception)[0];
    });
  }

  static async linkEvidence(modelId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async (client) => {
      const model = await this.lockModel(modelId, client); this.assertWrite(model, actor); const attachmentId = text(input.attachmentId, 'Attachment');
      const attachment = await client.query<Input>('SELECT id,ticket_id,sha256_hash FROM ticket_attachments WHERE id=$1', [attachmentId]); if (!attachment.rows[0]) throw new Error('Evidence attachment not found.');
      const sourceTicket = db.data.tickets.find((ticket) => ticket.id === attachment.rows[0].ticket_id);
      if (!sourceTicket) throw new Error('Evidence attachment source ticket is unavailable for authorization.');
      const attachmentAccess = AuthService.canAccessResource({ user: actor, action: 'READ', resourceType: 'TICKET', resource: sourceTicket });
      if (!attachmentAccess.allowed) throw new Error(attachmentAccess.reason || 'Not authorized to link this attachment as Threat Model evidence.');
      const storedAttachment = db.data.attachments.find((candidate) => candidate.id === attachmentId);
      if (!storedAttachment || storedAttachment.virusScanStatus !== 'CLEAN') throw new Error('Only a clean, retained attachment can be linked as security evidence.');
      const evidenceId = id('tme'); const linkedEntityType = text(input.linkedEntityType || 'THREAT_MODEL', 'Linked entity type'); const linkedEntityId = text(input.linkedEntityId || modelId, 'Linked entity ID');
      const revisionId = text(input.revisionId || model.currentRevisionId, '', false) || null;
      if (revisionId) {
        const revision = await client.query(`SELECT 1 FROM threat_model_revisions WHERE id=$1 AND threat_model_id=$2`, [revisionId, modelId]);
        if (!revision.rowCount) throw new Error('Evidence revision does not belong to this Threat Model.');
      }
      if (input.controlId) {
        const control = await client.query(`SELECT 1 FROM threat_controls c JOIN threats t ON t.id=c.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id WHERE c.id=$1 AND r.threat_model_id=$2`, [text(input.controlId, 'Control'), modelId]);
        if (!control.rowCount) throw new Error('Evidence control does not belong to this Threat Model.');
      }
      if (input.threatId) {
        const threat = await client.query(`SELECT 1 FROM threats t JOIN threat_model_revisions r ON r.id=t.revision_id WHERE t.id=$1 AND r.threat_model_id=$2`, [text(input.threatId, 'Threat'), modelId]);
        if (!threat.rowCount) throw new Error('Evidence threat does not belong to this Threat Model.');
      }
      await client.query(`INSERT INTO threat_model_evidence(id,threat_model_id,revision_id,threat_id,control_id,verification_id,attachment_id,classification,linked_entity_type,linked_entity_id,uploaded_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [evidenceId, modelId, text(input.revisionId || model.currentRevisionId, '', false) || null, text(input.threatId, '', false) || null, text(input.controlId, '', false) || null, text(input.verificationId, '', false) || null, attachmentId, text(input.classification || model.dataClassification, 'Classification'), linkedEntityType, linkedEntityId, actor.id]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId: text(input.revisionId || model.currentRevisionId, '', false) || undefined, actorId: actor.id, action: 'EVIDENCE_LINKED', entityType: 'THREAT_MODEL_EVIDENCE', entityId: evidenceId, newValue: { attachmentId, sha256: attachment.rows[0].sha256_hash } });
      return { id: evidenceId, attachmentId };
    });
  }

  static async markReviewRequiredForMaterialChange(scope: { projectId?: string; assetId?: string; serviceId?: string; changeId?: string }, actor: BankUser) {
    const filters = Object.entries(scope).filter(([, value]) => Boolean(value)); if (!filters.length) return [];
    const clauses = filters.map(([field], index) => `${field.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)} = $${index + 1}`).join(' OR ');
    const values = filters.map(([, value]) => value);
    const models = await pgClient.query<Input>(`SELECT id,current_revision_id FROM threat_models WHERE status='APPROVED' AND (${clauses})`, values);
    await pgClient.transaction(async (client) => {
      for (const model of models.rows) {
        const revisionId = await this.createMaterialChangeRevision(client, model.id, actor, scope);
        if (!revisionId) continue;
        await client.query(`UPDATE threat_models SET current_revision_id=$1,status='REVIEW_REQUIRED',updated_at=NOW(),version=version+1 WHERE id=$2`, [revisionId, model.id]);
        await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: model.id, revisionId, actorId: actor.id, action: 'REVIEW_REQUIRED', entityType: 'THREAT_MODEL', entityId: model.id, newValue: scope });
      }
    });
    return models.rows.map((model) => model.id);
  }

  /** Ticket completion signals implementation only; verification remains a separate AppSec action. */
  static async synchronizeControlTicket(ticketId: string, statusCategory: string, actor: BankUser) {
    await pgClient.transaction(async (client) => {
      const controls = await client.query<Input>(`SELECT c.id,c.threat_id,t.revision_id,r.threat_model_id FROM threat_controls c JOIN threats t ON t.id=c.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id WHERE c.implementation_ticket_id=$1 FOR UPDATE`, [ticketId]);
      for (const control of controls.rows) {
        const status = statusCategory === 'DONE' ? 'VERIFICATION_REQUIRED' : statusCategory === 'CANCELLED' ? 'PLANNED' : 'IN_IMPLEMENTATION';
        await client.query('UPDATE threat_controls SET status=$1,updated_at=NOW() WHERE id=$2', [status, control.id]);
        await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: control.threat_model_id, revisionId: control.revision_id, actorId: actor.id, action: 'REMEDIATION_TICKET_SYNCHRONIZED', entityType: 'THREAT_CONTROL', entityId: control.id, newValue: { ticketId, status, statusCategory } });
        if (status === 'VERIFICATION_REQUIRED') await enqueueOutbox(client, 'threat-control.verification.required', 'THREAT_CONTROL', control.id, { threatModelId: control.threat_model_id, revisionId: control.revision_id, controlId: control.id, implementationTicketId: ticketId, completedBy: actor.id });
      }
    });
  }

  /** A material-change re-review starts from a faithful structural copy while retaining the approved revision as immutable evidence. */
  private static async createMaterialChangeRevision(client: PoolClient, modelId: string, actor: BankUser, scope: Input): Promise<string | undefined> {
    const model = await this.lockModel(modelId, client);
    if (model.status !== 'APPROVED') return undefined;
    const previousResult = await client.query<Input>('SELECT * FROM threat_model_revisions WHERE id=$1 FOR UPDATE', [model.currentRevisionId]);
    const previous = previousResult.rows[0];
    if (!previous || previous.status !== 'APPROVED') throw new Error('A material-change revision requires a current approved Threat Model revision.');
    const revisionId = id('tmr'); const revisionNumber = Number(previous.revision_number) + 1;
    await client.query(`INSERT INTO threat_model_revisions(id,threat_model_id,revision_number,status,scope_summary,architecture_summary,assumptions,security_objectives,in_scope,out_of_scope,supersedes_revision_id,change_reason,created_by_user_id)
      VALUES($1,$2,$3,'DRAFT',$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)`, [revisionId, modelId, revisionNumber, previous.scope_summary, previous.architecture_summary, previous.assumptions, previous.security_objectives, JSON.stringify(previous.in_scope || []), JSON.stringify(previous.out_of_scope || []), previous.id, `Material change detected: ${Object.keys(scope).filter((key) => scope[key]).join(', ')}`, actor.id]);

    const componentIds = new Map<string, string>();
    const boundaryIds = new Map<string, string>();
    const flowIds = new Map<string, string>();
    const threatIds = new Map<string, string>();
    const components = await client.query<Input>('SELECT * FROM threat_model_components WHERE revision_id=$1 ORDER BY name', [previous.id]);
    for (const component of components.rows) {
      const newId = id('cmp'); componentIds.set(component.id, newId);
      await client.query(`INSERT INTO threat_model_components(id,revision_id,name,type,description,technology,asset_id,owner_id,criticality) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [newId, revisionId, component.name, component.type, component.description, component.technology, component.asset_id, component.owner_id, component.criticality]);
    }
    const boundaries = await client.query<Input>('SELECT * FROM threat_model_trust_boundaries WHERE revision_id=$1 ORDER BY name', [previous.id]);
    for (const boundary of boundaries.rows) {
      const newId = id('bnd'); boundaryIds.set(boundary.id, newId);
      await client.query(`INSERT INTO threat_model_trust_boundaries(id,revision_id,name,description,boundary_type,trust_level_from,trust_level_to,authentication_required,encryption_required,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [newId, revisionId, boundary.name, boundary.description, boundary.boundary_type, boundary.trust_level_from, boundary.trust_level_to, boundary.authentication_required, boundary.encryption_required, boundary.notes]);
    }
    const flows = await client.query<Input>('SELECT * FROM threat_model_data_flows WHERE revision_id=$1 ORDER BY name', [previous.id]);
    for (const flow of flows.rows) {
      const newId = id('flow'); flowIds.set(flow.id, newId);
      await client.query(`INSERT INTO threat_model_data_flows(id,revision_id,source_component_id,destination_component_id,trust_boundary_id,name,description,protocol,port,authentication_method,encryption_in_transit,data_classification,data_types,crosses_trust_boundary,direction,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)`, [newId, revisionId, componentIds.get(flow.source_component_id), componentIds.get(flow.destination_component_id), flow.trust_boundary_id ? boundaryIds.get(flow.trust_boundary_id) || null : null, flow.name, flow.description, flow.protocol, flow.port, flow.authentication_method, flow.encryption_in_transit, flow.data_classification, JSON.stringify(flow.data_types || []), flow.crosses_trust_boundary, flow.direction, flow.notes]);
    }
    const threats = await client.query<Input>('SELECT * FROM threats WHERE revision_id=$1 ORDER BY created_at,id', [previous.id]);
    for (let index = 0; index < threats.rows.length; index += 1) {
      const threat = threats.rows[index]; const newId = id('th'); threatIds.set(threat.id, newId);
      await client.query(`INSERT INTO threats(id,revision_id,key,title,description,categories,attack_scenario,attacker_type,attacker_capability,preconditions,attack_path,affected_component_id,affected_data_flow_id,affected_trust_boundary_id,affected_asset_id,cwe_ids,capec_ids,inherent_likelihood,inherent_impact,inherent_score,status,owner_id,due_date,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,$20,'OPEN',$21,$22,$23)`, [newId, revisionId, `${model.key}-R${revisionNumber}-T${String(index + 1).padStart(3, '0')}`, threat.title, threat.description, JSON.stringify(threat.categories || []), threat.attack_scenario, threat.attacker_type, threat.attacker_capability, threat.preconditions, threat.attack_path, threat.affected_component_id ? componentIds.get(threat.affected_component_id) || null : null, threat.affected_data_flow_id ? flowIds.get(threat.affected_data_flow_id) || null : null, threat.affected_trust_boundary_id ? boundaryIds.get(threat.affected_trust_boundary_id) || null : null, threat.affected_asset_id, JSON.stringify(threat.cwe_ids || []), JSON.stringify(threat.capec_ids || []), threat.inherent_likelihood, threat.inherent_impact, threat.inherent_score, threat.owner_id, threat.due_date, actor.id]);
    }
    const controls = await client.query<Input>('SELECT c.* FROM threat_controls c JOIN threats t ON t.id=c.threat_id WHERE t.revision_id=$1 ORDER BY c.created_at,c.id', [previous.id]);
    for (const control of controls.rows) {
      const carriedStatus = control.required_before_release ? 'VERIFICATION_REQUIRED' : 'PROPOSED';
      await client.query(`INSERT INTO threat_controls(id,threat_id,title,description,control_type,implementation_owner_id,status,required_before_release,due_date,effectiveness_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id('ctl'), threatIds.get(control.threat_id), control.title, control.description, control.control_type, control.implementation_owner_id, carriedStatus, control.required_before_release, control.due_date, control.effectiveness_status]);
    }
    await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId, actorId: actor.id, action: 'REVISION_CREATED', entityType: 'THREAT_MODEL_REVISION', entityId: revisionId, oldValue: { revisionId: previous.id }, newValue: { revisionNumber, materialChange: scope } });
    return revisionId;
  }

  private static async addArchitecture(kind: 'component' | 'boundary' | 'flow', modelId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async (client) => {
      const model = await this.lockModel(modelId, client); this.assertWrite(model, actor); const revision = await ThreatModelRepository.requireMutableRevision(model.currentRevisionId, client); const entityId = id(kind === 'component' ? 'cmp' : kind === 'boundary' ? 'bnd' : 'flow');
      if (kind === 'component') await client.query(`INSERT INTO threat_model_components(id,revision_id,name,type,description,technology,asset_id,owner_id,criticality) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [entityId, revision.id, text(input.name, 'Component name'), text(input.type, 'Component type'), text(input.description, '', false) || null, text(input.technology, '', false) || null, text(input.assetId, '', false) || null, text(input.ownerId, '', false) || null, text(input.criticality, '', false) || null]);
      if (kind === 'boundary') await client.query(`INSERT INTO threat_model_trust_boundaries(id,revision_id,name,description,boundary_type,trust_level_from,trust_level_to,authentication_required,encryption_required,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [entityId, revision.id, text(input.name, 'Boundary name'), text(input.description, '', false) || null, text(input.boundaryType, 'Boundary type'), text(input.trustLevelFrom, '', false) || null, text(input.trustLevelTo, '', false) || null, input.authenticationRequired !== false, input.encryptionRequired !== false, text(input.notes, '', false) || null]);
      if (kind === 'flow') { const sourceComponentId = text(input.sourceComponentId, 'Source component'); const destinationComponentId = text(input.destinationComponentId, 'Destination component'); const trustBoundaryId = text(input.trustBoundaryId, '', false) || null; const components = await client.query('SELECT id FROM threat_model_components WHERE revision_id=$1 AND id = ANY($2::varchar[])', [revision.id, [sourceComponentId, destinationComponentId]]); if (new Set(components.rows.map((row: Input) => row.id)).size !== 2) throw new Error('Data-flow source and destination must belong to the current Threat Model revision.'); if (trustBoundaryId) { const boundary = await client.query('SELECT 1 FROM threat_model_trust_boundaries WHERE id=$1 AND revision_id=$2', [trustBoundaryId, revision.id]); if (!boundary.rowCount) throw new Error('Data-flow trust boundary must belong to the current Threat Model revision.'); } const port = input.port === undefined || input.port === null || input.port === '' ? null : Number(input.port); if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new Error('Port must be between 1 and 65535.'); await client.query(`INSERT INTO threat_model_data_flows(id,revision_id,source_component_id,destination_component_id,trust_boundary_id,name,description,protocol,port,authentication_method,encryption_in_transit,data_classification,data_types,crosses_trust_boundary,direction,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)`, [entityId, revision.id, sourceComponentId, destinationComponentId, trustBoundaryId, text(input.name, 'Data flow name'), text(input.description, '', false) || null, text(input.protocol, '', false) || null, port, text(input.authenticationMethod, '', false) || null, input.encryptionInTransit ?? null, text(input.dataClassification || 'CONFIDENTIAL_SECURITY_ONLY', 'Data classification'), JSON.stringify(list(input.dataTypes)), Boolean(input.crossesTrustBoundary), input.direction === 'BIDIRECTIONAL' ? 'BIDIRECTIONAL' : 'ONE_WAY', text(input.notes, '', false) || null]); }
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId: revision.id, actorId: actor.id, action: `${kind.toUpperCase()}_CREATED`, entityType: `THREAT_MODEL_${kind.toUpperCase()}`, entityId });
      const table = kind === 'component' ? 'threat_model_components' : kind === 'boundary' ? 'threat_model_trust_boundaries' : 'threat_model_data_flows'; const mapper = kind === 'component' ? ThreatModelRepository.component : kind === 'boundary' ? ThreatModelRepository.boundary : ThreatModelRepository.flow;
      return (await client.query<Input>(`SELECT * FROM ${table} WHERE id=$1`, [entityId])).rows.map(mapper)[0];
    });
  }

  private static async loadPolicy(organizationId: string, client?: QueryClient): Promise<ThreatModelPolicy> {
    const connection = client || pgClient;
    const result = await connection.query<Input>('SELECT policy FROM threat_model_policies WHERE organization_id=$1', [organizationId]);
    const stored = result.rows[0]?.policy;
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return {
      requiredSignals: Array.isArray(parsed?.requiredSignals) && parsed.requiredSignals.length ? list(parsed.requiredSignals) : defaultPolicy.requiredSignals,
      reviewFrequencyDays: Number.isInteger(Number(parsed?.reviewFrequencyDays)) && Number(parsed.reviewFrequencyDays) > 0 ? Number(parsed.reviewFrequencyDays) : defaultPolicy.reviewFrequencyDays,
      maxExceptionDays: { ...defaultPolicy.maxExceptionDays, ...(parsed?.maxExceptionDays && typeof parsed.maxExceptionDays === 'object' ? Object.fromEntries(Object.entries(parsed.maxExceptionDays).map(([key, value]) => [key, Number(value)])) : {}) },
      requiredApprovalStages: Array.isArray(parsed?.requiredApprovalStages) && parsed.requiredApprovalStages.length ? list(parsed.requiredApprovalStages) : defaultPolicy.requiredApprovalStages,
      releaseBlockingSeverities: Array.isArray(parsed?.releaseBlockingSeverities) ? list(parsed.releaseBlockingSeverities) : defaultPolicy.releaseBlockingSeverities,
      verificationExpirationDays: { ...defaultPolicy.verificationExpirationDays, ...(parsed?.verificationExpirationDays && typeof parsed.verificationExpirationDays === 'object' ? Object.fromEntries(Object.entries(parsed.verificationExpirationDays).map(([key, value]) => [key, Number(value)])) : {}) },
      remediationSlaDays: { ...defaultPolicy.remediationSlaDays, ...(parsed?.remediationSlaDays && typeof parsed.remediationSlaDays === 'object' ? Object.fromEntries(Object.entries(parsed.remediationSlaDays).map(([key, value]) => [key, Number(value)])) : {}) },
    };
  }

  private static async lockModel(modelId: string, client: PoolClient): Promise<Input> { const result = await client.query<Input>('SELECT * FROM threat_models WHERE id=$1 FOR UPDATE', [modelId]); if (!result.rows[0]) throw new Error('Threat Model not found.'); return ThreatModelRepository.model(result.rows[0]); }
  private static async lockThreatContext(threatId: string, client: PoolClient): Promise<{ model: Input; revisionId: string; inherentScore: number }> { const result = await client.query<Input>(`SELECT tm.*,t.revision_id,t.inherent_score FROM threats t JOIN threat_model_revisions r ON r.id=t.revision_id JOIN threat_models tm ON tm.id=r.threat_model_id WHERE t.id=$1 FOR UPDATE`, [threatId]); if (!result.rows[0]) throw new Error('Threat not found.'); return { model: ThreatModelRepository.model(result.rows[0]), revisionId: result.rows[0].revision_id, inherentScore: Number(result.rows[0].inherent_score) }; }
  private static async lockControlContext(controlId: string, client: PoolClient): Promise<{ model: Input; revisionId: string; implementerId?: string }> { const result = await client.query<Input>(`SELECT tm.*,t.revision_id,c.implementation_owner_id FROM threat_controls c JOIN threats t ON t.id=c.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id JOIN threat_models tm ON tm.id=r.threat_model_id WHERE c.id=$1 FOR UPDATE`, [controlId]); if (!result.rows[0]) throw new Error('Threat control not found.'); return { model: ThreatModelRepository.model(result.rows[0]), revisionId: result.rows[0].revision_id, implementerId: result.rows[0].implementation_owner_id || undefined }; }
  private static assertRead(model: Input, actor: BankUser): void { if (privileged(actor) || appSec(actor) || actor.roles.includes('AUDITOR') || [model.businessOwnerId, model.technicalOwnerId, model.securityOwnerId].includes(actor.id) || (model.departmentId && model.departmentId === actor.departmentId)) return; throw new Error('Threat Model access is restricted to its owners, department, security reviewers, and auditors.'); }
  private static assertWrite(model: Input, actor: BankUser): void { this.assertRead(model, actor); if (actor.roles.includes('AUDITOR')) throw new Error('Auditor access is read-only.'); if (privileged(actor) || appSec(actor) || [model.businessOwnerId, model.technicalOwnerId, model.securityOwnerId].includes(actor.id)) return; throw new Error('Only a Threat Model owner or authorized security team member may modify this model.'); }
  /** IDs received from the browser must reference an existing, actor-visible operational record; opaque strings cannot create cross-scope models. */
  private static assertScopeReferences(input: Input, actor: BankUser): void {
    const owners = new Set<string>(); const departments = new Set<string>();
    const addRecord = (record: any, label: string) => {
      if (!record) throw new Error(`${label} does not exist or is no longer available.`);
      for (const owner of [record.ownerId, record.managerId, record.businessOwnerId, record.businessOwnerUserId, record.technicalOwnerId, record.technicalOwnerUserId, record.requesterId, record.reporterId]) if (owner) owners.add(String(owner));
      if (record.departmentId) departments.add(String(record.departmentId));
    };
    const serviceId = text(input.serviceId, '', false); if (serviceId) addRecord(db.data.configurationItems.find((item) => item.id === serviceId) || db.data.applications.find((item) => item.id === serviceId), 'Service');
    const assetId = text(input.assetId, '', false); if (assetId) addRecord(db.data.configurationItems.find((item) => item.id === assetId) || db.data.assets.find((item) => item.id === assetId), 'Asset');
    const projectId = text(input.projectId, '', false); if (projectId) addRecord(db.data.projects.find((item) => item.id === projectId), 'Project');
    const changeId = text(input.changeId, '', false); if (changeId) addRecord(db.data.tickets.find((item) => item.id === changeId && item.category === 'CHANGE_REQUEST'), 'Change request');
    const releaseId = text(input.releaseId, '', false); if (releaseId) addRecord(db.data.tickets.find((item) => item.id === releaseId), 'Release record');
    if (!appSec(actor) && !privileged(actor) && !owners.has(actor.id) && (!actor.departmentId || !departments.has(actor.departmentId))) {
      throw new Error('You may create a Threat Model only for an operational record you own or that belongs to your department.');
    }
  }
}
