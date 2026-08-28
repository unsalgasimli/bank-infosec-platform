-- vCenter identity, duplicate-target and tag/category namespace controls.
-- No external calls or automatic connector merges are performed here.

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_vcenter_profile_target
    ON cmdb_vcenter_connector_profiles(lower(endpoint_fqdn), port);

CREATE TABLE IF NOT EXISTS cmdb_vcenter_category_sources (
    connector_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    category_id VARCHAR(255) NOT NULL CHECK (btrim(category_id) <> ''),
    name VARCHAR(512),
    description TEXT,
    cardinality VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (connector_id, category_id)
);

CREATE TABLE IF NOT EXISTS cmdb_vcenter_tag_sources (
    connector_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    tag_id VARCHAR(255) NOT NULL CHECK (btrim(tag_id) <> ''),
    category_id VARCHAR(255),
    name VARCHAR(512),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (connector_id, tag_id),
    CONSTRAINT fk_cmdb_vcenter_tag_category_namespace
      FOREIGN KEY (connector_id, category_id)
      REFERENCES cmdb_vcenter_category_sources(connector_id, category_id)
      ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_cmdb_vcenter_tag_category
    ON cmdb_vcenter_tag_sources(connector_id, category_id);

COMMENT ON TABLE cmdb_vcenter_category_sources IS
  'VMware category IDs are connector-scoped; equal IDs across vCenters are unrelated.';
COMMENT ON TABLE cmdb_vcenter_tag_sources IS
  'VMware tag IDs are connector-scoped; equal IDs across vCenters are unrelated.';
