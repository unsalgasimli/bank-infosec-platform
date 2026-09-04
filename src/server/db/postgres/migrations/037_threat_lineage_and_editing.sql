-- Add metadata without rewriting approved threats or inventing historical correlations.
ALTER TABLE threats ADD COLUMN content_version integer NOT NULL DEFAULT 1 CHECK(content_version>0);
ALTER TABLE threats ADD COLUMN previous_threat_id varchar(64) REFERENCES threats(id) ON DELETE RESTRICT;
ALTER TABLE threat_model_exceptions ADD COLUMN threat_content_version integer NOT NULL DEFAULT 1 CHECK(threat_content_version>0);

CREATE TABLE threat_lineage_members (
  threat_id varchar(64) PRIMARY KEY REFERENCES threats(id) ON DELETE RESTRICT,
  lineage_id varchar(64) NOT NULL REFERENCES threats(id) ON DELETE RESTRICT,
  revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id) ON DELETE RESTRICT,
  origin varchar(32) NOT NULL CHECK(origin IN ('LEGACY_UNCORRELATED','NATIVE','REVISION_COPY')),
  UNIQUE(revision_id,lineage_id)
);
INSERT INTO threat_lineage_members(threat_id,lineage_id,revision_id,origin)
  SELECT id,id,revision_id,'LEGACY_UNCORRELATED' FROM threats;
CREATE INDEX threat_lineage_history ON threat_lineage_members(lineage_id,revision_id);
CREATE TRIGGER threat_lineage_immutable BEFORE UPDATE OR DELETE ON threat_lineage_members FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();

CREATE FUNCTION validate_threat_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id varchar(64); rid varchar(64); predecessor_revision varchar(64); predecessor_lineage varchar(64);
BEGIN
  SELECT previous_threat_id,revision_id INTO parent_id,rid FROM threats WHERE id=NEW.threat_id;
  IF NEW.revision_id IS DISTINCT FROM rid THEN RAISE EXCEPTION 'Invalid threat lineage revision' USING ERRCODE='23514'; END IF;
  IF parent_id IS NULL THEN
    IF NEW.lineage_id<>NEW.threat_id OR NEW.origin<>'NATIVE' THEN RAISE EXCEPTION 'Invalid threat lineage root' USING ERRCODE='23514'; END IF;
  ELSE
    SELECT t.revision_id,m.lineage_id INTO predecessor_revision,predecessor_lineage FROM threats t JOIN threat_lineage_members m ON m.threat_id=t.id WHERE t.id=parent_id;
    IF NOT EXISTS(SELECT 1 FROM threat_model_revisions r JOIN threat_model_revisions p ON p.id=r.supersedes_revision_id AND p.threat_model_id=r.threat_model_id WHERE r.id=rid AND p.id=predecessor_revision)
      OR NEW.lineage_id IS DISTINCT FROM predecessor_lineage OR NEW.origin<>'REVISION_COPY' THEN
      RAISE EXCEPTION 'Threat lineage must follow the same model predecessor revision' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_threat_lineage BEFORE INSERT ON threat_lineage_members FOR EACH ROW EXECUTE FUNCTION validate_threat_lineage();
CREATE FUNCTION initialize_threat_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO threat_lineage_members(threat_id,lineage_id,revision_id,origin)
    VALUES(NEW.id,CASE WHEN NEW.previous_threat_id IS NULL THEN NEW.id ELSE (SELECT lineage_id FROM threat_lineage_members WHERE threat_id=NEW.previous_threat_id) END,
      NEW.revision_id,CASE WHEN NEW.previous_threat_id IS NULL THEN 'NATIVE' ELSE 'REVISION_COPY' END);
  RETURN NEW;
END $$;
CREATE TRIGGER initialize_threat_lineage AFTER INSERT ON threats FOR EACH ROW EXECUTE FUNCTION initialize_threat_lineage();

CREATE FUNCTION threat_authored_content(value threats) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb($1))
  WHERE key=ANY(ARRAY['title','description','categories','attack_scenario','attacker_type','attacker_capability','preconditions','attack_path',
    'affected_component_id','affected_data_flow_id','affected_trust_boundary_id','affected_asset_id','cwe_ids','capec_ids','inherent_likelihood','inherent_impact','owner_id','due_date']);
