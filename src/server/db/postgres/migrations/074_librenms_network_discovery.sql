INSERT INTO cmdb_discovery_connector_types(id,display_name)
VALUES ('LIBRENMS','LibreNMS network inventory') ON CONFLICT (id) DO NOTHING;

INSERT INTO cmdb_source_precedence_rules(id,attribute_path,source_kind,connector_type_id,precedence,allow_override_manual)
VALUES
 ('precedence-librenms-network-name','identity.name','DISCOVERY','LIBRENMS',720,FALSE),
 ('precedence-librenms-network-os','operatingSystem.reported','DISCOVERY','LIBRENMS',720,FALSE),
 ('precedence-librenms-network-model','hardware.model','DISCOVERY','LIBRENMS',720,FALSE)
ON CONFLICT (id) DO NOTHING;
