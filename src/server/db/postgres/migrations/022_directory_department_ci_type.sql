-- Department objects are an additive extension to the immutable AD discovery migration.
INSERT INTO cmdb_ci_types(id, name, parent_type_id, icon, is_active, required_attributes, optional_attributes, validation_rules, allowed_relationship_type_ids)
VALUES ('directory_department', 'Directory Department', 'identity', 'Building2', TRUE, '["name","environment"]', '[]', '{}', '[]')
ON CONFLICT (id) DO NOTHING;
