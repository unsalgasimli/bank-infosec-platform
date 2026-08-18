-- ============================================================================
-- Apex Bank International - Enterprise InfoSec & GRC Platform Database Schema
-- Standard: PostgreSQL 14+ / PostgreSQL 16
-- Compliance: SOC2 Type II, ISO 27001, PCI-DSS v4.0, GDPR, Tier-1 Banking Regs
-- ============================================================================

-- Create Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Organizational Structure (Divisions, Departments, Teams, Users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_divisions (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_departments (
    id VARCHAR(64) PRIMARY KEY,
    division_id VARCHAR(64) NOT NULL REFERENCES bank_divisions(id) ON DELETE RESTRICT,
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_teams (
    id VARCHAR(64) PRIMARY KEY,
    department_id VARCHAR(64) NOT NULL REFERENCES bank_departments(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    on_call_schedule VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(128) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(128) NOT NULL,
    last_name VARCHAR(128) NOT NULL,
    title VARCHAR(255) NOT NULL,
    department_id VARCHAR(64) REFERENCES bank_departments(id) ON DELETE SET NULL,
    division_id VARCHAR(64) REFERENCES bank_divisions(id) ON DELETE SET NULL,
    security_clearance VARCHAR(64) NOT NULL DEFAULT 'INTERNAL',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    team_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    owned_application_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    owned_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON bank_users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON bank_users(email);
CREATE INDEX IF NOT EXISTS idx_users_dept ON bank_users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_clearance ON bank_users(security_clearance);

-- ----------------------------------------------------------------------------
-- 2. CMDB Assets & Applications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_assets (
    id VARCHAR(64) PRIMARY KEY,
    tag VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(64) NOT NULL,
    ip_address VARCHAR(64),
    fqdn VARCHAR(255),
    environment VARCHAR(64) NOT NULL,
    critical_asset BOOLEAN NOT NULL DEFAULT FALSE,
    pci_dss_scope BOOLEAN NOT NULL DEFAULT FALSE,
    owner_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    custodian_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    department_id VARCHAR(64) REFERENCES bank_departments(id) ON DELETE SET NULL,
    os VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_applications (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(32) NOT NULL,
    architecture_type VARCHAR(64) NOT NULL,
    repository_url VARCHAR(512),
    technical_owner_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    business_owner_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    department_id VARCHAR(64) REFERENCES bank_departments(id) ON DELETE SET NULL,
    active_cve_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. Workflows & SLA Policies
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflows (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    project_code VARCHAR(32) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    initial_state_id VARCHAR(64) NOT NULL,
    states JSONB NOT NULL DEFAULT '[]'::jsonb,
    transitions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sla_policies (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    business_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. Enterprise Security Tickets & Findings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
    id VARCHAR(64) PRIMARY KEY,
    key VARCHAR(64) NOT NULL UNIQUE,
    project_code VARCHAR(32) NOT NULL,
    ticket_type_id VARCHAR(64) NOT NULL,
    ticket_type_name VARCHAR(128) NOT NULL,
    category VARCHAR(64) NOT NULL,
    security_domain VARCHAR(64) NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    
    -- Workflow Status
    status_id VARCHAR(64) NOT NULL,
    status_name VARCHAR(128) NOT NULL,
    status_category VARCHAR(32) NOT NULL,
    workflow_id VARCHAR(64) NOT NULL,
    workflow_version INTEGER NOT NULL DEFAULT 1,
    
    -- Risk & Prioritization
    technical_severity VARCHAR(32) NOT NULL,
    business_priority VARCHAR(32) NOT NULL,
    business_impact VARCHAR(32) NOT NULL,
    inherent_risk VARCHAR(32) NOT NULL,
    residual_risk VARCHAR(32) NOT NULL,
    risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    cvss_score NUMERIC(3,1),
    cvss_vector VARCHAR(128),
    
    -- ABAC & Confidentiality
    confidentiality VARCHAR(64) NOT NULL DEFAULT 'INTERNAL',
    restricted_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    restricted_team_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Ownership & Relations
    reporter_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    assignee_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    security_owner_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    team_id VARCHAR(64) REFERENCES bank_teams(id) ON DELETE SET NULL,
    department_id VARCHAR(64) REFERENCES bank_departments(id) ON DELETE SET NULL,
    application_id VARCHAR(64) REFERENCES bank_applications(id) ON DELETE SET NULL,
    asset_id VARCHAR(64) REFERENCES bank_assets(id) ON DELETE SET NULL,
    risk_owner_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    watcher_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Dynamic Details (JSONB for extensibility)
    finding_details JSONB,
    incident_details JSONB,
    exception_details JSONB,
    custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Dates & SLA Tracking
    detected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    first_response_at TIMESTAMPTZ,
    due_date TIMESTAMPTZ NOT NULL,
    remediation_deadline TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    reopened_at TIMESTAMPTZ,
    
    -- SLA Status
    sla_policy_id VARCHAR(64) REFERENCES sla_policies(id) ON DELETE SET NULL,
    sla_state VARCHAR(32) NOT NULL DEFAULT 'SAFE',
    sla_breach_deadline TIMESTAMPTZ,
    sla_paused_reason TEXT,
    sla_remaining_minutes INTEGER,
    
    -- Optimistic Concurrency
    version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_tickets_key ON tickets(key);
CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_code);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_sec_domain ON tickets(security_domain);
CREATE INDEX IF NOT EXISTS idx_tickets_status_cat ON tickets(status_category);
CREATE INDEX IF NOT EXISTS idx_tickets_confidentiality ON tickets(confidentiality);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_reporter ON tickets(reporter_id);
CREATE INDEX IF NOT EXISTS idx_tickets_dept ON tickets(department_id);
CREATE INDEX IF NOT EXISTS idx_tickets_app ON tickets(application_id);
CREATE INDEX IF NOT EXISTS idx_tickets_asset ON tickets(asset_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_state ON tickets(sla_state);
CREATE INDEX IF NOT EXISTS idx_tickets_finding_gin ON tickets USING GIN (finding_details);

-- ----------------------------------------------------------------------------
-- 5. Multi-Stage Approval Chains
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_approvals (
    id VARCHAR(64) PRIMARY KEY,
    ticket_id VARCHAR(64) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    workflow_id VARCHAR(64) NOT NULL REFERENCES workflows(id) ON DELETE RESTRICT,
    transition_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    initiated_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id),
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_ticket ON ticket_approvals(ticket_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON ticket_approvals(status);

-- ----------------------------------------------------------------------------
-- 6. Ticket Comments & Discussions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_comments (
    id VARCHAR(64) PRIMARY KEY,
    ticket_id VARCHAR(64) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    content TEXT NOT NULL,
    visibility VARCHAR(32) NOT NULL DEFAULT 'ALL',
    is_audit_note BOOLEAN NOT NULL DEFAULT FALSE,
    is_resolution_summary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_ticket ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON ticket_comments(created_at ASC);

-- ----------------------------------------------------------------------------
-- 7. Cloud Storage Attachments & Forensic Artifacts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_attachments (
    id VARCHAR(64) PRIMARY KEY,
    ticket_id VARCHAR(64) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    storage_provider VARCHAR(32) NOT NULL DEFAULT 's3',
    storage_key VARCHAR(512) NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    uploaded_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_forensic_artifact BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_attachments_hash ON ticket_attachments(sha256_hash);

-- ----------------------------------------------------------------------------
-- 8. Immutable Security Audit Trail
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
    id VARCHAR(64) PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    actor_name VARCHAR(255) NOT NULL,
    actor_role VARCHAR(64),
    ip_address VARCHAR(64),
    user_agent TEXT,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    before_state JSONB,
    after_state JSONB,
    changes JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp DESC);

-- ----------------------------------------------------------------------------
-- 9. GRC Risk Register
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_register_items (
    id VARCHAR(64) PRIMARY KEY,
    risk_id VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(64) NOT NULL,
    inherent_risk VARCHAR(32) NOT NULL,
    residual_risk VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    risk_owner_id VARCHAR(64) REFERENCES bank_users(id),
    mitigation_plan TEXT,
    review_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 10. Automation Rules & Knowledge Base
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_rules (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    trigger VARCHAR(64) NOT NULL,
    conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
    actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_articles (
    id VARCHAR(64) PRIMARY KEY,
    slug VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(64) NOT NULL,
    author_id VARCHAR(64) NOT NULL REFERENCES bank_users(id),
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_filters (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    jql TEXT NOT NULL,
    user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id),
    is_global BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 11. Enterprise ITSM lifecycle extensions
-- ----------------------------------------------------------------------------
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_type VARCHAR(32);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS request_type_id VARCHAR(64);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS request_type_name VARCHAR(128);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS intake_channel VARCHAR(32) DEFAULT 'PORTAL';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_code VARCHAR(32);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_summary TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS urgency VARCHAR(16) DEFAULT 'MEDIUM';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS requester_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE RESTRICT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS on_behalf_of_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assignment_group_id VARCHAR(64) REFERENCES bank_teams(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS owner_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS participant_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS organization_id VARCHAR(64);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS site_id VARCHAR(64);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS affected_service_id VARCHAR(64);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS affected_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS parent_ticket_id VARCHAR(64) REFERENCES tickets(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS duplicate_of_ticket_id VARCHAR(64) REFERENCES tickets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS ticket_relationships (
    id VARCHAR(64) PRIMARY KEY,
    source_ticket_id VARCHAR(64) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    target_ticket_id VARCHAR(64) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    relationship_type VARCHAR(32) NOT NULL,
    note TEXT,
    created_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ticket_relationship_distinct CHECK (source_ticket_id <> target_ticket_id),
    CONSTRAINT ticket_relationship_unique UNIQUE (source_ticket_id, target_ticket_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS ticket_tasks (
    id VARCHAR(64) PRIMARY KEY,
    ticket_id VARCHAR(64) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    owner_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    group_id VARCHAR(64) REFERENCES bank_teams(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'TO_DO',
    due_at TIMESTAMPTZ,
    dependency_task_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    completion_condition TEXT,
    created_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ticket_worklogs (
    id VARCHAR(64) PRIMARY KEY,
    ticket_id VARCHAR(64) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    agent_id VARCHAR(64) NOT NULL REFERENCES bank_users(id),
    started_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
    description TEXT NOT NULL,
    billable BOOLEAN NOT NULL DEFAULT FALSE,
    activity_type VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_sla_instances (
    id VARCHAR(64) PRIMARY KEY,
    ticket_id VARCHAR(64) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    policy_id VARCHAR(64) NOT NULL REFERENCES sla_policies(id) ON DELETE RESTRICT,
    metric VARCHAR(32) NOT NULL,
    target_minutes INTEGER NOT NULL CHECK (target_minutes > 0),
    started_at TIMESTAMPTZ NOT NULL,
    deadline_at TIMESTAMPTZ NOT NULL,
    state VARCHAR(16) NOT NULL,
    elapsed_minutes INTEGER NOT NULL DEFAULT 0,
    remaining_minutes INTEGER NOT NULL,
    paused_at TIMESTAMPTZ,
    paused_reason TEXT,
    accrued_paused_minutes INTEGER NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    breached_at TIMESTAMPTZ,
    CONSTRAINT ticket_sla_metric_unique UNIQUE (ticket_id, metric)
);

CREATE TABLE IF NOT EXISTS ticket_satisfaction (
    id VARCHAR(64) PRIMARY KEY,
    ticket_id VARCHAR(64) NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    requester_id VARCHAR(64) NOT NULL REFERENCES bank_users(id),
    score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment TEXT,
    agent_rating SMALLINT CHECK (agent_rating BETWEEN 1 AND 5),
    resolution_quality SMALLINT CHECK (resolution_quality BETWEEN 1 AND 5),
    speed_rating SMALLINT CHECK (speed_rating BETWEEN 1 AND 5),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_ai_recommendations (
    id VARCHAR(64) PRIMARY KEY,
    ticket_id VARCHAR(64) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW',
    recommendation JSONB NOT NULL,
    confidence NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    engine_version VARCHAR(64) NOT NULL,
    requires_human_confirmation BOOLEAN NOT NULL DEFAULT TRUE CHECK (requires_human_confirmation = TRUE),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by_user_id VARCHAR(64) REFERENCES bank_users(id)
);

CREATE INDEX IF NOT EXISTS idx_relationships_source ON ticket_relationships(source_ticket_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON ticket_relationships(target_ticket_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ticket ON ticket_tasks(ticket_id, status);
CREATE INDEX IF NOT EXISTS idx_worklogs_ticket ON ticket_worklogs(ticket_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sla_instances_ticket ON ticket_sla_instances(ticket_id, state);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_ticket ON ticket_ai_recommendations(ticket_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 12. Backend-owned workflow template catalog and immutable launch runs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_templates (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    short_name VARCHAR(128),
    domain VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    icon_name VARCHAR(64) NOT NULL,
    project_code VARCHAR(16) NOT NULL,
    workflow_id VARCHAR(64) NOT NULL REFERENCES workflows(id) ON DELETE RESTRICT,
    sla_policy_id VARCHAR(64) REFERENCES sla_policies(id) ON DELETE RESTRICT,
    owner_department_id VARCHAR(64) REFERENCES bank_departments(id) ON DELETE RESTRICT,
    participating_department_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
    task_definitions JSONB NOT NULL,
    estimated_days INTEGER NOT NULL CHECK (estimated_days BETWEEN 1 AND 3650),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id VARCHAR(64) PRIMARY KEY,
    template_id VARCHAR(64) REFERENCES workflow_templates(id) ON DELETE SET NULL,
    template_version INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('COMPLETED', 'FAILED')),
    idempotency_key VARCHAR(120),
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_ticket_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT workflow_run_idempotency UNIQUE (created_by_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_active ON workflow_templates(is_active, domain);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_template ON workflow_runs(template_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_actor ON workflow_runs(created_by_user_id, created_at DESC);
