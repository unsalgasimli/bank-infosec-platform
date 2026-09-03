-- Make Environment an operator-editable CMDB field and keep a database-backed
-- catalog of every OS value already observed by the canonical inventory.

ALTER TABLE cmdb_custom_field_definitions
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS cmdb_operating_systems (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cmdb_operating_systems_active
    ON cmdb_operating_systems(is_active, normalized_name);

INSERT INTO cmdb_custom_field_definitions
    (id, field_key, label, data_type, options, description, display_order,
     is_active, is_system, created_at, updated_at)
VALUES
    ('cmdb-system-environment', 'environment', 'Environment', 'SELECT',
     '["PRODUCTION","DR","UAT","STAGING","TEST","DEV","UNKNOWN"]'::jsonb,
     'Operator-maintained environment override for this asset.', 0, TRUE, TRUE,
     NOW(), NOW())
ON CONFLICT (field_key) DO UPDATE SET
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    options = EXCLUDED.options,
    description = EXCLUDED.description,
    is_active = TRUE,
    is_system = TRUE,
    updated_at = NOW();

WITH observed(name) AS (
    SELECT NULLIF(BTRIM(operating_system), '') FROM configuration_items
    UNION ALL
    SELECT NULLIF(BTRIM(os_version), '') FROM configuration_items
    UNION ALL
    SELECT NULLIF(BTRIM(normalized_payload #>> '{operatingSystem,reported}'), '')
      FROM cmdb_source_records
    UNION ALL
    SELECT NULLIF(BTRIM(normalized_payload #>> '{operatingSystem,configured}'), '')
      FROM cmdb_source_records
    UNION ALL
    SELECT NULLIF(BTRIM(normalized_payload #>> '{operatingSystem,name}'), '')
      FROM cmdb_source_records
), normalized AS (
    SELECT MIN(name) AS name,
           LOWER(REGEXP_REPLACE(BTRIM(name), '\\s+', ' ', 'g')) AS normalized_name
      FROM observed
     WHERE name IS NOT NULL
     GROUP BY LOWER(REGEXP_REPLACE(BTRIM(name), '\\s+', ' ', 'g'))
)
INSERT INTO cmdb_operating_systems (id, name, normalized_name)
SELECT 'cmdb-os-' || MD5(normalized_name), name, normalized_name
  FROM normalized
ON CONFLICT (normalized_name) DO UPDATE SET
    last_seen_at = NOW(),
    updated_at = NOW(),
    is_active = TRUE;
