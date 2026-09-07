import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../shared/canonical-json.js';
import { emergencyDeadline, emergencySlaState } from './threat-emergency-policy.js';
import type { BusinessCalendar } from '../../shared/types/orchestration.js';
import { z } from 'zod';
import { ThreatReportingService } from './threat-reporting.service.js';
import { storageService } from './storage.service.js';
import { threatAuthoringSchema, threatEditSchema } from './threat-authoring.schema.js';
import { architectureSchemas, architectureStorage, architectureEditSchema, type ArchitectureKind } from './threat-architecture.schema.js';
import { riskRating as risk } from '../../shared/risk-matrix.js';
import { assertExceptionDecision, evaluateScreening, exceptionLimits, nextReviewDate, screeningRules, screeningRuleSchema, securityReviewer, seniorRiskAuthority } from './threat-model-policy.js';
import type { PoolClient } from 'pg';
import type { BankUser } from '../../shared/types/auth.js';
import { ThreatModelRepository } from '../db/postgres/threat-model-repository.js';
import { pgClient } from '../db/postgres/client.js';
import { db } from '../db/database.js';
import { AuthService, CONFIDENTIALITY_LEVELS } from './auth.service.js';
import { AuditService } from './audit.service.js';
import { evaluateSecurityReleaseGate, issueReleaseAuthorization, verifyReleaseAuthorization } from './security-release-gate.service.js';

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
const appSec = securityReviewer;
const securityArchitecture = securityReviewer;
const riskAuthority = seniorRiskAuthority;
const releaseAuthority = securityReviewer;
const score = (value: unknown, label: string) => { const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error(`${label} must be an integer from 1 to 5.`); return n; };
const text = (value: unknown, label: string, required = true) => { const result = String(value ?? '').trim(); if (required && !result) throw new Error(`${label} is required.`); return result; };
const list = (value: unknown) => Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
const defaultPolicy: ThreatModelPolicy = {
  requiredSignals: ['internetExposed', 'customerData', 'confidentialData', 'financialTransactions', 'authenticationChange', 'authorizationChange', 'privilegedCapability', 'externalApi', 'trustBoundary', 'thirdPartyIntegration', 'cloudDeployment', 'newDataStore', 'cryptography', 'secretsHandling', 'paymentRelated', 'coreBankingRelated', 'iamPamRelated', 'criticalInfrastructure', 'materialArchitectureChange', 'highCriticalAsset', 'securityIncidentDriven'],
  reviewFrequencyDays: 365,
  maxExceptionDays: { ...exceptionLimits },
  requiredApprovalStages: ['APPSEC', 'SECURITY_ARCHITECTURE'],
  releaseBlockingSeverities: ['CRITICAL', 'HIGH'],
  verificationExpirationDays: { DEFAULT: 90, SAST: 30, SCA: 30, DAST: 30, PENETRATION_TEST: 180 },
  remediationSlaDays: { CRITICAL: 1, HIGH: 14, MEDIUM: 30, LOW: 90 },
};
export const enqueueOutbox = async (client: PoolClient, topic: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>, correlationId?: string) => {
  await client.query(`INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload,correlation_id,occurred_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,NOW())`, [id('out'), topic, aggregateType, aggregateId, JSON.stringify(payload), correlationId || null]);
};

export class ThreatModelService {
  static async governancePolicy(organizationId = 'org-bank', client: QueryClient = pgClient) {
    const version = (await client.query<Input>(`SELECT * FROM threat_governance_policy_versions WHERE organization_id=$1 AND effective_at<=NOW() ORDER BY version DESC LIMIT 1`, [organizationId])).rows[0];
    if (!version) throw new Error('An effective governance policy is required for this organization.');
    const rules = (await client.query<Input>('SELECT signal,reason,weight,minimum_tier AS "minimumTier" FROM threat_screening_rules WHERE policy_version_id=$1 ORDER BY signal', [version.id])).rows;
    return { id: String(version.id), version: Number(version.version), config: version.config as Input, effectiveAt: version.effective_at, rules: rules.map(rule => screeningRuleSchema.parse(rule)) };
  }

