-- CMDB multi-source component identity
--
-- Network interfaces and storage devices are normalized observations owned by
-- a stable source record. Different connectors (or different source objects
-- correlated to one canonical asset) may legitimately reuse native keys such
-- as "nic-0" or "disk-0". Scope those keys to their source record while
-- retaining the asset in the key for efficient integrity checks and lookups.

DROP INDEX IF EXISTS uq_cmdb_network_interface_key;
CREATE UNIQUE INDEX uq_cmdb_network_interface_key
    ON cmdb_network_interfaces(asset_id, COALESCE(source_record_id, ''), interface_key)
    WHERE retired_at IS NULL;

DROP INDEX IF EXISTS uq_cmdb_storage_device_key;
CREATE UNIQUE INDEX uq_cmdb_storage_device_key
    ON cmdb_storage_devices(asset_id, COALESCE(source_record_id, ''), device_key)
    WHERE retired_at IS NULL;

