-- Cortex XDR extends the source-neutral discovery ledger. It does not create a
-- parallel inventory or a second canonical asset model.

INSERT INTO cmdb_identifier_types(id, display_name, is_strong_identity, is_case_sensitive)
VALUES ('CORTEX_ASSET_ID', 'Cortex unified asset ID', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS cmdb_cortex_security_posture (
    asset_id VARCHAR(64) PRIMARY KEY REFERENCES configuration_items(id) ON DELETE RESTRICT,
    connector_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    source_record_id VARCHAR(64) NOT NULL UNIQUE REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    cortex_asset_id VARCHAR(512),
    endpoint_id VARCHAR(512),
    asset_class VARCHAR(128),
    asset_category VARCHAR(128),
    asset_type VARCHAR(128),
    coverage_status VARCHAR(32) NOT NULL DEFAULT 'COVERED'
        CHECK (coverage_status IN ('COVERED','MISSING','STALE','UNKNOWN')),
    agent_installed BOOLEAN,
    agent_status VARCHAR(64),
    agent_version VARCHAR(128),
    protection_state VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN'
        CHECK (protection_state IN ('PROTECTED','PARTIALLY_PROTECTED','UNPROTECTED','UNKNOWN')),
    isolation_status VARCHAR(64),
    content_status VARCHAR(64),
    content_version VARCHAR(128),
    assigned_security_policies JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(assigned_security_policies)='array'),
    cortex_first_seen_at TIMESTAMPTZ,
    cortex_last_seen_at TIMESTAMPTZ,
    observed_at TIMESTAMPTZ NOT NULL,
    source_record_revision BIGINT NOT NULL CHECK (source_record_revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (cortex_last_seen_at IS NULL OR cortex_first_seen_at IS NULL OR cortex_last_seen_at >= cortex_first_seen_at)
);

CREATE INDEX IF NOT EXISTS idx_cmdb_cortex_posture_operational
    ON cmdb_cortex_security_posture(protection_state, agent_status, content_status, cortex_last_seen_at);
CREATE INDEX IF NOT EXISTS idx_cmdb_cortex_posture_connector
    ON cmdb_cortex_security_posture(connector_id, observed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_cortex_posture_asset_id
    ON cmdb_cortex_security_posture(connector_id, cortex_asset_id) WHERE cortex_asset_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_cortex_posture_endpoint_id
    ON cmdb_cortex_security_posture(connector_id, endpoint_id) WHERE endpoint_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cmdb_security_findings (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    finding_type VARCHAR(64) NOT NULL,
    source_connector_id VARCHAR(64) REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    source_record_id VARCHAR(64) REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
    state VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','RESOLVED','SUPPRESSED')),
    title VARCHAR(255) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
    detection_key VARCHAR(512) NOT NULL,
    first_observed_at TIMESTAMPTZ NOT NULL,
    last_observed_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (last_observed_at >= first_observed_at),
    CHECK ((state='RESOLVED') = (resolved_at IS NOT NULL)),
    UNIQUE (asset_id, detection_key)
);

CREATE INDEX IF NOT EXISTS idx_cmdb_security_findings_queue
    ON cmdb_security_findings(state, severity, finding_type, last_observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmdb_security_findings_asset
    ON cmdb_security_findings(asset_id, state, last_observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmdb_security_findings_connector
    ON cmdb_security_findings(source_connector_id, state, finding_type);

INSERT INTO cmdb_source_precedence_rules(id,attribute_path,source_kind,connector_type_id,precedence,allow_override_manual)
VALUES
    ('precedence-vcenter-cpu','compute.cpuCount','DISCOVERY','VCENTER',950,FALSE),
    ('precedence-vcenter-memory','compute.memoryBytes','DISCOVERY','VCENTER',950,FALSE),
    ('precedence-ad-hostname','identity.hostname','DISCOVERY','ACTIVE_DIRECTORY',760,FALSE),
    ('precedence-ad-fqdn','identity.fqdn','DISCOVERY','ACTIVE_DIRECTORY',780,FALSE),
    ('precedence-ad-configured-os','operatingSystem.configured','DISCOVERY','ACTIVE_DIRECTORY',760,FALSE),
    ('precedence-cortex-hostname','identity.hostname','DISCOVERY','CORTEX',820,FALSE),
    ('precedence-cortex-fqdn','identity.fqdn','DISCOVERY','CORTEX',830,FALSE),
    ('precedence-cortex-reported-os','operatingSystem.reported','DISCOVERY','CORTEX',900,FALSE),
    ('precedence-cortex-effective-os','operatingSystem.name','DISCOVERY','CORTEX',900,FALSE),
    ('precedence-cortex-os-version','operatingSystem.version','DISCOVERY','CORTEX',900,FALSE),
    ('precedence-cortex-technical-state','technicalState','DISCOVERY','CORTEX',900,FALSE)
ON CONFLICT (id) DO NOTHING;