$$;
CREATE FUNCTION protect_threat_authored_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.previous_threat_id IS DISTINCT FROM OLD.previous_threat_id OR NEW.key IS DISTINCT FROM OLD.key OR NEW.content_version IS DISTINCT FROM OLD.content_version THEN
      RAISE EXCEPTION 'Threat identity and content version are server-managed' USING ERRCODE='55000';
    END IF;
    IF threat_authored_content(NEW) IS DISTINCT FROM threat_authored_content(OLD) THEN
      NEW.content_version:=OLD.content_version+1;
      NEW.status:='OPEN'; NEW.residual_likelihood:=NULL; NEW.residual_impact:=NULL; NEW.residual_score:=NULL;
      NEW.residual_risk_rationale:=NULL; NEW.residual_risk_calculated_at:=NULL; NEW.residual_risk_calculated_by_user_id:=NULL;
      NEW.updated_at:=now();
    END IF;
  END IF;
  IF (NEW.affected_component_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM threat_model_components WHERE id=NEW.affected_component_id AND revision_id=NEW.revision_id))
    OR (NEW.affected_data_flow_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM threat_model_data_flows WHERE id=NEW.affected_data_flow_id AND revision_id=NEW.revision_id))
    OR (NEW.affected_trust_boundary_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM threat_model_trust_boundaries WHERE id=NEW.affected_trust_boundary_id AND revision_id=NEW.revision_id)) THEN
    RAISE EXCEPTION 'Affected architecture must belong to the threat revision' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_threat_authored_content BEFORE INSERT OR UPDATE ON threats FOR EACH ROW EXECUTE FUNCTION protect_threat_authored_content();
CREATE FUNCTION invalidate_edited_threat_controls() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content_version=OLD.content_version THEN RETURN NEW; END IF;
  UPDATE threat_controls SET scope_version=scope_version+1,status='VERIFICATION_REQUIRED',effectiveness_status='THREAT_CHANGED',updated_at=now()
    WHERE id IN(SELECT control_id FROM threat_control_threats WHERE threat_id=NEW.id);
  UPDATE threats SET residual_likelihood=NULL,residual_impact=NULL,residual_score=NULL,residual_risk_rationale=NULL,
    residual_risk_calculated_at=NULL,residual_risk_calculated_by_user_id=NULL,
    status=CASE WHEN status IN ('MITIGATED','CLOSED','ACCEPTED') THEN 'OPEN' ELSE status END,updated_at=now()
    WHERE id<>NEW.id AND id IN(SELECT m.threat_id FROM threat_control_threats m JOIN threat_control_threats edited ON edited.control_id=m.control_id WHERE edited.threat_id=NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER invalidate_edited_threat_controls AFTER UPDATE ON threats FOR EACH ROW EXECUTE FUNCTION invalidate_edited_threat_controls();

CREATE FUNCTION bind_exception_threat_content() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_version integer;
BEGIN
  SELECT content_version INTO current_version FROM threats WHERE id=NEW.threat_id;
  IF TG_OP='INSERT' THEN NEW.threat_content_version:=current_version;
  ELSIF NEW.threat_content_version IS DISTINCT FROM OLD.threat_content_version OR NEW.threat_id IS DISTINCT FROM OLD.threat_id THEN
    RAISE EXCEPTION 'Risk acceptance assessment binding is immutable' USING ERRCODE='55000';
  END IF;
  IF NEW.status='APPROVED' AND NEW.threat_content_version IS DISTINCT FROM current_version THEN
    RAISE EXCEPTION 'Risk acceptance requires a fresh threat assessment' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bind_exception_threat_content BEFORE INSERT OR UPDATE ON threat_model_exceptions FOR EACH ROW EXECUTE FUNCTION bind_exception_threat_content();
CREATE VIEW threat_details AS SELECT t.*,m.lineage_id,m.origin AS lineage_origin FROM threats t JOIN threat_lineage_members m ON m.threat_id=t.id;
