import { pgClient } from './client.js';

type Row = Record<string, any>;
type SqlClient = { query<T extends Row = Row>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }> };

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') { try { return JSON.parse(value) as T; } catch { return fallback; } }
  return value as T;
};

export class ThreatModelRepository {
  static async list(scope: { userId: string; departmentId?: string; elevated: boolean }): Promise<Row[]> {
    const result = await pgClient.query<Row>(
      `SELECT tm.*, r.revision_number, r.status AS revision_status
         FROM threat_models tm LEFT JOIN threat_model_revisions r ON r.id = tm.current_revision_id
        WHERE ($1::boolean OR tm.department_id = $2 OR tm.business_owner_id = $3 OR tm.technical_owner_id = $3 OR tm.security_owner_id = $3)
        ORDER BY tm.updated_at DESC`,
      [scope.elevated, scope.departmentId || null, scope.userId]
    );
    return result.rows.map(this.model);
  }

  static async findById(id: string, client: SqlClient = pgClient): Promise<Row | undefined> {
    const result = await client.query<Row>('SELECT * FROM threat_models WHERE id = $1', [id]);
    return result.rows[0] ? this.model(result.rows[0]) : undefined;
  }

  static async modelDetail(id: string): Promise<Record<string, unknown> | undefined> {
    const model = await this.findById(id);
    if (!model) return undefined;
    const revisionId = model.currentRevisionId as string | undefined;
    const [revisions, assessment, components, boundaries, flows, threats, controls, verifications, approvals, exceptions, evidence, audit, enterpriseRisks] = await Promise.all([
      pgClient.query<Row>('SELECT * FROM threat_model_revisions WHERE threat_model_id = $1 ORDER BY revision_number DESC', [id]),
      pgClient.query<Row>('SELECT * FROM threat_model_applicability WHERE threat_model_id = $1 ORDER BY assessed_at DESC', [id]),
      pgClient.query<Row>('SELECT * FROM threat_model_components WHERE revision_id = $1 ORDER BY name', [revisionId || '']),
      pgClient.query<Row>('SELECT * FROM threat_model_trust_boundaries WHERE revision_id = $1 ORDER BY name', [revisionId || '']),
      pgClient.query<Row>('SELECT * FROM threat_model_data_flows WHERE revision_id = $1 ORDER BY name', [revisionId || '']),
      pgClient.query<Row>('SELECT * FROM threats WHERE revision_id = $1 ORDER BY inherent_score DESC, key', [revisionId || '']),
      pgClient.query<Row>('SELECT c.*, tk.status_category AS implementation_ticket_status FROM threat_controls c JOIN threats t ON t.id = c.threat_id LEFT JOIN tickets tk ON tk.id = c.implementation_ticket_id WHERE t.revision_id = $1 ORDER BY c.created_at', [revisionId || '']),
      pgClient.query<Row>('SELECT v.* FROM control_verifications v JOIN threat_controls c ON c.id = v.control_id JOIN threats t ON t.id = c.threat_id WHERE t.revision_id = $1 ORDER BY v.executed_at DESC', [revisionId || '']),
      pgClient.query<Row>('SELECT a.* FROM threat_model_approvals a JOIN threat_model_revisions r ON r.id = a.revision_id WHERE r.threat_model_id = $1 ORDER BY a.decided_at DESC', [id]),
      pgClient.query<Row>('SELECT e.* FROM threat_model_exceptions e JOIN threats t ON t.id = e.threat_id JOIN threat_model_revisions r ON r.id = t.revision_id WHERE r.threat_model_id = $1 ORDER BY e.created_at DESC', [id]),
      pgClient.query<Row>('SELECT * FROM threat_model_evidence WHERE threat_model_id = $1 ORDER BY uploaded_at DESC', [id]),
      pgClient.query<Row>('SELECT * FROM threat_model_audit_events WHERE threat_model_id = $1 ORDER BY occurred_at DESC LIMIT 500', [id]),
      pgClient.query<Row>(`SELECT l.id AS link_id,l.threat_id,l.link_reason,l.created_at AS linked_at,rr.id AS risk_id,rr.risk_id AS risk_code,rr.title,rr.inherent_risk,rr.residual_risk,rr.status,rr.review_date
                              FROM threat_model_risk_links l JOIN risk_register_items rr ON rr.id=l.risk_register_item_id
                             WHERE l.threat_model_id=$1 ORDER BY l.created_at DESC`, [id]),
    ]);
    return { model, revisions: revisions.rows.map(this.revision), applicability: assessment.rows.map(this.assessment), components: components.rows.map(this.component), trustBoundaries: boundaries.rows.map(this.boundary), dataFlows: flows.rows.map(this.flow), threats: threats.rows.map(this.threat), controls: controls.rows.map(this.control), verifications: verifications.rows.map(this.verification), approvals: approvals.rows.map(this.approval), exceptions: exceptions.rows.map(this.exception), evidence: evidence.rows.map(this.evidence), history: audit.rows.map(this.auditEvent), enterpriseRisks: enterpriseRisks.rows.map((row) => ({ id: row.link_id, threatId: row.threat_id, riskId: row.risk_id, riskCode: row.risk_code, title: row.title, inherentRisk: row.inherent_risk, residualRisk: row.residual_risk, status: row.status, reviewDate: row.review_date?.toISOString?.() || row.review_date, linkReason: row.link_reason, linkedAt: row.linked_at?.toISOString?.() || row.linked_at })) };
  }

