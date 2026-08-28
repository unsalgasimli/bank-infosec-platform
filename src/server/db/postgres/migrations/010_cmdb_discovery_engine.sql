-- Generic discovery processing engine state.
-- No connector adapter, vCenter network call, or source-specific reconciliation
-- logic belongs in this migration.

ALTER TABLE configuration_items
    ADD COLUMN IF NOT EXISTS cpu_count INTEGER CHECK (cpu_count IS NULL OR cpu_count >= 0),
    ADD COLUMN IF NOT EXISTS memory_bytes NUMERIC(24,0) CHECK (memory_bytes IS NULL OR memory_bytes >= 0);

CREATE INDEX IF NOT EXISTS idx_configuration_items_technical_capacity
    ON configuration_items(type_id, cpu_count, memory_bytes)
    WHERE lifecycle_state NOT IN ('RETIRED','ARCHIVED');

ALTER TABLE cmdb_source_records
    ADD COLUMN IF NOT EXISTS normalized_schema_version INTEGER CHECK (normalized_schema_version IS NULL OR normalized_schema_version > 0),
    ADD COLUMN IF NOT EXISTS normalized_payload JSONB,
    ADD COLUMN IF NOT EXISTS normalized_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS miss_count INTEGER NOT NULL DEFAULT 0 CHECK (miss_count >= 0),
    ADD COLUMN IF NOT EXISTS last_correlation_outcome VARCHAR(24)
        CHECK (last_correlation_outcome IS NULL OR last_correlation_outcome IN ('MATCHED','NO_MATCH','POSSIBLE_MATCH','CONFLICT')),
    ADD COLUMN IF NOT EXISTS correlation_rule_version VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_cmdb_source_records_reconciliation
    ON cmdb_source_records(connector_id, miss_count DESC, last_seen_at)
    WHERE status IN ('ACTIVE','MISSING','STALE');

