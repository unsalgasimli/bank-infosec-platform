-- Existing controls remain implementation instances. No legacy title is invented into a canonical definition.
CREATE TABLE threat_control_catalog_versions (
  id varchar(64) PRIMARY KEY,
  organization_id varchar(64) NOT NULL,
  code varchar(64) NOT NULL,
  version integer NOT NULL CHECK(version>0),
  title varchar(255) NOT NULL,
  description text NOT NULL,
  control_function varchar(24) NOT NULL CHECK(control_function IN ('PREVENTIVE','DETECTIVE','CORRECTIVE','COMPENSATING')),
  verification_guidance text NOT NULL,
  reference_url varchar(2000),
  created_by varchar(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code,version)
);
CREATE TABLE threat_control_catalog_decisions (
  id varchar(64) PRIMARY KEY,
  catalog_version_id varchar(64) NOT NULL REFERENCES threat_control_catalog_versions(id) ON DELETE RESTRICT,
  decision varchar(16) NOT NULL CHECK(decision IN ('PUBLISHED','RETIRED')),
  reason text NOT NULL,
  decided_by varchar(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT now(),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY,
  UNIQUE(catalog_version_id,decision)
);
CREATE TRIGGER catalog_versions_immutable BEFORE UPDATE OR DELETE ON threat_control_catalog_versions FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
CREATE TRIGGER catalog_decisions_immutable BEFORE UPDATE OR DELETE ON threat_control_catalog_decisions FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
ALTER TABLE threat_controls ADD COLUMN catalog_version_id varchar(64) REFERENCES threat_control_catalog_versions(id) ON DELETE RESTRICT;
ALTER TABLE threat_controls ADD COLUMN implementation_key varchar(128);
ALTER TABLE threat_controls ADD COLUMN scope_version integer NOT NULL DEFAULT 1 CHECK(scope_version>0);
ALTER TABLE control_verifications ADD COLUMN control_scope_version integer NOT NULL DEFAULT 1 CHECK(control_scope_version>0);
CREATE TABLE threat_control_threats (
  control_id varchar(64) NOT NULL REFERENCES threat_controls(id) ON DELETE RESTRICT,
  threat_id varchar(64) NOT NULL REFERENCES threats(id) ON DELETE RESTRICT,
  PRIMARY KEY(control_id,threat_id)
);
-- Preserve all historical IDs and the original attachment scope, including immutable approved revisions.
INSERT INTO threat_control_threats(control_id,threat_id) SELECT id,threat_id FROM threat_controls;
CREATE INDEX threat_control_threats_by_threat ON threat_control_threats(threat_id,control_id);
CREATE INDEX threat_controls_catalog ON threat_controls(catalog_version_id) WHERE catalog_version_id IS NOT NULL;
CREATE FUNCTION validate_catalog_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE author_id varchar(64); previous varchar(16);
BEGIN
  SELECT created_by INTO author_id FROM threat_control_catalog_versions WHERE id=NEW.catalog_version_id FOR UPDATE;
  SELECT decision INTO previous FROM threat_control_catalog_decisions WHERE catalog_version_id=NEW.catalog_version_id ORDER BY event_sequence DESC LIMIT 1;
  IF author_id=NEW.decided_by THEN RAISE EXCEPTION 'Catalog author cannot approve their own definition' USING ERRCODE='23514'; END IF;
  IF NOT ((COALESCE(previous,'DRAFT')='DRAFT' AND NEW.decision='PUBLISHED') OR (previous='PUBLISHED' AND NEW.decision='RETIRED')) THEN RAISE EXCEPTION 'Invalid catalog decision transition' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_catalog_decision BEFORE INSERT ON threat_control_catalog_decisions FOR EACH ROW EXECUTE FUNCTION validate_catalog_decision();
CREATE FUNCTION validate_catalog_instance_key() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid varchar(64);
BEGIN
  IF NEW.catalog_version_id IS NULL THEN RETURN NEW; END IF;
  SELECT revision_id INTO rid FROM threats WHERE id=NEW.threat_id;
  PERFORM 1 FROM threat_model_revisions WHERE id=rid FOR UPDATE;
  IF NEW.implementation_key IS NULL OR length(trim(NEW.implementation_key))=0 THEN RAISE EXCEPTION 'Catalog implementation key is required' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM threat_controls c JOIN threats t ON t.id=c.threat_id WHERE t.revision_id=rid AND c.catalog_version_id=NEW.catalog_version_id AND lower(c.implementation_key)=lower(NEW.implementation_key)) THEN RAISE EXCEPTION 'Duplicate catalog implementation in this revision' USING ERRCODE='23505'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_catalog_instance_key BEFORE INSERT ON threat_controls FOR EACH ROW EXECUTE FUNCTION validate_catalog_instance_key();

