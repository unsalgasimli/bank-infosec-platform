CREATE TABLE threat_model_access_grants (
  id varchar(64) PRIMARY KEY, threat_model_id varchar(64) NOT NULL REFERENCES threat_models(id),
  user_id varchar(64) NOT NULL REFERENCES bank_users(id), permission varchar(32) NOT NULL CHECK(permission IN ('READ','CONTRIBUTE')),
  valid_until timestamptz NOT NULL, reason varchar(4000) NOT NULL CHECK(length(trim(reason))>0),
  granted_by varchar(64) NOT NULL REFERENCES bank_users(id), granted_at timestamptz NOT NULL DEFAULT now(),
  CHECK(valid_until>granted_at), CHECK(user_id<>granted_by)
);
CREATE TABLE threat_model_access_revocations (
  grant_id varchar(64) PRIMARY KEY REFERENCES threat_model_access_grants(id),
  reason varchar(4000) NOT NULL CHECK(length(trim(reason))>0),revoked_by varchar(64) NOT NULL REFERENCES bank_users(id),revoked_at timestamptz NOT NULL DEFAULT now()
);
CREATE VIEW threat_model_active_grants AS SELECT g.* FROM threat_model_access_grants g
  JOIN bank_users u ON u.id=g.user_id AND u.is_active LEFT JOIN threat_model_access_revocations r ON r.grant_id=g.id
  WHERE r.grant_id IS NULL AND g.valid_until>now();
CREATE INDEX threat_model_grants_lookup ON threat_model_access_grants(threat_model_id,user_id,valid_until);
CREATE FUNCTION guard_threat_access_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mid varchar(64); aid varchar(64); model threat_models; roles jsonb;
BEGIN
  IF TG_TABLE_NAME='threat_model_access_grants' THEN mid:=NEW.threat_model_id;aid:=NEW.granted_by;
  ELSE SELECT threat_model_id INTO mid FROM threat_model_access_grants WHERE id=NEW.grant_id;aid:=NEW.revoked_by; END IF;
  SELECT * INTO model FROM threat_models WHERE id=mid;
  SELECT u.roles INTO roles FROM bank_users u WHERE u.id=aid AND u.is_active;
  IF roles IS NULL OR roles ? 'AUDITOR' OR NOT(COALESCE(aid IN (model.business_owner_id,model.technical_owner_id,model.security_owner_id),false) OR roles ?| ARRAY['CISO','INFOSEC_ADMIN','INFOSEC_MANAGER','APPSEC_ANALYST']) THEN
    RAISE EXCEPTION 'Model owner or security authority required for access governance' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TABLE threat_compliance_decisions (
  id varchar(64) PRIMARY KEY, requirement_id varchar(64) NOT NULL REFERENCES threat_compliance_requirements(id),
  decision varchar(32) NOT NULL CHECK(decision IN ('VALIDATED','RETIRED')),
  reason varchar(4000) NOT NULL CHECK(length(trim(reason))>0),decided_by varchar(64) NOT NULL REFERENCES bank_users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),event_sequence bigint GENERATED ALWAYS AS IDENTITY
);
CREATE FUNCTION guard_threat_compliance_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE definition threat_compliance_requirements; roles jsonb; prior text;
BEGIN
  SELECT * INTO definition FROM threat_compliance_requirements WHERE id=NEW.requirement_id FOR UPDATE;
  SELECT u.roles INTO roles FROM bank_users u WHERE u.id=NEW.decided_by AND u.is_active;
  IF roles IS NULL OR roles ? 'AUDITOR' OR NOT(roles ?| ARRAY['CISO','INFOSEC_ADMIN','INFOSEC_MANAGER','GRC_ANALYST']) OR definition.created_by=NEW.decided_by THEN
    RAISE EXCEPTION 'Independent compliance-owner authority is required' USING ERRCODE='23514';
  END IF;
  SELECT decision INTO prior FROM threat_compliance_decisions WHERE requirement_id=NEW.requirement_id ORDER BY event_sequence DESC LIMIT 1;
  prior:=COALESCE(prior,definition.validation_status);
  IF NOT((prior='PENDING_VALIDATION' AND NEW.decision='VALIDATED') OR (prior='VALIDATED' AND NEW.decision='RETIRED')) THEN
    RAISE EXCEPTION 'Invalid compliance decision; retired definitions require a new framework version' USING ERRCODE='23514';
  END IF;
  IF NEW.decision='VALIDATED' AND NULLIF(trim(definition.source_url),'') IS NULL THEN RAISE EXCEPTION 'An authoritative source reference is required for validation' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE VIEW threat_compliance_details AS SELECT c.*,COALESCE(d.decision,c.validation_status) AS current_validation_status,d.decided_by,d.decided_at,d.reason AS validation_reason
  FROM threat_compliance_requirements c LEFT JOIN LATERAL(SELECT * FROM threat_compliance_decisions WHERE requirement_id=c.id ORDER BY event_sequence DESC LIMIT 1) d ON TRUE;
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['threat_model_access_grants','threat_model_access_revocations','threat_compliance_decisions'] LOOP
    EXECUTE format('CREATE TRIGGER governance_history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation()',tbl);
  END LOOP;
END $$;
CREATE TRIGGER access_grant_guard BEFORE INSERT ON threat_model_access_grants FOR EACH ROW EXECUTE FUNCTION guard_threat_access_grant();
CREATE TRIGGER access_revoke_guard BEFORE INSERT ON threat_model_access_revocations FOR EACH ROW EXECUTE FUNCTION guard_threat_access_grant();
CREATE TRIGGER compliance_decision_guard BEFORE INSERT ON threat_compliance_decisions FOR EACH ROW EXECUTE FUNCTION guard_threat_compliance_decision();
