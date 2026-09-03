-- Repair the initial catalog normalization without rewriting migration 028.
-- The catalog is derived from canonical/source evidence and has no operator
-- maintained values, so rebuilding it removes duplicate whitespace variants.

TRUNCATE TABLE cmdb_operating_systems;

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
           LOWER(REGEXP_REPLACE(BTRIM(name), '\s+', ' ', 'g')) AS normalized_name
      FROM observed
     WHERE name IS NOT NULL
     GROUP BY LOWER(REGEXP_REPLACE(BTRIM(name), '\s+', ' ', 'g'))
)
INSERT INTO cmdb_operating_systems (id, name, normalized_name)
SELECT 'cmdb-os-' || MD5(normalized_name), name, normalized_name
  FROM normalized
ON CONFLICT (normalized_name) DO UPDATE SET
    last_seen_at = NOW(),
    updated_at = NOW(),
    is_active = TRUE;
