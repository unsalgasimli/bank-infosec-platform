ALTER TABLE threat_model_components ADD COLUMN content_version integer NOT NULL DEFAULT 1 CHECK(content_version>0);
ALTER TABLE threat_model_trust_boundaries ADD COLUMN content_version integer NOT NULL DEFAULT 1 CHECK(content_version>0);
ALTER TABLE threat_model_data_flows ADD COLUMN content_version integer NOT NULL DEFAULT 1 CHECK(content_version>0);
ALTER TABLE threat_model_revisions ADD COLUMN architecture_version integer NOT NULL DEFAULT 1 CHECK(architecture_version>0);
ALTER TABLE threat_model_exceptions ADD COLUMN architecture_version integer NOT NULL DEFAULT 1 CHECK(architecture_version>0);

-- Names/descriptions are documentation only; notes can contain security assumptions.
CREATE FUNCTION architecture_security_content(value jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT $1 - ARRAY['id','revision_id','name','description','content_version','crosses_trust_boundary'];
$$;
CREATE FUNCTION guard_threat_architecture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_zone text; destination_zone text;
BEGIN
  IF TG_OP='DELETE' THEN
    IF (TG_TABLE_NAME='threat_model_components' AND (
      EXISTS(SELECT 1 FROM threat_model_data_flows WHERE source_component_id=OLD.id OR destination_component_id=OLD.id) OR
      EXISTS(SELECT 1 FROM threats WHERE affected_component_id=OLD.id) OR EXISTS(SELECT 1 FROM threat_data_object_links WHERE component_id=OLD.id))) OR
      (TG_TABLE_NAME='threat_model_trust_boundaries' AND (
      EXISTS(SELECT 1 FROM threat_model_data_flows WHERE trust_boundary_id=OLD.id) OR EXISTS(SELECT 1 FROM threats WHERE affected_trust_boundary_id=OLD.id))) OR
      (TG_TABLE_NAME='threat_model_data_flows' AND (
      EXISTS(SELECT 1 FROM threats WHERE affected_data_flow_id=OLD.id) OR EXISTS(SELECT 1 FROM threat_data_object_links WHERE flow_id=OLD.id))) THEN
      RAISE EXCEPTION 'Referenced architecture cannot be removed; resolve its links first' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME='threat_model_data_flows' THEN
    IF NEW.source_component_id=NEW.destination_component_id OR
      (SELECT count(*) FROM threat_model_components WHERE revision_id=NEW.revision_id AND id IN(NEW.source_component_id,NEW.destination_component_id))<>2 THEN
      RAISE EXCEPTION 'Flow endpoints must be distinct components in the current revision' USING ERRCODE='23514';
    END IF;
    IF NEW.trust_boundary_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM threat_model_trust_boundaries WHERE id=NEW.trust_boundary_id AND revision_id=NEW.revision_id) THEN
      RAISE EXCEPTION 'Flow boundary must belong to the current revision' USING ERRCODE='23514';
    END IF;
    SELECT security_zone INTO source_zone FROM threat_model_components WHERE id=NEW.source_component_id;
    SELECT security_zone INTO destination_zone FROM threat_model_components WHERE id=NEW.destination_component_id;
    IF NULLIF(source_zone,'') IS NOT NULL AND NULLIF(destination_zone,'') IS NOT NULL AND source_zone<>destination_zone AND NEW.trust_boundary_id IS NULL THEN
      RAISE EXCEPTION 'A flow crossing security zones requires a trust boundary' USING ERRCODE='23514';
    END IF;
    -- Legacy unknown zones remain representable for revalidation, but block release.
    NEW.crosses_trust_boundary:=COALESCE(source_zone<>destination_zone,false) OR NEW.trust_boundary_id IS NOT NULL;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.content_version<>1 THEN RAISE EXCEPTION 'Architecture content version is server-managed' USING ERRCODE='55000'; END IF;
  ELSE
    IF NEW.id<>OLD.id OR NEW.content_version<>OLD.content_version THEN RAISE EXCEPTION 'Architecture identity and content version are server-managed' USING ERRCODE='55000'; END IF;
    IF (to_jsonb(NEW)-'content_version') IS DISTINCT FROM (to_jsonb(OLD)-'content_version') THEN NEW.content_version:=OLD.content_version+1; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION invalidate_threat_architecture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid varchar(64);
