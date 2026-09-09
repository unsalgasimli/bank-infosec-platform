ALTER TABLE threat_delivery_mappings ADD COLUMN artifact_job_name varchar(255);
CREATE FUNCTION guard_threat_exception_risk_authority() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor_roles jsonb; owner_id varchar; BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('APPROVED','REJECTED','REVOKED') THEN
  SELECT roles INTO actor_roles FROM bank_users WHERE id=NEW.approver_id AND is_active;
  SELECT m.business_owner_id INTO owner_id FROM threats t JOIN threat_model_revisions r ON r.id=t.revision_id JOIN threat_models m ON m.id=r.threat_model_id WHERE t.id=NEW.threat_id;
  IF actor_roles IS NULL OR actor_roles ? 'AUDITOR' OR NOT(actor_roles ? 'CISO' OR (NEW.risk_level NOT IN ('CRITICAL','HIGH') AND actor_roles ? 'RISK_OWNER' AND NEW.approver_id=owner_id)) THEN RAISE EXCEPTION 'Designated risk authority required'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER threat_exception_risk_authority BEFORE UPDATE ON threat_model_exceptions FOR EACH ROW EXECUTE FUNCTION guard_threat_exception_risk_authority();
