-- Repair the connector mutation actor column for databases that recorded the
-- original API-control migration before this column was present in their base
-- schema. Connector create/update operations must retain an auditable actor.
ALTER TABLE cmdb_discovery_connectors
    ADD COLUMN IF NOT EXISTS updated_by_user_id VARCHAR(64)
        REFERENCES bank_users(id) ON DELETE SET NULL;
