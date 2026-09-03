-- Read-only SMB printer-share discovery. Printer shares are source evidence;
-- canonical assets continue to be created only by DiscoveryIngestionService.
INSERT INTO cmdb_discovery_connector_types(id, display_name)
VALUES ('SMB_PRINTER', 'SMB printer shares') ON CONFLICT (id) DO NOTHING;

INSERT INTO cmdb_ci_types(id, name, parent_type_id, icon, is_active, required_attributes, optional_attributes, validation_rules, allowed_relationship_type_ids)
VALUES ('printer', 'Network Printer', 'infrastructure', 'Printer', TRUE, '["name","environment"]', '["locationId","departmentId","manufacturer","model"]', '{}', '[]')
ON CONFLICT (id) DO NOTHING;

INSERT INTO cmdb_source_precedence_rules(id,attribute_path,source_kind,connector_type_id,precedence,allow_override_manual)
VALUES ('precedence-smb-printer-name','identity.name','DISCOVERY','SMB_PRINTER',700,FALSE)
ON CONFLICT (id) DO NOTHING;
