-- Generic CMDB discovery database foundation.
--
-- This migration intentionally contains no connector implementation, network
-- calls, correlation policy, or fake discovery data. configuration_items stays
-- the canonical asset table and department_connections stays the platform's
-- external-connection registry.

-- ---------------------------------------------------------------------------
-- Canonical asset taxonomy and lifecycle
-- ---------------------------------------------------------------------------

INSERT INTO cmdb_ci_types(id, name, parent_type_id, icon, is_active, required_attributes, optional_attributes, validation_rules, allowed_relationship_type_ids)
VALUES
    ('infrastructure', 'Infrastructure', NULL, 'Server', TRUE, '["name","environment","criticality"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('endpoint', 'Endpoint', NULL, 'Monitor', TRUE, '["name","environment"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('software', 'Software', NULL, 'Box', TRUE, '["name","environment","criticality"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('physical_server', 'Physical Server', 'infrastructure', 'Server', TRUE, '["name","environment"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('virtual_machine', 'Virtual Machine', 'infrastructure', 'Server', TRUE, '["name","environment"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('hypervisor', 'Hypervisor', 'infrastructure', 'ServerCog', TRUE, '["name","environment"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('cluster', 'Cluster', 'infrastructure', 'Boxes', TRUE, '["name","environment"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('datacenter', 'Datacenter', 'infrastructure', 'Building2', TRUE, '["name","environment"]', '["departmentId"]', '{}', '[]'),
    ('network', 'Network', 'infrastructure', 'Network', TRUE, '["name","environment"]', '["departmentId"]', '{}', '[]'),
    ('network_device', 'Network Device', 'infrastructure', 'Router', TRUE, '["name","environment"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('storage', 'Storage', 'infrastructure', 'HardDrive', TRUE, '["name","environment"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('datastore', 'Datastore', 'storage', 'Database', TRUE, '["name","environment"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('workstation', 'Workstation', 'endpoint', 'Monitor', TRUE, '["name","environment"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('laptop', 'Laptop', 'endpoint', 'Laptop', TRUE, '["name","environment"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('security_device', 'Security Device', 'infrastructure', 'Shield', TRUE, '["name","environment"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('cloud_resource', 'Cloud Resource', 'infrastructure', 'Cloud', TRUE, '["name","environment"]', '["ownerUserId","departmentId"]', '{}', '[]'),
    ('application', 'Application', 'software', 'AppWindow', TRUE, '["name","environment","criticality"]', '["technicalOwnerUserId","businessOwnerUserId","departmentId"]', '{}', '[]'),
    ('business_service', 'Business Service', 'software', 'BriefcaseBusiness', TRUE, '["name","criticality"]', '["businessOwnerUserId","departmentId"]', '{}', '[]'),
    ('other', 'Other', NULL, 'Box', TRUE, '["name"]', '["ownerUserId","departmentId"]', '{}', '[]')
ON CONFLICT (id) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS cmdb_asset_key_seq AS BIGINT START WITH 1 INCREMENT BY 1;

ALTER TABLE configuration_items
    ADD COLUMN IF NOT EXISTS asset_key VARCHAR(128),
    ADD COLUMN IF NOT EXISTS asset_subtype VARCHAR(128),
    ADD COLUMN IF NOT EXISTS lifecycle_state VARCHAR(32),
    ADD COLUMN IF NOT EXISTS technical_status VARCHAR(64),
    ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stale_since TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reactivated_at TIMESTAMPTZ;

UPDATE configuration_items
SET asset_key = COALESCE(NULLIF(asset_key, ''), ci_number),
    lifecycle_state = COALESCE(
        lifecycle_state,
        CASE
            WHEN status = 'ARCHIVED' THEN 'ARCHIVED'
            WHEN status = 'RETIRED' OR lifecycle_status IN ('RETIRED', 'DISPOSED') THEN 'RETIRED'
            WHEN discovery_status = 'DISCOVERED' THEN 'DISCOVERED'
            ELSE 'ACTIVE'
        END
    ),
    technical_status = COALESCE(NULLIF(technical_status, ''), status, 'UNKNOWN'),
    first_seen_at = COALESCE(first_seen_at, created_at),
    retired_at = CASE
        WHEN COALESCE(lifecycle_state, CASE WHEN status = 'ARCHIVED' THEN 'ARCHIVED' WHEN status = 'RETIRED' OR lifecycle_status IN ('RETIRED','DISPOSED') THEN 'RETIRED' ELSE 'ACTIVE' END) = 'RETIRED'
            THEN COALESCE(retired_at, archived_at, updated_at)
        ELSE retired_at
    END;

ALTER TABLE configuration_items
    ALTER COLUMN asset_key SET DEFAULT ('AST-' || LPAD(nextval('cmdb_asset_key_seq')::TEXT, 12, '0')),
    ALTER COLUMN asset_key SET NOT NULL,
    ALTER COLUMN lifecycle_state SET DEFAULT 'ACTIVE',
    ALTER COLUMN lifecycle_state SET NOT NULL,
    ALTER COLUMN technical_status SET DEFAULT 'UNKNOWN',
    ALTER COLUMN technical_status SET NOT NULL,
    ALTER COLUMN first_seen_at SET DEFAULT NOW(),
    ALTER COLUMN first_seen_at SET NOT NULL;

SELECT setval(
    'cmdb_asset_key_seq',
    GREATEST(
        1,
        COALESCE((
            SELECT MAX(substring(asset_key FROM '^AST-([0-9]+)$')::BIGINT)
            FROM configuration_items
            WHERE asset_key ~ '^AST-[0-9]+$'
        ), 0),
        (SELECT COUNT(*) FROM configuration_items)
    ),
    TRUE
);

ALTER TABLE configuration_items DROP CONSTRAINT IF EXISTS configuration_items_lifecycle_state_check;
ALTER TABLE configuration_items ADD CONSTRAINT configuration_items_lifecycle_state_check
    CHECK (lifecycle_state IN ('DISCOVERED','ACTIVE','STALE','DECOMMISSION_CANDIDATE','RETIRED','ARCHIVED'));
ALTER TABLE configuration_items DROP CONSTRAINT IF EXISTS configuration_items_lifecycle_dates_check;
ALTER TABLE configuration_items ADD CONSTRAINT configuration_items_lifecycle_dates_check CHECK (
    (lifecycle_state <> 'STALE' OR stale_since IS NOT NULL)
    AND (lifecycle_state NOT IN ('RETIRED','ARCHIVED') OR retired_at IS NOT NULL OR archived_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_configuration_items_asset_key ON configuration_items(lower(asset_key));
CREATE INDEX IF NOT EXISTS idx_configuration_items_lifecycle_seen
    ON configuration_items(lifecycle_state, last_seen_at NULLS FIRST, id);
CREATE INDEX IF NOT EXISTS idx_configuration_items_type_lifecycle
    ON configuration_items(type_id, lifecycle_state, technical_status);
CREATE INDEX IF NOT EXISTS idx_configuration_items_display_name
    ON configuration_items(lower(COALESCE(display_name, name)));

-- Hard global uniqueness for hostnames and serials causes false canonical
-- merges across DNS domains, tenants and recycled hardware. Keep indexed
-- lookup, while correlation decisions are represented by normalized identifiers.
DROP INDEX IF EXISTS uq_ci_active_serial;
DROP INDEX IF EXISTS uq_ci_active_hostname;
CREATE INDEX IF NOT EXISTS idx_ci_active_serial_lookup
    ON configuration_items(lower(serial_number)) WHERE serial_number IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ci_active_hostname_lookup
    ON configuration_items(lower(hostname)) WHERE hostname IS NOT NULL AND archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- Normalized identifiers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cmdb_identifier_types (
    id VARCHAR(64) PRIMARY KEY,
    display_name VARCHAR(128) NOT NULL UNIQUE,
    is_strong_identity BOOLEAN NOT NULL,
    is_case_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cmdb_identifier_types(id, display_name, is_strong_identity, is_case_sensitive)
VALUES
    ('HOSTNAME', 'Hostname', FALSE, FALSE),
    ('FQDN', 'Fully qualified domain name', FALSE, FALSE),
    ('SERIAL_NUMBER', 'Serial number', TRUE, FALSE),
    ('BIOS_UUID', 'BIOS UUID', TRUE, FALSE),
    ('VMWARE_INSTANCE_UUID', 'VMware instance UUID', TRUE, FALSE),
    ('CLOUD_INSTANCE_ID', 'Cloud instance ID', TRUE, TRUE),
    ('MAC_ADDRESS', 'MAC address', FALSE, FALSE),
    ('AGENT_ID', 'Agent ID', TRUE, TRUE),
    ('EDR_DEVICE_ID', 'EDR device ID', TRUE, TRUE),
    ('SCCM_RESOURCE_ID', 'SCCM resource ID', TRUE, TRUE),
    ('AD_OBJECT_GUID', 'Active Directory object GUID', TRUE, FALSE),
    ('OTHER', 'Other identifier', FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- IP addresses are intentionally absent from this identity taxonomy. They are
-- observations attached to interfaces, never strong canonical identity keys.
CREATE TABLE IF NOT EXISTS cmdb_asset_identifiers (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    identifier_type_id VARCHAR(64) NOT NULL REFERENCES cmdb_identifier_types(id) ON DELETE RESTRICT,
    namespace VARCHAR(255) NOT NULL DEFAULT 'GLOBAL',
    value TEXT NOT NULL CHECK (btrim(value) <> ''),
    normalized_value VARCHAR(512) NOT NULL CHECK (btrim(normalized_value) <> ''),
    source VARCHAR(64) NOT NULL,
    connector_id VARCHAR(64),
    source_record_id VARCHAR(64),
    confidence NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (confidence >= 0 AND confidence <= 100),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (last_seen_at >= first_seen_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_asset_identifier_value
    ON cmdb_asset_identifiers(asset_id, identifier_type_id, namespace, normalized_value)
    WHERE retired_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_asset_identifier_primary
    ON cmdb_asset_identifiers(asset_id, identifier_type_id, namespace)
    WHERE is_primary AND retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_asset_identifier_lookup
    ON cmdb_asset_identifiers(identifier_type_id, normalized_value, namespace)
    WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_asset_identifier_asset
    ON cmdb_asset_identifiers(asset_id, is_primary DESC, identifier_type_id)
    WHERE retired_at IS NULL;

-- ---------------------------------------------------------------------------
-- Generic discovery connector profiles, attached to existing connections
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cmdb_discovery_connector_types (
    id VARCHAR(64) PRIMARY KEY,
    display_name VARCHAR(128) NOT NULL UNIQUE,
    schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cmdb_discovery_connector_types(id, display_name)
VALUES
    ('GENERIC', 'Generic discovery source'),
    ('VCENTER', 'VMware vCenter'),
    ('ACTIVE_DIRECTORY', 'Active Directory'),
    ('SCCM', 'Microsoft Configuration Manager'),
    ('INTUNE', 'Microsoft Intune'),
    ('CROWDSTRIKE', 'CrowdStrike'),
    ('CORTEX', 'Palo Alto Cortex'),
    ('TENABLE', 'Tenable'),
    ('QUALYS', 'Qualys'),
    ('AZURE', 'Microsoft Azure'),
    ('AWS', 'Amazon Web Services'),
    ('BACKUP_SYSTEM', 'Backup system'),
    ('NETWORK_DISCOVERY', 'Network discovery')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION cmdb_jsonb_contains_secret_key(input JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    item RECORD;
    child JSONB;
BEGIN
    IF input IS NULL THEN
        RETURN FALSE;
    END IF;
    IF jsonb_typeof(input) = 'object' THEN
        FOR item IN SELECT key, value FROM jsonb_each(input)
        LOOP
            IF lower(item.key) = ANY (ARRAY[
                'password','passwd','pwd','token','access_token','refresh_token',
                'api_key','apikey','secret','client_secret','private_key',
                'credential','credentials','authorization'
            ]) THEN
                RETURN TRUE;
            END IF;
            IF cmdb_jsonb_contains_secret_key(item.value) THEN
                RETURN TRUE;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(input) = 'array' THEN
        FOR child IN SELECT value FROM jsonb_array_elements(input)
        LOOP
            IF cmdb_jsonb_contains_secret_key(child) THEN
                RETURN TRUE;
            END IF;
        END LOOP;
    END IF;
    RETURN FALSE;
END;
$$;

ALTER TABLE department_connections DROP CONSTRAINT IF EXISTS department_connections_non_secret_config_check;
ALTER TABLE department_connections ADD CONSTRAINT department_connections_non_secret_config_check
    CHECK (NOT cmdb_jsonb_contains_secret_key(config_summary));

CREATE TABLE IF NOT EXISTS cmdb_discovery_connectors (
    id VARCHAR(64) PRIMARY KEY,
    connection_id VARCHAR(128) NOT NULL UNIQUE REFERENCES department_connections(id) ON DELETE RESTRICT,
    connector_type_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_connector_types(id) ON DELETE RESTRICT,
    environment VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    health_status VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN'
        CHECK (health_status IN ('UNKNOWN','HEALTHY','DEGRADED','UNHEALTHY','DISABLED')),
    non_secret_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    secret_reference VARCHAR(512),
    tls_ca_reference VARCHAR(512),
    schedule_minutes INTEGER NOT NULL DEFAULT 0 CHECK (schedule_minutes BETWEEN 0 AND 10080),
    last_sync_at TIMESTAMPTZ,
    last_successful_sync_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_failure_code VARCHAR(128),
    last_failure_message TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
    checkpoint TEXT,
    created_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (NOT cmdb_jsonb_contains_secret_key(non_secret_configuration)),
    CHECK (secret_reference IS NULL OR btrim(secret_reference) <> ''),
    CHECK (tls_ca_reference IS NULL OR btrim(tls_ca_reference) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_discovery_connector_type_connection
    ON cmdb_discovery_connectors(connection_id, connector_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_discovery_connectors_schedule
    ON cmdb_discovery_connectors(enabled, schedule_minutes, last_sync_at)
    WHERE enabled AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_discovery_connectors_health
    ON cmdb_discovery_connectors(health_status, last_successful_sync_at)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Sync runs, source records and immutable raw observations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cmdb_discovery_sync_runs (
    id VARCHAR(64) PRIMARY KEY,
    connector_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    run_type VARCHAR(24) NOT NULL CHECK (run_type IN ('FULL','INCREMENTAL','RECONCILIATION','MANUAL')),
    state VARCHAR(24) NOT NULL CHECK (state IN ('QUEUED','RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED')),
    requested_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    correlation_id VARCHAR(128),
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    checkpoint TEXT,
    cursor_value TEXT,
    discovered_count BIGINT NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
    created_count BIGINT NOT NULL DEFAULT 0 CHECK (created_count >= 0),
    updated_count BIGINT NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
    unchanged_count BIGINT NOT NULL DEFAULT 0 CHECK (unchanged_count >= 0),
    failed_count BIGINT NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    unmatched_count BIGINT NOT NULL DEFAULT 0 CHECK (unmatched_count >= 0),
    stale_candidate_count BIGINT NOT NULL DEFAULT 0 CHECK (stale_candidate_count >= 0),
    error_summary JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(error_summary) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (started_at IS NULL OR started_at >= queued_at),
    CHECK (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at)),
    CHECK (state NOT IN ('SUCCEEDED','PARTIAL','FAILED','CANCELLED') OR completed_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_discovery_connector_active_run
    ON cmdb_discovery_sync_runs(connector_id)
    WHERE state IN ('QUEUED','RUNNING');
CREATE INDEX IF NOT EXISTS idx_cmdb_discovery_runs_connector_time
    ON cmdb_discovery_sync_runs(connector_id, queued_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmdb_discovery_runs_state
    ON cmdb_discovery_sync_runs(state, queued_at) WHERE state IN ('QUEUED','RUNNING');
CREATE INDEX IF NOT EXISTS idx_cmdb_discovery_runs_correlation
    ON cmdb_discovery_sync_runs(correlation_id) WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cmdb_source_records (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64) REFERENCES configuration_items(id) ON DELETE RESTRICT,
    connector_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    external_object_type VARCHAR(128) NOT NULL CHECK (btrim(external_object_type) <> ''),
    external_object_id VARCHAR(512) NOT NULL CHECK (btrim(external_object_id) <> ''),
    native_uuid VARCHAR(255),
    source_name VARCHAR(512),
    source_path TEXT,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    last_sync_run_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_sync_runs(id) ON DELETE RESTRICT,
    current_observation_hash CHAR(64),
    normalized_payload_hash CHAR(64),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','UNMATCHED','MISSING','STALE','RETIRED','ERROR')),
    missing_since TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (last_seen_at >= first_seen_at),
    CHECK (status <> 'UNMATCHED' OR asset_id IS NULL),
    CHECK (status <> 'MISSING' OR missing_since IS NOT NULL),
    UNIQUE (connector_id, external_object_type, external_object_id)
);

CREATE INDEX IF NOT EXISTS idx_cmdb_source_records_asset
    ON cmdb_source_records(asset_id, status, last_seen_at DESC) WHERE asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_source_records_connector_seen
    ON cmdb_source_records(connector_id, status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmdb_source_records_native_uuid
    ON cmdb_source_records(connector_id, native_uuid) WHERE native_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_source_records_name
    ON cmdb_source_records(connector_id, lower(source_name)) WHERE source_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_source_records_stale
    ON cmdb_source_records(connector_id, missing_since) WHERE status IN ('MISSING','STALE');

ALTER TABLE cmdb_asset_identifiers
    ADD CONSTRAINT fk_cmdb_asset_identifiers_connector
        FOREIGN KEY (connector_id) REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_cmdb_asset_identifiers_source_record
        FOREIGN KEY (source_record_id) REFERENCES cmdb_source_records(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS cmdb_raw_observations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    connector_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    sync_run_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_sync_runs(id) ON DELETE RESTRICT,
    source_record_id VARCHAR(64) REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    source_object_type VARCHAR(128) NOT NULL,
    source_object_id VARCHAR(512) NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    raw_payload JSONB NOT NULL,
    deterministic_hash CHAR(64) NOT NULL CHECK (deterministic_hash ~ '^[0-9a-f]{64}$'),
    processing_status VARCHAR(24) NOT NULL DEFAULT 'RECEIVED'
        CHECK (processing_status IN ('RECEIVED','VALIDATED','NORMALIZED','PROCESSED','REJECTED','FAILED')),
    processing_error_code VARCHAR(128),
    processing_error TEXT,
    processing_attempts INTEGER NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sync_run_id, source_object_type, source_object_id, deterministic_hash)
);

CREATE INDEX IF NOT EXISTS idx_cmdb_raw_observations_run_status
    ON cmdb_raw_observations(sync_run_id, processing_status, id);
CREATE INDEX IF NOT EXISTS idx_cmdb_raw_observations_source_record
    ON cmdb_raw_observations(source_record_id, observed_at DESC) WHERE source_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_raw_observations_source_object
    ON cmdb_raw_observations(connector_id, source_object_type, source_object_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmdb_raw_observations_observed_brin
    ON cmdb_raw_observations USING BRIN(observed_at) WITH (pages_per_range = 64);

CREATE OR REPLACE FUNCTION prevent_cmdb_raw_observation_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'cmdb_raw_observations is immutable evidence; DELETE is not permitted'
            USING ERRCODE = '55000';
    END IF;
    IF NEW.connector_id IS DISTINCT FROM OLD.connector_id
        OR NEW.sync_run_id IS DISTINCT FROM OLD.sync_run_id
        OR NEW.source_object_type IS DISTINCT FROM OLD.source_object_type
        OR NEW.source_object_id IS DISTINCT FROM OLD.source_object_id
        OR NEW.observed_at IS DISTINCT FROM OLD.observed_at
        OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
        OR NEW.raw_payload IS DISTINCT FROM OLD.raw_payload
        OR NEW.deterministic_hash IS DISTINCT FROM OLD.deterministic_hash
        OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'cmdb_raw_observations evidence fields are immutable'
            USING ERRCODE = '55000';
    END IF;
    IF OLD.source_record_id IS NOT NULL AND NEW.source_record_id IS DISTINCT FROM OLD.source_record_id THEN
        RAISE EXCEPTION 'cmdb_raw_observations source record attribution cannot be reassigned'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cmdb_raw_observations_evidence_immutable ON cmdb_raw_observations;
CREATE TRIGGER cmdb_raw_observations_evidence_immutable
    BEFORE UPDATE OR DELETE ON cmdb_raw_observations
    FOR EACH ROW EXECUTE FUNCTION prevent_cmdb_raw_observation_evidence_mutation();

-- ---------------------------------------------------------------------------
-- Canonical relationships with multi-source evidence
-- ---------------------------------------------------------------------------

INSERT INTO cmdb_relationship_types(id, name, inverse_name, is_dependency, prevents_cycles, is_active)
VALUES
    ('runs_on', 'RUNS_ON', 'HOSTS', TRUE, TRUE, TRUE),
    ('member_of', 'MEMBER_OF', 'HAS_MEMBER', FALSE, TRUE, TRUE),
    ('located_in', 'LOCATED_IN', 'CONTAINS', FALSE, TRUE, TRUE),
    ('connected_to', 'CONNECTED_TO', 'CONNECTED_TO', FALSE, FALSE, TRUE),
    ('stored_on', 'STORED_ON', 'STORES', TRUE, TRUE, TRUE),
    ('depends_on', 'DEPENDS_ON', 'IS_DEPENDENCY_OF', TRUE, TRUE, TRUE),
    ('hosts', 'HOSTS', 'RUNS_ON', FALSE, TRUE, TRUE),
    ('part_of', 'PART_OF', 'HAS_PART', FALSE, TRUE, TRUE),
    ('managed_by', 'MANAGED_BY', 'MANAGES', FALSE, TRUE, TRUE),
    ('backed_up_by', 'BACKED_UP_BY', 'BACKS_UP', TRUE, TRUE, TRUE),
    ('protected_by', 'PROTECTED_BY', 'PROTECTS', TRUE, TRUE, TRUE),
    ('related_to', 'RELATED_TO', 'RELATED_TO', FALSE, FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE ci_relationships
    ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stale_since TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;

UPDATE ci_relationships
SET first_seen_at = COALESCE(first_seen_at, valid_from, created_at),
    last_seen_at = COALESCE(last_seen_at, valid_to, valid_from, created_at),
    retired_at = CASE WHEN status = 'INACTIVE' THEN COALESCE(retired_at, valid_to, archived_at) ELSE retired_at END;

ALTER TABLE ci_relationships
    ALTER COLUMN first_seen_at SET DEFAULT NOW(),
    ALTER COLUMN first_seen_at SET NOT NULL,
    ALTER COLUMN last_seen_at SET DEFAULT NOW(),
    ALTER COLUMN last_seen_at SET NOT NULL;

ALTER TABLE ci_relationships DROP CONSTRAINT IF EXISTS ci_relationships_status_check;
ALTER TABLE ci_relationships ADD CONSTRAINT ci_relationships_status_check
    CHECK (status IN ('ACTIVE','STALE','RETIRED','INACTIVE'));
ALTER TABLE ci_relationships DROP CONSTRAINT IF EXISTS ci_relationships_seen_check;
ALTER TABLE ci_relationships ADD CONSTRAINT ci_relationships_seen_check CHECK (last_seen_at >= first_seen_at);

CREATE TABLE IF NOT EXISTS cmdb_relationship_evidence (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    relationship_id VARCHAR(64) NOT NULL REFERENCES ci_relationships(id) ON DELETE RESTRICT,
    connector_id VARCHAR(64) REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    source_record_id VARCHAR(64) REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    sync_run_id VARCHAR(64) REFERENCES cmdb_discovery_sync_runs(id) ON DELETE RESTRICT,
    source VARCHAR(64) NOT NULL,
    confidence NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (confidence >= 0 AND confidence <= 100),
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','MISSING','STALE','RETIRED')),
    evidence_hash CHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (last_seen_at >= first_seen_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_relationship_evidence_source
    ON cmdb_relationship_evidence(
        relationship_id,
        COALESCE(connector_id, ''),
        COALESCE(source_record_id, ''),
        source
    ) WHERE status <> 'RETIRED';
CREATE INDEX IF NOT EXISTS idx_cmdb_relationship_evidence_connector
    ON cmdb_relationship_evidence(connector_id, status, last_seen_at DESC) WHERE connector_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_relationship_evidence_source_record
    ON cmdb_relationship_evidence(source_record_id, status) WHERE source_record_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Network and storage normalization
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cmdb_network_interfaces (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    connector_id VARCHAR(64) REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    source_record_id VARCHAR(64) REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    interface_key VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    description TEXT,
    interface_type VARCHAR(64),
    technical_status VARCHAR(64) NOT NULL DEFAULT 'UNKNOWN',
    mtu INTEGER CHECK (mtu IS NULL OR mtu > 0),
    speed_bps NUMERIC(24,0) CHECK (speed_bps IS NULL OR speed_bps >= 0),
    is_virtual BOOLEAN NOT NULL DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (last_seen_at >= first_seen_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_network_interface_key
    ON cmdb_network_interfaces(asset_id, interface_key) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_network_interfaces_asset
    ON cmdb_network_interfaces(asset_id, technical_status, name) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_network_interfaces_source
    ON cmdb_network_interfaces(source_record_id) WHERE source_record_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cmdb_mac_addresses (
    id VARCHAR(64) PRIMARY KEY,
    interface_id VARCHAR(64) NOT NULL REFERENCES cmdb_network_interfaces(id) ON DELETE RESTRICT,
    normalized_mac VARCHAR(16) NOT NULL CHECK (normalized_mac ~ '^[0-9a-f]{12}([0-9a-f]{4})?$'),
    display_mac VARCHAR(23) NOT NULL,
    address_type VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (last_seen_at >= first_seen_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_interface_mac
    ON cmdb_mac_addresses(interface_id, normalized_mac) WHERE retired_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_interface_primary_mac
    ON cmdb_mac_addresses(interface_id) WHERE is_primary AND retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_mac_lookup
    ON cmdb_mac_addresses(normalized_mac) WHERE retired_at IS NULL;

CREATE TABLE IF NOT EXISTS cmdb_ip_addresses (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    interface_id VARCHAR(64) REFERENCES cmdb_network_interfaces(id) ON DELETE RESTRICT,
    ip_address INET NOT NULL,
    address_role VARCHAR(64) NOT NULL DEFAULT 'UNKNOWN',
    dns_name VARCHAR(255),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_dynamic BOOLEAN NOT NULL DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (last_seen_at >= first_seen_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_asset_interface_ip
    ON cmdb_ip_addresses(asset_id, COALESCE(interface_id, ''), ip_address) WHERE retired_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_asset_primary_ip
    ON cmdb_ip_addresses(asset_id) WHERE is_primary AND retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_ip_lookup
    ON cmdb_ip_addresses(ip_address) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_ip_interface
    ON cmdb_ip_addresses(interface_id, ip_address) WHERE interface_id IS NOT NULL AND retired_at IS NULL;

CREATE TABLE IF NOT EXISTS cmdb_storage_devices (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    storage_asset_id VARCHAR(64) REFERENCES configuration_items(id) ON DELETE RESTRICT,
    connector_id VARCHAR(64) REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    source_record_id VARCHAR(64) REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    device_key VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    storage_type VARCHAR(64) NOT NULL,
    technical_status VARCHAR(64) NOT NULL DEFAULT 'UNKNOWN',
    vendor VARCHAR(255),
    model VARCHAR(255),
    serial_number VARCHAR(255),
    capacity_bytes NUMERIC(24,0) CHECK (capacity_bytes IS NULL OR capacity_bytes >= 0),
    used_bytes NUMERIC(24,0) CHECK (used_bytes IS NULL OR used_bytes >= 0),
    free_bytes NUMERIC(24,0) CHECK (free_bytes IS NULL OR free_bytes >= 0),
    filesystem VARCHAR(128),
    mount_path TEXT,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (last_seen_at >= first_seen_at),
    CHECK (storage_asset_id IS NULL OR storage_asset_id <> asset_id),
    CHECK (capacity_bytes IS NULL OR used_bytes IS NULL OR used_bytes <= capacity_bytes),
    CHECK (capacity_bytes IS NULL OR free_bytes IS NULL OR free_bytes <= capacity_bytes)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_storage_device_key
    ON cmdb_storage_devices(asset_id, device_key) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_storage_devices_asset
    ON cmdb_storage_devices(asset_id, technical_status, storage_type) WHERE retired_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_storage_devices_source
    ON cmdb_storage_devices(source_record_id) WHERE source_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_storage_serial
    ON cmdb_storage_devices(lower(serial_number)) WHERE serial_number IS NOT NULL AND retired_at IS NULL;

-- ---------------------------------------------------------------------------
-- Provenance and append-only material change history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cmdb_attribute_observations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    asset_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    attribute_path VARCHAR(512) NOT NULL CHECK (btrim(attribute_path) <> ''),
    observed_value JSONB,
    value_hash CHAR(64) NOT NULL CHECK (value_hash ~ '^[0-9a-f]{64}$'),
    source VARCHAR(64) NOT NULL CHECK (source IN ('MANUAL','DISCOVERY','IMPORT','API','MIGRATION')),
    connector_id VARCHAR(64) REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    source_record_id VARCHAR(64) REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    sync_run_id VARCHAR(64) REFERENCES cmdb_discovery_sync_runs(id) ON DELETE RESTRICT,
    observed_at TIMESTAMPTZ NOT NULL,
    confidence NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (confidence >= 0 AND confidence <= 100),
    precedence SMALLINT NOT NULL DEFAULT 0,
    is_manual BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (is_manual = (source = 'MANUAL'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_attribute_source_observation
    ON cmdb_attribute_observations(
        asset_id,
        attribute_path,
        value_hash,
        COALESCE(source_record_id, ''),
        observed_at
    );
CREATE INDEX IF NOT EXISTS idx_cmdb_attribute_observations_asset
    ON cmdb_attribute_observations(asset_id, attribute_path, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmdb_attribute_observations_source
    ON cmdb_attribute_observations(source_record_id, observed_at DESC) WHERE source_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_attribute_observations_time_brin
    ON cmdb_attribute_observations USING BRIN(observed_at) WITH (pages_per_range = 64);

CREATE TABLE IF NOT EXISTS cmdb_asset_attribute_state (
    asset_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    attribute_path VARCHAR(512) NOT NULL,
    effective_value JSONB,
    effective_value_hash CHAR(64) NOT NULL CHECK (effective_value_hash ~ '^[0-9a-f]{64}$'),
    winning_observation_id BIGINT REFERENCES cmdb_attribute_observations(id) ON DELETE RESTRICT,
    source VARCHAR(64) NOT NULL,
    connector_id VARCHAR(64) REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    source_record_id VARCHAR(64) REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    precedence SMALLINT NOT NULL DEFAULT 0,
    confidence NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (confidence >= 0 AND confidence <= 100),
    manually_managed BOOLEAN NOT NULL DEFAULT FALSE,
    manual_lock BOOLEAN NOT NULL DEFAULT FALSE,
    observed_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (asset_id, attribute_path),
    CHECK (NOT manual_lock OR manually_managed)
);

CREATE INDEX IF NOT EXISTS idx_cmdb_asset_attribute_state_source
    ON cmdb_asset_attribute_state(source_record_id, attribute_path) WHERE source_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_asset_attribute_state_manual
    ON cmdb_asset_attribute_state(asset_id, manual_lock) WHERE manually_managed;

CREATE TABLE IF NOT EXISTS cmdb_asset_changes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    asset_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    change_type VARCHAR(64) NOT NULL,
    field_path VARCHAR(512) NOT NULL,
    before_value JSONB,
    after_value JSONB,
    source VARCHAR(64) NOT NULL,
    connector_id VARCHAR(64) REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    source_record_id VARCHAR(64) REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    source_record_revision BIGINT CHECK (source_record_revision IS NULL OR source_record_revision > 0),
    sync_run_id VARCHAR(64) REFERENCES cmdb_discovery_sync_runs(id) ON DELETE RESTRICT,
    detection_hash CHAR(64) NOT NULL CHECK (detection_hash ~ '^[0-9a-f]{64}$'),
    detected_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (before_value IS DISTINCT FROM after_value),
    CHECK ((source_record_id IS NULL) = (source_record_revision IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_asset_change_source_revision
    ON cmdb_asset_changes(source_record_id, source_record_revision, field_path, change_type)
    WHERE source_record_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_asset_change_detection
    ON cmdb_asset_changes(asset_id, detection_hash, field_path, detected_at);
CREATE INDEX IF NOT EXISTS idx_cmdb_asset_changes_asset
    ON cmdb_asset_changes(asset_id, detected_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_cmdb_asset_changes_run
    ON cmdb_asset_changes(sync_run_id, id) WHERE sync_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_asset_changes_time_brin
    ON cmdb_asset_changes USING BRIN(detected_at) WITH (pages_per_range = 64);

CREATE OR REPLACE FUNCTION prevent_cmdb_asset_change_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'cmdb_asset_changes is append-only; % is not permitted', TG_OP
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cmdb_asset_changes_append_only ON cmdb_asset_changes;
CREATE TRIGGER cmdb_asset_changes_append_only
    BEFORE UPDATE OR DELETE ON cmdb_asset_changes
    FOR EACH ROW EXECUTE FUNCTION prevent_cmdb_asset_change_mutation();

-- ---------------------------------------------------------------------------
-- Compatibility mapping and existing-data migration
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cmdb_legacy_asset_map (
    legacy_record_type VARCHAR(32) NOT NULL CHECK (legacy_record_type IN ('BANK_ASSET','BANK_APPLICATION')),
    legacy_record_id VARCHAR(64) NOT NULL,
    asset_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    legacy_key VARCHAR(128),
    migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (legacy_record_type, legacy_record_id),
    UNIQUE (asset_id, legacy_record_type)
);

CREATE INDEX IF NOT EXISTS idx_cmdb_legacy_asset_map_asset ON cmdb_legacy_asset_map(asset_id);

-- Preserve a legacy ID whenever it is not already occupied. A deterministic
-- alternate ID plus the map prevents silent data loss in the collision case.
INSERT INTO configuration_items(
    id, ci_number, asset_key, name, display_name, type_id, status,
    lifecycle_status, lifecycle_state, technical_status, environment,
    criticality, owner_user_id, technical_owner_user_id, department_id,
    operating_system, fqdn, ip_address, source, discovery_status, details,
    version, first_seen_at, last_seen_at, created_at, updated_at, created_by, updated_by
)
SELECT
    CASE WHEN ci.id IS NULL THEN a.id ELSE 'ci-legacy-' || substr(md5('BANK_ASSET:' || a.id), 1, 32) END,
    'LA-' || left(a.tag, 48) || '-' || substr(md5(a.id), 1, 8),
    'LEGACY-ASSET-' || a.tag,
    a.name,
    a.name,
    CASE
        WHEN lower(a.type) LIKE '%laptop%' THEN 'laptop'
        WHEN lower(a.type) LIKE '%workstation%' OR lower(a.type) LIKE '%desktop%' THEN 'workstation'
        WHEN lower(a.type) LIKE '%virtual%' OR lower(a.type) = 'vm' THEN 'virtual_machine'
        WHEN lower(a.type) LIKE '%network%' OR lower(a.type) LIKE '%switch%' OR lower(a.type) LIKE '%router%' THEN 'network_device'
        WHEN lower(a.type) LIKE '%security%' OR lower(a.type) LIKE '%firewall%' THEN 'security_device'
        WHEN lower(a.type) LIKE '%storage%' THEN 'storage'
        WHEN lower(a.type) LIKE '%server%' THEN 'physical_server'
        ELSE 'other'
    END,
    'ACTIVE', 'IN_USE', 'ACTIVE', 'UNKNOWN',
    CASE WHEN a.environment IN ('DEV','TEST','UAT','STAGING','PRODUCTION','DR','UNKNOWN') THEN a.environment ELSE 'UNKNOWN' END,
    CASE WHEN a.critical_asset THEN 'CRITICAL' ELSE 'MEDIUM' END,
    a.owner_id, a.owner_id, a.department_id, a.os, a.fqdn, a.ip_address,
    'IMPORT', 'NOT_DISCOVERED',
    jsonb_build_object(
        'legacyRecordType', 'BANK_ASSET',
        'legacyAssetTag', a.tag,
        'legacyAssetType', a.type,
        'legacyCustodianId', a.custodian_id,
        'pciDssScope', a.pci_dss_scope
    ),
    1, a.created_at, COALESCE(a.updated_at, a.created_at), a.created_at, a.updated_at, NULL, NULL
FROM bank_assets a
LEFT JOIN configuration_items ci ON ci.id = a.id
WHERE NOT EXISTS (
    SELECT 1 FROM cmdb_legacy_asset_map m
    WHERE m.legacy_record_type = 'BANK_ASSET' AND m.legacy_record_id = a.id
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO cmdb_legacy_asset_map(legacy_record_type, legacy_record_id, asset_id, legacy_key)
SELECT
    'BANK_ASSET', a.id,
    CASE WHEN EXISTS (
        SELECT 1 FROM configuration_items ci
        WHERE ci.id = a.id AND (ci.details->>'legacyRecordType' = 'BANK_ASSET' OR ci.ci_number = 'LA-' || left(a.tag, 48) || '-' || substr(md5(a.id), 1, 8))
    ) THEN a.id ELSE 'ci-legacy-' || substr(md5('BANK_ASSET:' || a.id), 1, 32) END,
    a.tag
FROM bank_assets a
WHERE EXISTS (
    SELECT 1 FROM configuration_items ci
    WHERE ci.id = CASE WHEN EXISTS (
        SELECT 1 FROM configuration_items occupied
        WHERE occupied.id = a.id AND NOT (occupied.details->>'legacyRecordType' = 'BANK_ASSET' OR occupied.ci_number = 'LA-' || left(a.tag, 48) || '-' || substr(md5(a.id), 1, 8))
    ) THEN 'ci-legacy-' || substr(md5('BANK_ASSET:' || a.id), 1, 32) ELSE a.id END
)
ON CONFLICT (legacy_record_type, legacy_record_id) DO NOTHING;

INSERT INTO configuration_items(
    id, ci_number, asset_key, name, display_name, type_id, status,
    lifecycle_status, lifecycle_state, technical_status, environment,
    criticality, business_criticality, technical_owner_user_id,
    business_owner_user_id, department_id, source, discovery_status, details,
    version, first_seen_at, last_seen_at, created_at, updated_at, created_by, updated_by
)
SELECT
    CASE WHEN ci.id IS NULL THEN a.id ELSE 'ci-legacy-' || substr(md5('BANK_APPLICATION:' || a.id), 1, 32) END,
    'LAPP-' || left(a.code, 45) || '-' || substr(md5(a.id), 1, 8),
    'LEGACY-APP-' || a.code,
    a.name,
    a.name,
    'application', 'ACTIVE', 'IN_USE', 'ACTIVE', 'UNKNOWN', 'UNKNOWN',
    CASE WHEN upper(a.tier) IN ('TIER_0','TIER_1') THEN 'CRITICAL' WHEN upper(a.tier) = 'TIER_2' THEN 'HIGH' ELSE 'MEDIUM' END,
    CASE WHEN upper(a.tier) IN ('TIER_0','TIER_1') THEN 'CRITICAL' WHEN upper(a.tier) = 'TIER_2' THEN 'HIGH' ELSE 'MEDIUM' END,
    a.technical_owner_id, a.business_owner_id, a.department_id,
    'IMPORT', 'NOT_DISCOVERED',
    jsonb_build_object(
        'legacyRecordType', 'BANK_APPLICATION',
        'applicationCode', a.code,
        'tier', a.tier,
        'architectureType', a.architecture_type,
        'repositoryUrl', a.repository_url,
        'activeCveCount', a.active_cve_count
    ),
    1, a.created_at, COALESCE(a.updated_at, a.created_at), a.created_at, a.updated_at, NULL, NULL
FROM bank_applications a
LEFT JOIN configuration_items ci ON ci.id = a.id
WHERE NOT EXISTS (
    SELECT 1 FROM cmdb_legacy_asset_map m
    WHERE m.legacy_record_type = 'BANK_APPLICATION' AND m.legacy_record_id = a.id
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO cmdb_legacy_asset_map(legacy_record_type, legacy_record_id, asset_id, legacy_key)
SELECT
    'BANK_APPLICATION', a.id,
    CASE WHEN EXISTS (
        SELECT 1 FROM configuration_items ci
        WHERE ci.id = a.id AND (ci.details->>'legacyRecordType' = 'BANK_APPLICATION' OR ci.ci_number = 'LAPP-' || left(a.code, 45) || '-' || substr(md5(a.id), 1, 8))
    ) THEN a.id ELSE 'ci-legacy-' || substr(md5('BANK_APPLICATION:' || a.id), 1, 32) END,
    a.code
FROM bank_applications a
WHERE EXISTS (
    SELECT 1 FROM configuration_items ci
    WHERE ci.id = CASE WHEN EXISTS (
        SELECT 1 FROM configuration_items occupied
        WHERE occupied.id = a.id AND NOT (occupied.details->>'legacyRecordType' = 'BANK_APPLICATION' OR occupied.ci_number = 'LAPP-' || left(a.code, 45) || '-' || substr(md5(a.id), 1, 8))
    ) THEN 'ci-legacy-' || substr(md5('BANK_APPLICATION:' || a.id), 1, 32) ELSE a.id END
)
ON CONFLICT (legacy_record_type, legacy_record_id) DO NOTHING;

-- Existing canonical CIs are also their own compatibility mapping when they
-- share an ID with a legacy record.
INSERT INTO cmdb_legacy_asset_map(legacy_record_type, legacy_record_id, asset_id, legacy_key)
SELECT 'BANK_ASSET', a.id, ci.id, a.tag
FROM bank_assets a JOIN configuration_items ci ON ci.id = a.id
ON CONFLICT (legacy_record_type, legacy_record_id) DO NOTHING;

INSERT INTO cmdb_legacy_asset_map(legacy_record_type, legacy_record_id, asset_id, legacy_key)
SELECT 'BANK_APPLICATION', a.id, ci.id, a.code
FROM bank_applications a JOIN configuration_items ci ON ci.id = a.id
ON CONFLICT (legacy_record_type, legacy_record_id) DO NOTHING;

-- Normalized identifiers for pre-existing canonical and migrated records.
INSERT INTO cmdb_asset_identifiers(
    id, asset_id, identifier_type_id, namespace, value, normalized_value,
    source, confidence, is_primary, first_seen_at, last_seen_at
)
SELECT 'aid-' || substr(md5(ci.id || ':HOSTNAME:' || lower(ci.hostname)), 1, 32), ci.id,
       'HOSTNAME', 'GLOBAL', ci.hostname, lower(btrim(ci.hostname)), 'MIGRATION', 70, TRUE,
       ci.first_seen_at, COALESCE(ci.last_seen_at, ci.updated_at)
FROM configuration_items ci
WHERE ci.hostname IS NOT NULL AND btrim(ci.hostname) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO cmdb_asset_identifiers(
    id, asset_id, identifier_type_id, namespace, value, normalized_value,
    source, confidence, is_primary, first_seen_at, last_seen_at
)
SELECT 'aid-' || substr(md5(ci.id || ':FQDN:' || lower(ci.fqdn)), 1, 32), ci.id,
       'FQDN', 'DNS', ci.fqdn, lower(trim(trailing '.' from btrim(ci.fqdn))), 'MIGRATION', 80, TRUE,
       ci.first_seen_at, COALESCE(ci.last_seen_at, ci.updated_at)
FROM configuration_items ci
WHERE ci.fqdn IS NOT NULL AND btrim(ci.fqdn) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO cmdb_asset_identifiers(
    id, asset_id, identifier_type_id, namespace, value, normalized_value,
    source, confidence, is_primary, first_seen_at, last_seen_at
)
SELECT 'aid-' || substr(md5(ci.id || ':SERIAL:' || lower(ci.serial_number)), 1, 32), ci.id,
       'SERIAL_NUMBER', COALESCE(NULLIF(lower(ci.manufacturer), ''), 'GLOBAL'),
       ci.serial_number, lower(btrim(ci.serial_number)), 'MIGRATION', 90, TRUE,
       ci.first_seen_at, COALESCE(ci.last_seen_at, ci.updated_at)
FROM configuration_items ci
WHERE ci.serial_number IS NOT NULL AND btrim(ci.serial_number) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO cmdb_asset_identifiers(
    id, asset_id, identifier_type_id, namespace, value, normalized_value,
    source, confidence, is_primary, first_seen_at, last_seen_at
)
SELECT 'aid-' || substr(md5(ci.id || ':ASSET_TAG:' || lower(ci.asset_tag)), 1, 32), ci.id,
       'OTHER', 'ASSET_TAG', ci.asset_tag, lower(btrim(ci.asset_tag)), 'MIGRATION', 95, TRUE,
       ci.first_seen_at, COALESCE(ci.last_seen_at, ci.updated_at)
FROM configuration_items ci
WHERE ci.asset_tag IS NOT NULL AND btrim(ci.asset_tag) <> ''
ON CONFLICT DO NOTHING;

-- Backfill ticket links without changing the legacy FK columns yet. Those
-- columns continue to support the current runtime while ci_record_links is the
-- canonical, many-to-many relation used by the CMDB.
INSERT INTO ci_record_links(id, ci_id, record_type, record_id, relationship, created_at, created_by, source_payload)
SELECT 'cil-' || substr(md5('TICKET:ASSET:' || t.id || ':' || m.asset_id), 1, 32),
       m.asset_id, 'TICKET', t.id, 'AFFECTED_BY', COALESCE(t.created_at, NOW()), t.reporter_id,
       jsonb_build_object('migration', '009_cmdb_discovery_foundation', 'legacyColumn', 'asset_id')
FROM tickets t
JOIN cmdb_legacy_asset_map m ON m.legacy_record_type = 'BANK_ASSET' AND m.legacy_record_id = t.asset_id
WHERE t.asset_id IS NOT NULL
ON CONFLICT (ci_id, record_type, record_id, relationship) DO NOTHING;

INSERT INTO ci_record_links(id, ci_id, record_type, record_id, relationship, created_at, created_by, source_payload)
SELECT 'cil-' || substr(md5('TICKET:APPLICATION:' || t.id || ':' || m.asset_id), 1, 32),
       m.asset_id, 'TICKET', t.id, 'AFFECTED_BY', COALESCE(t.created_at, NOW()), t.reporter_id,
       jsonb_build_object('migration', '009_cmdb_discovery_foundation', 'legacyColumn', 'application_id')
FROM tickets t
JOIN cmdb_legacy_asset_map m ON m.legacy_record_type = 'BANK_APPLICATION' AND m.legacy_record_id = t.application_id
WHERE t.application_id IS NOT NULL
ON CONFLICT (ci_id, record_type, record_id, relationship) DO NOTHING;

-- Risk and project references are JSON compatibility fields in the existing
-- modules. Materialize the resolvable references while leaving their source
-- representation untouched for rollback and current application behavior.
INSERT INTO ci_record_links(id, ci_id, record_type, record_id, relationship, created_at, source_payload)
SELECT 'cil-' || substr(md5('RISK:ASSET:' || r.id || ':' || m.asset_id), 1, 32),
       m.asset_id, 'RISK', r.id, 'AFFECTED_BY', COALESCE(r.created_at, NOW()),
       jsonb_build_object('migration', '009_cmdb_discovery_foundation', 'legacyField', 'affectedAssetIds')
FROM risk_register_items r
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(r.source_payload->'affectedAssetIds', '[]'::jsonb)) ref(id)
JOIN cmdb_legacy_asset_map m ON m.legacy_record_type = 'BANK_ASSET' AND m.legacy_record_id = ref.id
ON CONFLICT (ci_id, record_type, record_id, relationship) DO NOTHING;

INSERT INTO ci_record_links(id, ci_id, record_type, record_id, relationship, created_at, source_payload)
SELECT 'cil-' || substr(md5('RISK:APPLICATION:' || r.id || ':' || m.asset_id), 1, 32),
       m.asset_id, 'RISK', r.id, 'AFFECTED_BY', COALESCE(r.created_at, NOW()),
       jsonb_build_object('migration', '009_cmdb_discovery_foundation', 'legacyField', 'affectedApplicationIds')
FROM risk_register_items r
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(r.source_payload->'affectedApplicationIds', '[]'::jsonb)) ref(id)
JOIN cmdb_legacy_asset_map m ON m.legacy_record_type = 'BANK_APPLICATION' AND m.legacy_record_id = ref.id
ON CONFLICT (ci_id, record_type, record_id, relationship) DO NOTHING;

INSERT INTO ci_record_links(id, ci_id, record_type, record_id, relationship, created_at, source_payload)
SELECT 'cil-' || substr(md5('PROJECT:' || p.record_id || ':' || ci.id), 1, 32),
       ci.id, 'PROJECT', p.record_id, 'RELATED_TO', NOW(),
       jsonb_build_object('migration', '009_cmdb_discovery_foundation', 'legacyField', 'relatedAssetIds')
FROM legacy_json_records p
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(p.payload->'relatedAssetIds', '[]'::jsonb)) ref(id)
JOIN configuration_items ci ON ci.id = ref.id
WHERE p.collection = 'projects'
ON CONFLICT (ci_id, record_type, record_id, relationship) DO NOTHING;

-- Record unresolved references instead of dropping or nulling them. This is
-- especially important for threat models, whose existing asset/service fields
-- are strings without foreign keys.
CREATE TABLE IF NOT EXISTS cmdb_unresolved_legacy_references (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_table VARCHAR(128) NOT NULL,
    source_record_id VARCHAR(128) NOT NULL,
    source_field VARCHAR(128) NOT NULL,
    referenced_value VARCHAR(512) NOT NULL,
    expected_record_type VARCHAR(64) NOT NULL,
    reason VARCHAR(128) NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_asset_id VARCHAR(64) REFERENCES configuration_items(id) ON DELETE RESTRICT,
    resolved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_unresolved_legacy_reference
    ON cmdb_unresolved_legacy_references(source_table, source_record_id, source_field, referenced_value)
    WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_unresolved_reference_value
    ON cmdb_unresolved_legacy_references(referenced_value, expected_record_type)
    WHERE resolved_at IS NULL;

DO $$
BEGIN
    IF to_regclass('public.threat_models') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO cmdb_unresolved_legacy_references(
                source_table, source_record_id, source_field, referenced_value,
                expected_record_type, reason
            )
            SELECT 'threat_models', tm.id, refs.field_name, refs.reference_value,
                   CASE WHEN refs.field_name = 'service_id' THEN 'BUSINESS_SERVICE' ELSE 'ASSET' END,
                   'NO_CANONICAL_CONFIGURATION_ITEM'
            FROM threat_models tm
            CROSS JOIN LATERAL (VALUES
                ('asset_id', tm.asset_id),
                ('service_id', tm.service_id)
            ) refs(field_name, reference_value)
            WHERE refs.reference_value IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM configuration_items ci WHERE ci.id = refs.reference_value)
            ON CONFLICT DO NOTHING
        $sql$;
    END IF;
END;
$$;

-- Compatibility record types are widened at the TypeScript/domain layer; the
-- existing table intentionally has no restrictive CHECK to rewrite.
CREATE INDEX IF NOT EXISTS idx_ci_record_links_ci_type
    ON ci_record_links(ci_id, record_type, record_id);
