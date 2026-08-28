-- Extend the applied vCenter foundation without rewriting migration 013.
-- These fields remain connector-scoped and contain no credentials or sessions.

ALTER TABLE cmdb_discovery_connectors
    ADD COLUMN IF NOT EXISTS configuration_status VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN IF NOT EXISTS connection_status VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN IF NOT EXISTS discovery_status VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN IF NOT EXISTS last_connection_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_auth_success_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retry_attempt INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

ALTER TABLE cmdb_discovery_connectors DROP CONSTRAINT IF EXISTS cmdb_discovery_connector_operational_state_check;
ALTER TABLE cmdb_discovery_connectors ADD CONSTRAINT cmdb_discovery_connector_operational_state_check
    CHECK (operational_state IN ('DISABLED','IDLE','CONNECTING','AUTHENTICATING','CONNECTED','READY','DEGRADED','SYNCING','RECONCILING','AUTH_FAILED','TLS_FAILED','DNS_FAILED','NETWORK_FAILED','PERMISSION_DENIED','UNSUPPORTED_VERSION','CONFIG_INVALID'));
ALTER TABLE cmdb_discovery_connectors DROP CONSTRAINT IF EXISTS cmdb_discovery_connector_configuration_status_check;
ALTER TABLE cmdb_discovery_connectors ADD CONSTRAINT cmdb_discovery_connector_configuration_status_check
    CHECK (configuration_status IN ('UNKNOWN','VALID','INVALID'));
ALTER TABLE cmdb_discovery_connectors DROP CONSTRAINT IF EXISTS cmdb_discovery_connector_connection_status_check;
ALTER TABLE cmdb_discovery_connectors ADD CONSTRAINT cmdb_discovery_connector_connection_status_check
    CHECK (connection_status IN ('UNKNOWN','CONNECTING','AUTHENTICATING','CONNECTED','AUTH_FAILED','TLS_FAILED','DNS_FAILED','NETWORK_FAILED','PERMISSION_DENIED','UNSUPPORTED_VERSION'));
ALTER TABLE cmdb_discovery_connectors DROP CONSTRAINT IF EXISTS cmdb_discovery_connector_discovery_status_check;
ALTER TABLE cmdb_discovery_connectors ADD CONSTRAINT cmdb_discovery_connector_discovery_status_check
    CHECK (discovery_status IN ('UNKNOWN','READY','SYNCING','RECONCILING','DEGRADED','FAILED'));
ALTER TABLE cmdb_discovery_connectors DROP CONSTRAINT IF EXISTS cmdb_discovery_connector_retry_attempt_check;
ALTER TABLE cmdb_discovery_connectors ADD CONSTRAINT cmdb_discovery_connector_retry_attempt_check
    CHECK (retry_attempt >= 0);

ALTER TABLE cmdb_vcenter_connector_profiles
    ADD COLUMN IF NOT EXISTS response_size_limit_bytes INTEGER NOT NULL DEFAULT 4194304,
    ADD COLUMN IF NOT EXISTS access_mode VARCHAR(16) NOT NULL DEFAULT 'READ_ONLY',
    ADD COLUMN IF NOT EXISTS certificate_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE cmdb_vcenter_connector_profiles DROP CONSTRAINT IF EXISTS cmdb_vcenter_profile_response_size_limit_check;
ALTER TABLE cmdb_vcenter_connector_profiles ADD CONSTRAINT cmdb_vcenter_profile_response_size_limit_check
    CHECK (response_size_limit_bytes BETWEEN 65536 AND 268435456);
ALTER TABLE cmdb_vcenter_connector_profiles DROP CONSTRAINT IF EXISTS cmdb_vcenter_profile_access_mode_check;
ALTER TABLE cmdb_vcenter_connector_profiles ADD CONSTRAINT cmdb_vcenter_profile_access_mode_check
    CHECK (access_mode = 'READ_ONLY');
ALTER TABLE cmdb_vcenter_connector_profiles DROP CONSTRAINT IF EXISTS cmdb_vcenter_profile_certificate_metadata_check;
ALTER TABLE cmdb_vcenter_connector_profiles ADD CONSTRAINT cmdb_vcenter_profile_certificate_metadata_check
    CHECK (jsonb_typeof(certificate_metadata) = 'object' AND NOT cmdb_jsonb_contains_secret_key(certificate_metadata));

ALTER TABLE cmdb_discovery_connectors DROP CONSTRAINT IF EXISTS cmdb_discovery_connector_capabilities_check;
ALTER TABLE cmdb_discovery_connectors ADD CONSTRAINT cmdb_discovery_connector_capabilities_check
    CHECK (jsonb_typeof(capabilities_json) = 'object' AND NOT cmdb_jsonb_contains_secret_key(capabilities_json));

CREATE TABLE IF NOT EXISTS cmdb_vcenter_sync_state (
    connector_id VARCHAR(64) PRIMARY KEY REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    baseline_generation BIGINT NOT NULL DEFAULT 0 CHECK (baseline_generation >= 0),
    incremental_version TEXT,
    filter_generation BIGINT NOT NULL DEFAULT 0 CHECK (filter_generation >= 0),
    last_full_sync_at TIMESTAMPTZ,
    last_reconcile_at TIMESTAMPTZ,
    last_incremental_update_at TIMESTAMPTZ,
    state VARCHAR(24) NOT NULL DEFAULT 'UNINITIALIZED' CHECK (state IN ('UNINITIALIZED','READY','SYNCING','RECONCILING','DEGRADED')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object' AND NOT cmdb_jsonb_contains_secret_key(metadata)),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cmdb_vcenter_sync_state(connector_id)
SELECT id FROM cmdb_discovery_connectors WHERE connector_type_id='VCENTER' AND deleted_at IS NULL
ON CONFLICT (connector_id) DO NOTHING;

UPDATE cmdb_discovery_connectors
SET operational_state = CASE WHEN enabled THEN 'IDLE' ELSE 'DISABLED' END
WHERE operational_state = 'IDLE';
