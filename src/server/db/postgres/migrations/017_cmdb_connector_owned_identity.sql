ALTER TABLE cmdb_discovery_connectors
    ALTER COLUMN connection_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

UPDATE cmdb_discovery_connectors c
SET name = COALESCE(NULLIF(c.name, ''), dc.name),
    description = COALESCE(c.description, dc.description, '')
FROM department_connections dc
WHERE dc.id = c.connection_id AND c.name IS NULL;

UPDATE cmdb_discovery_connectors
SET name = CONCAT('CMDB connector ', id)
WHERE name IS NULL OR btrim(name) = '';

ALTER TABLE cmdb_discovery_connectors
    ALTER COLUMN name SET NOT NULL;
