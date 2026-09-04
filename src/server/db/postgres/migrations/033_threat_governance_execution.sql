-- Release authorization is a persisted, single-consumption decision, not a deployment.
CREATE TABLE threat_release_authorizations (
  id varchar(64) PRIMARY KEY,
  threat_model_id varchar(64) NOT NULL REFERENCES threat_models(id) ON DELETE RESTRICT,
  revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id) ON DELETE RESTRICT,
  release_id varchar(64) NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  issued_by varchar(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by varchar(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
  consumption_key varchar(128),
  gate_snapshot jsonb NOT NULL,
  CHECK(expires_at>issued_at),
  UNIQUE(release_id,consumption_key)
);
CREATE TABLE threat_model_source_events (
  id varchar(64) PRIMARY KEY,
  threat_model_id varchar(64) NOT NULL REFERENCES threat_models(id) ON DELETE RESTRICT,
  source varchar(64) NOT NULL,
  source_event_id varchar(128) NOT NULL,
  reason text NOT NULL,
  material boolean NOT NULL,
  created_by varchar(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(threat_model_id,source,source_event_id)
);
CREATE TRIGGER source_events_append_only BEFORE UPDATE OR DELETE ON threat_model_source_events FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();

-- Cross-revision references are never valid even if another write path omits service checks.
CREATE FUNCTION validate_threat_revision_links() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid varchar(64); target_rid varchar(64); model_id varchar(64);
BEGIN
  IF TG_TABLE_NAME='threat_model_data_flows' THEN
    IF NOT EXISTS(SELECT 1 FROM threat_model_components WHERE id=NEW.source_component_id AND revision_id=NEW.revision_id)
       OR NOT EXISTS(SELECT 1 FROM threat_model_components WHERE id=NEW.destination_component_id AND revision_id=NEW.revision_id)
       OR (NEW.trust_boundary_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM threat_model_trust_boundaries WHERE id=NEW.trust_boundary_id AND revision_id=NEW.revision_id)) THEN
      RAISE EXCEPTION 'Data flow references must belong to its revision' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='threat_data_object_links' THEN
    SELECT threat_model_id INTO model_id FROM threat_model_revisions WHERE id=NEW.revision_id;
    IF NOT EXISTS(SELECT 1 FROM threat_data_objects WHERE id=NEW.data_object_id AND threat_model_id=model_id)
       OR (NEW.component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM threat_model_components WHERE id=NEW.component_id AND revision_id=NEW.revision_id))
       OR (NEW.flow_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM threat_model_data_flows WHERE id=NEW.flow_id AND revision_id=NEW.revision_id)) THEN
      RAISE EXCEPTION 'Data object link crosses revision scope' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME IN ('threat_requirement_threats','threat_requirement_controls') THEN
    SELECT revision_id INTO rid FROM threat_security_requirements WHERE id=NEW.requirement_id;
    IF TG_TABLE_NAME='threat_requirement_threats' THEN SELECT revision_id INTO target_rid FROM threats WHERE id=NEW.threat_id;
    ELSE SELECT t.revision_id INTO target_rid FROM threats t JOIN threat_controls c ON c.threat_id=t.id WHERE c.id=NEW.control_id; END IF;
    IF rid IS DISTINCT FROM target_rid THEN RAISE EXCEPTION 'Requirement mapping crosses revision scope' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['threat_model_data_flows','threat_data_object_links','threat_requirement_threats','threat_requirement_controls'] LOOP
    EXECUTE format('CREATE TRIGGER validate_revision_links BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION validate_threat_revision_links()',tbl);
  END LOOP;
END $$;
