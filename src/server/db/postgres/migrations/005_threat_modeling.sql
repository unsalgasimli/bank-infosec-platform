-- Bank-grade Threat Modeling: a separately versioned security-control domain.
-- All approval-sensitive history is append-only; normal application operations
-- create new revisions instead of editing approved material.

CREATE TABLE IF NOT EXISTS threat_model_policies (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL DEFAULT 'org-bank',
    policy JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS threat_models (
    id VARCHAR(64) PRIMARY KEY,
    key VARCHAR(64) NOT NULL UNIQUE,
    organization_id VARCHAR(64) NOT NULL,
    service_id VARCHAR(128),
    asset_id VARCHAR(128),
    project_id VARCHAR(128),
    change_id VARCHAR(128),
    release_id VARCHAR(128),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    criticality VARCHAR(16) NOT NULL CHECK (criticality IN ('CRITICAL','HIGH','MEDIUM','LOW')),
    data_classification VARCHAR(64) NOT NULL,
    business_owner_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    technical_owner_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    security_owner_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    department_id VARCHAR(128) REFERENCES bank_departments(id) ON DELETE SET NULL,
    current_revision_id VARCHAR(64),
    status VARCHAR(32) NOT NULL CHECK (status IN ('DRAFT','IN_REVIEW','CHANGES_REQUIRED','APPROVED','REVIEW_REQUIRED','SUPERSEDED','ARCHIVED')),
    next_review_at TIMESTAMPTZ,
    last_approved_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (service_id IS NOT NULL OR asset_id IS NOT NULL OR project_id IS NOT NULL OR change_id IS NOT NULL OR release_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS threat_model_revisions (
    id VARCHAR(64) PRIMARY KEY,
    threat_model_id VARCHAR(64) NOT NULL REFERENCES threat_models(id) ON DELETE RESTRICT,
    revision_number INTEGER NOT NULL CHECK (revision_number > 0),
    status VARCHAR(32) NOT NULL CHECK (status IN ('DRAFT','IN_REVIEW','CHANGES_REQUIRED','APPROVED','SUPERSEDED')),
    scope_summary TEXT NOT NULL DEFAULT '',
    architecture_summary TEXT NOT NULL DEFAULT '',
    assumptions TEXT NOT NULL DEFAULT '',
    security_objectives TEXT NOT NULL DEFAULT '',
    in_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
    out_of_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
    supersedes_revision_id VARCHAR(64) REFERENCES threat_model_revisions(id) ON DELETE RESTRICT,
    change_reason TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
    submitted_at TIMESTAMPTZ,
    reviewed_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ,
    approved_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    UNIQUE(threat_model_id, revision_number)
);
ALTER TABLE threat_models DROP CONSTRAINT IF EXISTS fk_threat_models_current_revision;
ALTER TABLE threat_models ADD CONSTRAINT fk_threat_models_current_revision FOREIGN KEY (current_revision_id) REFERENCES threat_model_revisions(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS threat_model_applicability (
    id VARCHAR(64) PRIMARY KEY,
    threat_model_id VARCHAR(64) REFERENCES threat_models(id) ON DELETE SET NULL,
    organization_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(128), change_id VARCHAR(128), service_id VARCHAR(128), asset_id VARCHAR(128),
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    decision VARCHAR(32) NOT NULL CHECK (decision IN ('REQUIRED','NOT_REQUIRED','SECURITY_REVIEW_REQUIRED')),
    justification TEXT,
    assessed_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ,
    CHECK (decision <> 'NOT_REQUIRED' OR justification IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS threat_model_components (
    id VARCHAR(64) PRIMARY KEY,
    revision_id VARCHAR(64) NOT NULL REFERENCES threat_model_revisions(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL CHECK (type IN ('PROCESS','SERVICE','API','DATABASE','DATASTORE','QUEUE','EXTERNAL_SYSTEM','USER','ADMIN','THIRD_PARTY','NETWORK_ZONE','CLOUD_SERVICE','DEVICE','OTHER')),
    description TEXT, technology VARCHAR(255), asset_id VARCHAR(128), owner_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    criticality VARCHAR(16) CHECK (criticality IN ('CRITICAL','HIGH','MEDIUM','LOW')),
    UNIQUE(revision_id, name)
);

CREATE TABLE IF NOT EXISTS threat_model_trust_boundaries (
    id VARCHAR(64) PRIMARY KEY,
    revision_id VARCHAR(64) NOT NULL REFERENCES threat_model_revisions(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL, description TEXT, boundary_type VARCHAR(64) NOT NULL,
    trust_level_from VARCHAR(64), trust_level_to VARCHAR(64), authentication_required BOOLEAN NOT NULL DEFAULT TRUE,
    encryption_required BOOLEAN NOT NULL DEFAULT TRUE, notes TEXT, UNIQUE(revision_id, name)
);

CREATE TABLE IF NOT EXISTS threat_model_data_flows (
    id VARCHAR(64) PRIMARY KEY,
    revision_id VARCHAR(64) NOT NULL REFERENCES threat_model_revisions(id) ON DELETE RESTRICT,
    source_component_id VARCHAR(64) NOT NULL REFERENCES threat_model_components(id) ON DELETE RESTRICT,
    destination_component_id VARCHAR(64) NOT NULL REFERENCES threat_model_components(id) ON DELETE RESTRICT,
    trust_boundary_id VARCHAR(64) REFERENCES threat_model_trust_boundaries(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL, description TEXT, protocol VARCHAR(64), port INTEGER CHECK (port BETWEEN 1 AND 65535),
    authentication_method VARCHAR(255), encryption_in_transit BOOLEAN, data_classification VARCHAR(64) NOT NULL,
    data_types JSONB NOT NULL DEFAULT '[]'::jsonb, crosses_trust_boundary BOOLEAN NOT NULL DEFAULT FALSE,
    direction VARCHAR(16) NOT NULL DEFAULT 'ONE_WAY' CHECK (direction IN ('ONE_WAY','BIDIRECTIONAL')), notes TEXT
);

CREATE TABLE IF NOT EXISTS threats (
    id VARCHAR(64) PRIMARY KEY,
    revision_id VARCHAR(64) NOT NULL REFERENCES threat_model_revisions(id) ON DELETE RESTRICT,
    key VARCHAR(96) NOT NULL UNIQUE, title VARCHAR(255) NOT NULL, description TEXT NOT NULL,
    categories JSONB NOT NULL CHECK (jsonb_array_length(categories) > 0), attack_scenario TEXT NOT NULL,
    attacker_type VARCHAR(255), attacker_capability VARCHAR(255), preconditions TEXT, attack_path TEXT,
    affected_component_id VARCHAR(64) REFERENCES threat_model_components(id) ON DELETE SET NULL,
    affected_data_flow_id VARCHAR(64) REFERENCES threat_model_data_flows(id) ON DELETE SET NULL,
    affected_trust_boundary_id VARCHAR(64) REFERENCES threat_model_trust_boundaries(id) ON DELETE SET NULL,
    affected_asset_id VARCHAR(128), cwe_ids JSONB NOT NULL DEFAULT '[]'::jsonb, capec_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    inherent_likelihood SMALLINT NOT NULL CHECK (inherent_likelihood BETWEEN 1 AND 5),
    inherent_impact SMALLINT NOT NULL CHECK (inherent_impact BETWEEN 1 AND 5),
    inherent_score SMALLINT NOT NULL CHECK (inherent_score BETWEEN 1 AND 25),
    residual_likelihood SMALLINT CHECK (residual_likelihood BETWEEN 1 AND 5), residual_impact SMALLINT CHECK (residual_impact BETWEEN 1 AND 5),
    residual_score SMALLINT CHECK (residual_score BETWEEN 1 AND 25), residual_risk_rationale TEXT,
    residual_risk_calculated_at TIMESTAMPTZ, residual_risk_calculated_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL CHECK (status IN ('OPEN','MITIGATING','MITIGATED','ACCEPTED','CLOSED')),
    owner_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL, due_date DATE,
    created_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (inherent_score = inherent_likelihood * inherent_impact),
    CHECK ((residual_likelihood IS NULL AND residual_impact IS NULL AND residual_score IS NULL) OR residual_score = residual_likelihood * residual_impact),
    CHECK (residual_score IS NULL OR residual_risk_rationale IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS threat_controls (
    id VARCHAR(64) PRIMARY KEY, threat_id VARCHAR(64) NOT NULL REFERENCES threats(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL, description TEXT NOT NULL, control_type VARCHAR(96) NOT NULL,
    implementation_owner_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('PROPOSED','PLANNED','IN_IMPLEMENTATION','IMPLEMENTED','VERIFICATION_REQUIRED','VERIFIED','FAILED','ACCEPTED_RISK','NOT_APPLICABLE')),
    implementation_ticket_id VARCHAR(64) REFERENCES tickets(id) ON DELETE SET NULL,
    required_before_release BOOLEAN NOT NULL DEFAULT TRUE, due_date DATE, effectiveness_status VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS control_verifications (
    id VARCHAR(64) PRIMARY KEY, control_id VARCHAR(64) NOT NULL REFERENCES threat_controls(id) ON DELETE RESTRICT,
    verification_type VARCHAR(64) NOT NULL, test_case TEXT NOT NULL, expected_result TEXT NOT NULL,
    result VARCHAR(16) NOT NULL CHECK (result IN ('NOT_RUN','PASS','FAIL','PARTIAL','EXPIRED')),
    evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb, executed_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    executed_at TIMESTAMPTZ NOT NULL, reviewer_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, notes TEXT
);

CREATE TABLE IF NOT EXISTS threat_model_approvals (
    id VARCHAR(64) PRIMARY KEY, revision_id VARCHAR(64) NOT NULL REFERENCES threat_model_revisions(id) ON DELETE RESTRICT,
    stage VARCHAR(32) NOT NULL CHECK (stage IN ('APPSEC','SECURITY_ARCHITECTURE','RISK_AUTHORITY')),
    decision VARCHAR(32) NOT NULL CHECK (decision IN ('APPROVED','REJECTED','CHANGES_REQUESTED')),
    decided_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT, decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), comments TEXT
);

CREATE TABLE IF NOT EXISTS threat_model_exceptions (
    id VARCHAR(64) PRIMARY KEY, threat_id VARCHAR(64) NOT NULL REFERENCES threats(id) ON DELETE RESTRICT,
    control_id VARCHAR(64) REFERENCES threat_controls(id) ON DELETE SET NULL, reason TEXT NOT NULL, business_justification TEXT NOT NULL,
    risk_level VARCHAR(16) NOT NULL CHECK (risk_level IN ('CRITICAL','HIGH','MEDIUM','LOW')), compensating_controls TEXT,
    requested_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT, approver_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ, expires_at TIMESTAMPTZ NOT NULL, review_date TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL CHECK (status IN ('REQUESTED','UNDER_REVIEW','APPROVED','REJECTED','EXPIRED','REVOKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK (approver_id IS NULL OR approver_id <> requested_by_user_id)
);

CREATE TABLE IF NOT EXISTS threat_model_evidence (
    id VARCHAR(64) PRIMARY KEY, threat_model_id VARCHAR(64) NOT NULL REFERENCES threat_models(id) ON DELETE RESTRICT,
    revision_id VARCHAR(64) REFERENCES threat_model_revisions(id) ON DELETE RESTRICT, threat_id VARCHAR(64) REFERENCES threats(id) ON DELETE RESTRICT,
    control_id VARCHAR(64) REFERENCES threat_controls(id) ON DELETE RESTRICT, verification_id VARCHAR(64) REFERENCES control_verifications(id) ON DELETE RESTRICT,
    attachment_id VARCHAR(64) NOT NULL REFERENCES ticket_attachments(id) ON DELETE RESTRICT, classification VARCHAR(64) NOT NULL,
    linked_entity_type VARCHAR(64) NOT NULL, linked_entity_id VARCHAR(64) NOT NULL,
    uploaded_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT, uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (attachment_id, linked_entity_type, linked_entity_id)
);

CREATE TABLE IF NOT EXISTS threat_model_audit_events (
    id VARCHAR(64) PRIMARY KEY, threat_model_id VARCHAR(64) NOT NULL REFERENCES threat_models(id) ON DELETE RESTRICT,
    revision_id VARCHAR(64) REFERENCES threat_model_revisions(id) ON DELETE RESTRICT, actor_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    action VARCHAR(64) NOT NULL, entity_type VARCHAR(64) NOT NULL, entity_id VARCHAR(64) NOT NULL,
    old_value JSONB, new_value JSONB, correlation_id VARCHAR(128), ip_address VARCHAR(64), user_agent TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_threat_models_scope ON threat_models(organization_id, project_id, asset_id, service_id, status);
CREATE INDEX IF NOT EXISTS idx_threat_revisions_model ON threat_model_revisions(threat_model_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_threats_revision_status ON threats(revision_id, status, inherent_score DESC);
CREATE INDEX IF NOT EXISTS idx_threat_controls_ticket ON threat_controls(implementation_ticket_id) WHERE implementation_ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threat_applicability_scope ON threat_model_applicability(project_id, change_id, service_id, asset_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_threat_audit_model ON threat_model_audit_events(threat_model_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION prevent_threat_model_history_mutation()
RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'Threat-model security history is append-only; % is not permitted', TG_OP USING ERRCODE = '55000'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS threat_model_approvals_append_only ON threat_model_approvals;
CREATE TRIGGER threat_model_approvals_append_only BEFORE UPDATE OR DELETE ON threat_model_approvals FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
DROP TRIGGER IF EXISTS threat_model_audit_events_append_only ON threat_model_audit_events;
CREATE TRIGGER threat_model_audit_events_append_only BEFORE UPDATE OR DELETE ON threat_model_audit_events FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