CREATE FUNCTION validate_threat_control_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid varchar(64); tid varchar(64); rid varchar(64); primary_tid varchar(64); state varchar(32);
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Control mappings cannot be retargeted' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN cid:=OLD.control_id; tid:=OLD.threat_id; ELSE cid:=NEW.control_id; tid:=NEW.threat_id; END IF;
  SELECT c.threat_id,t.revision_id INTO primary_tid,rid FROM threat_controls c JOIN threats t ON t.id=c.threat_id WHERE c.id=cid;
  SELECT status INTO state FROM threat_model_revisions WHERE id=rid FOR UPDATE;
  IF state IS NULL OR state NOT IN ('DRAFT','CHANGES_REQUIRED') THEN RAISE EXCEPTION 'Control mapping scope is immutable; create a draft' USING ERRCODE='55000'; END IF;
  IF NOT EXISTS(SELECT 1 FROM threats WHERE id=tid AND revision_id=rid) THEN RAISE EXCEPTION 'Control mapping crosses revision scope' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' AND tid=primary_tid THEN RAISE EXCEPTION 'Original control anchor cannot be removed' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER validate_control_mapping BEFORE INSERT OR UPDATE OR DELETE ON threat_control_threats FOR EACH ROW EXECUTE FUNCTION validate_threat_control_mapping();
CREATE FUNCTION invalidate_threat_control_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid varchar(64); tid varchar(64);
BEGIN
  IF TG_OP='DELETE' THEN cid:=OLD.control_id; tid:=OLD.threat_id; ELSE cid:=NEW.control_id; tid:=NEW.threat_id; END IF;
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM threat_controls WHERE id=cid AND threat_id=tid) THEN RETURN NEW; END IF;
  UPDATE threat_controls SET scope_version=scope_version+1,status='VERIFICATION_REQUIRED',effectiveness_status='SCOPE_CHANGED',updated_at=now() WHERE id=cid;
  UPDATE threats SET residual_likelihood=NULL,residual_impact=NULL,residual_score=NULL,residual_risk_rationale=NULL,residual_risk_calculated_at=NULL,residual_risk_calculated_by_user_id=NULL,status=CASE WHEN status IN ('MITIGATED','CLOSED') THEN 'MITIGATING' ELSE status END,updated_at=now()
    WHERE id=tid OR id IN(SELECT threat_id FROM threat_control_threats WHERE control_id=cid);
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER invalidate_control_scope AFTER INSERT OR DELETE ON threat_control_threats FOR EACH ROW EXECUTE FUNCTION invalidate_threat_control_scope();
CREATE FUNCTION initialize_threat_control_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO threat_control_threats(control_id,threat_id) VALUES(NEW.id,NEW.threat_id); RETURN NEW; END $$;
CREATE TRIGGER initialize_control_mapping AFTER INSERT ON threat_controls FOR EACH ROW EXECUTE FUNCTION initialize_threat_control_mapping();

CREATE FUNCTION validate_control_verification_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM threat_controls WHERE id=NEW.control_id AND scope_version=NEW.control_scope_version) THEN RAISE EXCEPTION 'Verification scope is no longer current' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_verification_scope BEFORE INSERT ON control_verifications FOR EACH ROW EXECUTE FUNCTION validate_control_verification_scope();
CREATE VIEW threat_control_details AS SELECT c.*,
  ARRAY(SELECT m.threat_id FROM threat_control_threats m WHERE m.control_id=c.id ORDER BY m.threat_id) AS threat_ids,
  cv.code AS catalog_code,cv.version AS catalog_version,cv.verification_guidance
  FROM threat_controls c LEFT JOIN threat_control_catalog_versions cv ON cv.id=c.catalog_version_id;
