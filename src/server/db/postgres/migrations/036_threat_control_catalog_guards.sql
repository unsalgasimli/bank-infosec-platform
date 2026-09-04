-- Additive correction: SQL NULL must not permit a draft-to-retired transition.
CREATE OR REPLACE FUNCTION validate_catalog_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE author_id varchar(64); previous varchar(16);
BEGIN
  SELECT created_by INTO author_id FROM threat_control_catalog_versions WHERE id=NEW.catalog_version_id FOR UPDATE;
  SELECT decision INTO previous FROM threat_control_catalog_decisions WHERE catalog_version_id=NEW.catalog_version_id ORDER BY event_sequence DESC LIMIT 1;
  previous:=COALESCE(previous,'DRAFT');
  IF author_id=NEW.decided_by THEN RAISE EXCEPTION 'Catalog author cannot approve their own definition' USING ERRCODE='23514'; END IF;
  IF NOT ((previous='DRAFT' AND NEW.decision='PUBLISHED') OR (previous='PUBLISHED' AND NEW.decision='RETIRED')) THEN RAISE EXCEPTION 'Invalid catalog decision transition' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION protect_control_definition_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.catalog_version_id,NEW.implementation_key) IS DISTINCT FROM (OLD.catalog_version_id,OLD.implementation_key) THEN RAISE EXCEPTION 'Control definition binding is immutable; create a new implementation' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_definition_binding BEFORE UPDATE ON threat_controls FOR EACH ROW EXECUTE FUNCTION protect_control_definition_binding();
