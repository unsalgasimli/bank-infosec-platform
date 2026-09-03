-- Operator-managed CMDB columns and per-asset values.
-- Definitions are soft-deleted so historical values and audit references remain
-- recoverable; values are kept outside configuration_items so discovery cannot
-- overwrite manually maintained ownership metadata.

CREATE TABLE IF NOT EXISTS cmdb_custom_field_definitions (
    id VARCHAR(64) PRIMARY KEY,
    field_key VARCHAR(64) NOT NULL,
    label VARCHAR(128) NOT NULL,
    data_type VARCHAR(24) NOT NULL CHECK (data_type IN ('TEXT','NUMBER','BOOLEAN','DATE','SELECT','MULTI_SELECT','USER')),
    options JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
    description VARCHAR(1000) NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    updated_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (field_key)
);

CREATE INDEX IF NOT EXISTS idx_cmdb_custom_field_definitions_active
    ON cmdb_custom_field_definitions(is_active, display_order, label)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS cmdb_custom_field_values (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    field_id VARCHAR(64) NOT NULL REFERENCES cmdb_custom_field_definitions(id) ON DELETE RESTRICT,
    value JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    updated_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (asset_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_cmdb_custom_field_values_asset
    ON cmdb_custom_field_values(asset_id, field_id);
