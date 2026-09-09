ALTER TABLE threat_delivery_mappings ADD COLUMN approved_revision_id varchar(64) REFERENCES threat_model_revisions(id);
CREATE FUNCTION guard_threat_delivery_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m threat_models; r threat_model_revisions; BEGIN
 IF TG_OP='UPDATE' AND (NEW.issuer,NEW.project_id) IS DISTINCT FROM (OLD.issuer,OLD.project_id) AND EXISTS(SELECT 1 FROM threat_deployment_authorizations WHERE mapping_id=OLD.id) THEN RAISE EXCEPTION 'Create a new mapping for a different provider project; receipt identity is retained'; END IF;
 SELECT * INTO m FROM threat_models WHERE id=NEW.model_id;
 SELECT * INTO r FROM threat_model_revisions WHERE id=m.current_revision_id;
 IF NEW.enabled THEN
  IF r.status<>'APPROVED' OR NOT EXISTS(SELECT 1 FROM threat_model_approval_snapshots WHERE revision_id=r.id) THEN RAISE EXCEPTION 'Release delegation requires an approved immutable revision'; END IF;
  PERFORM assert_threat_analysis_coverage(r.id);
  IF r.tier=3 AND (NEW.updated_by IN(r.created_by_user_id,r.submitted_by_user_id,m.technical_owner_id,m.business_owner_id) OR EXISTS(SELECT 1 FROM threat_model_approvals WHERE revision_id=r.id AND decided_by_user_id=NEW.updated_by AND decision='APPROVED')) THEN RAISE EXCEPTION 'Independent TM-3 release authority required'; END IF;
  NEW.approved_revision_id:=r.id;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER delivery_revision_authority BEFORE INSERT OR UPDATE ON threat_delivery_mappings FOR EACH ROW EXECUTE FUNCTION guard_threat_delivery_revision();
