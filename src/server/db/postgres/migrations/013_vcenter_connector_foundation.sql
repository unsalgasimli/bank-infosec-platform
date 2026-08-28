-- VMware vCenter multi-connector foundation.
--
-- This migration adds only connection metadata, capability state and runtime
-- ownership boundaries. It intentionally does not discover inventory or store
-- SOAP/REST session material.

ALTER TABLE cmdb_discovery_connectors
    ADD COLUMN IF NOT EXISTS operational_state VARCHAR(24) NOT NULL DEFAULT 'IDLE',
    ADD COLUMN IF NOT EXISTS last_connection_test_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_successful_connection_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS detected_product VARCHAR(255),
    ADD COLUMN IF NOT EXISTS detected_version VARCHAR(128),
    ADD COLUMN IF NOT EXISTS detected_build VARCHAR(128),
    ADD COLUMN IF NOT EXISTS detected_api_version VARCHAR(128),
    ADD COLUMN IF NOT EXISTS detected_instance_uuid VARCHAR(255),
    ADD COLUMN IF NOT EXISTS capabilities_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS last_full_sync_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_incremental_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_reconciliation_at TIMESTAMPTZ;

ALTER TABLE cmdb_discovery_connectors DROP CONSTRAINT IF EXISTS cmdb_discovery_connector_operational_state_check;
ALTER TABLE cmdb_discovery_connectors ADD CONSTRAINT cmdb_discovery_connector_operational_state_check
    CHECK (operational_state IN ('DISABLED','IDLE','CONNECTING','READY','DEGRADED','FAILED','SYNCING'));
ALTER TABLE cmdb_discovery_connectors DROP CONSTRAINT IF EXISTS cmdb_discovery_connector_capabilities_check;
ALTER TABLE cmdb_discovery_connectors ADD CONSTRAINT cmdb_discovery_connector_capabilities_check
    CHECK (jsonb_typeof(capabilities_json) = 'object' AND NOT cmdb_jsonb_contains_secret_key(capabilities_json));

CREATE TABLE IF NOT EXISTS cmdb_vcenter_connector_profiles (
    connector_id VARCHAR(64) PRIMARY KEY REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    endpoint_fqdn VARCHAR(255) NOT NULL CHECK (btrim(endpoint_fqdn) <> ''),
    port INTEGER NOT NULL DEFAULT 443 CHECK (port BETWEEN 1 AND 65535),
    soap_endpoint_path VARCHAR(255) NOT NULL DEFAULT '/sdk' CHECK (left(soap_endpoint_path, 1) = '/'),
    automation_api_base_path VARCHAR(255) NOT NULL DEFAULT '/api' CHECK (left(automation_api_base_path, 1) = '/'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cmdb_vcenter_connector_profiles_endpoint
    ON cmdb_vcenter_connector_profiles(lower(endpoint_fqdn), port);

-- A source identity is always connector-scoped. cmdb_source_records already
-- enforces this for discovered objects; this index makes the intended lookup
-- explicit and efficient for MoRefs, tags, categories and future object kinds.
CREATE INDEX IF NOT EXISTS idx_cmdb_source_records_connector_object
    ON cmdb_source_records(connector_id, external_object_type, external_object_id);

UPDATE cmdb_discovery_connectors
SET operational_state = CASE WHEN enabled THEN 'IDLE' ELSE 'DISABLED' END
WHERE operational_state IS NULL;