  static async updateGovernancePolicy(input: Input, actor: BankUser) {
    if (actor.roles.includes('AUDITOR') || !privileged(actor)) throw new Error('Governance policy management authority is required.');
    const rules = z.array(screeningRuleSchema).min(1).max(100).parse(input.rules);
    if (new Set(rules.map(rule => rule.signal)).size !== rules.length) throw new Error('Duplicate screening rules are invalid.');
    for (const baseline of screeningRules) {
      if (!rules.some(rule => rule.signal === baseline.signal && rule.minimumTier >= baseline.minimumTier)) throw new Error(`Mandatory trigger cannot be removed or downgraded: ${baseline.signal}.`);
    }
    const thresholds = z.object({ 1: z.number().int().positive(), 2: z.number().int().positive(), 3: z.number().int().positive() }).parse(input.scoreThresholds);
    if (!(thresholds[1] < thresholds[2] && thresholds[2] < thresholds[3])) throw new Error('Invalid screening thresholds.');
    const reviewMonths = z.object({ 0:z.number().int().min(1).max(24),1:z.number().int().min(1).max(12),2:z.number().int().min(1).max(12),3:z.number().int().min(1).max(6) }).optional().parse(input.reviewMonths);
    const exceptionDays = z.object({ CRITICAL:z.number().int().min(1).max(7),HIGH:z.number().int().min(1).max(30),MEDIUM:z.number().int().min(1).max(90),LOW:z.number().int().min(1).max(180) }).optional().parse(input.exceptionDays);
    return pgClient.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('threat-governance-policy'))");
      const organizationId = 'org-bank';
      const previous = await this.governancePolicy(organizationId, client);
      const policyId = id('tmgp');
      await client.query(`INSERT INTO threat_governance_policy_versions(id,organization_id,version,config,created_by) VALUES($1,$2,$3,$4::jsonb,$5)`, [policyId, organizationId, Number(previous.version) + 1, JSON.stringify({ ...previous.config, scoreThresholds: thresholds, reviewMonths:reviewMonths || previous.config.reviewMonths,exceptionDays:exceptionDays || previous.config.exceptionDays }), actor.id]);
      for (const rule of rules) await client.query(`INSERT INTO threat_screening_rules(policy_version_id,signal,reason,weight,minimum_tier) VALUES($1,$2,$3,$4,$5)`, [policyId, rule.signal, rule.reason, rule.weight, rule.minimumTier]);
      return this.governancePolicy(organizationId, client);
    });
  }

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
    if (!privileged(actor) || actor.roles.includes('AUDITOR')) throw new Error('Threat Model policy changes require platform or CISO authority.');
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
    if (Object.entries(exceptionLimits).some(([level, maximum]) => Number(maxExceptionDays[level]) > maximum) || !requiredApprovalStages.includes('APPSEC') || !['CRITICAL','HIGH'].every(level => releaseBlockingSeverities.includes(level))) throw new Error('Mandatory approval, blocking severity, and exception limits cannot be weakened.');
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

  static async list(actor: BankUser, input: Input = {}) {
    const paging = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }).parse(input);
    const identifier = z.string().trim().min(1).max(64).optional();
    const filters = z.object({
      q: z.string().trim().min(1).max(200).optional(),
      status: z.enum(['DRAFT','IN_REVIEW','CHANGES_REQUIRED','APPROVED','REVIEW_REQUIRED','SUPERSEDED','RETIRED','ARCHIVED']).optional(),
      ownerId: identifier, serviceId: identifier, assetId: identifier,
      threatId: identifier, controlId: identifier, complianceId: identifier,
      tier: z.coerce.number().int().min(0).max(3).optional(),
      risk: z.enum(['CRITICAL','HIGH','MEDIUM','LOW']).optional(),
      classification: z.enum(['PUBLIC','INTERNAL','RESTRICTED','CONFIDENTIAL_SECURITY_ONLY','HIGHLY_RESTRICTED_HR_LEGAL']).optional(),
      reviewDueBefore: z.string().datetime().optional(),
      threatDueBefore: z.string().date().optional(),
      exceptionExpiresBefore: z.string().datetime().optional(),
    }).parse(input);
    if (!actor.isActive) throw new Error('Inactive user access is restricted.');
    const classifications = Object.entries(CONFIDENTIALITY_LEVELS).filter(([,level]) => level <= (CONFIDENTIALITY_LEVELS[actor.securityClearance] || 0)).map(([classification])=>classification);
    return ThreatModelRepository.list({ userId: actor.id, elevated: appSec(actor) || actor.roles.includes('AUDITOR'), classifications, filters, ...paging });
  }

  static async governanceReport(actor: BankUser) { return ThreatReportingService.report(actor); }


  static async listMigrationBacklog(actor: BankUser, organizationId = 'org-bank') {
    if (!actor.isActive || !(appSec(actor) || actor.roles.includes('GRC_ANALYST') || actor.roles.includes('AUDITOR'))) throw new Error('Threat Model migration backlog access requires security, GRC, or audit authority.');
    const classifications=Object.entries(CONFIDENTIALITY_LEVELS).filter(([,level])=>level<=(CONFIDENTIALITY_LEVELS[actor.securityClearance]||0)).map(([name])=>name);
    const result = await pgClient.query<Input>(`SELECT b.*,tm.key AS threat_model_key FROM threat_model_migration_backlog b LEFT JOIN threat_models tm ON tm.id=b.current_threat_model_id WHERE b.organization_id=$1 AND ((tm.id IS NOT NULL AND tm.data_classification=ANY($4::varchar[]) AND ($2 OR $3 IN(tm.business_owner_id,tm.technical_owner_id,tm.security_owner_id) OR EXISTS(SELECT 1 FROM threat_model_active_grants g WHERE g.threat_model_id=tm.id AND g.user_id=$3))) OR (b.current_threat_model_id IS NULL AND 'CONFIDENTIAL_SECURITY_ONLY'=ANY($4::varchar[]) AND ($2 OR b.owner_id=$3))) ORDER BY b.tier,b.target_date NULLS LAST,b.system_name LIMIT 200`, [organizationId,appSec(actor)||actor.roles.includes('AUDITOR'),actor.id,classifications]);
    return result.rows.map((row) => ({ id: row.id, organizationId: row.organization_id, systemName: row.system_name, serviceId: row.service_id || undefined, assetId: row.asset_id || undefined, projectId: row.project_id || undefined, tier: row.tier, status: row.status, criticality: row.criticality, ownerId: row.owner_id || undefined, targetDate: row.target_date?.toISOString?.().slice(0, 10) || row.target_date, currentThreatModelId: row.current_threat_model_id || undefined, currentThreatModelKey: row.threat_model_key || undefined, notes: row.notes || undefined }));
  }

  static async upsertMigrationBacklog(input: Input, actor: BankUser) {
    if (actor.roles.includes('AUDITOR')) throw new Error('Auditor access is read-only.');
    if (!actor.isActive || !(appSec(actor) || actor.roles.includes('GRC_ANALYST'))) throw new Error('Threat Model migration backlog changes require AppSec, GRC, or security authority.');
    if((CONFIDENTIALITY_LEVELS[actor.securityClearance]||0)<CONFIDENTIALITY_LEVELS.CONFIDENTIAL_SECURITY_ONLY)throw new Error('Security backlog access is restricted by clearance.');
    const organizationId = text(input.organizationId || 'org-bank', 'Organization'); const systemName = text(input.systemName, 'System name');
    const tier = text(input.tier, 'Tier'); const status = text(input.status, 'Migration status'); const criticality = text(input.criticality || 'HIGH', 'Criticality');
    if (!['TIER_1', 'TIER_2', 'TIER_3'].includes(tier) || !['NOT_STARTED', 'PLANNED', 'IN_PROGRESS', 'APPROVED', 'OVERDUE'].includes(status) || !['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(criticality)) throw new Error('Invalid migration backlog tier, status, or criticality.');
    return pgClient.transaction(async (client) => {
      const currentModelId = text(input.currentThreatModelId, '', false) || null;
      if (currentModelId) {
        const model = await ThreatModelRepository.findById(currentModelId,client);
        if (!model) throw new Error('The linked Threat Model does not exist.');this.assertRead(model,actor);
        if(status==='APPROVED'&&model.status!=='APPROVED')throw new Error('Migration approval must reflect an actually approved Threat Model.');
      }
      if(status==='APPROVED'&&!currentModelId)throw new Error('Migration approval requires an approved Threat Model.');
      await this.assertScopeReferences(input,actor,client);
      const existing = await client.query<Input>('SELECT * FROM threat_model_migration_backlog WHERE organization_id=$1 AND system_name=$2 FOR UPDATE', [organizationId, systemName]);
      if(!appSec(actor)&&(input.ownerId!==actor.id||existing.rows[0]&&existing.rows[0].owner_id!==actor.id))throw new Error('Migration backlog ownership is restricted.');
      const backlogId = existing.rows[0]?.id || id('tmbl');
      await client.query(`INSERT INTO threat_model_migration_backlog(id,organization_id,system_name,service_id,asset_id,project_id,tier,status,criticality,owner_id,target_date,current_threat_model_id,notes,created_by_user_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT(organization_id,system_name) DO UPDATE SET service_id=EXCLUDED.service_id,asset_id=EXCLUDED.asset_id,project_id=EXCLUDED.project_id,tier=EXCLUDED.tier,status=EXCLUDED.status,criticality=EXCLUDED.criticality,owner_id=EXCLUDED.owner_id,target_date=EXCLUDED.target_date,current_threat_model_id=EXCLUDED.current_threat_model_id,notes=EXCLUDED.notes,updated_at=NOW()`, [backlogId, organizationId, systemName, text(input.serviceId, '', false) || null, text(input.assetId, '', false) || null, text(input.projectId, '', false) || null, tier, status, criticality, text(input.ownerId, '', false) || null, text(input.targetDate, '', false) || null, currentModelId, text(input.notes, '', false) || null, actor.id]);
      await AuditService.logPostgres(client,{actor,action:'THREAT_MODEL_BACKLOG_UPDATED',entityType:'THREAT_MODEL_BACKLOG',entityId:backlogId,before:existing.rows[0],after:{...input,id:backlogId}});
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
      pgClient.query<Input>('SELECT * FROM threat_details WHERE revision_id=$1 ORDER BY inherent_score DESC,key', [revisionId]),
      pgClient.query<Input>('SELECT c.* FROM threat_control_details c JOIN threats t ON t.id=c.threat_id WHERE t.revision_id=$1 ORDER BY c.created_at', [revisionId]),
      pgClient.query<Input>('SELECT v.* FROM control_verifications v JOIN threat_controls c ON c.id=v.control_id JOIN threats t ON t.id=c.threat_id WHERE t.revision_id=$1 ORDER BY v.executed_at DESC', [revisionId]),
      pgClient.query<Input>('SELECT * FROM threat_model_approvals WHERE revision_id=$1 ORDER BY decided_at DESC', [revisionId]),
    ]);
    return { model, revision: ThreatModelRepository.revision(revision), components: components.rows.map(ThreatModelRepository.component), trustBoundaries: boundaries.rows.map(ThreatModelRepository.boundary), dataFlows: dataFlows.rows.map(ThreatModelRepository.flow), threats: threats.rows.map(ThreatModelRepository.threat), controls: controls.rows.map(ThreatModelRepository.control), verifications: verifications.rows.map(ThreatModelRepository.verification), approvals: approvals.rows.map(ThreatModelRepository.approval) };
  }

  static async create(input: Input, actor: BankUser, request: { correlationId?: string; ip?: string; userAgent?: string } = {}) {
    if (actor.roles.includes('AUDITOR')) throw new Error('Auditor access is read-only.');
    const classification = z.enum(['PUBLIC','INTERNAL','RESTRICTED','CONFIDENTIAL_SECURITY_ONLY','HIGHLY_RESTRICTED_HR_LEGAL']).parse(input.dataClassification || 'CONFIDENTIAL_SECURITY_ONLY');
    if (!actor.isActive || (CONFIDENTIALITY_LEVELS[actor.securityClearance] || 0) < CONFIDENTIALITY_LEVELS[classification]) throw new Error('Insufficient clearance for Threat Model creation.');
    const title = text(input.title, 'Title');
    const scope = ['serviceId', 'assetId', 'projectId', 'changeId', 'releaseId'].some((field) => text(input[field], '', false));
    if (!scope) throw new Error('Link the Threat Model to a service, asset, project, change, or release.');
    const criticality = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(input.criticality) ? input.criticality : 'HIGH';
    await this.assertScopeReferences(input, actor);
    return pgClient.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('threat-model-key'))");
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
    return pgClient.transaction(async (client) => {
      const modelId = text(input.threatModelId, 'Threat Model');
      const model = await this.lockModel(modelId, client); this.assertWrite(model, actor);
      const revision = await ThreatModelRepository.requireMutableRevision(model.currentRevisionId, client);
      const policy = await this.governancePolicy(model.organizationId, client);
      const answers = z.record(z.boolean()).parse(input.answers);
      // Canonical high-impact context is a floor, not an editable questionnaire answer.
      if (model.criticality === 'CRITICAL') answers.criticalInfrastructure = true;
      const canonical = (await client.query<Input>('SELECT criticality,business_criticality FROM configuration_items WHERE id=ANY($1::varchar[]) OR id IN(SELECT asset_id FROM threat_model_components WHERE revision_id=$2)',[ [model.assetId,model.serviceId].filter(Boolean),revision.id ])).rows;
      if (canonical.some(ci=>ci.criticality === 'CRITICAL' || ci.business_criticality === 'CRITICAL')) answers.criticalInfrastructure = true;
      if (canonical.some(ci=>ci.criticality === 'HIGH' || ci.business_criticality === 'HIGH')) answers.highCriticalAsset = true;
      if (['CONFIDENTIAL_SECURITY_ONLY','HIGHLY_RESTRICTED_HR_LEGAL','RESTRICTED'].includes(model.dataClassification)) answers.confidentialData = true;
      const data = (await client.query<Input>(`SELECT bool_or(d.bank_secrecy) AS secrecy,bool_or(d.sensitive_personal_data) AS sensitive,bool_or(d.payment_data) AS payment,bool_or(d.credential_data) AS credentials FROM threat_data_objects d JOIN threat_data_object_links l ON l.data_object_id=d.id WHERE l.revision_id=$1`, [revision.id])).rows[0];
      if (data?.secrecy) answers.bankSecrecy = true;
      if (data?.sensitive) answers.sensitivePersonalData = true;
      if (data?.payment) answers.paymentRelated = true;
      if (data?.credentials) answers.secretsHandling = true;
      const architecture=(await client.query<Input>(`SELECT
        EXISTS(SELECT 1 FROM threat_model_components WHERE revision_id=$1 AND criticality='CRITICAL') AS critical,
        EXISTS(SELECT 1 FROM threat_model_components WHERE revision_id=$1 AND criticality='HIGH') AS high,
        EXISTS(SELECT 1 FROM threat_model_data_flows WHERE revision_id=$1 AND crosses_trust_boundary) AS boundary,
        EXISTS(SELECT 1 FROM threat_model_data_flows WHERE revision_id=$1 AND data_classification IN ('RESTRICTED','CONFIDENTIAL_SECURITY_ONLY','HIGHLY_RESTRICTED_HR_LEGAL')) AS confidential,
        (EXISTS(SELECT 1 FROM threat_model_components WHERE revision_id=$1 AND exposure='INTERNET') OR EXISTS(SELECT 1 FROM threat_model_data_flows WHERE revision_id=$1 AND internet_exposure)) AS internet,
        (EXISTS(SELECT 1 FROM threat_model_components WHERE revision_id=$1 AND (exposure='THIRD_PARTY' OR hosting='THIRD_PARTY' OR type='THIRD_PARTY')) OR EXISTS(SELECT 1 FROM threat_model_data_flows WHERE revision_id=$1 AND third_party_involvement)) AS third_party,
        EXISTS(SELECT 1 FROM threat_model_components WHERE revision_id=$1 AND (privileges='PRIVILEGED' OR type='ADMIN')) AS privileged,
        EXISTS(SELECT 1 FROM threat_model_components WHERE revision_id=$1 AND (hosting IN ('PRIVATE_CLOUD','PUBLIC_CLOUD','HYBRID') OR type='CLOUD_SERVICE')) AS cloud,
        EXISTS(SELECT 1 FROM threat_model_components WHERE revision_id=$1 AND type='IDENTITY_PROVIDER') AS identity_provider,
        EXISTS(SELECT 1 FROM threat_model_components WHERE revision_id=$1 AND type='HSM_KMS') AS key_management`,[revision.id])).rows[0];
      if(architecture.critical)answers.criticalInfrastructure=true;
      if(architecture.high)answers.highCriticalAsset=true;
      if(architecture.boundary)answers.trustBoundary=true;
      if(architecture.confidential)answers.confidentialData=true;
      if(architecture.internet)answers.internetExposed=true;
      if(architecture.third_party)answers.thirdPartyIntegration=true;
      if(architecture.privileged)answers.privilegedCapability=true;
      if(architecture.cloud)answers.cloudDeployment=true;
      if(architecture.identity_provider)answers.iamPamRelated=true;
      if(architecture.key_management){answers.cryptography=true;answers.secretsHandling=true;}
      const evaluated = evaluateScreening(answers, policy.rules, policy.config.scoreThresholds);
      if (input.tier !== undefined && Number(input.tier) !== evaluated.tier) throw new Error('Invalid tier override: tier is derived by policy.');
      if (input.decision === 'NOT_REQUIRED' && evaluated.tier > 0) throw new Error('Mandatory Threat Modeling cannot be exempted.');
      const decision = evaluated.tier === 0 ? 'NOT_REQUIRED' : 'REQUIRED';
      const justification = text(input.justification, 'Screening justification'); const assessmentId = id('tma');
      await client.query(`INSERT INTO threat_model_applicability(id,threat_model_id,organization_id,project_id,change_id,service_id,asset_id,answers,decision,justification,assessed_by_user_id,revision_id,policy_version_id,calculated_tier,score,triggered_conditions) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`, [assessmentId, modelId, model.organizationId, model.projectId || null, model.changeId || null, model.serviceId || null, model.assetId || null, JSON.stringify(answers), decision, justification, actor.id, revision.id, policy.id, evaluated.tier, evaluated.score, JSON.stringify(evaluated.triggeredConditions)]);
      await client.query('UPDATE threat_model_revisions SET tier=$1,policy_version_id=$2,version=version+1 WHERE id=$3', [evaluated.tier, policy.id, revision.id]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId: revision.id, actorId: actor.id, action: 'APPLICABILITY_ASSESSED', entityType: 'THREAT_MODEL_APPLICABILITY', entityId: assessmentId, newValue: { decision, answers, ...evaluated, policyVersionId: policy.id }, ...request });
      return { id: assessmentId, decision, answers, justification, ...evaluated, policyVersionId: policy.id };
    });
  }

  static async createRevision(modelId: string, input: Input, actor: BankUser, request: { correlationId?: string; ip?: string; userAgent?: string } = {}) {
    return pgClient.transaction(async client => {
      const model = await this.lockModel(modelId, client); this.assertWrite(model, actor);
      const reason = text(input.changeReason, 'Change reason');
      const revisionId = await this.createMaterialChangeRevision(client, modelId, actor, { reason });
      if (!revisionId) throw new Error('A new revision requires a current approved model.');
      await client.query("UPDATE threat_models SET current_revision_id=$1,status='DRAFT',stale_reason=$2,updated_at=NOW(),version=version+1 WHERE id=$3", [revisionId, reason, modelId]);
      return ThreatModelRepository.revision((await client.query('SELECT * FROM threat_model_revisions WHERE id=$1',[revisionId])).rows[0]);
    });
  }

  static async addComponent(modelId: string, input: Input, actor: BankUser) { return this.addArchitecture('component', modelId, input, actor); }
  static async addTrustBoundary(modelId: string, input: Input, actor: BankUser) { return this.addArchitecture('boundary', modelId, input, actor); }
  static async addDataFlow(modelId: string, input: Input, actor: BankUser) { return this.addArchitecture('flow', modelId, input, actor); }

  static async updateScope(modelId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async client => {
      const model = await this.lockModel(modelId, client); this.assertWrite(model, actor);
      const revision = await ThreatModelRepository.requireMutableRevision(model.currentRevisionId, client);
      if (Number(input.version) !== revision.version) throw new Error('Revision changed by another user; refresh before saving.');
      await client.query(`UPDATE threat_model_revisions SET scope_summary=$1,architecture_summary=$2,assumptions=$3,security_objectives=$4,version=version+1 WHERE id=$5`, [text(input.scopeSummary, 'Scope'), text(input.architectureSummary, 'Architecture summary'), text(input.assumptions, 'Assumptions'), text(input.securityObjectives, 'Security objectives'), revision.id]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId: revision.id, actorId: actor.id, action: 'SCOPE_UPDATED', entityType: 'THREAT_MODEL_REVISION', entityId: revision.id, oldValue: revision, newValue: input });
      return { revisionId: revision.id };
    });
  }

  static async governanceDetail(modelId: string, actor: BankUser) {
    const model = await ThreatModelRepository.findById(modelId); if (!model) throw new Error('Threat Model not found.'); this.assertRead(model, actor);
    const revisionId = model.currentRevisionId;
    const [requirements, mappings, dataObjects, links, catalog, revision, emergencies] = await Promise.all([
      pgClient.query(`SELECT * FROM threat_security_requirements WHERE revision_id=$1 ORDER BY title`, [revisionId]),
      pgClient.query(`SELECT r.id, ARRAY(SELECT threat_id FROM threat_requirement_threats WHERE requirement_id=r.id) AS threat_ids, ARRAY(SELECT control_id FROM threat_requirement_controls WHERE requirement_id=r.id) AS control_ids, ARRAY(SELECT compliance_id FROM threat_requirement_compliance WHERE requirement_id=r.id) AS compliance_ids FROM threat_security_requirements r WHERE revision_id=$1`, [revisionId]),
      pgClient.query('SELECT * FROM threat_data_objects WHERE threat_model_id=$1 ORDER BY name', [modelId]),
      pgClient.query('SELECT * FROM threat_data_object_links WHERE revision_id=$1', [revisionId]),
      pgClient.query('SELECT * FROM threat_compliance_details ORDER BY framework,code LIMIT 500'),
      pgClient.query('SELECT id,tier,policy_version_id,review_cycle,version,architecture_version FROM threat_model_revisions WHERE id=$1', [revisionId]),
      pgClient.query('SELECT * FROM threat_emergency_changes WHERE threat_model_id=$1 ORDER BY requested_at DESC LIMIT 100', [modelId]),
    ]);
    return { requirements: requirements.rows.map(row => ({ ...row, ...mappings.rows.find(mapping => mapping.id === row.id) })), dataObjects: dataObjects.rows, dataLinks: links.rows, compliance: catalog.rows, revision: revision.rows[0], emergencies: emergencies.rows.map(row => ({...row,...emergencySlaState(row)})), policy: await this.governancePolicy(model.organizationId) };
  }

  static async createRequirement(modelId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async client => {
      const model = await this.lockModel(modelId, client); this.assertWrite(model, actor);
      const revision = await ThreatModelRepository.requireMutableRevision(model.currentRevisionId, client); const requirementId = id('tmreq');
      const threatIds = [...new Set(list(input.threatIds))]; const controlIds = [...new Set(list(input.controlIds))]; const complianceIds = [...new Set(list(input.complianceIds))];
      if (!threatIds.length) throw new Error('At least one threat is required for a security requirement.');
      const threats = await client.query('SELECT id FROM threats WHERE revision_id=$1 AND id=ANY($2::varchar[])', [revision.id, threatIds]);
      if (threats.rowCount !== threatIds.length) throw new Error('Requirement threats must belong to this revision.');
      const controls = await client.query('SELECT DISTINCT control_id AS id FROM threat_control_threats WHERE threat_id=ANY($1::varchar[]) AND control_id=ANY($2::varchar[])', [threatIds, controlIds]);
      if (controls.rowCount !== controlIds.length) throw new Error('Requirement controls must mitigate its linked threats.');
      await client.query(`INSERT INTO threat_security_requirements(id,revision_id,title,description,mandatory,owner_id,verification_method,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [requirementId, revision.id, text(input.title, 'Requirement title'), text(input.description, 'Requirement description'), input.mandatory !== false, text(input.ownerId, 'Implementation owner'), text(input.verificationMethod, 'Verification method'), actor.id]);
      for (const threatId of threatIds) await client.query('INSERT INTO threat_requirement_threats VALUES($1,$2)', [requirementId, threatId]);
      for (const controlId of controlIds) await client.query('INSERT INTO threat_requirement_controls VALUES($1,$2)', [requirementId, controlId]);
      for (const complianceId of complianceIds){
        if(!(await client.query("SELECT 1 FROM threat_compliance_details WHERE id=$1 AND current_validation_status<>'RETIRED'",[complianceId])).rowCount)throw new Error('Compliance mapping requires a non-retired catalog definition.');
        await client.query('INSERT INTO threat_requirement_compliance VALUES($1,$2)', [requirementId, complianceId]);
      }
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId: revision.id, actorId: actor.id, action: 'REQUIREMENT_CREATED', entityType: 'SECURITY_REQUIREMENT', entityId: requirementId, newValue: { ...input, threatIds, controlIds, complianceIds } });
      return { id: requirementId };
    });
  }

  static async addComplianceRequirement(input: Input, actor: BankUser) {
    if (!actor.isActive || actor.roles.includes('AUDITOR') || !(appSec(actor)||actor.roles.includes('GRC_ANALYST'))) throw new Error('Security catalog management authority is required.');
    const parsed = z.object({ framework: z.string().trim().min(1).max(128), frameworkVersion: z.string().trim().min(1).max(64), code: z.string().trim().min(1).max(128), title: z.string().trim().min(1).max(2000), requirementKind: z.enum(['REGULATORY_MINIMUM','BANK_POLICY','APPLICATION_REQUIREMENT']), sourceUrl: z.string().url().optional() }).parse(input);
    // Creation is a proposal, not an assertion of legal applicability/compliance.
    return pgClient.transaction(async client=>{
      const created = await client.query(`INSERT INTO threat_compliance_requirements(id,framework,framework_version,code,title,requirement_kind,source_url,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [id('tmcmp'), parsed.framework, parsed.frameworkVersion, parsed.code, parsed.title, parsed.requirementKind, parsed.sourceUrl || null, actor.id]);
      await AuditService.logPostgres(client,{actor,action:'THREAT_COMPLIANCE_PROPOSED',entityType:'THREAT_COMPLIANCE_REQUIREMENT',entityId:created.rows[0].id,after:created.rows[0]});
      return created.rows[0];
    });
  }

  static async linkRequirementControl(modelId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async client => {
      const model = await this.lockModel(modelId, client); this.assertWrite(model,actor);
      const revision = await ThreatModelRepository.requireMutableRevision(model.currentRevisionId,client);
      const requirementId = text(input.requirementId,'Requirement'); const controlId = text(input.controlId,'Control');
      const linked = await client.query(`SELECT 1 FROM threat_security_requirements r JOIN threat_requirement_threats rt ON rt.requirement_id=r.id JOIN threat_control_threats ct ON ct.threat_id=rt.threat_id JOIN threat_controls c ON c.id=ct.control_id WHERE r.id=$1 AND r.revision_id=$2 AND c.id=$3 AND (NOT r.mandatory OR c.required_before_release)`,[requirementId,revision.id,controlId]);
      if (!linked.rowCount) throw new Error('Control must mitigate a requirement threat in this revision; mandatory requirements need release-required controls.');
      const result = await client.query('INSERT INTO threat_requirement_controls VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING control_id',[requirementId,controlId]);
      if (result.rowCount) await ThreatModelRepository.audit(client,{id:id('tmae'),modelId,revisionId:revision.id,actorId:actor.id,action:'REQUIREMENT_CONTROL_LINKED',entityType:'SECURITY_REQUIREMENT',entityId:requirementId,newValue:{controlId}});
      return {requirementId,controlId};
    });
  }

  static async addDataObject(modelId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async client => {
      const model = await this.lockModel(modelId, client); this.assertWrite(model, actor);
      const revision = await ThreatModelRepository.requireMutableRevision(model.currentRevisionId, client);
      let objectId = text(input.dataObjectId, '', false);
      if (objectId) {
        if (!(await client.query('SELECT 1 FROM threat_data_objects WHERE id=$1 AND threat_model_id=$2', [objectId, modelId])).rowCount) throw new Error('Data object access is restricted to its model.');
      } else {
        objectId = id('tmdata');
        const classification = z.enum(['PUBLIC','INTERNAL','RESTRICTED','CONFIDENTIAL_SECURITY_ONLY','HIGHLY_RESTRICTED_HR_LEGAL']).parse(input.classification);
        if (['PUBLIC','INTERNAL'].includes(classification) && [input.sensitivePersonalData,input.bankSecrecy,input.credentialData,input.paymentData].some(value=>value === true)) throw new Error('Sensitive, secret, credential and payment data require at least RESTRICTED classification.');
        await client.query(`INSERT INTO threat_data_objects(id,threat_model_id,name,classification,personal_data,sensitive_personal_data,bank_secrecy,credential_data,payment_data,owner_id,retention,allowed_locations,encryption_requirements,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [objectId, modelId, text(input.name, 'Data object name'), classification, input.personalData === true, input.sensitivePersonalData === true, input.bankSecrecy === true, input.credentialData === true, input.paymentData === true, text(input.ownerId, 'Data owner'), text(input.retention, 'Data retention'), text(input.allowedLocations, 'Allowed locations'), text(input.encryptionRequirements, 'Encryption requirements'), actor.id]);
      }
      const componentId = text(input.componentId, '', false) || null; const flowId = text(input.flowId, '', false) || null;
      if (Boolean(componentId) === Boolean(flowId)) throw new Error('Exactly one component or flow link is required.');
      const target = await client.query(`SELECT 1 FROM ${componentId ? 'threat_model_components' : 'threat_model_data_flows'} WHERE id=$1 AND revision_id=$2`, [componentId || flowId, revision.id]);
      if (!target.rowCount) throw new Error('Data link must belong to the current revision.');
      await client.query('INSERT INTO threat_data_object_links(id,data_object_id,revision_id,component_id,flow_id) VALUES($1,$2,$3,$4,$5)', [id('tmdl'), objectId, revision.id, componentId, flowId]);
      // New security data invalidates a previous screening, never silently preserves a low tier.
      await client.query('UPDATE threat_model_revisions SET tier=NULL,policy_version_id=NULL,version=version+1 WHERE id=$1', [revision.id]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId: revision.id, actorId: actor.id, action: 'DATA_OBJECT_LINKED', entityType: 'DATA_OBJECT', entityId: objectId, newValue: { componentId, flowId } });
      await this.notifyArchitectureControls(client,modelId,revision.id);
      return { id: objectId };
    });
  }

  static async transitionThreat(threatId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async client => {
      const context = await this.lockThreatContext(threatId, client); this.assertWrite(context.model, actor); await ThreatModelRepository.requireMutableRevision(context.revisionId, client);
      const threat = (await client.query<Input>('SELECT * FROM threats WHERE id=$1', [threatId])).rows[0];
      const status = text(input.status, 'Threat status'); const reason = text(input.reason, 'Transition reason');
      const transitions: Record<string,string[]> = { OPEN: ['MITIGATING','ACCEPTED'], MITIGATING: ['OPEN','MITIGATED','ACCEPTED'], MITIGATED: ['OPEN','CLOSED'], ACCEPTED: ['OPEN'], CLOSED: ['OPEN'] };
      if (!transitions[threat.status]?.includes(status)) throw new Error('Invalid threat lifecycle transition.');
      if (['MITIGATED','ACCEPTED','CLOSED'].includes(status) && !appSec(actor)) throw new Error('Security authority is required for threat disposition.');
      if (['MITIGATED','CLOSED'].includes(status)) { await this.assertVerifiedControls(client, threatId); if (!threat.residual_score || !threat.residual_risk_rationale) throw new Error('Verified residual risk is required before mitigation or closure.'); }
      if (status === 'ACCEPTED' && !(await client.query(`SELECT 1 FROM threat_model_exceptions e JOIN threats t ON t.id=e.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id WHERE e.threat_id=$1 AND e.status='APPROVED' AND e.expires_at>NOW() AND e.threat_content_version=t.content_version AND e.architecture_version=r.architecture_version`, [threatId])).rowCount) throw new Error('A current approved risk acceptance is required.');
      await client.query('UPDATE threats SET status=$1,updated_at=NOW() WHERE id=$2', [status, threatId]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: context.model.id, revisionId: context.revisionId, actorId: actor.id, action: 'THREAT_TRANSITIONED', entityType: 'THREAT', entityId: threatId, oldValue: { status: threat.status }, newValue: { status, reason } });
      return { id: threatId, status };
    });
  }

  private static async assertVerifiedControls(client: QueryClient, threatId: string) {
    const controls = (await client.query<Input>(`SELECT c.status,c.scope_version,v.control_scope_version,v.result,v.evidence_ids,v.expires_at FROM threat_controls c JOIN threat_control_threats ct ON ct.control_id=c.id LEFT JOIN LATERAL (SELECT * FROM control_verifications WHERE control_id=c.id ORDER BY executed_at DESC,id DESC LIMIT 1) v ON TRUE WHERE ct.threat_id=$1 AND c.required_before_release`, [threatId])).rows;
    if (!controls.length || controls.some(c => c.status !== 'VERIFIED' || c.scope_version !== c.control_scope_version || c.result !== 'PASS' || !c.evidence_ids?.length || !c.expires_at || new Date(c.expires_at) <= new Date())) throw new Error('Every required control needs current independent verification and evidence for its control scope.');
  }

  private static async approvalSnapshot(client: QueryClient, modelId: string, revisionId: string) {
    const snapshot: Input = { formatVersion: 1, modelId, revisionId };
    const queries: Record<string, string> = {
      revision: 'SELECT * FROM threat_model_revisions WHERE id=$1',
      scopeReferences: 'SELECT s.* FROM threat_model_scope_references s JOIN threat_model_revisions r ON r.threat_model_id=s.threat_model_id WHERE r.id=$1 ORDER BY s.scope_kind,s.source_id',
      components: 'SELECT * FROM threat_model_components WHERE revision_id=$1 ORDER BY id',
      boundaries: 'SELECT * FROM threat_model_trust_boundaries WHERE revision_id=$1 ORDER BY id',
      flows: 'SELECT * FROM threat_model_data_flows WHERE revision_id=$1 ORDER BY id',
      threats: 'SELECT * FROM threat_details WHERE revision_id=$1 ORDER BY id',
      controls: 'SELECT c.*,tk.status_category AS implementation_ticket_status FROM threat_control_details c JOIN threats t ON t.id=c.threat_id LEFT JOIN tickets tk ON tk.id=c.implementation_ticket_id WHERE t.revision_id=$1 ORDER BY c.id',
      verifications: 'SELECT v.* FROM control_verifications v JOIN threat_controls c ON c.id=v.control_id JOIN threats t ON t.id=c.threat_id WHERE t.revision_id=$1 ORDER BY v.id',
      evidence: "SELECT e.*,a.sha256_hash,a.source_payload->>'virusScanStatus' AS scan_status FROM threat_model_evidence e JOIN ticket_attachments a ON a.id=e.attachment_id WHERE e.revision_id=$1 ORDER BY e.id",
      exceptions: 'SELECT e.* FROM threat_model_exceptions e JOIN threats t ON t.id=e.threat_id WHERE t.revision_id=$1 ORDER BY e.id',
      approvals: 'SELECT * FROM threat_model_approvals WHERE revision_id=$1 ORDER BY id',
      requirements: 'SELECT * FROM threat_security_requirements WHERE revision_id=$1 ORDER BY id',
      controlMappings: 'SELECT ct.* FROM threat_control_threats ct JOIN threats t ON t.id=ct.threat_id WHERE t.revision_id=$1 ORDER BY ct.control_id,ct.threat_id',
      controlDefinitions: 'SELECT DISTINCT cv.* FROM threat_control_catalog_versions cv JOIN threat_controls c ON c.catalog_version_id=cv.id JOIN threats t ON t.id=c.threat_id WHERE t.revision_id=$1 ORDER BY cv.id',
      requirementControls: 'SELECT m.* FROM threat_requirement_controls m JOIN threat_security_requirements r ON r.id=m.requirement_id WHERE r.revision_id=$1 ORDER BY m.requirement_id,m.control_id',
      requirementThreats: 'SELECT m.* FROM threat_requirement_threats m JOIN threat_security_requirements r ON r.id=m.requirement_id WHERE r.revision_id=$1 ORDER BY m.requirement_id,m.threat_id',
      compliance: 'SELECT m.requirement_id,c.* FROM threat_requirement_compliance m JOIN threat_security_requirements r ON r.id=m.requirement_id JOIN threat_compliance_details c ON c.id=m.compliance_id WHERE r.revision_id=$1 ORDER BY m.requirement_id,c.id',
      data: 'SELECT l.*,d.name,d.classification,d.personal_data,d.sensitive_personal_data,d.bank_secrecy,d.retention,d.allowed_locations,d.encryption_requirements FROM threat_data_object_links l JOIN threat_data_objects d ON d.id=l.data_object_id WHERE l.revision_id=$1 ORDER BY l.id',
      emergencyChanges: 'SELECT e.* FROM threat_emergency_changes e WHERE e.threat_model_id=(SELECT threat_model_id FROM threat_model_revisions WHERE id=$1) ORDER BY e.requested_at,e.id',
      analysisSuggestions: 'SELECT * FROM threat_analysis_suggestions WHERE revision_id=$1 ORDER BY id',
      analysisDispositions: 'SELECT d.* FROM threat_suggestion_dispositions d JOIN threat_analysis_suggestions s ON s.id=d.suggestion_id WHERE s.revision_id=$1 ORDER BY d.id',
      attackCases: 'SELECT * FROM threat_attack_cases WHERE revision_id=$1 ORDER BY id',
      attackNodes: 'SELECT n.* FROM threat_attack_nodes n JOIN threat_attack_cases c ON c.id=n.case_id WHERE c.revision_id=$1 ORDER BY n.case_id,n.ordinal',
      findingLinks: 'SELECT * FROM threat_finding_link_state WHERE revision_id=$1 ORDER BY id',
      findingAssessments: 'SELECT a.* FROM threat_finding_assessments a JOIN threat_finding_links l ON l.id=a.link_id WHERE l.revision_id=$1 ORDER BY a.id',
      exceptionEscalations: 'SELECT x.* FROM threat_exception_escalation_reviews x JOIN threat_model_exceptions e ON e.id=x.exception_id JOIN threats t ON t.id=e.threat_id WHERE t.revision_id=$1 ORDER BY x.exception_id',
    };
    for (const [key, query] of Object.entries(queries)) snapshot[key] = (await client.query(query, [revisionId])).rows;
    snapshot.model = (await client.query('SELECT * FROM threat_models WHERE id=$1', [modelId])).rows[0];
    return snapshot;
  }

  static async exportSnapshot(modelId: string, revisionId: string, actor: BankUser) {
    return pgClient.transaction(async client=>{
      const model = await this.lockModel(modelId,client);this.assertRead(model, actor);
      const snapshot = (await client.query(`SELECT s.* FROM threat_model_approval_snapshots s JOIN threat_model_revisions r ON r.id=s.revision_id WHERE r.threat_model_id=$1 AND s.revision_id=$2`, [modelId, revisionId])).rows[0];
      if (!snapshot) throw new Error('Approved snapshot not found; legacy records require a new reviewed revision.');
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId,revisionId,actorId:actor.id,action:'APPROVED_SNAPSHOT_EXPORTED',entityType:'THREAT_MODEL_REVISION',entityId:revisionId,newValue:{sha256:snapshot.sha256}});
      return snapshot;
    });
  }

  static async addThreat(modelId: string, input: Input, actor: BankUser, transactionClient?: PoolClient) {
    input = threatAuthoringSchema.parse(input);
    const createRecord=async (client:PoolClient) => {
      const model = await this.lockModel(modelId, client); this.assertWrite(model, actor); const revision = await ThreatModelRepository.requireMutableRevision(model.currentRevisionId, client);
      await this.assertScopeReferences({ assetId: input.affectedAssetId }, actor,client);
      if (input.ownerId && !(await client.query('SELECT 1 FROM bank_users WHERE id=$1 AND is_active', [input.ownerId])).rowCount) throw new Error('An active threat owner is required.');
      const references: Array<[string, string, string]> = [['affectedComponentId', 'threat_model_components', 'component'], ['affectedDataFlowId', 'threat_model_data_flows', 'data flow'], ['affectedTrustBoundaryId', 'threat_model_trust_boundaries', 'trust boundary']];
      for (const [field, table, label] of references) {
        const referenceId = text(input[field], '', false); if (!referenceId) continue;
        const reference = await client.query(`SELECT 1 FROM ${table} WHERE id=$1 AND revision_id=$2`, [referenceId, revision.id]);
        if (!reference.rowCount) throw new Error(`Affected ${label} must belong to the current Threat Model revision.`);
      }
      const likelihood = score(input.inherentLikelihood, 'Inherent likelihood'); const impact = score(input.inherentImpact, 'Inherent impact'); const threatId = id('th');
      const count = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM threats WHERE revision_id=$1', [revision.id]);
      const categories = list(input.categories); if (!categories.length) throw new Error('At least one STRIDE or abuse-case category is required.');
      const key = `${model.key}-R${revision.revisionNumber}-T${String(count.rows[0].count + 1).padStart(3, '0')}`;
      await client.query(`INSERT INTO threats(id,revision_id,key,title,description,categories,attack_scenario,attacker_type,attacker_capability,preconditions,attack_path,affected_component_id,affected_data_flow_id,affected_trust_boundary_id,affected_asset_id,cwe_ids,capec_ids,inherent_likelihood,inherent_impact,inherent_score,status,owner_id,due_date,created_by_user_id,methodology,source,assumptions,confidentiality_impact,integrity_impact,availability_impact,security_properties) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,$20,'OPEN',$21,$22,$23,$24,$25,$26,$27,$28,$29,$30::jsonb)`, [threatId, revision.id, key, text(input.title, 'Threat title'), text(input.description, 'Threat description'), JSON.stringify(categories), text(input.attackScenario, 'Attack scenario'), text(input.attackerType, '', false) || null, text(input.attackerCapability, '', false) || null, text(input.preconditions, '', false) || null, text(input.attackPath, '', false) || null, text(input.affectedComponentId, '', false) || null, text(input.affectedDataFlowId, '', false) || null, text(input.affectedTrustBoundaryId, '', false) || null, text(input.affectedAssetId, '', false) || null, JSON.stringify(list(input.cweIds)), JSON.stringify(list(input.capecIds)), likelihood, impact, likelihood * impact, text(input.ownerId, '', false) || null, text(input.dueDate, '', false) || null, actor.id,input.methodology,input.source,input.assumptions||null,input.confidentialityImpact,input.integrityImpact,input.availabilityImpact,JSON.stringify(input.securityProperties)]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId: revision.id, actorId: actor.id, action: 'THREAT_CREATED', entityType: 'THREAT', entityId: threatId, newValue: { key, inherentRisk: risk(likelihood * impact) } });
      if (likelihood * impact >= 10) await enqueueOutbox(client, 'threat-model.high-risk-threat.created', 'THREAT', threatId, { threatModelId: modelId, threatId, severity: risk(likelihood * impact) });
      return (await client.query<Input>('SELECT * FROM threat_details WHERE id=$1', [threatId])).rows.map(ThreatModelRepository.threat)[0];
    };
    return transactionClient?createRecord(transactionClient):pgClient.transaction(createRecord);
  }

  /** Shared transactional authorization boundary for supplemental first-class analysis. */
  static async withAnalysisModel<T>(modelId:string,actor:BankUser,operation:(client:PoolClient,model:Input)=>Promise<T>) {
    return pgClient.transaction(async client=>{
      const model=await this.lockModel(modelId,client);this.assertWrite(model,actor);
      await ThreatModelRepository.requireMutableRevision(model.currentRevisionId,client);
      return operation(client,model);
    });
  }

  static async withGovernanceModel<T>(modelId:string,actor:BankUser,operation:(client:PoolClient,model:Input)=>Promise<T>){
    return pgClient.transaction(async client=>{const model=await this.lockModel(modelId,client);this.assertRead(model,actor);return operation(client,model);});
  }

  static async validateGovernanceEvidence(client:PoolClient,model:Input,attachmentId:string,changeId:string,actor:BankUser){
    await this.assertEmergencyAttachment(client,attachmentId,changeId,actor);
    const ticket=(await client.query('SELECT category,confidentiality FROM tickets WHERE id=$1',[changeId])).rows[0];
    if(ticket.category!=='CHANGE_REQUEST')throw new Error('Decommission evidence requires a Change Request.');
    const classification=ticket.confidentiality as keyof typeof CONFIDENTIALITY_LEVELS;
    if((CONFIDENTIALITY_LEVELS[classification]??Infinity)>(CONFIDENTIALITY_LEVELS[model.dataClassification as keyof typeof CONFIDENTIALITY_LEVELS]??0))throw new Error('Evidence classification exceeds this model; raise model classification before linking.');
  }

  /** Replace authored content only. Risk disposition, identity and verification remain server-managed. */
  static async updateThreat(threatId: string, input: Input, actor: BankUser, requestContext?: { correlationId?: string; ipAddress?: string; userAgent?: string }) {
    const parsed = threatEditSchema.parse(input);
    return pgClient.transaction(async client => {
      // Model-first locking matches revision copy/approval and serializes shared-control edits.
      const found = (await client.query<Input>('SELECT r.threat_model_id FROM threats t JOIN threat_model_revisions r ON r.id=t.revision_id WHERE t.id=$1', [threatId])).rows[0];
      if (!found) throw new Error('Threat not found.');
      const model = await this.lockModel(found.threat_model_id, client); this.assertWrite(model, actor);
      const before = (await client.query<Input>('SELECT * FROM threat_details WHERE id=$1', [threatId])).rows[0];
      if (before.revision_id !== model.currentRevisionId) throw new Error('Threat revision is no longer current.');
      await ThreatModelRepository.requireMutableRevision(before.revision_id, client);
      if (Number(before.content_version) !== parsed.contentVersion) throw new Error('Threat changed by another editor. Reload before saving.');
      await this.assertScopeReferences({ assetId: parsed.affectedAssetId }, actor,client);
      if (parsed.ownerId && !(await client.query('SELECT 1 FROM bank_users WHERE id=$1 AND is_active', [parsed.ownerId])).rowCount) throw new Error('An active threat owner is required.');
      await client.query(`UPDATE threats SET title=$1,description=$2,categories=$3::jsonb,attack_scenario=$4,attacker_type=$5,attacker_capability=$6,
        preconditions=$7,attack_path=$8,affected_component_id=$9,affected_data_flow_id=$10,affected_trust_boundary_id=$11,affected_asset_id=$12,
        cwe_ids=$13::jsonb,capec_ids=$14::jsonb,inherent_likelihood=$15,inherent_impact=$16,inherent_score=$15::smallint*$16::smallint,owner_id=$17,due_date=$18 ,methodology=$20,source=$21,assumptions=$22,confidentiality_impact=$23,integrity_impact=$24,availability_impact=$25,security_properties=$26::jsonb WHERE id=$19`,
        [parsed.title,parsed.description,JSON.stringify(parsed.categories),parsed.attackScenario,parsed.attackerType||null,parsed.attackerCapability||null,
          parsed.preconditions||null,parsed.attackPath||null,parsed.affectedComponentId||null,parsed.affectedDataFlowId||null,parsed.affectedTrustBoundaryId||null,
          parsed.affectedAssetId||null,JSON.stringify(parsed.cweIds),JSON.stringify(parsed.capecIds),parsed.inherentLikelihood,parsed.inherentImpact,parsed.ownerId||null,parsed.dueDate||null,threatId,parsed.methodology,parsed.source,parsed.assumptions||null,parsed.confidentialityImpact,parsed.integrityImpact,parsed.availabilityImpact,JSON.stringify(parsed.securityProperties)]);
      const after = (await client.query<Input>('SELECT * FROM threat_details WHERE id=$1', [threatId])).rows[0];
      if (after.content_version !== before.content_version) {
        const controls = (await client.query<Input>('SELECT c.id,c.scope_version FROM threat_controls c JOIN threat_control_threats m ON m.control_id=c.id WHERE m.threat_id=$1 ORDER BY c.id', [threatId])).rows;
        const staleExceptions = (await client.query<Input>("SELECT id FROM threat_model_exceptions WHERE threat_id=$1 AND threat_content_version<>$2 AND status IN ('REQUESTED','UNDER_REVIEW','APPROVED')", [threatId,after.content_version])).rows.map(row=>row.id);
        await ThreatModelRepository.audit(client, { id:id('tmae'),modelId:model.id,revisionId:before.revision_id,actorId:actor.id,action:'THREAT_UPDATED',entityType:'THREAT',entityId:threatId,
          oldValue:before,newValue:{threat:after,reason:parsed.reason,invalidatedControls:controls,staleExceptions},...requestContext });
        for (const control of controls) {
          // Outbox uniqueness is (topic, correlation_id): one request can invalidate many controls.
          const eventKey=`threat-edit:${createHash('sha256').update(`${threatId}:${after.content_version}:${control.id}:${control.scope_version}`).digest('hex')}`;
          await enqueueOutbox(client,'threat-control.verification.required','THREAT_CONTROL',control.id,{threatModelId:model.id,controlId:control.id,reason:'THREAT_CHANGED',scopeVersion:control.scope_version,requestCorrelationId:requestContext?.correlationId},eventKey);
        }
      }
      return ThreatModelRepository.threat(after);
    });
  }

  static async threatLineage(threatId: string, input: Input, actor: BankUser) {
    const query = z.object({ limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).max(1000000).default(0) }).parse(input);
    const found = (await pgClient.query<Input>('SELECT r.threat_model_id,m.lineage_id,m.origin FROM threat_lineage_members m JOIN threat_model_revisions r ON r.id=m.revision_id WHERE m.threat_id=$1',[threatId])).rows[0];
    if (!found) throw new Error('Threat not found.');
    const model = await ThreatModelRepository.findById(found.threat_model_id); if (!model) throw new Error('Threat Model not found.'); this.assertRead(model,actor);
    const rows = (await pgClient.query<Input>(`SELECT t.*,r.revision_number,r.status AS revision_status FROM threat_details t JOIN threat_model_revisions r ON r.id=t.revision_id
      WHERE t.lineage_id=$1 AND r.threat_model_id=$2 ORDER BY r.revision_number DESC LIMIT $3 OFFSET $4`,[found.lineage_id,model.id,query.limit+1,query.offset])).rows;
    return { lineageId:found.lineage_id,hasMore:rows.length>query.limit,versions:rows.slice(0,query.limit).map(row=>({...ThreatModelRepository.threat(row),revisionNumber:row.revision_number,revisionStatus:row.revision_status})) };
  }

  static async addControl(threatId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async (client) => {
      const context = await this.lockThreatContext(threatId, client); this.assertWrite(context.model, actor); await ThreatModelRepository.requireMutableRevision(context.revisionId, client);
      let catalog:Input|undefined;
      const catalogVersionId=text(input.catalogVersionId,'',false) || null;
      const implementationKey=catalogVersionId ? z.string().trim().min(1).max(128).parse(input.implementationKey) : null;
      if(catalogVersionId){
        catalog=(await client.query<Input>('SELECT * FROM threat_control_catalog_versions WHERE id=$1 AND organization_id=$2 FOR UPDATE',[catalogVersionId,context.model.organizationId])).rows[0];
        const decision=(await client.query('SELECT decision FROM threat_control_catalog_decisions WHERE catalog_version_id=$1 ORDER BY event_sequence DESC LIMIT 1',[catalogVersionId])).rows[0]?.decision;
        if(!catalog || decision!=='PUBLISHED') throw new Error('A published control catalog version is required for new implementations.');
      }
      const policy = await this.loadPolicy(context.model.organizationId, client); const threatSeverity = risk(Number(context.inherentScore || 0));
      const configuredDueDate = new Date(Date.now() + (policy.remediationSlaDays[threatSeverity] || defaultPolicy.remediationSlaDays[threatSeverity]) * 86400000).toISOString();
      const controlId = id('ctl');
      await client.query(`INSERT INTO threat_controls(id,threat_id,title,description,control_type,implementation_owner_id,status,required_before_release,due_date,effectiveness_status,catalog_version_id,implementation_key) VALUES($1,$2,$3,$4,$5,$6,'PROPOSED',$7,$8,$9,$10,$11)`, [controlId, threatId, text(input.title || catalog?.title, 'Control title'), text(input.description || catalog?.description, 'Control description'), text(catalog?.control_function || input.controlType || 'TECHNICAL', 'Control type'), text(input.implementationOwnerId || context.model.technicalOwnerId, 'Implementation owner'), input.requiredBeforeRelease !== false, text(input.dueDate, '', false) || configuredDueDate, 'UNVERIFIED',catalogVersionId,implementationKey]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: context.model.id, revisionId: context.revisionId, actorId: actor.id, action: 'CONTROL_CREATED', entityType: 'THREAT_CONTROL', entityId: controlId, newValue: { threatId, catalogVersionId,implementationKey,requiredBeforeRelease: input.requiredBeforeRelease !== false } });
      await enqueueOutbox(client, 'threat-control.created', 'THREAT_CONTROL', controlId, { threatModelId: context.model.id, threatId, controlId, createdBy: actor.id });
      return (await client.query<Input>('SELECT * FROM threat_control_details WHERE id=$1', [controlId])).rows.map(ThreatModelRepository.control)[0];
    });
  }

  static async mapControlThreat(modelId:string,input:Input,actor:BankUser) {
    const value=z.object({controlId:z.string().min(1),threatId:z.string().min(1),scopeVersion:z.number().int().positive(),action:z.enum(['LINK','UNLINK']).default('LINK'),reason:z.string().trim().min(1).max(10000)}).parse(input);
    return pgClient.transaction(async client=>{
      const model=await this.lockModel(modelId,client);this.assertWrite(model,actor);
      const revision=await ThreatModelRepository.requireMutableRevision(model.currentRevisionId,client);
      const control=(await client.query<Input>('SELECT c.* FROM threat_controls c JOIN threats t ON t.id=c.threat_id WHERE c.id=$1 AND t.revision_id=$2 FOR UPDATE OF c',[value.controlId,revision.id])).rows[0];
      if(!control || !(await client.query('SELECT 1 FROM threats WHERE id=$1 AND revision_id=$2',[value.threatId,revision.id])).rowCount) throw new Error('Control and threat must belong to the current revision.');
      if(control.scope_version!==value.scopeVersion) throw new Error('Control scope changed by another user; reload before mapping.');
      const before=(await client.query('SELECT threat_id FROM threat_control_threats WHERE control_id=$1 ORDER BY threat_id',[value.controlId])).rows;
      if(value.action==='LINK') {
        await client.query('INSERT INTO threat_control_threats(control_id,threat_id) VALUES($1,$2)',[value.controlId,value.threatId]);
      }else{
        if((await client.query('SELECT 1 FROM threat_requirement_controls rc JOIN threat_requirement_threats rt ON rt.requirement_id=rc.requirement_id WHERE rc.control_id=$1 AND rt.threat_id=$2',[value.controlId,value.threatId])).rowCount) throw new Error('Remove the dependent requirement mapping before unlinking this control.');
        if(!(await client.query('DELETE FROM threat_control_threats WHERE control_id=$1 AND threat_id=$2',[value.controlId,value.threatId])).rowCount) throw new Error('Control mapping not found.');
      }
      const updated=(await client.query('SELECT * FROM threat_control_details WHERE id=$1',[value.controlId])).rows[0];
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId,revisionId:revision.id,actorId:actor.id,action:`CONTROL_THREAT_${value.action}ED`,entityType:'THREAT_CONTROL',entityId:value.controlId,oldValue:{scopeVersion:control.scope_version,threatIds:before.map(row=>row.threat_id)},newValue:{scopeVersion:updated.scope_version,threatIds:updated.threat_ids,reason:value.reason,verificationInvalidated:true}});
      await enqueueOutbox(client,'threat-control.verification.required','THREAT_CONTROL',value.controlId,{threatModelId:modelId,revisionId:revision.id,controlId:value.controlId,scopeVersion:updated.scope_version,implementationTicketId:control.implementation_ticket_id});
      return ThreatModelRepository.control(updated);
    });
  }

  static async recordVerification(controlId: string, input: Input, actor: BankUser) {
    if (!appSec(actor)) throw new Error('Only AppSec or an authorized security authority may verify controls.');
    return pgClient.transaction(async (client) => {
      const context = await this.lockControlContext(controlId, client); if (context.implementerId === actor.id) throw new Error('Control implementer cannot independently verify this security control.');
      this.assertWrite(context.model, actor); await ThreatModelRepository.requireMutableRevision(context.revisionId, client);
      const verificationId = id('ver'); const result = text(input.result, 'Verification result');
      const scopeVersion=Number((await client.query('SELECT scope_version FROM threat_controls WHERE id=$1',[controlId])).rows[0].scope_version);
      if(Number(input.controlScopeVersion ?? 1)!==scopeVersion) throw new Error('Verification control scope is no longer current; reload and reassess every mapped threat.');
      if (!['NOT_RUN', 'PASS', 'FAIL', 'PARTIAL', 'EXPIRED'].includes(result)) throw new Error('Invalid verification result.');
      if(result==='PASS'&&(await client.query("SELECT 1 FROM threat_finding_link_state WHERE control_id=$1 AND (current_state IS DISTINCT FROM 'RESOLVED' OR current_fingerprint IS DISTINCT FROM COALESCE(assessed_fingerprint,source_fingerprint)) LIMIT 1",[controlId])).rowCount)throw new Error('Linked finding contradicts the control assumption; reassess its current source state before verification.');
      const evidenceIds = list(input.evidenceIds);
      if (result === 'PASS' && !evidenceIds.length) throw new Error('A passing control verification must reference linked evidence.');
      if (evidenceIds.length) {
        const evidence = await client.query<Input>(`SELECT e.id,e.attachment_id,a.ticket_id,a.sha256_hash,a.source_payload FROM threat_model_evidence e JOIN ticket_attachments a ON a.id=e.attachment_id WHERE e.control_id=$1 AND e.id = ANY($2::varchar[])`, [controlId, evidenceIds]);
        if (evidence.rows.length !== evidenceIds.length) throw new Error('Verification evidence must already be linked to this control and Threat Model.');
        for(const item of evidence.rows){
          const ticket=(await client.query('SELECT * FROM tickets WHERE id=$1',[item.ticket_id])).rows[0];
          if(!/^[a-f0-9]{64}$/i.test(item.sha256_hash) || item.source_payload?.virusScanStatus!=='CLEAN') throw new Error('Current clean retained evidence is required for verification.');
          if(!ticket || !AuthService.canAccessResource({user:actor,action:'READ',resourceType:'TICKET',resource:this.ticketAuthorizationRecord(ticket)}).allowed) throw new Error('Verification evidence access is restricted.');
        }
      }
      const verificationType = text(input.verificationType, 'Verification type'); const policy = await this.loadPolicy(context.model.organizationId, client);
      const expiresAt = text(input.expiresAt, '', false) || new Date(Date.now() + (policy.verificationExpirationDays[verificationType] || policy.verificationExpirationDays.DEFAULT || defaultPolicy.verificationExpirationDays.DEFAULT) * 86400000).toISOString();
      const maximumExpiry = Date.now() + (policy.verificationExpirationDays[verificationType] || policy.verificationExpirationDays.DEFAULT) * 86400000;
      if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now() || Date.parse(expiresAt) > maximumExpiry) throw new Error('Verification expiry must be within the configured freshness period.');
      if (input.reviewerId && input.reviewerId !== actor.id) throw new Error('Verification reviewer must be the authenticated actor.');
      await client.query(`INSERT INTO control_verifications(id,control_id,verification_type,test_case,expected_result,result,evidence_ids,executed_by_user_id,executed_at,reviewer_id,reviewed_at,expires_at,notes,control_scope_version) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,NOW(),$9,NOW(),$10,$11,$12)`, [verificationId, controlId, verificationType, text(input.testCase, 'Test case'), text(input.expectedResult, 'Expected result'), result, JSON.stringify(evidenceIds), actor.id, text(input.reviewerId, '', false) || actor.id, expiresAt, text(input.notes, '', false) || null,scopeVersion]);
      await client.query(`UPDATE threat_controls SET status=$1,updated_at=NOW() WHERE id=$2`, [result === 'PASS' ? 'VERIFIED' : result === 'FAIL' ? 'FAILED' : 'VERIFICATION_REQUIRED', controlId]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: context.model.id, revisionId: context.revisionId, actorId: actor.id, action: 'CONTROL_VERIFIED', entityType: 'CONTROL_VERIFICATION', entityId: verificationId, newValue: { controlId, result,scopeVersion } });
      if (result === 'FAIL') await enqueueOutbox(client, 'threat-control.verification.failed', 'THREAT_CONTROL', controlId, { threatModelId: context.model.id, controlId, verificationId });
      return (await client.query<Input>('SELECT * FROM control_verifications WHERE id=$1', [verificationId])).rows.map(ThreatModelRepository.verification)[0];
    });
  }

  static async calculateResidualRisk(threatId: string, input: Input, actor: BankUser) {
    if (!appSec(actor)) throw new Error('Only AppSec may confirm residual risk.');
    return pgClient.transaction(async (client) => {
      const context = await this.lockThreatContext(threatId, client); const controls = await client.query<Input>('SELECT c.* FROM threat_controls c JOIN threat_control_threats ct ON ct.control_id=c.id WHERE ct.threat_id=$1', [threatId]);
      this.assertWrite(context.model, actor); await ThreatModelRepository.requireMutableRevision(context.revisionId, client);
      await this.assertVerifiedControls(client, threatId);
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
    if (actor.roles.includes('AUDITOR')) throw new Error('Auditor access is read-only.');
    if (!(appSec(actor) || actor.roles.includes('GRC_ANALYST') || actor.roles.includes('RISK_OWNER'))) throw new Error('Enterprise risk linkage requires AppSec, GRC, or risk-owner authority.');
    return pgClient.transaction(async (client) => {
      const context = await this.lockThreatContext(threatId, client); this.assertWrite(context.model, actor);
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
      const screening = (await client.query<Input>('SELECT tier,policy_version_id FROM threat_model_revisions WHERE id=$1', [revision.id])).rows[0];
      if (screening.tier === null || !screening.policy_version_id) throw new Error('Security impact screening is required before submission.');
      if((await client.query('SELECT 1 FROM threat_analysis_suggestions s LEFT JOIN threat_suggestion_dispositions d ON d.suggestion_id=s.id WHERE s.revision_id=$1 AND d.id IS NULL LIMIT 1',[revision.id])).rowCount)throw new Error('Analyst disposition is required for every pending threat suggestion before submission.');
      if (screening.tier > 0 && (!components.rowCount || !threats.rowCount)) throw new Error('Architecture and at least one structured threat are required before submission.');
      if (screening.tier >= 2) {
        const completeness = (await client.query<Input>(`SELECT EXISTS(SELECT 1 FROM threat_model_data_flows WHERE revision_id=$1) AS flows, EXISTS(SELECT 1 FROM threat_model_trust_boundaries WHERE revision_id=$1) AS boundaries, EXISTS(SELECT 1 FROM threat_security_requirements WHERE revision_id=$1) AS requirements, EXISTS(SELECT 1 FROM threat_data_object_links WHERE revision_id=$1) AS data`, [revision.id])).rows[0];
        if (!Object.values(completeness).every(Boolean)) throw new Error('TM-2/3 requires structured flows, boundaries, data classification and security requirements.');
      }
      if (screening.tier === 3) {
        const abuse = await client.query(`SELECT 1 FROM threats WHERE revision_id=$1 AND categories ?| ARRAY['BUSINESS_ABUSE','FRAUD','TRANSACTION_MANIPULATION','WORKFLOW_BYPASS'] LIMIT 1`, [revision.id]);
        if (!abuse.rowCount || !revision.assumptions?.trim()) throw new Error('TM-3 requires abuse analysis and explicit assumptions.');
      }
      await client.query(`UPDATE threat_model_revisions SET status='IN_REVIEW',submitted_by_user_id=$1,submitted_at=NOW(),review_cycle=review_cycle+1,version=version+1 WHERE id=$2`, [actor.id, revision.id]);
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
      this.assertRead(model, actor);
      if (!revision || revision.status !== 'IN_REVIEW') throw new Error('Only an in-review revision may be approved.');
      if ([revision.created_by_user_id, revision.submitted_by_user_id, model.businessOwnerId, model.technicalOwnerId, model.securityOwnerId].includes(actor.id)) throw new Error('Author or owner cannot approve the Threat Model.');
if (decision === 'APPROVED' && (await client.query(`SELECT 1 FROM threat_model_audit_events WHERE revision_id=$1 AND actor_id=$2 AND action=ANY($3::varchar[]) LIMIT 1`, [revision.id,actor.id,['REQUIREMENT_COMPLIANCE_REPLACED','FINDING_ASSUMPTION_LINKED','FINDING_ASSUMPTION_ASSESSED','THREAT_ATTACK_CASE_CREATED','THREAT_SUGGESTION_DISPOSITION','SCOPE_UPDATED','THREAT_CREATED','THREAT_UPDATED','CONTROL_CREATED','REQUIREMENT_CREATED','DATA_OBJECT_LINKED','COMPONENT_CREATED','BOUNDARY_CREATED','FLOW_CREATED','COMPONENT_UPDATED','BOUNDARY_UPDATED','FLOW_UPDATED','COMPONENT_REMOVED','BOUNDARY_REMOVED','FLOW_REMOVED','MODEL_CLASSIFICATION_RAISED','CONTROL_THREAT_LINKED','CONTROL_THREAT_UNLINKED']])).rowCount) throw new Error('A contributing author cannot approve the Threat Model.');
      if (decision === 'APPROVED') {
        const otherStageBySameReviewer = await client.query(`SELECT 1 FROM threat_model_approvals WHERE revision_id=$1 AND decided_by_user_id=$2 AND stage<>$3 AND decision='APPROVED' AND review_cycle=$4 LIMIT 1`, [revision.id, actor.id, stage, revision.review_cycle]);
        if (otherStageBySameReviewer.rowCount) throw new Error('AppSec and Security Architecture approvals require separate authorized reviewers.');
      }
      const approvalId = id('appr'); await client.query(`INSERT INTO threat_model_approvals(id,revision_id,stage,decision,decided_by_user_id,comments,review_cycle) VALUES($1,$2,$3,$4,$5,$6,$7)`, [approvalId, revision.id, stage, decision, actor.id, text(input.comments, '', false) || null, revision.review_cycle]);
      if (decision !== 'APPROVED') { await client.query(`UPDATE threat_model_revisions SET status='CHANGES_REQUIRED',reviewed_by_user_id=$1,reviewed_at=NOW(),version=version+1 WHERE id=$2`, [actor.id, revision.id]); await client.query(`UPDATE threat_models SET status='CHANGES_REQUIRED',updated_at=NOW(),version=version+1 WHERE id=$1`, [modelId]); }
      else {
        const approvals = await client.query<Input>(`SELECT stage FROM threat_model_approvals WHERE revision_id=$1 AND decision='APPROVED' AND review_cycle=$2`, [revision.id, revision.review_cycle]); const approvedStages = new Set(approvals.rows.map((approval) => approval.stage));
        const policy = await this.loadPolicy(model.organizationId, client);
        if (revision.tier === 3 && !policy.requiredApprovalStages.includes('SECURITY_ARCHITECTURE')) policy.requiredApprovalStages.push('SECURITY_ARCHITECTURE');
        if (policy.requiredApprovalStages.every((requiredStage) => approvedStages.has(requiredStage))) {
          if (revision.tier === null || !revision.policy_version_id) throw new Error('Screening required; return legacy revision for reassessment.');
          await client.query(`UPDATE threat_model_revisions SET status='APPROVED',approved_by_user_id=$1,approved_at=NOW(),reviewed_by_user_id=$1,reviewed_at=NOW(),version=version+1 WHERE id=$2`, [actor.id, revision.id]);
          const pinnedPolicy = (await client.query<Input>('SELECT config FROM threat_governance_policy_versions WHERE id=$1',[revision.policy_version_id])).rows[0];
          await client.query(`UPDATE threat_models SET status='APPROVED',stale_reason=NULL,last_approved_at=NOW(),next_review_at=$1,updated_at=NOW(),version=version+1 WHERE id=$2`, [nextReviewDate(revision.tier,new Date(),pinnedPolicy.config.reviewMonths[revision.tier]), modelId]);
          const snapshot = await this.approvalSnapshot(client, modelId, revision.id);
          snapshot.evaluatedPolicy = policy;
          snapshot.screeningPolicy = (await client.query('SELECT * FROM threat_governance_policy_versions WHERE id=$1', [revision.policy_version_id])).rows[0];
          await client.query(`INSERT INTO threat_model_approval_snapshots(revision_id,snapshot,sha256) VALUES($1,$2::jsonb,$3)`, [revision.id, canonicalJson(snapshot), createHash('sha256').update(canonicalJson(snapshot)).digest('hex')]);
          const emergencies = (await client.query<Input>("SELECT * FROM threat_emergency_changes WHERE threat_model_id=$1 AND status='DEPLOYED' AND model_updated_at IS NULL AND revision_id<>$2 AND deployed_at<=$3 FOR UPDATE",[modelId,revision.id,revision.created_at])).rows;
          for (const emergency of emergencies) {
            const approvedAt = snapshot.revision[0].approved_at;
            await this.recordEmergencyBreaches(client,{...emergency,model_updated_at:approvedAt},actor);
            await client.query('UPDATE threat_emergency_changes SET updated_revision_id=$1,model_updated_at=$2 WHERE id=$3',[revision.id,approvedAt,emergency.id]);
            await ThreatModelRepository.audit(client,{id:id('tmae'),modelId,revisionId:revision.id,actorId:actor.id,action:'EMERGENCY_MODEL_UPDATE_APPROVED',entityType:'THREAT_EMERGENCY_CHANGE',entityId:emergency.id,newValue:{revisionId:revision.id,approvedAt}});
          }
        }
      }
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId: revision.id, actorId: actor.id, action: `APPROVAL_${decision}`, entityType: 'THREAT_MODEL_APPROVAL', entityId: approvalId, newValue: { stage, decision } });
      return { approvalId, decision, status: (await client.query<Input>('SELECT status FROM threat_models WHERE id=$1', [modelId])).rows[0].status };
    });
  }

  static async requestChanges(modelId: string, input: Input, actor: BankUser) {
    return this.decideApproval(modelId, { ...input, decision: 'CHANGES_REQUESTED' }, actor);
  }

  static async releaseGate(modelId: string, actor: BankUser) {
    return pgClient.transaction(async client => {
      const model = await this.lockModel(modelId, client); this.assertRead(model, actor);
      return this.evaluateGate(client, model);
    });
  }

  private static async evaluateGate(client: QueryClient, model: Input) {
    const snapshot = await this.approvalSnapshot(client, model.id, model.currentRevisionId);
    const revision = snapshot.revision[0]; const policy = await this.loadPolicy(model.organizationId, client);
    if (revision.tier === 3 && !policy.requiredApprovalStages.includes('SECURITY_ARCHITECTURE')) policy.requiredApprovalStages.push('SECURITY_ARCHITECTURE');
    const approvedSnapshot = await client.query('SELECT 1 FROM threat_model_approval_snapshots WHERE revision_id=$1', [revision.id]);
    const requirementBlockers: string[] = [];
    for(const [scopeKind,sourceId] of [['SERVICE',model.serviceId],['ASSET',model.assetId],['PROJECT',model.projectId],['CHANGE',model.changeId],['RELEASE',model.releaseId]])if(sourceId&&!(snapshot.scopeReferences as Input[]).some(reference=>reference.scope_kind===scopeKind&&reference.source_id===sourceId))requirementBlockers.push(`${scopeKind}: unresolved legacy canonical reference; reconcile before release.`);
    for(const link of snapshot.findingLinks as Input[])if(link.current_state!=='RESOLVED'||link.current_fingerprint!==(link.assessed_fingerprint||link.source_fingerprint))requirementBlockers.push(`${link.id}: linked finding is open or its security state changed; reassessment is required.`);
    for(const component of snapshot.components as Input[]) if(!component.security_zone?.trim()) requirementBlockers.push(`${component.name}: security zone is unknown; architecture revalidation is required.`);
    for(const flow of snapshot.flows as Input[]) {
      const source=(snapshot.components as Input[]).find(item=>item.id===flow.source_component_id);
      const destination=(snapshot.components as Input[]).find(item=>item.id===flow.destination_component_id);
      if(!source||!destination||source.id===destination.id||((source.security_zone!==destination.security_zone||flow.crosses_trust_boundary)&&!(snapshot.boundaries as Input[]).some(item=>item.id===flow.trust_boundary_id))) requirementBlockers.push(`${flow.name}: invalid flow endpoints or missing trust boundary.`);
    }
    const pendingEmergencies = (await client.query<Input>("SELECT id,status FROM threat_emergency_changes WHERE threat_model_id=$1 AND (status='REQUESTED' OR (status='DEPLOYED' AND ((reviewed_at IS NULL AND review_due_at<NOW()) OR (model_updated_at IS NULL AND model_update_due_at<NOW()))))",[model.id])).rows;
    for (const emergency of pendingEmergencies) requirementBlockers.push(`${emergency.id}: ${emergency.status === 'REQUESTED' ? 'emergency security assessment awaits independent authorization' : 'post-emergency security obligations are overdue'}.`);
    for (const requirement of snapshot.requirements as Input[]) {
      if (!requirement.mandatory) continue;
      for(const mapping of (snapshot.compliance as Input[]).filter(item=>item.requirement_id===requirement.id))if(mapping.current_validation_status!=='VALIDATED')requirementBlockers.push(`${requirement.title}: compliance reference ${mapping.framework}/${mapping.code} requires independent validation or replacement.`);
      const mappings = (snapshot.requirementControls as Input[]).filter(mapping => mapping.requirement_id === requirement.id);
      if (!mappings.length) requirementBlockers.push(`${requirement.title}: mandatory requirement has no control mapping.`);
      for (const mapping of mappings) if (!(snapshot.controls as Input[]).some(control => control.id === mapping.control_id && control.required_before_release)) requirementBlockers.push(`${requirement.title}: mandatory requirement must map to release-required controls.`);
    }
    const orderedVerifications=(snapshot.verifications as Input[]).sort((a,b)=>new Date(b.executed_at).getTime()-new Date(a.executed_at).getTime() || String(b.id).localeCompare(a.id));
    const latestVerifications=[...new Map([...orderedVerifications].reverse().map(item=>[item.control_id,item])).values()];
    const evidenceIds = latestVerifications.filter(v=>(snapshot.controls as Input[]).some(c=>c.id===v.control_id && c.required_before_release)).flatMap(v => list(v.evidence_ids));
    const invalidEvidenceIds = evidenceIds.filter(evidenceId => {
      const evidence = (snapshot.evidence as Input[]).find(e => e.id === evidenceId);
      return !evidence || !/^[a-f0-9]{64}$/i.test(evidence.sha256_hash) || evidence.scan_status!=='CLEAN';
    });
    return evaluateSecurityReleaseGate({ applicable: true,
      threatModel: { status: model.status, currentRevisionId: revision.id, approvedRevisionId: revision.status === 'APPROVED' ? revision.id : undefined, nextReviewAt: model.nextReviewAt, screeningComplete: revision.tier !== null && Boolean(revision.policy_version_id), snapshotPresent: Boolean(approvedSnapshot.rowCount), architectureVersion: revision.architecture_version },
      threats: snapshot.threats.map(ThreatModelRepository.threat), controls: snapshot.controls.map(ThreatModelRepository.control),
      verifications: snapshot.verifications.sort((a: Input,b: Input) => new Date(b.executed_at).getTime()-new Date(a.executed_at).getTime() || String(b.id).localeCompare(a.id)).map(ThreatModelRepository.verification),
      approvals: snapshot.approvals.filter((a: Input) => a.review_cycle === revision.review_cycle).map(ThreatModelRepository.approval),
      exceptions: snapshot.exceptions.map(ThreatModelRepository.exception),
      requiredApprovalStages: policy.requiredApprovalStages, releaseBlockingSeverities: policy.releaseBlockingSeverities, requirementBlockers, invalidEvidenceIds,
    });
  }

  static async authorizeRelease(modelId: string, releaseId: string, actor: BankUser, emergencyChangeId?: string) {
    if (!releaseAuthority(actor)) throw new Error('Security release authorization requires AppSec or security authority.');
    return pgClient.transaction(async client => {
      const model = await this.lockModel(modelId, client); this.assertRead(model, actor);
      if (model.releaseId !== releaseId && model.changeId !== releaseId) throw new Error('Release must be the canonical release/change linked to this model.');
      if (!(await client.query('SELECT 1 FROM tickets WHERE id=$1', [releaseId])).rowCount) throw new Error('Release record not found.');
      await this.assertEmergencyRelease(client,model,releaseId,emergencyChangeId);
      const gate = await this.evaluateGate(client, model);
      if (!gate.allowed) throw new Error(`Release is blocked: ${gate.blockers.join(' ')}`);
      const revisionId = String(model.currentRevisionId); const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
      const authorizationId = id('tmra');
      await client.query('INSERT INTO threat_release_authorizations(id,threat_model_id,revision_id,release_id,issued_by,expires_at,gate_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)', [authorizationId, modelId, revisionId, releaseId, actor.id, expiresAt, JSON.stringify(gate)]);
      if (emergencyChangeId) await client.query('UPDATE threat_release_authorizations SET emergency_change_id=$1 WHERE id=$2',[emergencyChangeId,authorizationId]);
      const authorization = issueReleaseAuthorization({ modelId, revisionId, releaseId, expiresAt, authorizationId });
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId, actorId: actor.id, action: 'RELEASE_AUTHORIZED', entityType: 'RELEASE_AUTHORIZATION', entityId: releaseId, newValue: { revisionId, expiresAt, gate } });
      return { authorizationId, authorization, expiresAt, revisionId, gate, emergencyChangeId };
    });
  }

  /** CI must invoke immediately before deployment; this records authorization, not deployment success. */
  static async consumeReleaseAuthorization(modelId: string, input: Input, actor: BankUser) {
    if (!releaseAuthority(actor)) throw new Error('Security release execution authority is required.');
    const releaseId = text(input.releaseId, 'Release');
    const consumptionKey = z.string().trim().min(1).max(128).parse(input.idempotencyKey);
    const payload = verifyReleaseAuthorization(input.authorization, { modelId, releaseId });
    if (!payload.authorizationId) throw new Error('Legacy authorization cannot be consumed; issue a current authorization.');
    const authorizationId = payload.authorizationId;
    return pgClient.transaction(async client => {
      const model = await this.lockModel(modelId, client); this.assertRead(model, actor);
      const authorization = (await client.query<Input>('SELECT * FROM threat_release_authorizations WHERE id=$1 FOR UPDATE', [payload.authorizationId])).rows[0];
      if (!authorization || authorization.threat_model_id !== modelId || authorization.revision_id !== model.currentRevisionId || authorization.release_id !== releaseId || new Date(authorization.expires_at) <= new Date()) throw new Error('Release authorization is no longer current.');
      if (authorization.consumed_at && (authorization.consumption_key !== consumptionKey || authorization.consumed_by !== actor.id)) throw new Error('Release authorization already consumed by another execution.');
      await this.assertEmergencyRelease(client,model,releaseId,authorization.emergency_change_id || undefined);
      const gate = await this.evaluateGate(client, model);
      if (!gate.allowed) throw new Error(`Release is blocked: ${gate.blockers.join(' ')}`);
      if (!authorization.consumed_at) {
        await client.query('UPDATE threat_release_authorizations SET consumed_at=NOW(),consumed_by=$1,consumption_key=$2 WHERE id=$3', [actor.id, consumptionKey, payload.authorizationId]);
        await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId: model.currentRevisionId || '', actorId: actor.id, action: 'RELEASE_AUTHORIZATION_CONSUMED', entityType: 'RELEASE_AUTHORIZATION', entityId: authorizationId, newValue: { releaseId, consumptionKey, gate } });
      }
      return { authorizationId, revisionId: model.currentRevisionId || '', releaseId, gate, deploymentExecuted: false };
    });
  }

  static async requestRiskAcceptance(threatId: string, input: Input, actor: BankUser) {
    const renewal=z.object({rationale:z.string().trim().min(1).max(4000),remediationStatus:z.string().trim().min(1).max(4000),evidenceId:z.string().min(1).max(64)}).optional().parse(input.renewalAssessment);
    return pgClient.transaction(async (client) => {
      const context = await this.lockThreatContext(threatId, client); this.assertWrite(context.model, actor);
      await ThreatModelRepository.requireMutableRevision(context.revisionId, client);
      const controlId = text(input.controlId, '', false) || null;
      if (controlId) { const control = await client.query('SELECT 1 FROM threat_control_threats WHERE control_id=$1 AND threat_id=$2', [controlId, threatId]); if (!control.rowCount) throw new Error('Risk acceptance control must mitigate the selected threat.'); }
      const expiresAt = new Date(text(input.expiresAt, 'Exception expiry')); if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) throw new Error('Exception expiry must be a future date.');
      const exceptionId = id('tmx'); const riskLevel = risk(context.inherentScore);
      if(renewal){
        const evidence=(await client.query('SELECT e.*,a.ticket_id FROM threat_model_evidence e JOIN ticket_attachments a ON a.id=e.attachment_id WHERE e.id=$1 AND e.threat_model_id=$2 AND e.revision_id=$3',[renewal.evidenceId,context.model.id,context.revisionId])).rows[0];
        if(!evidence)throw new Error('Renewal evidence must belong to the current model revision.');
        await this.assertEmergencyAttachment(client,evidence.attachment_id,evidence.ticket_id,actor);
      }
      if (input.riskLevel && input.riskLevel !== riskLevel) throw new Error('Invalid risk level override; exception severity is server-calculated.');
      if (riskLevel === 'CRITICAL' && input.emergency !== true) throw new Error('Critical risk acceptance requires an emergency exception; normal release remains prohibited.');
      const remediationOwner = text(input.remediationOwnerId, 'Remediation owner');
      const remediationPlan = text(input.remediationPlan, 'Remediation plan');
      const deadline = new Date(text(input.remediationDeadline, 'Remediation deadline'));
      if (!Number.isFinite(deadline.getTime()) || deadline <= new Date() || deadline > expiresAt) throw new Error('Remediation deadline must be in the future and no later than exception expiry.');
      text(input.compensatingControls, 'Compensating controls');
      const policy = await this.loadPolicy(context.model.organizationId, client);
      const activePolicy = await this.governancePolicy(context.model.organizationId, client);
      if ((expiresAt.getTime() - Date.now()) / 86400000 > Math.min(activePolicy.config.exceptionDays[riskLevel], policy.maxExceptionDays[riskLevel])) throw new Error(`Exception duration exceeds the configured ${riskLevel} maximum.`);
await client.query(`INSERT INTO threat_model_exceptions(id,threat_id,control_id,reason,business_justification,risk_level,compensating_controls,requested_by_user_id,expires_at,review_date,status,renewal_rationale,remediation_status,assessment_evidence_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'REQUESTED',$11,$12,$13)`, [exceptionId, threatId, controlId, text(input.reason, 'Reason'), text(input.businessJustification, 'Business justification'), riskLevel, text(input.compensatingControls, '', false) || null, actor.id, expiresAt.toISOString(), text(input.reviewDate, '', false) || null,renewal?.rationale||null,renewal?.remediationStatus||null,renewal?.evidenceId||null]);
      const governance = await this.governancePolicy(context.model.organizationId, client);
      await client.query('UPDATE threat_model_exceptions SET remediation_owner_id=$1,remediation_plan=$2,remediation_deadline=$3,emergency=$4,policy_version_id=$5 WHERE id=$6', [remediationOwner, remediationPlan, deadline.toISOString(), input.emergency === true, governance.id, exceptionId]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: context.model.id, revisionId: context.revisionId, actorId: actor.id, action: 'RISK_ACCEPTANCE_REQUESTED', entityType: 'THREAT_MODEL_EXCEPTION', entityId: exceptionId, newValue: { threatId, riskLevel, expiresAt: expiresAt.toISOString() } });
      return (await client.query<Input>('SELECT * FROM threat_model_exceptions WHERE id=$1', [exceptionId])).rows.map(ThreatModelRepository.exception)[0];
    });
  }

  static async decideRiskAcceptance(exceptionId: string, input: Input, actor: BankUser) {
    if (actor.roles.includes('AUDITOR')) throw new Error('Auditor access is read-only.');
    return pgClient.transaction(async (client) => {
      const found=(await client.query<Input>('SELECT r.threat_model_id FROM threat_model_exceptions e JOIN threats t ON t.id=e.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id WHERE e.id=$1',[exceptionId])).rows[0];
      if(!found)throw new Error('Threat Model exception not found.');
      const model=await this.lockModel(found.threat_model_id,client);
      const result = await client.query<Input>(`SELECT e.*,tm.id AS threat_model_id,tm.business_owner_id,tm.technical_owner_id,tm.security_owner_id,tm.department_id,t.revision_id,t.content_version AS current_threat_content_version,r.architecture_version AS current_architecture_version FROM threat_model_exceptions e JOIN threats t ON t.id=e.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id JOIN threat_models tm ON tm.id=r.threat_model_id WHERE e.id=$1 FOR UPDATE`, [exceptionId]); const exception = result.rows[0]; if (!exception) throw new Error('Threat Model exception not found.');
      this.assertRead(model, actor); if (exception.requested_by_user_id === actor.id) throw new Error('Risk requester cannot approve their own exception.');
      const decision = text(input.decision, 'Decision'); if (!['APPROVED', 'REJECTED', 'REVOKED'].includes(decision)) throw new Error('Invalid exception decision.');
      assertExceptionDecision(exception.status, decision, exception.expires_at?.toISOString?.() || exception.expires_at);
      if (decision === 'APPROVED') {
        await ThreatModelRepository.requireMutableRevision(exception.revision_id, client);
        if (exception.architecture_version !== exception.current_architecture_version) throw new Error('Risk acceptance requires a fresh architecture assessment.');
        if (exception.threat_content_version !== exception.current_threat_content_version) throw new Error('Risk acceptance requires a fresh threat assessment.');
        const days = (new Date(exception.expires_at).getTime() - new Date(exception.created_at).getTime()) / 86400000;
        if (days > exceptionLimits[exception.risk_level as keyof typeof exceptionLimits] || !exception.remediation_plan || !exception.remediation_owner_id || !exception.compensating_controls || (exception.risk_level === 'CRITICAL' && !exception.emergency)) throw new Error('Exception requires a fresh assessment under current bank limits.');
      }
      if (['CRITICAL', 'HIGH'].includes(exception.risk_level) && !riskAuthority(actor)) throw new Error('CISO or delegated risk authority is required for high or critical risk acceptance.');
      if (!['CRITICAL', 'HIGH'].includes(exception.risk_level) && !(riskAuthority(actor) || appSec(actor) || actor.roles.includes('GRC_ANALYST'))) throw new Error('GRC, AppSec, or risk authority is required for this exception decision.');
      await client.query(`UPDATE threat_model_exceptions SET status=$1::varchar,approver_id=$2,approved_at=CASE WHEN $1::varchar='APPROVED' THEN NOW() ELSE approved_at END WHERE id=$3`, [decision, actor.id, exceptionId]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: exception.threat_model_id, revisionId: exception.revision_id, actorId: actor.id, action: `RISK_ACCEPTANCE_${decision}`, entityType: 'THREAT_MODEL_EXCEPTION', entityId: exceptionId, newValue: { decision } });
      return (await client.query<Input>('SELECT * FROM threat_model_exceptions WHERE id=$1', [exceptionId])).rows.map(ThreatModelRepository.exception)[0];
    });
  }

  static async linkEvidence(modelId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async (client) => {
      const model = await this.lockModel(modelId, client); this.assertWrite(model, actor); const attachmentId = text(input.attachmentId, 'Attachment');
      await ThreatModelRepository.requireMutableRevision(model.currentRevisionId, client);
      const attachment = await client.query<Input>('SELECT id,ticket_id,sha256_hash,source_payload FROM ticket_attachments WHERE id=$1', [attachmentId]); if (!attachment.rows[0]) throw new Error('Evidence attachment not found.');
      const sourceTicket = (await client.query('SELECT * FROM tickets WHERE id=$1',[attachment.rows[0].ticket_id])).rows[0];
      if (!sourceTicket) throw new Error('Evidence attachment source ticket is unavailable for authorization.');
      const attachmentAccess = AuthService.canAccessResource({ user: actor, action: 'READ', resourceType: 'TICKET', resource: this.ticketAuthorizationRecord(sourceTicket) });
      if (!attachmentAccess.allowed) throw new Error(attachmentAccess.reason || 'Not authorized to link this attachment as Threat Model evidence.');
      if (attachment.rows[0].source_payload?.virusScanStatus !== 'CLEAN') throw new Error('Only a clean, retained attachment can be linked as security evidence.');
      const evidenceId = id('tme'); const linkedEntityType = text(input.linkedEntityType || 'THREAT_MODEL', 'Linked entity type'); const linkedEntityId = text(input.linkedEntityId || modelId, 'Linked entity ID');
      const revisionId = text(input.revisionId || model.currentRevisionId, '', false) || null;
      if (revisionId !== model.currentRevisionId) throw new Error('Evidence must belong to the current mutable revision.');
      if (revisionId) {
        const revision = await client.query(`SELECT 1 FROM threat_model_revisions WHERE id=$1 AND threat_model_id=$2`, [revisionId, modelId]);
        if (!revision.rowCount) throw new Error('Evidence revision does not belong to this Threat Model.');
      }
      if (input.controlId) {
        const control = await client.query(`SELECT 1 FROM threat_controls c JOIN threats t ON t.id=c.threat_id WHERE c.id=$1 AND t.revision_id=$2`, [text(input.controlId, 'Control'), revisionId]);
        if (!control.rowCount) throw new Error('Evidence control does not belong to this Threat Model.');
      }
      if (input.threatId) {
        const threat = await client.query(`SELECT 1 FROM threats t WHERE t.id=$1 AND t.revision_id=$2`, [text(input.threatId, 'Threat'), revisionId]);
        if (!threat.rowCount) throw new Error('Evidence threat does not belong to this Threat Model.');
      }
      if (input.verificationId) throw new Error('Link evidence to a control before recording its verification.');
      if(input.controlId && input.threatId && !(await client.query('SELECT 1 FROM threat_control_threats WHERE control_id=$1 AND threat_id=$2',[input.controlId,input.threatId])).rowCount) throw new Error('Evidence control must mitigate its linked threat.');
      if((await client.query('SELECT 1 FROM threat_model_evidence WHERE attachment_id=$1 AND revision_id=$2 AND control_id IS NOT DISTINCT FROM $3::varchar AND threat_id IS NOT DISTINCT FROM $4::varchar',[attachmentId,revisionId,input.controlId||null,input.threatId||null])).rowCount)throw new Error('Duplicate evidence link is invalid; reuse the existing revision-scoped reference.');
      await client.query(`INSERT INTO threat_model_evidence(id,threat_model_id,revision_id,threat_id,control_id,verification_id,attachment_id,classification,linked_entity_type,linked_entity_id,uploaded_by_user_id,link_contract_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,2)`, [evidenceId, modelId, revisionId, text(input.threatId, '', false) || null, text(input.controlId, '', false) || null, null, attachmentId, model.dataClassification, linkedEntityType, linkedEntityId, actor.id]);
      await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId: text(input.revisionId || model.currentRevisionId, '', false) || undefined, actorId: actor.id, action: 'EVIDENCE_LINKED', entityType: 'THREAT_MODEL_EVIDENCE', entityId: evidenceId, newValue: { attachmentId, sha256: attachment.rows[0].sha256_hash } });
      return { id: evidenceId, attachmentId };
    });
  }

  static async downloadEvidence(modelId:string,evidenceId:string,actor:BankUser){
    const read=async(client:PoolClient)=>{
      const evidence=(await client.query('SELECT e.revision_id,a.* FROM threat_model_evidence e JOIN ticket_attachments a ON a.id=e.attachment_id WHERE e.id=$1 AND e.threat_model_id=$2',[evidenceId,modelId])).rows[0];
      if(!evidence)throw new Error('Evidence not found in this model.');
      await this.assertEmergencyAttachment(client,evidence.id,evidence.ticket_id,actor);
      if(!evidence.storage_key||String(evidence.storage_key).startsWith('quarantine/'))throw new Error('Evidence storage is not ready.');
      return evidence;
    };
    const initial=await this.withGovernanceModel(modelId,actor,read);
    const stored=await storageService.getFileBuffer(initial.storage_key);
    const digest=createHash('sha256').update(stored.buffer).digest('hex');
    return this.withGovernanceModel(modelId,actor,async client=>{
      const current=await read(client);
      if(current.storage_key!==initial.storage_key||digest!==String(current.sha256_hash).toLowerCase())throw new Error('Evidence content integrity check failed; download blocked.');
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId,revisionId:current.revision_id,actorId:actor.id,action:'THREAT_EVIDENCE_DOWNLOADED',entityType:'THREAT_MODEL_EVIDENCE',entityId:evidenceId,newValue:{attachmentId:current.id,sha256:digest}});
      return {buffer:stored.buffer,fileName:String(current.file_name),sha256:digest};
    });
  }

  static async markReviewRequiredForMaterialChange(scope: { projectId?: string; assetId?: string; serviceId?: string; changeId?: string }, actor: BankUser, origin?: { source: string; eventId: string; reason: string }) {
    const filters = Object.entries(scope).filter(([key, value]) => ['projectId','assetId','serviceId','changeId'].includes(key) && Boolean(value)); if (!filters.length) return [];
    const clauses = filters.map(([field], index) => `${field.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)} = $${index + 1}`).join(' OR ');
    const values = filters.map(([, value]) => value);
    const models = await pgClient.query<Input>(`SELECT id,current_revision_id FROM threat_models WHERE status='APPROVED' AND (${clauses})`, values);
    await pgClient.transaction(async (client) => {
      for (const model of models.rows) {
        if (origin) {
          const inserted = await client.query('INSERT INTO threat_model_source_events(id,threat_model_id,source,source_event_id,reason,material,created_by) VALUES($1,$2,$3,$4,$5,true,$6) ON CONFLICT(threat_model_id,source,source_event_id) DO NOTHING RETURNING id', [id('tmse'),model.id,origin.source,origin.eventId,origin.reason,actor.id]);
          if (!inserted.rowCount) continue;
        }
        const revisionId = await this.createMaterialChangeRevision(client, model.id, actor, scope);
        if (!revisionId) continue;
        await client.query(`UPDATE threat_models SET current_revision_id=$1,status='REVIEW_REQUIRED',stale_reason=$3,updated_at=NOW(),version=version+1 WHERE id=$2`, [revisionId, model.id, origin?.reason || `Material security change: ${JSON.stringify(scope)}`]);
        await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: model.id, revisionId, actorId: actor.id, action: 'REVIEW_REQUIRED', entityType: 'THREAT_MODEL', entityId: model.id, newValue: scope });
      }
    });
    return models.rows.map((model) => model.id);
  }

  private static async assertEmergencyRelease(client: PoolClient, model: Input, releaseId: string, emergencyId?: string) {
    const active = (await client.query<Input>("SELECT * FROM threat_emergency_changes WHERE threat_model_id=$1 AND change_id=$2 AND status IN ('REQUESTED','APPROVED','DEPLOYED')",[model.id,releaseId])).rows[0];
    if (!active && !emergencyId) return;
    if (!active || active.id !== emergencyId || active.status !== 'APPROVED' || active.revision_id !== model.currentRevisionId || new Date(active.authorization_expires_at) <= new Date()) throw new Error('Current independent emergency authorization is required and must be explicitly bound to this release.');
  }

  /** A minimum emergency assessment is immutable; changing its scope requires a new request. */
  static async requestEmergencyChange(modelId: string, input: Input, actor: BankUser) {
    return pgClient.transaction(async client => {
      const model = await this.lockModel(modelId,client); this.assertWrite(model,actor);
      if (model.status === 'ARCHIVED') throw new Error('Archived models cannot request an emergency change.');
      const changeId = text(input.changeId,'Canonical change/release');
      if (![model.changeId,model.releaseId].includes(changeId)) throw new Error('Emergency change must be linked to this model.');
      if (!(await client.query('SELECT 1 FROM tickets WHERE id=$1',[changeId])).rowCount) throw new Error('Change record not found.');
      const policy = await this.governancePolicy(model.organizationId,client);
      const calendarId = String(policy.config.emergencyCalendarId || 'calendar-bank-baku');
      const row = (await client.query<Input>('SELECT * FROM orchestration_business_calendars WHERE id=$1',[calendarId])).rows[0];
      if (!row) throw new Error('A persisted bank business calendar is required before emergency assessment.');
      const calendar: BusinessCalendar = {id:row.id,name:row.name,timezone:row.timezone,workdays:row.workdays,holidays:row.holidays,businessStart:row.business_start,businessEnd:row.business_end,is24x7:row.is_24x7};
      emergencyDeadline(new Date(),5,calendar);
      const emergencyId = id('tmec');
      await client.query(`INSERT INTO threat_emergency_changes(id,threat_model_id,revision_id,change_id,policy_version_id,calendar_id,calendar_snapshot,reason,security_impact,compensating_controls,rollback_plan,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)`,[emergencyId,modelId,model.currentRevisionId,changeId,policy.id,calendarId,JSON.stringify(calendar),text(input.reason,'Emergency justification'),text(input.securityImpact,'Minimum security impact assessment'),text(input.compensatingControls,'Compensating controls'),text(input.rollbackPlan,'Rollback plan'),actor.id]);
      const assessment = (await client.query('SELECT * FROM threat_emergency_changes WHERE id=$1',[emergencyId])).rows[0];
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'EMERGENCY_CHANGE_REQUESTED',entityType:'THREAT_EMERGENCY_CHANGE',entityId:emergencyId,newValue:{...assessment,fullModelUpdateRequired:true}});
      return {id:emergencyId,status:'REQUESTED',deploymentExecuted:false};
    });
  }

  static async decideEmergencyChange(modelId: string, emergencyId: string, input: Input, actor: BankUser) {
    if (!seniorRiskAuthority(actor)) throw new Error('Emergency authorization requires independent CISO authority.');
    const decision = z.enum(['APPROVED','REJECTED','REVOKED']).parse(input.decision);
    const reason = text(input.reason,'Decision rationale');
    return pgClient.transaction(async client => {
      const model = await this.lockModel(modelId,client); this.assertWrite(model,actor);
      const emergency = await this.lockEmergency(client,modelId,emergencyId);
      if ([emergency.requested_by,model.businessOwnerId,model.technicalOwnerId].includes(actor.id)) throw new Error('Emergency requester or implementation owner cannot approve their own change.');
      if (!(emergency.status === 'REQUESTED' && ['APPROVED','REJECTED'].includes(decision)) && !(emergency.status === 'APPROVED' && decision === 'REVOKED')) throw new Error('Invalid emergency decision; renewal requires a new assessment.');
      if (decision === 'APPROVED') {
        if (emergency.revision_id !== model.currentRevisionId) throw new Error('Emergency assessment is no longer current; submit a new assessment.');
        if (model.status !== 'APPROVED') throw new Error('An approved immutable model is required before emergency authorization; emergency is not a release-gate bypass.');
        if ((await client.query('SELECT tier FROM threat_model_revisions WHERE id=$1',[model.currentRevisionId])).rows[0]?.tier == null) throw new Error('Current security screening is required before emergency authorization.');
        await client.query("UPDATE threat_emergency_changes SET status='APPROVED',approved_by=$1,approved_at=NOW(),authorization_expires_at=NOW()+INTERVAL '24 hours' WHERE id=$2",[actor.id,emergencyId]);
      } else await client.query('UPDATE threat_emergency_changes SET status=$1 WHERE id=$2',[decision,emergencyId]);
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId,revisionId:emergency.revision_id,actorId:actor.id,action:`EMERGENCY_${decision}`,entityType:'THREAT_EMERGENCY_CHANGE',entityId:emergencyId,oldValue:{status:emergency.status},newValue:{decision,reason,normalReleaseGateStillRequired:true}});
      return {id:emergencyId,status:decision,deploymentExecuted:false};
    });
  }

  /** Records an evidence-backed operator attestation of an external execution, never executes deployment. */
  static async recordEmergencyDeployment(modelId: string, emergencyId: string, input: Input, actor: BankUser) {
    if (!releaseAuthority(actor)) throw new Error('Security release execution authority is required.');
    return pgClient.transaction(async client => {
      const model = await this.lockModel(modelId,client); this.assertWrite(model,actor);
      const emergency = await this.lockEmergency(client,modelId,emergencyId);
      const authorizationId = text(input.authorizationId,'Consumed release authorization');
      const reference = z.string().trim().min(1).max(500).parse(input.executionReference);
      const attachmentId = text(input.attachmentId,'Deployment evidence attachment');
      const deployedAt = new Date(z.string().datetime({offset:true}).parse(input.deployedAt));
      if (emergency.deployed_at) {
        if (emergency.release_authorization_id !== authorizationId || emergency.execution_reference !== reference || emergency.deployment_attachment_id !== attachmentId || new Date(emergency.deployed_at).getTime() !== deployedAt.getTime() || emergency.deployed_by !== actor.id) throw new Error('Deployment is already recorded with different immutable evidence.');
        return {id:emergencyId,status:emergency.status,executionSource:'OPERATOR_ATTESTATION',deploymentExecuted:false};
      }
      if (emergency.status !== 'APPROVED') throw new Error('Approved emergency authorization is required.');
      const authorization = (await client.query<Input>('SELECT * FROM threat_release_authorizations WHERE id=$1 FOR UPDATE',[authorizationId])).rows[0];
      if (!authorization || authorization.emergency_change_id !== emergencyId || authorization.threat_model_id !== modelId || authorization.release_id !== emergency.change_id || !authorization.consumed_at || authorization.consumed_by !== actor.id) throw new Error('A consumed, matching emergency release authorization is required.');
      if (deployedAt > new Date() || deployedAt < new Date(authorization.consumed_at) || deployedAt > new Date(authorization.expires_at) || deployedAt > new Date(emergency.authorization_expires_at)) throw new Error('Deployment time must fall within the consumed authorization window.');
      const deploymentEvidence = await this.assertEmergencyAttachment(client,attachmentId,emergency.change_id,actor);
      const policy = (await client.query<Input>('SELECT config FROM threat_governance_policy_versions WHERE id=$1',[emergency.policy_version_id])).rows[0].config;
      const reviewDueAt = emergencyDeadline(deployedAt,Math.min(2,Number(policy.postEmergencyReviewBusinessDays || 2)),emergency.calendar_snapshot);
      const updateDueAt = emergencyDeadline(deployedAt,Math.min(5,Number(policy.postEmergencyModelBusinessDays || 5)),emergency.calendar_snapshot);
      await client.query("UPDATE threat_emergency_changes SET status='DEPLOYED',deployed_by=$1,deployed_at=$2,execution_reference=$3,deployment_attachment_id=$4,release_authorization_id=$5,review_due_at=$6,model_update_due_at=$7 WHERE id=$8",[actor.id,deployedAt.toISOString(),reference,attachmentId,authorizationId,reviewDueAt,updateDueAt,emergencyId]);
      const revisionId = await this.createMaterialChangeRevision(client,modelId,actor,{reason:`Post-emergency revalidation ${emergencyId}`});
      if (revisionId) await client.query("UPDATE threat_models SET current_revision_id=$1,status='REVIEW_REQUIRED',stale_reason='Mandatory post-emergency revalidation',updated_at=NOW(),version=version+1 WHERE id=$2",[revisionId,modelId]);
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId,revisionId:emergency.revision_id,actorId:actor.id,action:'EMERGENCY_DEPLOYMENT_ATTESTED',entityType:'THREAT_EMERGENCY_CHANGE',entityId:emergencyId,newValue:{authorizationId,reference,attachmentId,sha256:deploymentEvidence.sha256_hash,deployedAt:deployedAt.toISOString(),reviewDueAt,updateDueAt,executionSource:'OPERATOR_ATTESTATION'}});
      return {id:emergencyId,status:'DEPLOYED',reviewDueAt,updateDueAt,executionSource:'OPERATOR_ATTESTATION',deploymentExecuted:false};
    });
  }

  static async reviewEmergencyChange(modelId: string, emergencyId: string, input: Input, actor: BankUser) {
    if (!appSec(actor)) throw new Error('Independent AppSec review authority is required.');
    return pgClient.transaction(async client => {
      const model = await this.lockModel(modelId,client); this.assertWrite(model,actor);
      const emergency = await this.lockEmergency(client,modelId,emergencyId);
      if (emergency.status !== 'DEPLOYED' || emergency.reviewed_at) throw new Error('An unreviewed deployed emergency is required.');
      if ([emergency.requested_by,emergency.deployed_by,emergency.approved_by,model.businessOwnerId,model.technicalOwnerId].includes(actor.id)) throw new Error('Change contributors cannot independently review their emergency.');
      const attachmentId = text(input.attachmentId,'Review evidence attachment');
      const reviewEvidence = await this.assertEmergencyAttachment(client,attachmentId,emergency.change_id,actor);
      const findings = text(input.findings,'Post-change security review findings');
      await this.recordEmergencyBreaches(client,emergency,actor);
      await client.query('UPDATE threat_emergency_changes SET reviewed_by=$1,reviewed_at=NOW(),review_findings=$2,review_attachment_id=$3 WHERE id=$4',[actor.id,findings,attachmentId,emergencyId]);
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'EMERGENCY_POST_CHANGE_REVIEWED',entityType:'THREAT_EMERGENCY_CHANGE',entityId:emergencyId,newValue:{findings,attachmentId,sha256:reviewEvidence.sha256_hash}});
      return {id:emergencyId,status:'DEPLOYED',modelUpdateRequired:true};
    });
  }

  static async closeEmergencyChange(modelId: string, emergencyId: string, actor: BankUser) {
    if (!appSec(actor)) throw new Error('Independent AppSec review authority is required.');
    return pgClient.transaction(async client => {
      const model = await this.lockModel(modelId,client); this.assertWrite(model,actor);
      const emergency = await this.lockEmergency(client,modelId,emergencyId);
      if (emergency.status !== 'DEPLOYED' || !emergency.reviewed_at) throw new Error('Completed post-change review is required before closure.');
      if ([emergency.requested_by,emergency.deployed_by,emergency.approved_by,model.businessOwnerId,model.technicalOwnerId].includes(actor.id)) throw new Error('Change contributors cannot independently close their emergency.');
      const revision = (await client.query<Input>(`SELECT r.*,s.revision_id AS snapshot_id FROM threat_model_revisions r LEFT JOIN threat_model_approval_snapshots s ON s.revision_id=r.id WHERE r.id=$1`,[model.currentRevisionId])).rows[0];
      if (model.status !== 'APPROVED' || !revision?.snapshot_id || revision.status !== 'APPROVED' || revision.id === emergency.revision_id || new Date(revision.created_at) < new Date(emergency.deployed_at) || new Date(revision.approved_at) < new Date(emergency.deployed_at)) throw new Error('A current approved post-deployment model update with immutable evidence is required.');
      await this.recordEmergencyBreaches(client,{...emergency,model_updated_at:emergency.model_updated_at || revision.approved_at},actor);
      await client.query("UPDATE threat_emergency_changes SET status='CLOSED',updated_revision_id=COALESCE(updated_revision_id,$1),model_updated_at=COALESCE(model_updated_at,$2),closed_at=NOW() WHERE id=$3",[revision.id,revision.approved_at,emergencyId]);
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId,revisionId:revision.id,actorId:actor.id,action:'EMERGENCY_CLOSED',entityType:'THREAT_EMERGENCY_CHANGE',entityId:emergencyId,newValue:{updatedRevisionId:revision.id,modelUpdatedAt:revision.approved_at}});
      return {id:emergencyId,status:'CLOSED'};
    });
  }

  private static async lockEmergency(client: PoolClient, modelId: string, emergencyId: string): Promise<Input> {
    const row = (await client.query<Input>('SELECT * FROM threat_emergency_changes WHERE id=$1 AND threat_model_id=$2 FOR UPDATE',[emergencyId,modelId])).rows[0];
    if (!row) throw new Error('Emergency change not found in this model.'); return row;
  }

  private static async assertEmergencyAttachment(client: PoolClient, attachmentId: string, changeId: string, actor: BankUser) {
    const attachment = (await client.query<Input>('SELECT * FROM ticket_attachments WHERE id=$1 AND ticket_id=$2',[attachmentId,changeId])).rows[0];
    const ticket = (await client.query('SELECT * FROM tickets WHERE id=$1',[changeId])).rows[0];
    if (!attachment || !/^[a-f0-9]{64}$/i.test(attachment.sha256_hash) || attachment.source_payload?.virusScanStatus!=='CLEAN') throw new Error('Clean retained evidence from the emergency change is required.');
    if (!ticket || !AuthService.canAccessResource({user:actor,action:'READ',resourceType:'TICKET',resource:this.ticketAuthorizationRecord(ticket)}).allowed) throw new Error('Emergency evidence access is restricted.');
    return attachment;
  }

  private static async recordEmergencyBreaches(client: PoolClient, emergency: Input, actor: BankUser) {
    const state = emergencySlaState(emergency);
    for (const [breached,column,due] of [[state.reviewBreached,'review_breached_at',emergency.review_due_at],[state.modelUpdateBreached,'model_update_breached_at',emergency.model_update_due_at]] as const) {
      if (!breached || emergency[column]) continue;
      await client.query(`UPDATE threat_emergency_changes SET ${column}=$1 WHERE id=$2`,[due,emergency.id]);
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId:emergency.threat_model_id,revisionId:emergency.revision_id,actorId:actor.id,action:'EMERGENCY_SLA_BREACHED',entityType:'THREAT_EMERGENCY_CHANGE',entityId:emergency.id,newValue:{sla:column,deadline:due}});
    }
  }

  /** Bounded scheduled maintenance; replay sees already-transitioned rows and does no new work. */
  static async maintainGovernance(actor: BankUser) {
    if (!actor?.id) throw new Error('A persisted automation actor is required.');
    await this.reconcileFindingChanges(actor);
    await this.reconcileComplianceChanges(actor);
    const emergencyCandidates = (await pgClient.query<Input>(`SELECT id,threat_model_id FROM threat_emergency_changes WHERE status='DEPLOYED' AND ((review_breached_at IS NULL AND review_due_at<NOW() AND (reviewed_at IS NULL OR reviewed_at>review_due_at)) OR (model_update_breached_at IS NULL AND model_update_due_at<NOW() AND (model_updated_at IS NULL OR model_updated_at>model_update_due_at))) ORDER BY review_due_at,id LIMIT 100`)).rows;
    let emergencyBreaches = 0;
    for (const candidate of emergencyCandidates) emergencyBreaches += await pgClient.transaction(async client => {
      // Same model -> emergency -> audit lock order as interactive mutations; never hold multiple models here.
      await this.lockModel(candidate.threat_model_id,client);
      const emergency = await this.lockEmergency(client,candidate.threat_model_id,candidate.id);
      const state = emergencySlaState(emergency);
      if (emergency.status !== 'DEPLOYED' || !((state.reviewBreached && !emergency.review_breached_at) || (state.modelUpdateBreached && !emergency.model_update_breached_at))) return 0;
      await this.recordEmergencyBreaches(client,emergency,actor); return 1;
    });
    const expiredCandidates=(await pgClient.query<Input>(`SELECT e.id,t.revision_id,r.threat_model_id FROM threat_model_exceptions e JOIN threats t ON t.id=e.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id WHERE e.status='APPROVED' AND e.expires_at<=NOW() ORDER BY e.expires_at,e.id LIMIT 100`)).rows;
    let expired=0;
    for(const exception of expiredCandidates)expired+=await pgClient.transaction(async client=>{
      await this.lockModel(exception.threat_model_id,client);
      const changed=await client.query("UPDATE threat_model_exceptions SET status='EXPIRED' WHERE id=$1 AND status='APPROVED' AND expires_at<=now() RETURNING id",[exception.id]);
      if(!changed.rowCount)return 0;
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId:exception.threat_model_id,revisionId:exception.revision_id,actorId:actor.id,action:'RISK_ACCEPTANCE_EXPIRED',entityType:'THREAT_MODEL_EXCEPTION',entityId:exception.id,newValue:{source:'GOVERNANCE_SCHEDULER'}});return 1;
    });
    const overdueCandidates=(await pgClient.query<Input>("SELECT id FROM threat_models WHERE status='APPROVED' AND next_review_at<=now() ORDER BY next_review_at,id LIMIT 50")).rows;
    let overdue=0;
    for(const candidate of overdueCandidates)overdue+=await pgClient.transaction(async client=>{
      const model=await this.lockModel(candidate.id,client);if(model.status!=='APPROVED'||!model.nextReviewAt||new Date(model.nextReviewAt)>new Date())return 0;
      const revisionId=await this.createMaterialChangeRevision(client,model.id,actor,{reason:'Periodic security review is due'});if(!revisionId)return 0;
      await client.query("UPDATE threat_models SET current_revision_id=$1,status='REVIEW_REQUIRED',stale_reason='Periodic security review is due',updated_at=now(),version=version+1 WHERE id=$2",[revisionId,model.id]);
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId:model.id,revisionId,actorId:actor.id,action:'PERIODIC_REVIEW_REQUIRED',entityType:'THREAT_MODEL',entityId:model.id,newValue:{source:'GOVERNANCE_SCHEDULER',previousRevisionId:model.currentRevisionId}});return 1;
    });
    return {expired,overdue,emergencyBreaches};
  }

  /** Ticket completion signals implementation only; verification remains a separate AppSec action. */
  static async synchronizeControlTicket(ticketId: string, statusCategory: string, actor: BankUser) {
    await pgClient.transaction(async (client) => {
      const controls = await client.query<Input>(`SELECT c.id,c.threat_id,c.status,t.revision_id,r.threat_model_id FROM threat_controls c JOIN threats t ON t.id=c.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id WHERE c.implementation_ticket_id=$1 AND r.status IN ('DRAFT','CHANGES_REQUIRED') FOR UPDATE`, [ticketId]);
      for (const control of controls.rows) {
        const status = statusCategory === 'DONE' ? 'VERIFICATION_REQUIRED' : statusCategory === 'CANCELLED' ? 'PLANNED' : 'IN_IMPLEMENTATION';
        if (control.status === status || (statusCategory === 'DONE' && control.status === 'VERIFIED')) continue;
        await client.query('UPDATE threat_controls SET status=$1,updated_at=NOW() WHERE id=$2', [status, control.id]);
        await ThreatModelRepository.audit(client, { id: id('tmae'), modelId: control.threat_model_id, revisionId: control.revision_id, actorId: actor.id, action: 'REMEDIATION_TICKET_SYNCHRONIZED', entityType: 'THREAT_CONTROL', entityId: control.id, newValue: { ticketId, status, statusCategory } });
        if (status === 'VERIFICATION_REQUIRED') await enqueueOutbox(client, 'threat-control.verification.required', 'THREAT_CONTROL', control.id, { threatModelId: control.threat_model_id, revisionId: control.revision_id, controlId: control.id, implementationTicketId: ticketId, completedBy: actor.id });
      }
    });
  }

  static async reconcileComplianceChanges(actor:BankUser){
    const invalid=`SELECT DISTINCT c.id,c.framework,c.code,c.current_validation_status FROM threat_security_requirements s JOIN threat_requirement_compliance l ON l.requirement_id=s.id JOIN threat_compliance_details c ON c.id=l.compliance_id WHERE s.revision_id=$1 AND s.mandatory AND c.current_validation_status='RETIRED'`;
    const candidates=(await pgClient.query("SELECT m.id FROM threat_models m WHERE m.status='APPROVED' AND EXISTS(SELECT 1 FROM threat_security_requirements s JOIN threat_requirement_compliance l ON l.requirement_id=s.id JOIN threat_compliance_details c ON c.id=l.compliance_id WHERE s.revision_id=m.current_revision_id AND s.mandatory AND c.current_validation_status='RETIRED') ORDER BY m.id LIMIT 50")).rows;
    for(const candidate of candidates)await pgClient.transaction(async client=>{
      const model=await this.lockModel(candidate.id,client);if(model.status!=='APPROVED')return;
      const changes=(await client.query(invalid,[model.currentRevisionId])).rows;if(!changes.length)return;
      const reason='A mandatory compliance interpretation was retired; independent revalidation is required';
      const revisionId=await this.createMaterialChangeRevision(client,model.id,actor,{reason});if(!revisionId)return;
      await client.query("UPDATE threat_models SET current_revision_id=$1,status='REVIEW_REQUIRED',stale_reason=$2,updated_at=now(),version=version+1 WHERE id=$3",[revisionId,reason,model.id]);
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId:model.id,revisionId,actorId:actor.id,action:'COMPLIANCE_REVALIDATION_REQUIRED',entityType:'THREAT_MODEL',entityId:model.id,newValue:{changes,previousRevisionId:model.currentRevisionId}});
      await enqueueOutbox(client,'threat-model.review.submitted','THREAT_MODEL',model.id,{threatModelId:model.id,revisionId,reason},`compliance-revalidation:${revisionId}`);
    });return {models:candidates.length};
  }

  static async findingLinks(modelId:string,actor:BankUser){
    const model=await ThreatModelRepository.findById(modelId);if(!model)throw new Error('Threat Model not found.');this.assertRead(model,actor);
    return (await pgClient.query('SELECT * FROM threat_finding_link_state WHERE revision_id=$1 ORDER BY created_at DESC,id LIMIT 500',[model.currentRevisionId])).rows;
  }

  static async linkFinding(modelId:string,input:Input,actor:BankUser){
    const parsed=z.object({threatId:z.string().min(1).max(64),controlId:z.string().min(1).max(64),cmdbFindingId:z.string().max(64).optional(),findingTicketId:z.string().max(64).optional(),assumption:z.string().trim().min(1).max(4000)}).refine(value=>Boolean(value.cmdbFindingId)!==Boolean(value.findingTicketId),'Exactly one canonical finding reference is required').parse(input);
    return this.withAnalysisModel(modelId,actor,async(client,model)=>{
      if(parsed.findingTicketId){
        const row=(await client.query('SELECT * FROM tickets WHERE id=$1',[parsed.findingTicketId])).rows[0];
        if(!row||!AuthService.canAccessResource({user:actor,action:'READ',resourceType:'TICKET',resource:this.ticketAuthorizationRecord(row)}).allowed)throw new Error('Finding ticket access is restricted.');
        await this.validateArchitectureOwner({dataClassification:row.confidentiality},model,actor,client);
      }else{
        const finding=(await client.query('SELECT asset_id FROM cmdb_security_findings WHERE id=$1',[parsed.cmdbFindingId])).rows[0];
        if(!finding)throw new Error('Canonical finding not found.');
        await this.assertScopeReferences({assetId:finding.asset_id},actor,client);
      }
      const linkId=id('tfl');await client.query('INSERT INTO threat_finding_links(id,revision_id,threat_id,control_id,cmdb_finding_id,finding_ticket_id,assumption,source_fingerprint,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,\'\',$8)',[linkId,model.currentRevisionId,parsed.threatId,parsed.controlId,parsed.cmdbFindingId||null,parsed.findingTicketId||null,parsed.assumption,actor.id]);
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'FINDING_ASSUMPTION_LINKED',entityType:'THREAT_FINDING_LINK',entityId:linkId,newValue:parsed});
      await enqueueOutbox(client,'threat-control.verification.required','THREAT_CONTROL',parsed.controlId,{threatModelId:modelId,controlId:parsed.controlId,reason:'FINDING_ASSUMPTION_LINKED'},`finding-link:${linkId}`);
      return {id:linkId};
    });
  }

  /** Live gate reads source state too: scheduler delivery is not a release-safety dependency. */
  static async reconcileFindingChanges(actor:BankUser){
    const candidates=(await pgClient.query<Input>(`SELECT DISTINCT m.id FROM threat_models m JOIN threat_finding_link_state l ON l.revision_id=m.current_revision_id WHERE m.status='APPROVED' AND (l.current_state IS DISTINCT FROM 'RESOLVED' OR l.current_fingerprint IS DISTINCT FROM COALESCE(l.assessed_fingerprint,l.source_fingerprint)) ORDER BY m.id LIMIT 50`)).rows;
    for(const candidate of candidates)await pgClient.transaction(async client=>{
      const model=await this.lockModel(candidate.id,client);if(model.status!=='APPROVED')return;
      const changes=(await client.query<Input>("SELECT * FROM threat_finding_link_state WHERE revision_id=$1 AND (current_state IS DISTINCT FROM 'RESOLVED' OR current_fingerprint IS DISTINCT FROM COALESCE(assessed_fingerprint,source_fingerprint)) ORDER BY id",[model.currentRevisionId])).rows;
      if(!changes.length)return;
      const reason='Linked security finding changed or contradicts a control assumption';
      const revisionId=await this.createMaterialChangeRevision(client,model.id,actor,{reason});if(!revisionId)return;
      await client.query("UPDATE threat_models SET current_revision_id=$1,status='REVIEW_REQUIRED',stale_reason=$2,updated_at=NOW(),version=version+1 WHERE id=$3",[revisionId,reason,model.id]);
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId:model.id,revisionId,actorId:actor.id,action:'FINDING_REVALIDATION_REQUIRED',entityType:'THREAT_MODEL',entityId:model.id,newValue:{reason,previousRevisionId:model.currentRevisionId,changes}});
      await enqueueOutbox(client,'threat-model.review.submitted','THREAT_MODEL',model.id,{threatModelId:model.id,revisionId,reason},`finding-revalidation:${revisionId}`);
    });
    return {models:candidates.length};
  }

  private static ticketAuthorizationRecord(row:Input):any {
    const mapped=Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter:string)=>letter.toUpperCase()),value]));
    return {...(row.source_payload||{}),...mapped,restrictedUserIds:row.restricted_user_ids||[],restrictedTeamIds:row.restricted_team_ids||[]};
  }

  static async assessFinding(modelId:string,linkId:string,input:Input,actor:BankUser){
    if(!securityReviewer(actor))throw new Error('Security authority required for finding assessment.');
    const parsed=z.object({fingerprint:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(1).max(4000)}).parse(input);
    return this.withAnalysisModel(modelId,actor,async(client,model)=>{
      const link=(await client.query('SELECT * FROM threat_finding_link_state WHERE id=$1 AND revision_id=$2',[linkId,model.currentRevisionId])).rows[0];
      if(!link)throw new Error('Finding link not found in the current revision.');
      if(link.current_fingerprint!==parsed.fingerprint)throw new Error('Finding changed; fresh assessment is required.');
      const assessmentId=id('tfa');await client.query('INSERT INTO threat_finding_assessments(id,link_id,assessed_fingerprint,reason,assessed_by) VALUES($1,$2,$3,$4,$5)',[assessmentId,linkId,parsed.fingerprint,parsed.reason,actor.id]);
      await ThreatModelRepository.audit(client,{id:id('tmae'),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'FINDING_ASSUMPTION_ASSESSED',entityType:'THREAT_FINDING_LINK',entityId:linkId,newValue:parsed});
      await enqueueOutbox(client,'threat-control.verification.required','THREAT_CONTROL',link.control_id,{threatModelId:modelId,controlId:link.control_id,reason:'FINDING_ASSUMPTION_ASSESSED'},`finding-assessment:${assessmentId}`);
      return {id:assessmentId};
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
    const controlIds = new Map<string, string>();
    // Use the same fixed persisted-field allowlist as authoring, including unknown values.
    // Identity, content counters and derived crossing flags are generated for the new revision.
    const copyArchitecture=async(kind:ArchitectureKind,newId:string,row:Input)=>{
      const storage=architectureStorage[kind];const columns=Object.values(storage.fields);
      await client.query(`INSERT INTO ${storage.table}(id,revision_id,${columns.join(',')}) VALUES($1,$2,${columns.map((column,index)=>`$${index+3}${column==='data_types'?'::jsonb':''}`).join(',')})`,[newId,revisionId,...columns.map(column=>column==='data_types'?JSON.stringify(row[column]||[]):row[column]??null)]);
    };
    const components = await client.query<Input>('SELECT * FROM threat_model_components WHERE revision_id=$1 ORDER BY name', [previous.id]);
    for (const component of components.rows) {
      const newId = id('cmp'); componentIds.set(component.id, newId);
      await copyArchitecture('component',newId,component);
    }
    const boundaries = await client.query<Input>('SELECT * FROM threat_model_trust_boundaries WHERE revision_id=$1 ORDER BY name', [previous.id]);
    for (const boundary of boundaries.rows) {
      const newId = id('bnd'); boundaryIds.set(boundary.id, newId);
      await copyArchitecture('boundary',newId,boundary);
    }
    const flows = await client.query<Input>('SELECT * FROM threat_model_data_flows WHERE revision_id=$1 ORDER BY name', [previous.id]);
    for (const flow of flows.rows) {
      const newId = id('flow'); flowIds.set(flow.id, newId);
      await copyArchitecture('flow',newId,{...flow,source_component_id:componentIds.get(flow.source_component_id),destination_component_id:componentIds.get(flow.destination_component_id),trust_boundary_id:flow.trust_boundary_id?boundaryIds.get(flow.trust_boundary_id):null});
    }
    const threats = await client.query<Input>('SELECT * FROM threats WHERE revision_id=$1 ORDER BY created_at,id', [previous.id]);
    for (let index = 0; index < threats.rows.length; index += 1) {
      const threat = threats.rows[index]; const newId = id('th'); threatIds.set(threat.id, newId);
      await client.query(`INSERT INTO threats(id,revision_id,key,title,description,categories,attack_scenario,attacker_type,attacker_capability,preconditions,attack_path,affected_component_id,affected_data_flow_id,affected_trust_boundary_id,affected_asset_id,cwe_ids,capec_ids,inherent_likelihood,inherent_impact,inherent_score,status,owner_id,due_date,created_by_user_id,previous_threat_id,methodology,source,assumptions,confidentiality_impact,integrity_impact,availability_impact,security_properties) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,$20,'OPEN',$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31::jsonb)`, [newId, revisionId, `${model.key}-R${revisionNumber}-T${String(index + 1).padStart(3, '0')}`, threat.title, threat.description, JSON.stringify(threat.categories || []), threat.attack_scenario, threat.attacker_type, threat.attacker_capability, threat.preconditions, threat.attack_path, threat.affected_component_id ? componentIds.get(threat.affected_component_id) || null : null, threat.affected_data_flow_id ? flowIds.get(threat.affected_data_flow_id) || null : null, threat.affected_trust_boundary_id ? boundaryIds.get(threat.affected_trust_boundary_id) || null : null, threat.affected_asset_id, JSON.stringify(threat.cwe_ids || []), JSON.stringify(threat.capec_ids || []), threat.inherent_likelihood, threat.inherent_impact, threat.inherent_score, threat.owner_id, threat.due_date, actor.id, threat.id,threat.methodology,threat.source,threat.assumptions,threat.confidentiality_impact,threat.integrity_impact,threat.availability_impact,JSON.stringify(threat.security_properties)]);
    }
    const attackCases=(await client.query<Input>('SELECT * FROM threat_attack_cases WHERE revision_id=$1 ORDER BY created_at,id',[previous.id])).rows;
    const attackNodes=(await client.query<Input>('SELECT n.* FROM threat_attack_nodes n JOIN threat_attack_cases c ON c.id=n.case_id WHERE c.revision_id=$1 ORDER BY n.ordinal',[previous.id])).rows;
    for(const attackCase of attackCases){
      const caseId=id('case');
      await client.query('INSERT INTO threat_attack_cases(id,revision_id,threat_id,title,objective,assumptions,methodology,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[caseId,revisionId,threatIds.get(attackCase.threat_id),attackCase.title,attackCase.objective,attackCase.assumptions,attackCase.methodology,actor.id]);
      const nodes=attackNodes.filter(node=>node.case_id===attackCase.id);const nodeIds=new Map(nodes.map(node=>[node.id,id('node')]));
      for(const node of nodes)await client.query('INSERT INTO threat_attack_nodes(id,case_id,parent_id,node_kind,label,ordinal) VALUES($1,$2,$3,$4,$5,$6)',[nodeIds.get(node.id),caseId,node.parent_id?nodeIds.get(node.parent_id):null,node.node_kind,node.label,node.ordinal]);
    }
    const controls = await client.query<Input>('SELECT c.* FROM threat_control_details c JOIN threats t ON t.id=c.threat_id WHERE t.revision_id=$1 ORDER BY c.created_at,c.id', [previous.id]);
    for (const control of controls.rows) {
      const carriedStatus = control.required_before_release ? 'VERIFICATION_REQUIRED' : 'PROPOSED';
      const controlId = id('ctl'); controlIds.set(control.id, controlId);
      await client.query(`INSERT INTO threat_controls(id,threat_id,title,description,control_type,implementation_owner_id,status,required_before_release,due_date,effectiveness_status,catalog_version_id,implementation_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [controlId, threatIds.get(control.threat_id), control.title, control.description, control.control_type, control.implementation_owner_id, carriedStatus, control.required_before_release, control.due_date, 'REASSESSMENT_REQUIRED',control.catalog_version_id,control.implementation_key]);
      for(const mappedThreatId of control.threat_ids || [control.threat_id]) if(mappedThreatId!==control.threat_id) await client.query('INSERT INTO threat_control_threats(control_id,threat_id) VALUES($1,$2)',[controlId,threatIds.get(mappedThreatId)]);
    }
    for(const link of (await client.query<Input>('SELECT * FROM threat_finding_links WHERE revision_id=$1 ORDER BY id',[previous.id])).rows){
      await client.query('INSERT INTO threat_finding_links(id,revision_id,threat_id,control_id,cmdb_finding_id,finding_ticket_id,assumption,source_fingerprint,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,\'\',$8)',[id('tfl'),revisionId,threatIds.get(link.threat_id),controlIds.get(link.control_id),link.cmdb_finding_id,link.finding_ticket_id,link.assumption,actor.id]);
    }
    for (const link of (await client.query<Input>('SELECT * FROM threat_data_object_links WHERE revision_id=$1', [previous.id])).rows) {
      await client.query('INSERT INTO threat_data_object_links(id,data_object_id,revision_id,component_id,flow_id) VALUES($1,$2,$3,$4,$5)', [id('tmdl'), link.data_object_id, revisionId, componentIds.get(link.component_id) || null, flowIds.get(link.flow_id) || null]);
    }
    for (const requirement of (await client.query<Input>('SELECT * FROM threat_security_requirements WHERE revision_id=$1 ORDER BY id', [previous.id])).rows) {
      const requirementId = id('tmreq');
      await client.query('INSERT INTO threat_security_requirements(id,revision_id,title,description,mandatory,owner_id,verification_method,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [requirementId, revisionId, requirement.title, requirement.description, requirement.mandatory, requirement.owner_id, requirement.verification_method, actor.id]);
      for (const row of (await client.query<Input>('SELECT * FROM threat_requirement_threats WHERE requirement_id=$1', [requirement.id])).rows) await client.query('INSERT INTO threat_requirement_threats VALUES($1,$2)', [requirementId, threatIds.get(row.threat_id)]);
      for (const row of (await client.query<Input>('SELECT * FROM threat_requirement_controls WHERE requirement_id=$1', [requirement.id])).rows) await client.query('INSERT INTO threat_requirement_controls VALUES($1,$2)', [requirementId, controlIds.get(row.control_id)]);
      for (const row of (await client.query<Input>('SELECT * FROM threat_requirement_compliance WHERE requirement_id=$1', [requirement.id])).rows) await client.query('INSERT INTO threat_requirement_compliance VALUES($1,$2)', [requirementId, row.compliance_id]);
    }
    await ThreatModelRepository.audit(client, { id: id('tmae'), modelId, revisionId, actorId: actor.id, action: 'REVISION_CREATED', entityType: 'THREAT_MODEL_REVISION', entityId: revisionId, oldValue: { revisionId: previous.id }, newValue: { revisionNumber, materialChange: scope } });
    return revisionId;
  }

  private static architectureMapper(kind:ArchitectureKind) {
    return kind==='component'?ThreatModelRepository.component:kind==='boundary'?ThreatModelRepository.boundary:ThreatModelRepository.flow;
  }

  private static async validateArchitectureOwner(input:Input,model:Input,actor:BankUser,client:QueryClient) {
    await this.assertScopeReferences({assetId:input.assetId},actor,client);
    if(input.ownerId && !(await client.query('SELECT 1 FROM bank_users WHERE id=$1 AND is_active',[input.ownerId])).rowCount) throw new Error('An active architecture owner is required.');
    if(input.dataClassification) {
      const level=CONFIDENTIALITY_LEVELS[input.dataClassification as keyof typeof CONFIDENTIALITY_LEVELS];
      if((CONFIDENTIALITY_LEVELS[actor.securityClearance]||0)<level)throw new Error('Data classification access is restricted by clearance.');
      if(level>(CONFIDENTIALITY_LEVELS[model.dataClassification as keyof typeof CONFIDENTIALITY_LEVELS]||0)) {
        await client.query('UPDATE threat_models SET data_classification=$1,version=version+1,updated_at=NOW() WHERE id=$2',[input.dataClassification,model.id]);
        await client.query('UPDATE threat_model_revisions SET tier=NULL,policy_version_id=NULL,version=version+1 WHERE id=$1',[model.currentRevisionId]);
        await ThreatModelRepository.audit(client,{id:id('tmae'),modelId:model.id,revisionId:model.currentRevisionId,actorId:actor.id,action:'MODEL_CLASSIFICATION_RAISED',entityType:'THREAT_MODEL',entityId:model.id,oldValue:{dataClassification:model.dataClassification},newValue:{dataClassification:input.dataClassification,source:'ARCHITECTURE_FLOW'}});
      }
    }
  }

  private static async addArchitecture(kind:ArchitectureKind,modelId:string,input:Input,actor:BankUser) {
    const parsed=architectureSchemas[kind].parse(input) as Input;
    return pgClient.transaction(async client=>{
      const model=await this.lockModel(modelId,client);this.assertWrite(model,actor);
      const revision=await ThreatModelRepository.requireMutableRevision(model.currentRevisionId,client);
      await this.validateArchitectureOwner(parsed,model,actor,client);
      const entityId=id(kind==='component'?'cmp':kind==='boundary'?'bnd':'flow');
      const storage=architectureStorage[kind];const fields=Object.entries(storage.fields);
      await client.query(`INSERT INTO ${storage.table}(id,revision_id,${fields.map(([,column])=>column).join(',')}) VALUES($1,$2,${fields.map(([field],index)=>`$${index+3}${field==='dataTypes'?'::jsonb':''}`).join(',')})`,
        [entityId,revision.id,...fields.map(([field])=>field==='dataTypes'?JSON.stringify(parsed[field]):parsed[field])]);
      const after=(await client.query<Input>(`SELECT * FROM ${storage.table} WHERE id=$1`,[entityId])).rows[0];
      await this.auditArchitectureChange(client,modelId,revision.id,kind,entityId,actor,undefined,after,'Created structured architecture');
      return this.architectureMapper(kind)(after);
    });
  }

  static async editArchitecture(modelId:string,entityId:string,input:Input,actor:BankUser,requestContext?:{correlationId?:string;ipAddress?:string;userAgent?:string}) {
    const edit=architectureEditSchema.parse(input);
    const parsed=edit.action==='UPDATE'?architectureSchemas[edit.kind].parse(input) as Input:undefined;
    return pgClient.transaction(async client=>{
      const model=await this.lockModel(modelId,client);this.assertWrite(model,actor);
      const revision=await ThreatModelRepository.requireMutableRevision(model.currentRevisionId,client);
      const storage=architectureStorage[edit.kind];
      const before=(await client.query<Input>(`SELECT * FROM ${storage.table} WHERE id=$1 AND revision_id=$2`,[entityId,revision.id])).rows[0];
      if(!before)throw new Error('Architecture record not found in the current revision.');
      if(before.content_version!==edit.contentVersion)throw new Error('Architecture changed by another editor. Reload before saving.');
      if(parsed){
        await this.validateArchitectureOwner(parsed,model,actor,client);
        const fields=Object.entries(storage.fields);
        await client.query(`UPDATE ${storage.table} SET ${fields.map(([field,column],index)=>`${column}=$${index+1}${field==='dataTypes'?'::jsonb':''}`).join(',')} WHERE id=$${fields.length+1}`,
          [...fields.map(([field])=>field==='dataTypes'?JSON.stringify(parsed[field]):parsed[field]),entityId]);
      }else await client.query(`DELETE FROM ${storage.table} WHERE id=$1`,[entityId]);
      const after=parsed?(await client.query<Input>(`SELECT * FROM ${storage.table} WHERE id=$1`,[entityId])).rows[0]:undefined;
      const changed=!after||after.content_version!==before.content_version;
      if(changed)await this.auditArchitectureChange(client,modelId,revision.id,edit.kind,entityId,actor,before,after,edit.reason,requestContext);
      return {entity:after?this.architectureMapper(edit.kind)(after):null,deleted:!after,changed};
    });
  }

  private static async auditArchitectureChange(client:PoolClient,modelId:string,revisionId:string,kind:ArchitectureKind,entityId:string,actor:BankUser,before:Input|undefined,after:Input|undefined,reason:string,requestContext?:{correlationId?:string;ipAddress?:string;userAgent?:string}) {
    const revision=(await client.query<Input>('SELECT architecture_version FROM threat_model_revisions WHERE id=$1',[revisionId])).rows[0];
    const material=!before||!after||(await client.query<Input>('SELECT architecture_security_content($1::jsonb) IS DISTINCT FROM architecture_security_content($2::jsonb) AS changed',[JSON.stringify(before),JSON.stringify(after)])).rows[0].changed;
    const controls=material?(await client.query<Input>('SELECT c.id,c.scope_version FROM threat_controls c JOIN threats t ON t.id=c.threat_id WHERE t.revision_id=$1 ORDER BY c.id',[revisionId])).rows:[];
    const action=before?(after?'UPDATED':'REMOVED'):'CREATED';
    await ThreatModelRepository.audit(client,{id:id('tmae'),modelId,revisionId,actorId:actor.id,action:`${kind.toUpperCase()}_${action}`,entityType:`THREAT_MODEL_${kind.toUpperCase()}`,entityId,oldValue:before,newValue:{entity:after||null,reason,material,architectureVersion:revision.architecture_version,invalidatedControls:controls},...requestContext});
    if(material)await this.notifyArchitectureControls(client,modelId,revisionId,controls,revision.architecture_version,requestContext?.correlationId);
  }

  private static async notifyArchitectureControls(client:PoolClient,modelId:string,revisionId:string,controls?:Input[],architectureVersion?:number,requestCorrelationId?:string) {
    const version=architectureVersion??(await client.query<Input>('SELECT architecture_version FROM threat_model_revisions WHERE id=$1',[revisionId])).rows[0].architecture_version;
    const targets=controls??(await client.query<Input>('SELECT c.id,c.scope_version FROM threat_controls c JOIN threats t ON t.id=c.threat_id WHERE t.revision_id=$1 ORDER BY c.id',[revisionId])).rows;
    for(const control of targets){
      const eventKey=`architecture:${createHash('sha256').update(`${revisionId}:${version}:${control.id}`).digest('hex')}`;
      await enqueueOutbox(client,'threat-control.verification.required','THREAT_CONTROL',control.id,{threatModelId:modelId,controlId:control.id,reason:'ARCHITECTURE_CHANGED',scopeVersion:control.scope_version,architectureVersion:version,requestCorrelationId},eventKey);
    }
  }

  private static async loadPolicy(organizationId: string, client?: QueryClient): Promise<ThreatModelPolicy> {
    const connection = client || pgClient;
    const result = await connection.query<Input>('SELECT policy FROM threat_model_policies WHERE organization_id=$1', [organizationId]);
    const stored = result.rows[0]?.policy;
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return {
      requiredSignals: Array.isArray(parsed?.requiredSignals) && parsed.requiredSignals.length ? list(parsed.requiredSignals) : defaultPolicy.requiredSignals,
      reviewFrequencyDays: Number.isInteger(Number(parsed?.reviewFrequencyDays)) && Number(parsed.reviewFrequencyDays) > 0 ? Number(parsed.reviewFrequencyDays) : defaultPolicy.reviewFrequencyDays,
      maxExceptionDays: Object.fromEntries(Object.entries(exceptionLimits).map(([level, maximum]) => [level, Math.min(maximum, Number(parsed?.maxExceptionDays?.[level]) > 0 ? Number(parsed.maxExceptionDays[level]) : maximum)])),
      requiredApprovalStages: [...new Set(['APPSEC', ...(Array.isArray(parsed?.requiredApprovalStages) && parsed.requiredApprovalStages.length ? list(parsed.requiredApprovalStages) : defaultPolicy.requiredApprovalStages)])],
      releaseBlockingSeverities: [...new Set(['CRITICAL','HIGH', ...list(parsed?.releaseBlockingSeverities)])],
      verificationExpirationDays: { ...defaultPolicy.verificationExpirationDays, ...(parsed?.verificationExpirationDays && typeof parsed.verificationExpirationDays === 'object' ? Object.fromEntries(Object.entries(parsed.verificationExpirationDays).map(([key, value]) => [key, Number(value)])) : {}) },
      remediationSlaDays: { ...defaultPolicy.remediationSlaDays, ...(parsed?.remediationSlaDays && typeof parsed.remediationSlaDays === 'object' ? Object.fromEntries(Object.entries(parsed.remediationSlaDays).map(([key, value]) => [key, Number(value)])) : {}) },
    };
  }

  private static async lockModel(modelId: string, client: PoolClient): Promise<Input> { const result = await client.query<Input>("SELECT tm.*,COALESCE((SELECT jsonb_agg(g) FROM threat_model_active_grants g WHERE g.threat_model_id=tm.id),'[]') AS access_grants FROM threat_models tm WHERE id=$1 FOR UPDATE OF tm", [modelId]); if (!result.rows[0]) throw new Error('Threat Model not found.'); return ThreatModelRepository.model(result.rows[0]); }
  private static async lockThreatContext(threatId: string, client: PoolClient): Promise<{ model: Input; revisionId: string; inherentScore: number }> {
    const found=(await client.query<Input>('SELECT r.threat_model_id FROM threats t JOIN threat_model_revisions r ON r.id=t.revision_id WHERE t.id=$1',[threatId])).rows[0];
    if(!found)throw new Error('Threat not found.');
    const model=await this.lockModel(found.threat_model_id,client);
    const threat=(await client.query<Input>('SELECT revision_id,inherent_score FROM threats WHERE id=$1 FOR UPDATE',[threatId])).rows[0];
    return {model,revisionId:threat.revision_id,inherentScore:Number(threat.inherent_score)};
  }
  private static async lockControlContext(controlId: string, client: PoolClient): Promise<{ model: Input; revisionId: string; implementerId?: string }> {
    const found=(await client.query<Input>('SELECT r.threat_model_id FROM threat_controls c JOIN threats t ON t.id=c.threat_id JOIN threat_model_revisions r ON r.id=t.revision_id WHERE c.id=$1',[controlId])).rows[0];
    if(!found)throw new Error('Threat control not found.');
    const model=await this.lockModel(found.threat_model_id,client);
    const control=(await client.query<Input>('SELECT t.revision_id,c.implementation_owner_id FROM threat_controls c JOIN threats t ON t.id=c.threat_id WHERE c.id=$1 FOR UPDATE OF c,t',[controlId])).rows[0];
    return {model,revisionId:control.revision_id,implementerId:control.implementation_owner_id||undefined};
  }
  private static assertRead(model: Input, actor: BankUser): void {
    const required = CONFIDENTIALITY_LEVELS[model.dataClassification as keyof typeof CONFIDENTIALITY_LEVELS] || CONFIDENTIALITY_LEVELS.CONFIDENTIAL_SECURITY_ONLY;
    if (!actor.isActive || (CONFIDENTIALITY_LEVELS[actor.securityClearance] || 0) < required) throw new Error('Threat Model access is restricted by security clearance.');
    if (appSec(actor) || actor.roles.includes('AUDITOR') || [model.businessOwnerId, model.technicalOwnerId, model.securityOwnerId].includes(actor.id) || (model.accessGrants||[]).some((grant:Input)=>grant.user_id===actor.id&&new Date(grant.valid_until)>new Date())) return;
    throw new Error('Threat Model access is restricted to its owners, security reviewers, and auditors.');
  }