ALTER TABLE cmdb_attribute_observations
    ADD COLUMN IF NOT EXISTS source_record_revision BIGINT CHECK (source_record_revision IS NULL OR source_record_revision > 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_attribute_source_revision
    ON cmdb_attribute_observations(source_record_id, source_record_revision, attribute_path, value_hash)
    WHERE source_record_id IS NOT NULL AND source_record_revision IS NOT NULL;

ALTER TABLE cmdb_raw_observations
    ADD COLUMN IF NOT EXISTS accounted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS cmdb_correlation_decisions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    observation_id BIGINT NOT NULL UNIQUE REFERENCES cmdb_raw_observations(id) ON DELETE RESTRICT,
    source_record_id VARCHAR(64) NOT NULL REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    outcome VARCHAR(24) NOT NULL CHECK (outcome IN ('MATCHED','NO_MATCH','POSSIBLE_MATCH','CONFLICT')),
    selected_asset_id VARCHAR(64) REFERENCES configuration_items(id) ON DELETE RESTRICT,
    rule_version VARCHAR(64) NOT NULL,
    confidence NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((outcome IN ('MATCHED','NO_MATCH')) OR selected_asset_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_cmdb_correlation_decisions_source
    ON cmdb_correlation_decisions(source_record_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmdb_correlation_decisions_asset
    ON cmdb_correlation_decisions(selected_asset_id, decided_at DESC) WHERE selected_asset_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cmdb_correlation_cases (
    id VARCHAR(64) PRIMARY KEY,
    source_record_id VARCHAR(64) NOT NULL REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    observation_id BIGINT NOT NULL REFERENCES cmdb_raw_observations(id) ON DELETE RESTRICT,
    outcome VARCHAR(24) NOT NULL CHECK (outcome IN ('POSSIBLE_MATCH','CONFLICT')),
    status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED_MATCH','RESOLVED_NEW_ASSET','DISMISSED')),
    rule_version VARCHAR(64) NOT NULL,
    summary TEXT NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
    resolved_asset_id VARCHAR(64) REFERENCES configuration_items(id) ON DELETE RESTRICT,
    resolution_note TEXT,
    CHECK ((status = 'OPEN' AND resolved_at IS NULL AND resolved_by_user_id IS NULL)
        OR (status <> 'OPEN' AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_correlation_case_open_source
    ON cmdb_correlation_cases(source_record_id) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_cmdb_correlation_cases_queue
    ON cmdb_correlation_cases(status, opened_at, outcome);

CREATE TABLE IF NOT EXISTS cmdb_correlation_candidates (
    case_id VARCHAR(64) NOT NULL REFERENCES cmdb_correlation_cases(id) ON DELETE RESTRICT,
    asset_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    score NUMERIC(6,2) NOT NULL CHECK (score >= 0),
    strong_signal_count SMALLINT NOT NULL DEFAULT 0 CHECK (strong_signal_count >= 0),
    medium_signal_count SMALLINT NOT NULL DEFAULT 0 CHECK (medium_signal_count >= 0),
    weak_signal_count SMALLINT NOT NULL DEFAULT 0 CHECK (weak_signal_count >= 0),
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (case_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_cmdb_correlation_candidates_asset
    ON cmdb_correlation_candidates(asset_id, score DESC);

CREATE TABLE IF NOT EXISTS cmdb_source_precedence_rules (
    id VARCHAR(64) PRIMARY KEY,
    attribute_path VARCHAR(512) NOT NULL,
    source_kind VARCHAR(32) NOT NULL CHECK (source_kind IN ('MANUAL','DISCOVERY','IMPORT','API','MIGRATION')),
    connector_type_id VARCHAR(64) REFERENCES cmdb_discovery_connector_types(id) ON DELETE RESTRICT,
    precedence SMALLINT NOT NULL,
    allow_override_manual BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    rule_version INTEGER NOT NULL DEFAULT 1 CHECK (rule_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_source_precedence_rule
    ON cmdb_source_precedence_rules(attribute_path, source_kind, COALESCE(connector_type_id, ''))
    WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cmdb_source_precedence_lookup
    ON cmdb_source_precedence_rules(attribute_path, source_kind, connector_type_id, precedence DESC)
    WHERE is_active;

INSERT INTO cmdb_source_precedence_rules(id, attribute_path, source_kind, precedence, allow_override_manual)
VALUES
    ('precedence-discovery-name', 'identity.name', 'DISCOVERY', 40, FALSE),
    ('precedence-discovery-hostname', 'identity.hostname', 'DISCOVERY', 70, FALSE),
    ('precedence-discovery-fqdn', 'identity.fqdn', 'DISCOVERY', 80, FALSE),
    ('precedence-discovery-serial', 'identity.serialNumber', 'DISCOVERY', 90, FALSE),
    ('precedence-discovery-environment', 'classification.environment', 'DISCOVERY', 50, FALSE),
    ('precedence-discovery-technical-state', 'technicalState', 'DISCOVERY', 100, FALSE),
    ('precedence-discovery-cpu', 'compute.cpuCount', 'DISCOVERY', 100, FALSE),
    ('precedence-discovery-memory', 'compute.memoryBytes', 'DISCOVERY', 100, FALSE),
    ('precedence-discovery-configured-os', 'operatingSystem.configured', 'DISCOVERY', 60, FALSE),
    ('precedence-discovery-reported-os', 'operatingSystem.reported', 'DISCOVERY', 80, FALSE),
    ('precedence-discovery-effective-os', 'operatingSystem.name', 'DISCOVERY', 80, FALSE),
    ('precedence-discovery-os-version', 'operatingSystem.version', 'DISCOVERY', 80, FALSE),
    ('precedence-manual-business-owner', 'business.ownerUserId', 'MANUAL', 1000, FALSE),
    ('precedence-manual-technical-owner', 'business.technicalOwnerUserId', 'MANUAL', 1000, FALSE),
    ('precedence-manual-department', 'business.departmentId', 'MANUAL', 1000, FALSE),
    ('precedence-manual-criticality', 'business.criticality', 'MANUAL', 1000, FALSE),
    ('precedence-manual-business-criticality', 'business.businessCriticality', 'MANUAL', 1000, FALSE),
    ('precedence-manual-support-group', 'business.supportGroupId', 'MANUAL', 1000, FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS cmdb_pending_relationships (
    id VARCHAR(64) PRIMARY KEY,
    source_record_id VARCHAR(64) NOT NULL REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    source_asset_id VARCHAR(64) REFERENCES configuration_items(id) ON DELETE RESTRICT,
    source_connector_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    source_sync_run_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_sync_runs(id) ON DELETE RESTRICT,
    relationship_type_id VARCHAR(64) NOT NULL REFERENCES cmdb_relationship_types(id) ON DELETE RESTRICT,
    target_connector_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    target_object_type VARCHAR(128) NOT NULL,
    target_object_id VARCHAR(512) NOT NULL,
    target_native_uuid VARCHAR(255),
    target_identifiers JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(target_identifiers) = 'array'),
    confidence NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (confidence >= 0 AND confidence <= 100),
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RESOLVED','SUPERSEDED','FAILED')),
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    resolved_relationship_id VARCHAR(64) REFERENCES ci_relationships(id) ON DELETE RESTRICT,
    resolved_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (last_seen_at >= first_seen_at),
    CHECK ((status = 'RESOLVED') = (resolved_relationship_id IS NOT NULL AND resolved_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_pending_relationship_active
    ON cmdb_pending_relationships(source_record_id, relationship_type_id, target_connector_id, target_object_type, target_object_id)
    WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_cmdb_pending_relationship_target
    ON cmdb_pending_relationships(target_connector_id, target_object_type, target_object_id, status);
CREATE INDEX IF NOT EXISTS idx_cmdb_pending_relationship_source
    ON cmdb_pending_relationships(source_record_id, status, relationship_type_id);

CREATE TABLE IF NOT EXISTS cmdb_discovery_lifecycle_policies (
    scope_key VARCHAR(128) PRIMARY KEY,
    connector_id VARCHAR(64) UNIQUE REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    stale_after_missed_runs INTEGER NOT NULL DEFAULT 3 CHECK (stale_after_missed_runs > 0),
    decommission_after_missed_runs INTEGER NOT NULL DEFAULT 10 CHECK (decommission_after_missed_runs >= stale_after_missed_runs),
    retire_after_missed_runs INTEGER CHECK (retire_after_missed_runs IS NULL OR retire_after_missed_runs >= decommission_after_missed_runs),
    auto_retire_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    rule_version INTEGER NOT NULL DEFAULT 1 CHECK (rule_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((scope_key = 'GLOBAL' AND connector_id IS NULL) OR scope_key = connector_id)
);

INSERT INTO cmdb_discovery_lifecycle_policies(scope_key, connector_id, stale_after_missed_runs, decommission_after_missed_runs, retire_after_missed_runs, auto_retire_enabled)
VALUES('GLOBAL', NULL, 3, 10, NULL, FALSE)
ON CONFLICT (scope_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS cmdb_asset_tags (
    asset_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    tag_key VARCHAR(255) NOT NULL,
    tag_value VARCHAR(1024) NOT NULL DEFAULT '',
    source_record_id VARCHAR(64) REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (asset_id, tag_key, tag_value),
    CHECK (btrim(tag_key) <> ''),
    CHECK (last_seen_at >= first_seen_at)
);

CREATE INDEX IF NOT EXISTS idx_cmdb_asset_tags_lookup
    ON cmdb_asset_tags(tag_key, tag_value, asset_id) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_asset_tags_source
    ON cmdb_asset_tags(source_record_id, last_seen_at DESC) WHERE source_record_id IS NOT NULL;
