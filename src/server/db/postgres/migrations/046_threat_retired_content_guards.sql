-- Preserve draft content too once a model is retired; approved snapshots stay unchanged.
CREATE OR REPLACE FUNCTION protect_threat_revision_content() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid varchar(64); oldrid varchar(64); state varchar(32);
BEGIN
  IF TG_TABLE_NAME='threat_model_revisions' THEN
    IF EXISTS(SELECT 1 FROM threat_models WHERE id=OLD.threat_model_id AND status IN ('RETIRED','ARCHIVED')) THEN RAISE EXCEPTION 'Retired security content is immutable' USING ERRCODE='55000'; END IF;
    IF TG_OP='DELETE' OR OLD.status IN ('APPROVED','SUPERSEDED') THEN
      RAISE EXCEPTION 'Approved security revision is immutable' USING ERRCODE='55000';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF to_jsonb(OLD)->>'revision_id' IS DISTINCT FROM to_jsonb(NEW)->>'revision_id'
       OR to_jsonb(OLD)->>'threat_id' IS DISTINCT FROM to_jsonb(NEW)->>'threat_id'
       OR to_jsonb(OLD)->>'control_id' IS DISTINCT FROM to_jsonb(NEW)->>'control_id'
       OR to_jsonb(OLD)->>'requirement_id' IS DISTINCT FROM to_jsonb(NEW)->>'requirement_id' THEN
      RAISE EXCEPTION 'Security record parent cannot change' USING ERRCODE='55000';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN oldrid := to_jsonb(OLD)->>'revision_id'; ELSE oldrid := to_jsonb(NEW)->>'revision_id'; END IF;
  rid := oldrid;
  IF TG_TABLE_NAME='threat_controls' THEN SELECT revision_id INTO rid FROM threats WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.threat_id ELSE NEW.threat_id END;
  ELSIF TG_TABLE_NAME='control_verifications' THEN SELECT t.revision_id INTO rid FROM threats t JOIN threat_controls c ON c.threat_id=t.id WHERE c.id=CASE WHEN TG_OP='DELETE' THEN OLD.control_id ELSE NEW.control_id END;
  ELSIF TG_TABLE_NAME IN ('threat_requirement_threats','threat_requirement_controls','threat_requirement_compliance') THEN SELECT revision_id INTO rid FROM threat_security_requirements WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.requirement_id ELSE NEW.requirement_id END;
  END IF;
  SELECT status INTO state FROM threat_model_revisions WHERE id=rid FOR UPDATE;
  IF EXISTS(SELECT 1 FROM threat_model_revisions r JOIN threat_models m ON m.id=r.threat_model_id WHERE r.id=rid AND m.status IN ('RETIRED','ARCHIVED')) THEN RAISE EXCEPTION 'Retired security content is immutable' USING ERRCODE='55000'; END IF;
  IF state IS NULL OR state NOT IN ('DRAFT','CHANGES_REQUIRED') THEN RAISE EXCEPTION 'Security revision content is immutable; create a draft' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE INDEX threat_model_service_status_lookup ON threat_models(service_id,status,updated_at DESC);
CREATE INDEX threat_model_asset_status_lookup ON threat_models(asset_id,status,updated_at DESC);
CREATE INDEX threat_model_classification_status_lookup ON threat_models(data_classification,status);
CREATE INDEX threat_requirement_compliance_lookup ON threat_requirement_compliance(compliance_id,requirement_id);
