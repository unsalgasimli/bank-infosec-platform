-- Project membership is the default access boundary for a project-linked model.
-- Explicit grants remain needed for users outside that project and are auditable.
CREATE OR REPLACE FUNCTION guard_threat_access_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mid varchar(64); aid varchar(64); model threat_models; roles jsonb;
BEGIN
  IF TG_TABLE_NAME='threat_model_access_grants' THEN mid:=NEW.threat_model_id;aid:=NEW.granted_by;
  ELSE SELECT threat_model_id INTO mid FROM threat_model_access_grants WHERE id=NEW.grant_id;aid:=NEW.revoked_by; END IF;
  SELECT * INTO model FROM threat_models WHERE id=mid;
  SELECT u.roles INTO roles FROM bank_users u WHERE u.id=aid AND u.is_active;
  IF roles IS NULL OR roles ? 'AUDITOR' OR NOT(COALESCE(aid IN (model.business_owner_id,model.technical_owner_id,model.security_owner_id),false) OR roles ?| ARRAY['PLATFORM_ADMIN','CISO','INFOSEC_ADMIN','INFOSEC_MANAGER','APPSEC_ANALYST']) THEN
    RAISE EXCEPTION 'Model owner, platform administrator, or security authority required for access governance' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