  static async requireMutableRevision(revisionId: string, client: SqlClient): Promise<Row> {
    const result = await client.query<Row>('SELECT * FROM threat_model_revisions WHERE id = $1 FOR UPDATE', [revisionId]);
    const revision = result.rows[0];
    if (!revision) throw new Error('Threat Model revision not found.');
    if (!['DRAFT', 'CHANGES_REQUIRED'].includes(revision.status)) throw new Error('Approved or in-review Threat Model revisions are immutable. Create a new revision.');
    return this.revision(revision);
  }

  static async audit(client: SqlClient, params: { id: string; modelId: string; revisionId?: string; actorId: string; action: string; entityType: string; entityId: string; oldValue?: unknown; newValue?: unknown; correlationId?: string; ipAddress?: string; userAgent?: string }): Promise<void> {
    await client.query(
      `INSERT INTO threat_model_audit_events(id,threat_model_id,revision_id,actor_id,action,entity_type,entity_id,old_value,new_value,correlation_id,ip_address,user_agent)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)`,
      [params.id, params.modelId, params.revisionId || null, params.actorId, params.action, params.entityType, params.entityId, params.oldValue === undefined ? null : JSON.stringify(params.oldValue), params.newValue === undefined ? null : JSON.stringify(params.newValue), params.correlationId || null, params.ipAddress || null, params.userAgent || null]
    );
  }