BEGIN
  IF TG_OP='UPDATE' AND architecture_security_content(to_jsonb(NEW)) IS NOT DISTINCT FROM architecture_security_content(to_jsonb(OLD)) THEN RETURN NEW; END IF;
  rid:=CASE WHEN TG_OP='DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
  -- The evidence scope is the complete revision architecture, not a guessed affected subgraph.
  UPDATE threat_model_revisions SET architecture_version=architecture_version+1,tier=NULL,policy_version_id=NULL,version=version+1 WHERE id=rid;
  UPDATE threat_controls SET scope_version=scope_version+1,status='VERIFICATION_REQUIRED',effectiveness_status='ARCHITECTURE_CHANGED',updated_at=now()
    WHERE threat_id IN(SELECT id FROM threats WHERE revision_id=rid);
  UPDATE threats SET residual_likelihood=NULL,residual_impact=NULL,residual_score=NULL,residual_risk_rationale=NULL,
    residual_risk_calculated_at=NULL,residual_risk_calculated_by_user_id=NULL,status='OPEN',updated_at=now() WHERE revision_id=rid;
  IF TG_TABLE_NAME='threat_model_components' AND TG_OP='UPDATE' THEN
    -- Recompute derived crossing flags. Missing boundary raises an error and rolls back the node edit.
    IF NEW.security_zone IS DISTINCT FROM OLD.security_zone THEN
      UPDATE threat_model_data_flows SET crosses_trust_boundary=crosses_trust_boundary WHERE source_component_id=NEW.id OR destination_component_id=NEW.id;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['threat_model_components','threat_model_trust_boundaries','threat_model_data_flows'] LOOP
    EXECUTE format('CREATE TRIGGER guard_threat_architecture BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_threat_architecture()',tbl);
    EXECUTE format('CREATE TRIGGER invalidate_threat_architecture AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION invalidate_threat_architecture()',tbl);
  END LOOP;
END $$;

CREATE FUNCTION bind_exception_architecture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_version integer;
BEGIN
  SELECT r.architecture_version INTO current_version FROM threats t JOIN threat_model_revisions r ON r.id=t.revision_id WHERE t.id=NEW.threat_id;
  IF TG_OP='INSERT' THEN NEW.architecture_version:=current_version;
  ELSIF NEW.architecture_version IS DISTINCT FROM OLD.architecture_version THEN RAISE EXCEPTION 'Exception architecture binding is immutable' USING ERRCODE='55000'; END IF;
  IF NEW.status='APPROVED' AND NEW.architecture_version IS DISTINCT FROM current_version THEN RAISE EXCEPTION 'Risk acceptance requires a fresh architecture assessment' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bind_exception_architecture BEFORE INSERT OR UPDATE ON threat_model_exceptions FOR EACH ROW EXECUTE FUNCTION bind_exception_architecture();
CREATE TRIGGER invalidate_data_context AFTER INSERT OR DELETE ON threat_data_object_links FOR EACH ROW EXECUTE FUNCTION invalidate_threat_architecture();
CREATE FUNCTION guard_architecture_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.architecture_version IS DISTINCT FROM OLD.architecture_version AND (pg_trigger_depth()<2 OR NEW.architecture_version<>OLD.architecture_version+1) THEN
    RAISE EXCEPTION 'Architecture version is server-managed' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_architecture_version BEFORE UPDATE ON threat_model_revisions FOR EACH ROW EXECUTE FUNCTION guard_architecture_version();
CREATE INDEX threat_flows_source ON threat_model_data_flows(source_component_id);
CREATE INDEX threat_flows_destination ON threat_model_data_flows(destination_component_id);
CREATE INDEX threat_flows_boundary ON threat_model_data_flows(trust_boundary_id);