private static assertWrite(model: Input, actor: BankUser): void { this.assertRead(model, actor); if (['RETIRED','ARCHIVED'].includes(model.status)) throw new Error('Retired or archived models are read-only.'); if (actor.roles.includes('AUDITOR')) throw new Error('Auditor access is read-only.'); if (appSec(actor) || [model.businessOwnerId, model.technicalOwnerId, model.securityOwnerId].includes(actor.id) || (model.accessGrants||[]).some((grant:Input)=>grant.user_id===actor.id&&grant.permission==='CONTRIBUTE'&&new Date(grant.valid_until)>new Date())) return; throw new Error('Only a Threat Model owner or authorized security team member may modify this model.'); }
  /** IDs received from the browser must reference an existing, actor-visible operational record; opaque strings cannot create cross-scope models. */
  private static async assertScopeReferences(input: Input, actor: BankUser,client:QueryClient=pgClient): Promise<void> {
    const addRecord = (record: any, label: string) => {
      if (!record) throw new Error(`${label} does not exist or is no longer available.`);
      const owners = new Set<string>();
      for (const owner of [record.ownerId, record.ownerUserId, record.managerId, record.businessOwnerId, record.businessOwnerUserId, record.technicalOwnerId, record.technicalOwnerUserId, record.requesterId, record.reporterId]) if (owner) owners.add(String(owner));
      if (!appSec(actor) && !owners.has(actor.id) && (!actor.departmentId || record.departmentId !== actor.departmentId)) throw new Error(`${label} access is restricted; every linked scope record requires independent access.`);
    };
    const inventory=async(value:string,fallback:'bank_applications'|'bank_assets')=>{
      const canonical=(await client.query('SELECT * FROM configuration_items WHERE id=$1',[value])).rows[0];
      if(canonical?.archived_at)throw new Error('Canonical inventory record is no longer available.');
      const row=canonical||(await client.query(`SELECT * FROM ${fallback} WHERE id=$1`,[value])).rows[0];
      return row?this.ticketAuthorizationRecord(row):undefined;
    };
    const serviceId = text(input.serviceId, '', false); if (serviceId) addRecord(await inventory(serviceId,'bank_applications'),'Service');
    const assetId = text(input.assetId, '', false); if (assetId) addRecord(await inventory(assetId,'bank_assets'),'Asset');
    const projectId = text(input.projectId, '', false); if (projectId) addRecord((await client.query("SELECT payload FROM legacy_json_records WHERE collection='projects' AND record_id=$1",[projectId])).rows[0]?.payload,'Project');
    for(const [field,label] of [['changeId','Change request'],['releaseId','Release record']] as const){
      const value=text(input[field],'',false);if(!value)continue;
      const row=(await client.query('SELECT * FROM tickets WHERE id=$1',[value])).rows[0];
      const record=row?this.ticketAuthorizationRecord(row):undefined;
      addRecord(field==='changeId'&&record?.category!=='CHANGE_REQUEST'?undefined:record,label);
      if(!AuthService.canAccessResource({user:actor,action:'READ',resourceType:'TICKET',resource:record}).allowed)throw new Error(`${label} access is restricted.`);
    }
  }
}