  static model(row: Row): Row { return { id: row.id, key: row.key, organizationId: row.organization_id, serviceId: row.service_id || undefined, assetId: row.asset_id || undefined, projectId: row.project_id || undefined, changeId: row.change_id || undefined, releaseId: row.release_id || undefined, title: row.title, description: row.description, criticality: row.criticality, dataClassification: row.data_classification, businessOwnerId: row.business_owner_id, technicalOwnerId: row.technical_owner_id, securityOwnerId: row.security_owner_id || undefined, departmentId: row.department_id || undefined, currentRevisionId: row.current_revision_id || undefined, status: row.status, nextReviewAt: row.next_review_at?.toISOString?.() || row.next_review_at, lastApprovedAt: row.last_approved_at?.toISOString?.() || row.last_approved_at, createdAt: row.created_at?.toISOString?.() || row.created_at, createdBy: row.created_by_user_id, updatedAt: row.updated_at?.toISOString?.() || row.updated_at, version: Number(row.version), revisionNumber: row.revision_number ? Number(row.revision_number) : undefined, revisionStatus: row.revision_status }; }
  static revision(row: Row): Row { return { id: row.id, threatModelId: row.threat_model_id, revisionNumber: Number(row.revision_number), status: row.status, scopeSummary: row.scope_summary, architectureSummary: row.architecture_summary, assumptions: row.assumptions, securityObjectives: row.security_objectives, inScope: parseJson(row.in_scope, []), outOfScope: parseJson(row.out_of_scope, []), supersedesRevisionId: row.supersedes_revision_id || undefined, changeReason: row.change_reason || undefined, createdBy: row.created_by_user_id, createdAt: row.created_at?.toISOString?.() || row.created_at, submittedBy: row.submitted_by_user_id || undefined, submittedAt: row.submitted_at?.toISOString?.() || row.submitted_at, reviewedBy: row.reviewed_by_user_id || undefined, reviewedAt: row.reviewed_at?.toISOString?.() || row.reviewed_at, approvedBy: row.approved_by_user_id || undefined, approvedAt: row.approved_at?.toISOString?.() || row.approved_at, version: Number(row.version) }; }
  static assessment(row: Row): Row { return { id: row.id, threatModelId: row.threat_model_id || undefined, organizationId: row.organization_id, projectId: row.project_id || undefined, changeId: row.change_id || undefined, serviceId: row.service_id || undefined, assetId: row.asset_id || undefined, answers: parseJson(row.answers, {}), decision: row.decision, justification: row.justification || undefined, assessedBy: row.assessed_by_user_id, assessedAt: row.assessed_at?.toISOString?.() || row.assessed_at, reviewedBy: row.reviewed_by_user_id || undefined, reviewedAt: row.reviewed_at?.toISOString?.() || row.reviewed_at }; }
  static component(row: Row): Row { return { id: row.id, revisionId: row.revision_id, name: row.name, type: row.type, description: row.description || undefined, technology: row.technology || undefined, assetId: row.asset_id || undefined, ownerId: row.owner_id || undefined, criticality: row.criticality || undefined }; }
  static boundary(row: Row): Row { return { id: row.id, revisionId: row.revision_id, name: row.name, description: row.description || undefined, boundaryType: row.boundary_type, trustLevelFrom: row.trust_level_from || undefined, trustLevelTo: row.trust_level_to || undefined, authenticationRequired: row.authentication_required, encryptionRequired: row.encryption_required, notes: row.notes || undefined }; }
  static flow(row: Row): Row { return { id: row.id, revisionId: row.revision_id, sourceComponentId: row.source_component_id, destinationComponentId: row.destination_component_id, trustBoundaryId: row.trust_boundary_id || undefined, name: row.name, description: row.description || undefined, protocol: row.protocol || undefined, port: row.port || undefined, authenticationMethod: row.authentication_method || undefined, encryptionInTransit: row.encryption_in_transit, dataClassification: row.data_classification, dataTypes: parseJson(row.data_types, []), crossesTrustBoundary: row.crosses_trust_boundary, direction: row.direction, notes: row.notes || undefined }; }
  static threat(row: Row): Row { return { id: row.id, revisionId: row.revision_id, key: row.key, title: row.title, description: row.description, categories: parseJson(row.categories, []), attackScenario: row.attack_scenario, attackerType: row.attacker_type || undefined, attackerCapability: row.attacker_capability || undefined, preconditions: row.preconditions || undefined, attackPath: row.attack_path || undefined, affectedComponentId: row.affected_component_id || undefined, affectedDataFlowId: row.affected_data_flow_id || undefined, affectedTrustBoundaryId: row.affected_trust_boundary_id || undefined, affectedAssetId: row.affected_asset_id || undefined, cweIds: parseJson(row.cwe_ids, []), capecIds: parseJson(row.capec_ids, []), inherentLikelihood: Number(row.inherent_likelihood), inherentImpact: Number(row.inherent_impact), inherentScore: Number(row.inherent_score), residualLikelihood: row.residual_likelihood || undefined, residualImpact: row.residual_impact || undefined, residualScore: row.residual_score || undefined, residualRiskRationale: row.residual_risk_rationale || undefined, residualRiskCalculatedAt: row.residual_risk_calculated_at?.toISOString?.() || row.residual_risk_calculated_at, residualRiskCalculatedBy: row.residual_risk_calculated_by_user_id || undefined, status: row.status, ownerId: row.owner_id || undefined, dueDate: row.due_date?.toISOString?.().slice(0, 10) || row.due_date, createdBy: row.created_by_user_id, createdAt: row.created_at?.toISOString?.() || row.created_at, updatedAt: row.updated_at?.toISOString?.() || row.updated_at }; }
  static control(row: Row): Row { return { id: row.id, threatId: row.threat_id, title: row.title, description: row.description, controlType: row.control_type, implementationOwnerId: row.implementation_owner_id || undefined, status: row.status, implementationTicketId: row.implementation_ticket_id || undefined, implementationTicketStatus: row.implementation_ticket_status || undefined, requiredBeforeRelease: row.required_before_release, dueDate: row.due_date?.toISOString?.().slice(0, 10) || row.due_date, effectivenessStatus: row.effectiveness_status || undefined, createdAt: row.created_at?.toISOString?.() || row.created_at, updatedAt: row.updated_at?.toISOString?.() || row.updated_at }; }
  static verification(row: Row): Row { return { id: row.id, controlId: row.control_id, verificationType: row.verification_type, testCase: row.test_case, expectedResult: row.expected_result, result: row.result, evidenceIds: parseJson(row.evidence_ids, []), executedBy: row.executed_by_user_id, executedAt: row.executed_at?.toISOString?.() || row.executed_at, reviewerId: row.reviewer_id || undefined, reviewedAt: row.reviewed_at?.toISOString?.() || row.reviewed_at, expiresAt: row.expires_at?.toISOString?.() || row.expires_at, notes: row.notes || undefined }; }
  static approval(row: Row): Row { return { id: row.id, revisionId: row.revision_id, stage: row.stage, decision: row.decision, decidedBy: row.decided_by_user_id, decidedAt: row.decided_at?.toISOString?.() || row.decided_at, comments: row.comments || undefined }; }
  static exception(row: Row): Row { return { id: row.id, threatId: row.threat_id, controlId: row.control_id || undefined, reason: row.reason, businessJustification: row.business_justification, riskLevel: row.risk_level, compensatingControls: row.compensating_controls || undefined, requestedBy: row.requested_by_user_id, approverId: row.approver_id || undefined, approvedAt: row.approved_at?.toISOString?.() || row.approved_at, expiresAt: row.expires_at?.toISOString?.() || row.expires_at, reviewDate: row.review_date?.toISOString?.() || row.review_date, status: row.status, createdAt: row.created_at?.toISOString?.() || row.created_at }; }
  static evidence(row: Row): Row { return { id: row.id, threatModelId: row.threat_model_id, revisionId: row.revision_id || undefined, threatId: row.threat_id || undefined, controlId: row.control_id || undefined, verificationId: row.verification_id || undefined, attachmentId: row.attachment_id, classification: row.classification, linkedEntityType: row.linked_entity_type, linkedEntityId: row.linked_entity_id, uploadedBy: row.uploaded_by_user_id, uploadedAt: row.uploaded_at?.toISOString?.() || row.uploaded_at }; }
  static auditEvent(row: Row): Row { return { id: row.id, threatModelId: row.threat_model_id, revisionId: row.revision_id || undefined, actorId: row.actor_id, action: row.action, entityType: row.entity_type, entityId: row.entity_id, oldValue: parseJson(row.old_value, undefined), newValue: parseJson(row.new_value, undefined), correlationId: row.correlation_id || undefined, occurredAt: row.occurred_at?.toISOString?.() || row.occurred_at }; }
}
