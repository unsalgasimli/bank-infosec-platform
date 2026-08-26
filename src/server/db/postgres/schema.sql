-- ============================================================================
-- Fiuu Database Schema
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

CREATE TABLE IF NOT EXISTS bank_department_sections (
    id VARCHAR(128) PRIMARY KEY,
    department_id VARCHAR(64) NOT NULL REFERENCES bank_departments(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    manager_id VARCHAR(64),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (department_id, code)
);

CREATE INDEX IF NOT EXISTS idx_department_sections_department ON bank_department_sections(department_id);

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
    section_id VARCHAR(128) REFERENCES bank_department_sections(id) ON DELETE SET NULL,
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

ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS section_id VARCHAR(128) REFERENCES bank_department_sections(id) ON DELETE SET NULL;
-- Only high-sensitivity directory security metadata is application-encrypted
-- (AES-256-GCM). Names, email, title, username, and organizational placement
-- remain readable for ordinary administration and assignment workflows.
ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS identity_ciphertext TEXT;
-- 1 = legacy profile-wide encryption; 2 = sensitive-directory-fields only.
ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS identity_ciphertext_version SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS email_lookup_hash VARCHAR(128);
ALTER TABLE bank_users ALTER COLUMN email DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lookup_hash ON bank_users(email_lookup_hash) WHERE email_lookup_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_username ON bank_users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON bank_users(email);
CREATE INDEX IF NOT EXISTS idx_users_dept ON bank_users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_section ON bank_users(section_id);
CREATE INDEX IF NOT EXISTS idx_users_clearance ON bank_users(security_clearance);

-- Opaque browser sessions. Only an HMAC digest of the cookie token is stored.
CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_active_user ON auth_sessions(user_id, expires_at) WHERE revoked_at IS NULL;

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
-- 2b. Canonical CMDB. Assets, applications and business services are views of
-- configuration_items, never separate copies of the same managed object.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cmdb_ci_types (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    parent_type_id VARCHAR(64) REFERENCES cmdb_ci_types(id) ON DELETE RESTRICT,
    icon VARCHAR(64) NOT NULL DEFAULT 'Box',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    required_attributes JSONB NOT NULL DEFAULT '[]'::jsonb,
    optional_attributes JSONB NOT NULL DEFAULT '[]'::jsonb,
    validation_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    allowed_relationship_type_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), source_payload JSONB
);
CREATE TABLE IF NOT EXISTS cmdb_relationship_types (
    id VARCHAR(64) PRIMARY KEY, name VARCHAR(64) NOT NULL UNIQUE, inverse_name VARCHAR(64) NOT NULL,
    is_dependency BOOLEAN NOT NULL DEFAULT FALSE, prevents_cycles BOOLEAN NOT NULL DEFAULT FALSE, is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), source_payload JSONB
);
CREATE TABLE IF NOT EXISTS configuration_items (
    id VARCHAR(64) PRIMARY KEY, ci_number VARCHAR(64) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL, display_name VARCHAR(255),
    type_id VARCHAR(64) NOT NULL REFERENCES cmdb_ci_types(id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','RETIRED','ARCHIVED')),
    lifecycle_status VARCHAR(32) NOT NULL CHECK (lifecycle_status IN ('REQUESTED','PROCURED','RECEIVED','IN_STOCK','ASSIGNED','IN_USE','MAINTENANCE','RETURNED','RETIRED','DISPOSED','LOST')),
    environment VARCHAR(32) NOT NULL, criticality VARCHAR(32) NOT NULL, business_criticality VARCHAR(32), description TEXT,
    owner_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL, technical_owner_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    business_owner_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL, support_group_id VARCHAR(128), department_id VARCHAR(128) REFERENCES bank_departments(id) ON DELETE SET NULL,
    location_id VARCHAR(128), vendor VARCHAR(255), manufacturer VARCHAR(255), model VARCHAR(255), serial_number VARCHAR(128), asset_tag VARCHAR(128),
    hostname VARCHAR(255), fqdn VARCHAR(255), ip_address VARCHAR(64), mac_address VARCHAR(64), operating_system VARCHAR(255), os_version VARCHAR(128), external_reference VARCHAR(255),
    source VARCHAR(32) NOT NULL, source_system VARCHAR(128), source_record_id VARCHAR(255), discovery_status VARCHAR(32) NOT NULL, last_discovered_at TIMESTAMPTZ, last_verified_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ, last_sync_at TIMESTAMPTZ, sync_status VARCHAR(32),
    details JSONB NOT NULL DEFAULT '{}'::jsonb, version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_by VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL, updated_by VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL, archived_at TIMESTAMPTZ, source_payload JSONB
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_active_asset_tag ON configuration_items(lower(asset_tag)) WHERE asset_tag IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_active_serial ON configuration_items(lower(serial_number)) WHERE serial_number IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_active_hostname ON configuration_items(lower(hostname)) WHERE hostname IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_source_record ON configuration_items(source_system, source_record_id) WHERE source_system IS NOT NULL AND source_record_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ci_name ON configuration_items(name); CREATE INDEX IF NOT EXISTS idx_ci_type_status ON configuration_items(type_id,status); CREATE INDEX IF NOT EXISTS idx_ci_department ON configuration_items(department_id); CREATE INDEX IF NOT EXISTS idx_ci_owner ON configuration_items(owner_user_id); CREATE INDEX IF NOT EXISTS idx_ci_environment ON configuration_items(environment); CREATE INDEX IF NOT EXISTS idx_ci_criticality ON configuration_items(criticality);
CREATE TABLE IF NOT EXISTS ci_relationships (
    id VARCHAR(64) PRIMARY KEY, source_ci_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT, target_ci_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    relationship_type_id VARCHAR(64) NOT NULL REFERENCES cmdb_relationship_types(id) ON DELETE RESTRICT, status VARCHAR(16) NOT NULL CHECK(status IN ('ACTIVE','INACTIVE')), description TEXT, source VARCHAR(32) NOT NULL, confidence NUMERIC(5,2) NOT NULL CHECK(confidence >= 0 AND confidence <= 100), valid_from TIMESTAMPTZ NOT NULL, valid_to TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_by VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL, archived_at TIMESTAMPTZ, source_payload JSONB, CHECK(source_ci_id <> target_ci_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_active_relationship ON ci_relationships(source_ci_id,target_ci_id,relationship_type_id) WHERE status='ACTIVE' AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ci_rel_source ON ci_relationships(source_ci_id,relationship_type_id) WHERE status='ACTIVE' AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ci_rel_target ON ci_relationships(target_ci_id,relationship_type_id) WHERE status='ACTIVE' AND archived_at IS NULL;
CREATE TABLE IF NOT EXISTS ci_record_links (
    id VARCHAR(64) PRIMARY KEY, ci_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT, record_type VARCHAR(32) NOT NULL, record_id VARCHAR(128) NOT NULL, relationship VARCHAR(32) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_by VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL, source_payload JSONB,
    UNIQUE(ci_id,record_type,record_id,relationship)
);
CREATE INDEX IF NOT EXISTS idx_ci_record_links_record ON ci_record_links(record_type,record_id);

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
-- 8b. Transactional Outbox and Worker Idempotency
-- Domain mutations and their event records commit in one PostgreSQL transaction.
-- RabbitMQ is a delivery mechanism, never the source of truth.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbox_events (
    id VARCHAR(64) PRIMARY KEY,
    topic VARCHAR(160) NOT NULL,
    aggregate_type VARCHAR(80) NOT NULL,
    aggregate_id VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    correlation_id VARCHAR(128),
    occurred_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_dispatch ON outbox_events(status, available_at, occurred_at);
-- A scheduler may be active on more than one replica during rolling deploys.
-- A stable correlation id makes a periodic domain tick exactly-once at the
-- database boundary while leaving ordinary event correlations unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_topic_correlation
    ON outbox_events(topic, correlation_id)
    WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_consumer_receipts (
    consumer_name VARCHAR(128) NOT NULL,
    event_id VARCHAR(64) NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (consumer_name, event_id)
);

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

-- ----------------------------------------------------------------------------
-- 13. Universal Enterprise Work Orchestration (normalized design + runtime)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orchestration_workflow_definitions (
    id VARCHAR(64) PRIMARY KEY,
    workflow_key VARCHAR(128) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    domain VARCHAR(64) NOT NULL,
    default_work_type VARCHAR(64) NOT NULL,
    lifecycle VARCHAR(24) NOT NULL CHECK (lifecycle IN ('DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED')),
    scope VARCHAR(24) NOT NULL CHECK (scope IN ('COMPANY', 'DEPARTMENT', 'PERSONAL')),
    owner_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    maintainer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    latest_version INTEGER NOT NULL DEFAULT 0,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    icon_name VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orchestration_policy_sets (
    id VARCHAR(64) NOT NULL,
    version INTEGER NOT NULL,
    policy_key VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
    business_calendar_id VARCHAR(64) NOT NULL,
    priority_mechanism VARCHAR(32) NOT NULL,
    sla_policy_id VARCHAR(64) REFERENCES sla_policies(id) ON DELETE SET NULL,
    routing_rule_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    priority_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    escalation_policy JSONB,
    permission_policy JSONB,
    PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS orchestration_form_definitions (
    id VARCHAR(64) PRIMARY KEY,
    form_key VARCHAR(128) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    domain VARCHAR(64) NOT NULL,
    lifecycle VARCHAR(24) NOT NULL,
    latest_version INTEGER NOT NULL,
    owner_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    maintainer_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orchestration_form_versions (
    id VARCHAR(80) PRIMARY KEY,
    form_definition_id VARCHAR(64) NOT NULL REFERENCES orchestration_form_definitions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
    change_log TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    created_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (form_definition_id, version)
);

CREATE TABLE IF NOT EXISTS orchestration_form_field_groups (
    id VARCHAR(64) NOT NULL,
    version INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(16) NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
    fields JSONB NOT NULL,
    PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS orchestration_workflow_versions (
    id VARCHAR(80) PRIMARY KEY,
    workflow_definition_id VARCHAR(64) NOT NULL REFERENCES orchestration_workflow_definitions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('DRAFT', 'REVIEW', 'PUBLISHED', 'RETIRED')),
    policy_set_id VARCHAR(64) NOT NULL,
    policy_set_version INTEGER NOT NULL,
    form_definition_id VARCHAR(64) REFERENCES orchestration_form_definitions(id) ON DELETE SET NULL,
    form_version INTEGER,
    change_log TEXT NOT NULL,
    checksum VARCHAR(80) NOT NULL,
    immutable_snapshot JSONB NOT NULL,
    created_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    UNIQUE (workflow_definition_id, version),
    FOREIGN KEY (policy_set_id, policy_set_version) REFERENCES orchestration_policy_sets(id, version) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS orchestration_workflow_stages (
    id VARCHAR(80) NOT NULL,
    workflow_version_id VARCHAR(80) NOT NULL REFERENCES orchestration_workflow_versions(id) ON DELETE CASCADE,
    stage_key VARCHAR(128) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    stage_order INTEGER NOT NULL,
    trigger_type VARCHAR(32) NOT NULL,
    trigger_expression TEXT,
    target_policy_id VARCHAR(64),
    PRIMARY KEY (workflow_version_id, id)
);

CREATE TABLE IF NOT EXISTS orchestration_workflow_nodes (
    id VARCHAR(80) NOT NULL,
    workflow_version_id VARCHAR(80) NOT NULL REFERENCES orchestration_workflow_versions(id) ON DELETE CASCADE,
    node_key VARCHAR(128) NOT NULL,
    node_type VARCHAR(40) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    stage_id VARCHAR(80),
    position_x NUMERIC NOT NULL,
    position_y NUMERIC NOT NULL,
    assignment_config JSONB,
    approval_config JSONB,
    condition_config JSONB,
    join_config JSONB,
    timer_config JSONB,
    action_config JSONB,
    retry_policy JSONB,
    compensation_config JSONB,
    permission_config JSONB,
    PRIMARY KEY (workflow_version_id, id),
    UNIQUE (workflow_version_id, node_key)
);

CREATE TABLE IF NOT EXISTS orchestration_workflow_edges (
    id VARCHAR(128) NOT NULL,
    workflow_version_id VARCHAR(80) NOT NULL REFERENCES orchestration_workflow_versions(id) ON DELETE CASCADE,
    source_node_id VARCHAR(80) NOT NULL,
    destination_node_id VARCHAR(80) NOT NULL,
    outcome VARCHAR(64),
    branch_label VARCHAR(128),
    dependency_type VARCHAR(32) NOT NULL DEFAULT 'FINISH_TO_START',
    delay_minutes INTEGER NOT NULL DEFAULT 0,
    condition_config JSONB,
    PRIMARY KEY (workflow_version_id, id),
    FOREIGN KEY (workflow_version_id, source_node_id) REFERENCES orchestration_workflow_nodes(workflow_version_id, id) ON DELETE CASCADE,
    FOREIGN KEY (workflow_version_id, destination_node_id) REFERENCES orchestration_workflow_nodes(workflow_version_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orchestration_workflow_triggers (
    id VARCHAR(80) NOT NULL,
    workflow_version_id VARCHAR(80) NOT NULL REFERENCES orchestration_workflow_versions(id) ON DELETE CASCADE,
    trigger_type VARCHAR(32) NOT NULL,
    event_name VARCHAR(128),
    record_type VARCHAR(128),
    schedule_expression VARCHAR(128),
    date_expression TEXT,
    condition_config JSONB,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (workflow_version_id, id)
);

CREATE TABLE IF NOT EXISTS orchestration_workflow_variables (
    workflow_version_id VARCHAR(80) NOT NULL REFERENCES orchestration_workflow_versions(id) ON DELETE CASCADE,
    variable_key VARCHAR(160) NOT NULL,
    variable_type VARCHAR(32) NOT NULL,
    required BOOLEAN NOT NULL DEFAULT FALSE,
    sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    default_value JSONB,
    PRIMARY KEY (workflow_version_id, variable_key)
);

CREATE TABLE IF NOT EXISTS orchestration_request_types (
    id VARCHAR(64) PRIMARY KEY,
    request_key VARCHAR(128) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    domain VARCHAR(64) NOT NULL,
    work_type VARCHAR(64) NOT NULL,
    category VARCHAR(128) NOT NULL,
    form_definition_id VARCHAR(64) NOT NULL REFERENCES orchestration_form_definitions(id) ON DELETE RESTRICT,
    form_version INTEGER NOT NULL,
    workflow_definition_id VARCHAR(64) NOT NULL REFERENCES orchestration_workflow_definitions(id) ON DELETE RESTRICT,
    workflow_version INTEGER,
    policy_set_id VARCHAR(64) NOT NULL,
    visibility VARCHAR(24) NOT NULL,
    supported_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS orchestration_catalog_templates (
    id VARCHAR(64) PRIMARY KEY,
    workflow_definition_id VARCHAR(64) NOT NULL REFERENCES orchestration_workflow_definitions(id) ON DELETE RESTRICT,
    published_workflow_version INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    domain VARCHAR(64) NOT NULL,
    category VARCHAR(128) NOT NULL,
    scope VARCHAR(24) NOT NULL,
    owner_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    maintainers JSONB NOT NULL DEFAULT '[]'::jsonb,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    icon_name VARCHAR(64) NOT NULL,
    estimated_duration_minutes INTEGER NOT NULL,
    stage_count INTEGER NOT NULL,
    department_count INTEGER NOT NULL,
    approval_count INTEGER NOT NULL,
    automation_count INTEGER NOT NULL,
    run_count INTEGER NOT NULL DEFAULT 0,
    success_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    favorite_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_used_at TIMESTAMPTZ,
    lifecycle VARCHAR(24) NOT NULL,
    change_log TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orchestration_business_calendars (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    timezone VARCHAR(64) NOT NULL,
    workdays JSONB NOT NULL,
    business_start TIME NOT NULL,
    business_end TIME NOT NULL,
    holidays JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_24x7 BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS orchestration_assignment_rules (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    rule_priority INTEGER NOT NULL,
    condition_config JSONB,
    assignment_config JSONB NOT NULL,
    explanation TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS orchestration_connectors (
    id VARCHAR(64) PRIMARY KEY,
    connector_key VARCHAR(128) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(40) NOT NULL,
    status VARCHAR(24) NOT NULL,
    action_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    credential_reference_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    supports_dry_run BOOLEAN NOT NULL DEFAULT FALSE,
    owner_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS orchestration_notification_policies (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    event_types JSONB NOT NULL,
    recipient_resolvers JSONB NOT NULL,
    channels JSONB NOT NULL,
    template_key VARCHAR(128) NOT NULL,
    deduplication_window_minutes INTEGER NOT NULL DEFAULT 30,
    digest_window_minutes INTEGER,
    enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS orchestration_instances (
    id VARCHAR(64) PRIMARY KEY,
    instance_key VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    workflow_definition_id VARCHAR(64) NOT NULL REFERENCES orchestration_workflow_definitions(id) ON DELETE RESTRICT,
    workflow_version INTEGER NOT NULL,
    form_definition_id VARCHAR(64) REFERENCES orchestration_form_definitions(id) ON DELETE RESTRICT,
    form_version INTEGER,
    policy_set_id VARCHAR(64) NOT NULL,
    policy_set_version INTEGER NOT NULL,
    request_type_id VARCHAR(64) REFERENCES orchestration_request_types(id) ON DELETE SET NULL,
    work_type VARCHAR(64) NOT NULL,
    domain VARCHAR(64) NOT NULL,
    trigger_type VARCHAR(32) NOT NULL,
    trigger_event_id VARCHAR(160),
    parent_workflow_instance_id VARCHAR(64) REFERENCES orchestration_instances(id) ON DELETE SET NULL,
    status VARCHAR(24) NOT NULL,
    current_stage_id VARCHAR(80),
    context JSONB NOT NULL,
    node_outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
    requester_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    owner_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    allowed_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    allowed_role_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    allowed_department_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidentiality VARCHAR(40) NOT NULL,
    idempotency_key VARCHAR(160),
    optimistic_version INTEGER NOT NULL DEFAULT 1,
    started_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    failure_reason TEXT,
    UNIQUE (requester_id, idempotency_key)
);

ALTER TABLE orchestration_instances ADD COLUMN IF NOT EXISTS parent_workflow_instance_id VARCHAR(64) REFERENCES orchestration_instances(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS orchestration_node_instances (
    id VARCHAR(64) PRIMARY KEY,
    workflow_instance_id VARCHAR(64) NOT NULL REFERENCES orchestration_instances(id) ON DELETE CASCADE,
    node_id VARCHAR(80) NOT NULL,
    node_key VARCHAR(128) NOT NULL,
    node_type VARCHAR(40) NOT NULL,
    stage_id VARCHAR(80),
    status VARCHAR(24) NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    logical_completion_key VARCHAR(180) NOT NULL UNIQUE,
    activated_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    waiting_until TIMESTAMPTZ,
    next_reminder_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    outcome VARCHAR(64),
    output JSONB,
    error TEXT,
    assignment_group_id VARCHAR(64) REFERENCES bank_teams(id) ON DELETE SET NULL,
    assignee_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    routing_explanation TEXT,
    work_item_id VARCHAR(64),
    approval_chain_id VARCHAR(64),
    child_workflow_instance_id VARCHAR(64) REFERENCES orchestration_instances(id) ON DELETE SET NULL,
    optimistic_version INTEGER NOT NULL DEFAULT 1,
    UNIQUE (workflow_instance_id, node_id)
);

CREATE TABLE IF NOT EXISTS orchestration_node_attempts (
    id VARCHAR(64) PRIMARY KEY,
    workflow_instance_id VARCHAR(64) NOT NULL REFERENCES orchestration_instances(id) ON DELETE CASCADE,
    node_instance_id VARCHAR(64) NOT NULL REFERENCES orchestration_node_instances(id) ON DELETE CASCADE,
    attempt INTEGER NOT NULL,
    idempotency_key VARCHAR(180) NOT NULL,
    status VARCHAR(16) NOT NULL,
    dry_run BOOLEAN NOT NULL DEFAULT FALSE,
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    output JSONB,
    error TEXT,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    UNIQUE (node_instance_id, attempt)
);

CREATE TABLE IF NOT EXISTS orchestration_dead_letters (
    id VARCHAR(64) PRIMARY KEY,
    workflow_instance_id VARCHAR(64) NOT NULL REFERENCES orchestration_instances(id) ON DELETE CASCADE,
    node_instance_id VARCHAR(64) NOT NULL REFERENCES orchestration_node_instances(id) ON DELETE CASCADE,
    node_attempt_id VARCHAR(64) NOT NULL REFERENCES orchestration_node_attempts(id) ON DELETE CASCADE,
    action_key VARCHAR(160) NOT NULL,
    idempotency_key VARCHAR(180) NOT NULL,
    error TEXT NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('OPEN', 'REQUEUED', 'RESOLVED')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    failed_at TIMESTAMPTZ NOT NULL,
    last_retried_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orchestration_dead_letters_open
    ON orchestration_dead_letters (workflow_instance_id, status, failed_at DESC);

CREATE TABLE IF NOT EXISTS orchestration_work_items (
    id VARCHAR(64) PRIMARY KEY,
    work_item_key VARCHAR(64) NOT NULL UNIQUE,
    workflow_instance_id VARCHAR(64) NOT NULL REFERENCES orchestration_instances(id) ON DELETE CASCADE,
    node_instance_id VARCHAR(64) NOT NULL UNIQUE REFERENCES orchestration_node_instances(id) ON DELETE CASCADE,
    parent_work_item_id VARCHAR(64) REFERENCES orchestration_work_items(id) ON DELETE SET NULL,
    work_type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    instructions TEXT,
    acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(24) NOT NULL,
    assignment_group_id VARCHAR(64) REFERENCES bank_teams(id) ON DELETE SET NULL,
    assignee_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    requester_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS orchestration_execution_events (
    id UUID PRIMARY KEY,
    sequence BIGINT NOT NULL,
    workflow_instance_id VARCHAR(64) NOT NULL REFERENCES orchestration_instances(id) ON DELETE CASCADE,
    node_instance_id VARCHAR(64) REFERENCES orchestration_node_instances(id) ON DELETE SET NULL,
    event_type VARCHAR(48) NOT NULL,
    actor_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    actor_name VARCHAR(255) NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_hash VARCHAR(80),
    event_hash VARCHAR(80) NOT NULL,
    UNIQUE (workflow_instance_id, sequence)
);

CREATE TABLE IF NOT EXISTS orchestration_work_relations (
    id VARCHAR(64) PRIMARY KEY,
    source_type VARCHAR(32) NOT NULL,
    source_id VARCHAR(128) NOT NULL,
    target_type VARCHAR(32) NOT NULL,
    target_id VARCHAR(128) NOT NULL,
    relation_type VARCHAR(32) NOT NULL,
    created_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL,
    metadata JSONB,
    UNIQUE (source_type, source_id, target_type, target_id, relation_type)
);

CREATE TABLE IF NOT EXISTS orchestration_sla_clocks (
    id VARCHAR(64) PRIMARY KEY,
    workflow_instance_id VARCHAR(64) NOT NULL REFERENCES orchestration_instances(id) ON DELETE CASCADE,
    clock_type VARCHAR(32) NOT NULL,
    label VARCHAR(255) NOT NULL,
    business_calendar_id VARCHAR(64) NOT NULL REFERENCES orchestration_business_calendars(id) ON DELETE RESTRICT,
    target_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(24) NOT NULL,
    elapsed_minutes INTEGER NOT NULL DEFAULT 0,
    target_minutes INTEGER NOT NULL,
    paused_at TIMESTAMPTZ,
    total_paused_minutes INTEGER NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    warning_at TIMESTAMPTZ,
    escalation_at TIMESTAMPTZ,
    UNIQUE (workflow_instance_id, clock_type, label)
);

CREATE TABLE IF NOT EXISTS orchestration_notification_deliveries (
    id VARCHAR(64) PRIMARY KEY,
    workflow_instance_id VARCHAR(64) NOT NULL REFERENCES orchestration_instances(id) ON DELETE CASCADE,
    node_instance_id VARCHAR(64) REFERENCES orchestration_node_instances(id) ON DELETE SET NULL,
    policy_id VARCHAR(64) REFERENCES orchestration_notification_policies(id) ON DELETE SET NULL,
    event_type VARCHAR(64) NOT NULL,
    recipient_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    recipient_group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    channels JSONB NOT NULL DEFAULT '[]'::jsonb,
    deduplication_key VARCHAR(512) NOT NULL,
    status VARCHAR(24) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS orchestration_trigger_receipts (
    id VARCHAR(64) PRIMARY KEY,
    idempotency_key VARCHAR(200) NOT NULL,
    trigger_type VARCHAR(32) NOT NULL,
    event_name VARCHAR(200) NOT NULL,
    record_type VARCHAR(100),
    source VARCHAR(100) NOT NULL,
    context JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ,
    launched_workflow_instance_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    UNIQUE (source, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_orch_catalog_category ON orchestration_catalog_templates(category, lifecycle);
CREATE INDEX IF NOT EXISTS idx_orch_instances_status ON orchestration_instances(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_instances_requester ON orchestration_instances(requester_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_node_ready ON orchestration_node_instances(status, next_attempt_at, waiting_until);
CREATE INDEX IF NOT EXISTS idx_orch_work_items_queue ON orchestration_work_items(assignment_group_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_orch_events_instance ON orchestration_execution_events(workflow_instance_id, sequence);
CREATE INDEX IF NOT EXISTS idx_orch_relations_source ON orchestration_work_relations(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_orch_relations_target ON orchestration_work_relations(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_orch_sla_status ON orchestration_sla_clocks(status, target_at);
CREATE INDEX IF NOT EXISTS idx_orch_notifications_dedupe ON orchestration_notification_deliveries(deduplication_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_trigger_receipts ON orchestration_trigger_receipts(trigger_type, event_name, received_at DESC);

-- ----------------------------------------------------------------------------
-- 16. Controlled legacy projection/import support
-- ----------------------------------------------------------------------------
-- Relational columns remain the query path. source_payload preserves fields
-- that existed in the JSON runtime during the zero-loss cutover and can be
-- retired only after the corresponding repository has been migrated.
ALTER TABLE bank_divisions ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE bank_departments ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE bank_teams ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE bank_departments ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE bank_departments ADD COLUMN IF NOT EXISTS manager_id VARCHAR(128);
ALTER TABLE bank_departments ADD COLUMN IF NOT EXISTS admin_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bank_departments ADD COLUMN IF NOT EXISTS color VARCHAR(32);
ALTER TABLE bank_departments ADD COLUMN IF NOT EXISTS icon VARCHAR(64);
ALTER TABLE bank_departments ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE bank_departments ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE bank_departments ADD COLUMN IF NOT EXISTS directory_source VARCHAR(32);
ALTER TABLE bank_teams ADD COLUMN IF NOT EXISTS code VARCHAR(64);
ALTER TABLE bank_teams ADD COLUMN IF NOT EXISTS lead_id VARCHAR(128);
ALTER TABLE bank_teams ADD COLUMN IF NOT EXISTS security_domain VARCHAR(64);
ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS sam_account_name VARCHAR(128);
ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS user_principal_name VARCHAR(255);
ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS distinguished_name TEXT;
ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS ldap_domain VARCHAR(255);
ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS ldap_bind_status VARCHAR(32);
ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS directory_source VARCHAR(32);
ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS distribution_groups JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS owned_risk_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bank_users ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE sla_policies ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE ticket_approvals ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE ticket_attachments ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE risk_register_items ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE saved_filters ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE ticket_relationships ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE ticket_tasks ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE ticket_worklogs ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE ticket_sla_instances ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE ticket_satisfaction ADD COLUMN IF NOT EXISTS source_payload JSONB;
ALTER TABLE ticket_ai_recommendations ADD COLUMN IF NOT EXISTS source_payload JSONB;

-- Department connectors are operational resources, not legacy JSON records.
-- Secrets are intentionally out of scope: only non-sensitive configuration
-- summaries may be persisted here; credentials belong in a secret manager.
CREATE TABLE IF NOT EXISTS department_connections (
    id VARCHAR(128) PRIMARY KEY,
    department_id VARCHAR(128) NOT NULL REFERENCES bank_departments(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(64) NOT NULL CHECK (type IN ('SIEM','EDR','ACTIVE_DIRECTORY','CLOUD_INFRA','VULN_SCANNER','HRIS','CORE_BANKING','PAYMENT_GATEWAY','TICKETING','COMMUNICATION','DATABASE')),
    provider VARCHAR(255) NOT NULL,
    endpoint_url VARCHAR(1024) NOT NULL,
    auth_type VARCHAR(64) NOT NULL CHECK (auth_type IN ('API_KEY','OAUTH2','MTLS_CERTIFICATE','LDAP_BIND','BEARER_TOKEN')),
    status VARCHAR(32) NOT NULL DEFAULT 'DISCONNECTED' CHECK (status IN ('CONNECTED','SYNCING','ERROR','DISCONNECTED')),
    last_sync_at TIMESTAMPTZ,
    latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
    health_score NUMERIC(5,2) CHECK (health_score IS NULL OR (health_score >= 0 AND health_score <= 100)),
    sync_frequency_minutes INTEGER NOT NULL DEFAULT 0 CHECK (sync_frequency_minutes >= 0 AND sync_frequency_minutes <= 10080),
    description TEXT NOT NULL DEFAULT '',
    config_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_payload JSONB,
    created_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_department_connections_active_name
    ON department_connections(department_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_department_connections_department
    ON department_connections(department_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_departments_active_division
    ON bank_departments(is_active, division_id, name);
CREATE INDEX IF NOT EXISTS idx_departments_manager
    ON bank_departments(manager_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_departments_manager'
    ) THEN
        ALTER TABLE bank_departments
            ADD CONSTRAINT fk_bank_departments_manager
            FOREIGN KEY (manager_id) REFERENCES bank_users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- AD-generated department slugs can exceed the original 64-character limit.
-- Widen the normalized key and every FK that points to it before importing;
-- this is an additive, metadata-preserving change (no truncation).
ALTER TABLE bank_departments ALTER COLUMN id TYPE VARCHAR(128);
ALTER TABLE bank_teams ALTER COLUMN department_id TYPE VARCHAR(128);
ALTER TABLE bank_users ALTER COLUMN department_id TYPE VARCHAR(128);
ALTER TABLE bank_assets ALTER COLUMN department_id TYPE VARCHAR(128);
ALTER TABLE bank_applications ALTER COLUMN department_id TYPE VARCHAR(128);
ALTER TABLE tickets ALTER COLUMN department_id TYPE VARCHAR(128);
ALTER TABLE workflow_templates ALTER COLUMN owner_department_id TYPE VARCHAR(128);

-- Canonical work-intake categories. The new-work modal reads this catalog from
-- PostgreSQL; category options must not be maintained as a client/server array.
CREATE TABLE IF NOT EXISTS ticket_categories (
    code VARCHAR(64) PRIMARY KEY,
    display_name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_categories_active_sort
    ON ticket_categories(is_active, sort_order, code);

INSERT INTO ticket_categories(code, display_name, description, sort_order) VALUES
    ('GENERAL_REQUEST', 'General Request', 'General business request', 10),
    ('GENERAL_TASK', 'General Task', 'General operational task', 20),
    ('IT_SUPPORT', 'IT Support', 'End-user technology support', 30),
    ('ACCESS_REQUEST', 'Access Request', 'System or facility access request', 40),
    ('HARDWARE_SOFTWARE', 'Hardware Software', 'Hardware or software service request', 50),
    ('NETWORK_INFRASTRUCTURE', 'Network Infrastructure', 'Network and infrastructure request', 60),
    ('CHANGE_REQUEST', 'Change Request', 'Controlled change request', 70),
    ('INCIDENT_MANAGEMENT', 'Incident Management', 'Operational incident handling', 80),
    ('PROJECT_DELIVERY', 'Project Delivery', 'Project delivery work item', 90),
    ('FINANCE_PROCUREMENT', 'Finance Procurement', 'Finance or procurement request', 100),
    ('HR_OPERATIONS', 'HR Operations', 'Human resources operations request', 110),
    ('COMPLIANCE_LEGAL', 'Compliance Legal', 'Compliance or legal request', 120),
    ('BUSINESS_OPERATIONS', 'Business Operations', 'Business operations request', 130),
    ('SECURITY_REVIEW', 'Security Review', 'Information-security review', 140),
    ('VULNERABILITY', 'Vulnerability', 'Vulnerability management item', 150),
    ('INCIDENT', 'Incident', 'Security incident', 160),
    ('SECURITY_EXCEPTION', 'Security Exception', 'Security exception request', 170),
    ('RISK_ACCEPTANCE', 'Risk Acceptance', 'Risk acceptance request', 180),
    ('AUDIT_FINDING', 'Audit Finding', 'Audit finding remediation', 190),
    ('IAM_REQUEST', 'IAM Request', 'Identity and access management request', 200),
    ('DLP_ALERT', 'DLP Alert', 'Data loss prevention alert', 210),
    ('THIRD_PARTY_ASSESSMENT', 'Third Party Assessment', 'Third-party assessment request', 220)
ON CONFLICT (code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

CREATE TABLE IF NOT EXISTS legacy_json_records (
    collection VARCHAR(128) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    source_checksum CHAR(64) NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (collection, record_id)
);

CREATE INDEX IF NOT EXISTS idx_legacy_json_records_collection ON legacy_json_records(collection);
