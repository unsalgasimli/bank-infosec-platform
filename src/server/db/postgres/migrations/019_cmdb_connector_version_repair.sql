-- Repair optimistic-concurrency support for databases that recorded the
-- original API-control migration before this column was present in their base
-- schema. Enablement and updates increment this version on every mutation.
ALTER TABLE cmdb_discovery_connectors
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE cmdb_discovery_connectors
    DROP CONSTRAINT IF EXISTS cmdb_discovery_connector_version_check;

ALTER TABLE cmdb_discovery_connectors
    ADD CONSTRAINT cmdb_discovery_connector_version_check CHECK (version > 0);
