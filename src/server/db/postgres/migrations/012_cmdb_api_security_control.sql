-- CMDB API, security and control-plane support.
-- This migration contains no connector implementation or external network I/O.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE cmdb_discovery_connectors
    ADD COLUMN IF NOT EXISTS tls_verify_certificates BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS request_timeout_ms INTEGER NOT NULL DEFAULT 30000,
    ADD COLUMN IF NOT EXISTS endpoint_allow_private_network BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS updated_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE cmdb_discovery_connectors DROP CONSTRAINT IF EXISTS cmdb_discovery_connector_timeout_check;
ALTER TABLE cmdb_discovery_connectors ADD CONSTRAINT cmdb_discovery_connector_timeout_check
    CHECK (request_timeout_ms BETWEEN 1000 AND 120000);
ALTER TABLE cmdb_discovery_connectors DROP CONSTRAINT IF EXISTS cmdb_discovery_connector_version_check;
ALTER TABLE cmdb_discovery_connectors ADD CONSTRAINT cmdb_discovery_connector_version_check
    CHECK (version > 0);

CREATE TABLE IF NOT EXISTS cmdb_correlation_overrides (
    source_record_id VARCHAR(64) PRIMARY KEY REFERENCES cmdb_source_records(id) ON DELETE RESTRICT,
    asset_id VARCHAR(64) REFERENCES configuration_items(id) ON DELETE RESTRICT,
    resolution_action VARCHAR(32) NOT NULL CHECK (resolution_action IN ('MATCH_EXISTING','CREATE_NEW','DISMISS')),
    resolution_note TEXT NOT NULL DEFAULT '',
    decided_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    CHECK ((resolution_action IN ('MATCH_EXISTING','CREATE_NEW')) = (asset_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_cmdb_correlation_override_asset
    ON cmdb_correlation_overrides(asset_id) WHERE active AND asset_id IS NOT NULL;

-- Bounded asset search uses these indexes through exact/prefix filters and
-- trigram matching. Relationship/source joins retain their existing FK indexes.
CREATE INDEX IF NOT EXISTS idx_cmdb_ci_name_trgm
    ON configuration_items USING GIN (lower(name) gin_trgm_ops) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_ci_hostname_trgm
    ON configuration_items USING GIN (lower(hostname) gin_trgm_ops) WHERE hostname IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_ci_fqdn_trgm
    ON configuration_items USING GIN (lower(fqdn) gin_trgm_ops) WHERE fqdn IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_ci_serial_trgm
    ON configuration_items USING GIN (lower(serial_number) gin_trgm_ops) WHERE serial_number IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_source_external_object_search
    ON cmdb_source_records(lower(external_object_id), asset_id);
CREATE INDEX IF NOT EXISTS idx_cmdb_source_asset_status
    ON cmdb_source_records(asset_id, status, last_seen_at DESC) WHERE asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_asset_changes_page
    ON cmdb_asset_changes(asset_id, detected_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_cmdb_network_interface_page
    ON cmdb_network_interfaces(asset_id, last_seen_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_cmdb_ip_asset_page
    ON cmdb_ip_addresses(asset_id, last_seen_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_cmdb_storage_asset_page
    ON cmdb_storage_devices(asset_id, last_seen_at DESC, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_sync_run_request_correlation
    ON cmdb_discovery_sync_runs(connector_id, correlation_id)
    WHERE correlation_id IS NOT NULL;
