-- Referential integrity without duplicating CMDB/application/project inventories.
CREATE TABLE threat_model_scope_references (
  threat_model_id varchar(64) NOT NULL REFERENCES threat_models(id) ON DELETE RESTRICT,
  scope_kind varchar(16) NOT NULL CHECK(scope_kind IN ('SERVICE','ASSET','PROJECT','CHANGE','RELEASE')),
  source_id varchar(255) NOT NULL,
  ci_id varchar(64) REFERENCES configuration_items(id) ON DELETE RESTRICT,
  application_id varchar(64) REFERENCES bank_applications(id) ON DELETE RESTRICT,
  asset_id varchar(64) REFERENCES bank_assets(id) ON DELETE RESTRICT,
  ticket_id varchar(64) REFERENCES tickets(id) ON DELETE RESTRICT,
  project_collection varchar(128),project_id varchar(255),linked_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(project_collection,project_id) REFERENCES legacy_json_records(collection,record_id) ON DELETE RESTRICT,
  CHECK(num_nonnulls(ci_id,application_id,asset_id,ticket_id,project_id)=1),
  CHECK((project_id IS NULL)=(project_collection IS NULL)),
  CHECK(project_collection IS NULL OR project_collection='projects'),
  CHECK(source_id=COALESCE(ci_id,application_id,asset_id,ticket_id,project_id)),
  CHECK((scope_kind='SERVICE' AND (ci_id IS NOT NULL OR application_id IS NOT NULL)) OR (scope_kind='ASSET' AND (ci_id IS NOT NULL OR asset_id IS NOT NULL)) OR (scope_kind='PROJECT' AND project_id IS NOT NULL) OR (scope_kind IN ('CHANGE','RELEASE') AND ticket_id IS NOT NULL)),
  PRIMARY KEY(threat_model_id,scope_kind,source_id)
);
CREATE TABLE threat_model_scope_migration_issues (
  threat_model_id varchar(64) NOT NULL REFERENCES threat_models(id),scope_kind varchar(16) NOT NULL,source_id varchar(255) NOT NULL,
  reason text NOT NULL DEFAULT 'LEGACY_UNRESOLVED_REFERENCE',recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(threat_model_id,scope_kind,source_id)
);
CREATE FUNCTION retain_threat_scope_reference(mid varchar,kind varchar,source_ref varchar,legacy boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
DECLARE ci varchar(64); app varchar(64); asset varchar(64); ticket varchar(64); project varchar(255);
BEGIN
  IF source_ref IS NULL THEN RETURN; END IF;
  IF kind IN ('SERVICE','ASSET') THEN
    SELECT id INTO ci FROM configuration_items WHERE id=source_ref;
    IF ci IS NULL AND kind='SERVICE' THEN SELECT id INTO app FROM bank_applications WHERE id=source_ref;
    ELSIF ci IS NULL AND kind='ASSET' THEN SELECT id INTO asset FROM bank_assets WHERE id=source_ref; END IF;
  ELSIF kind='PROJECT' THEN SELECT record_id INTO project FROM legacy_json_records WHERE collection='projects' AND record_id=source_ref;
  ELSE SELECT id INTO ticket FROM tickets WHERE id=source_ref; END IF;
  IF num_nonnulls(ci,app,asset,ticket,project)=0 THEN
    IF legacy THEN INSERT INTO threat_model_scope_migration_issues(threat_model_id,scope_kind,source_id) VALUES(mid,kind,source_ref) ON CONFLICT DO NOTHING;RETURN; END IF;
    RAISE EXCEPTION 'Threat Model scope must reference an existing canonical record' USING ERRCODE='23503';
  END IF;
  INSERT INTO threat_model_scope_references(threat_model_id,scope_kind,source_id,ci_id,application_id,asset_id,ticket_id,project_collection,project_id)
    VALUES(mid,kind,source_ref,ci,app,asset,ticket,CASE WHEN project IS NULL THEN NULL ELSE 'projects' END,project) ON CONFLICT DO NOTHING;
END $$;
DO $$ DECLARE model threat_models; BEGIN
  FOR model IN SELECT * FROM threat_models LOOP
    PERFORM retain_threat_scope_reference(model.id,'SERVICE',model.service_id,true);
    PERFORM retain_threat_scope_reference(model.id,'ASSET',model.asset_id,true);
    PERFORM retain_threat_scope_reference(model.id,'PROJECT',model.project_id,true);
    PERFORM retain_threat_scope_reference(model.id,'CHANGE',model.change_id,true);
    PERFORM retain_threat_scope_reference(model.id,'RELEASE',model.release_id,true);
  END LOOP;
END $$;
CREATE FUNCTION guard_threat_scope_references() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.service_id IS DISTINCT FROM OLD.service_id THEN PERFORM retain_threat_scope_reference(NEW.id,'SERVICE',NEW.service_id); END IF;
  IF TG_OP='INSERT' OR NEW.asset_id IS DISTINCT FROM OLD.asset_id THEN PERFORM retain_threat_scope_reference(NEW.id,'ASSET',NEW.asset_id); END IF;
  IF TG_OP='INSERT' OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN PERFORM retain_threat_scope_reference(NEW.id,'PROJECT',NEW.project_id); END IF;
  IF TG_OP='INSERT' OR NEW.change_id IS DISTINCT FROM OLD.change_id THEN PERFORM retain_threat_scope_reference(NEW.id,'CHANGE',NEW.change_id); END IF;
  IF TG_OP='INSERT' OR NEW.release_id IS DISTINCT FROM OLD.release_id THEN PERFORM retain_threat_scope_reference(NEW.id,'RELEASE',NEW.release_id); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER threat_scope_references_guard AFTER INSERT OR UPDATE ON threat_models FOR EACH ROW EXECUTE FUNCTION guard_threat_scope_references();
CREATE TRIGGER threat_scope_history_immutable BEFORE UPDATE OR DELETE ON threat_model_scope_references FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
CREATE TRIGGER threat_scope_issues_immutable BEFORE UPDATE OR DELETE ON threat_model_scope_migration_issues FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
