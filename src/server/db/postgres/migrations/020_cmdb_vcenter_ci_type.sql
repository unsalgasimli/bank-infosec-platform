-- A vCenter server is a first-class infrastructure CI, while its connector
-- remains the source configuration and encrypted credential boundary.
INSERT INTO cmdb_ci_types(id, name, parent_type_id, icon, is_active, required_attributes, optional_attributes, validation_rules, allowed_relationship_type_ids)
VALUES ('vcenter', 'VMware vCenter Server', 'infrastructure', 'ServerCog', TRUE, '["name","environment"]', '["fqdn","version"]', '{}', '[]')
ON CONFLICT (id) DO NOTHING;
