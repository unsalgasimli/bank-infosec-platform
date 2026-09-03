-- A deleted connector retains its profile for audit/history, but must not
-- reserve a vCenter target forever. Only live connector profiles are unique.
ALTER TABLE cmdb_vcenter_connector_profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE cmdb_vcenter_connector_profiles profile
SET deleted_at = connector.deleted_at
FROM cmdb_discovery_connectors connector
WHERE connector.id = profile.connector_id
  AND connector.deleted_at IS NOT NULL
  AND profile.deleted_at IS NULL;

DROP INDEX IF EXISTS uq_cmdb_vcenter_profile_target;

CREATE UNIQUE INDEX uq_cmdb_vcenter_profile_live_target
  ON cmdb_vcenter_connector_profiles(lower(endpoint_fqdn), port)
  WHERE deleted_at IS NULL;
