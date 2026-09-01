-- Active Directory is a source of identity and endpoint evidence.  These CI
-- types deliberately remain separate from employee-directory projections.
INSERT INTO cmdb_ci_types(id, name, parent_type_id, icon, is_active, required_attributes, optional_attributes, validation_rules, allowed_relationship_type_ids)
VALUES
  ('identity', 'Identity', NULL, 'UserRound', TRUE, '["name","environment"]', '[]', '{}', '[]'),
  ('directory_user', 'Directory User', 'identity', 'UserRound', TRUE, '["name","environment"]', '[]', '{}', '[]'),
  ('directory_group', 'Directory Group', 'identity', 'UsersRound', TRUE, '["name","environment"]', '[]', '{}', '[]'),
  ('organizational_unit', 'Organizational Unit', 'identity', 'FolderTree', TRUE, '["name","environment"]', '[]', '{}', '[]')
ON CONFLICT (id) DO NOTHING;

-- Source-specific lifecycle policy: AD deletion/tombstones are not assumed
-- from an incremental run. Full reconciliation is the only absence signal.
CREATE INDEX IF NOT EXISTS idx_cmdb_source_records_ad_lifecycle
  ON cmdb_source_records(connector_id, external_object_type, status, last_seen_at)
  WHERE status <> 'RETIRED';
