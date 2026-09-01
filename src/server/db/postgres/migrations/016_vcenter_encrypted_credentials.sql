-- vCenter service credentials are application-encrypted. Session tokens are
-- deliberately absent: they are process/Redis cache material only.
CREATE TABLE IF NOT EXISTS cmdb_vcenter_credentials (
    connector_id VARCHAR(64) PRIMARY KEY REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    credential_ciphertext TEXT NOT NULL CHECK (btrim(credential_ciphertext) <> ''),
    credential_iv VARCHAR(64) NOT NULL CHECK (btrim(credential_iv) <> ''),
    credential_auth_tag VARCHAR(64) NOT NULL CHECK (btrim(credential_auth_tag) <> ''),
    credential_key_version VARCHAR(64) NOT NULL DEFAULT 'v1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cmdb_vcenter_credentials IS
  'Application-encrypted vCenter service credentials. Never stores REST session IDs.';
