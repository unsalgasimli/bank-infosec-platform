-- No existing analyst or administrator is automatically granted these authorities.
CREATE TABLE threat_directory_role_mappings (
 group_dn text PRIMARY KEY, role varchar(64) NOT NULL CHECK(role IN ('SECURITY_ARCHITECT','RELEASE_AUTHORITY')),
 enabled boolean NOT NULL DEFAULT true, updated_by varchar(64) NOT NULL REFERENCES bank_users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION guard_threat_stage_authority() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE roles jsonb; r threat_model_revisions; m threat_models;
BEGIN
 SELECT u.roles INTO roles FROM bank_users u WHERE u.id=NEW.decided_by_user_id AND u.is_active;
 IF roles IS NULL OR roles ? 'AUDITOR' THEN RAISE EXCEPTION 'Active approval authority required'; END IF;
 IF NEW.stage='SECURITY_ARCHITECTURE' AND NOT(roles ? 'SECURITY_ARCHITECT') THEN RAISE EXCEPTION 'Security Architecture authority is required'; END IF;
 IF NEW.stage='APPSEC' AND NOT(roles ?| ARRAY['APPSEC_ANALYST','INFOSEC_ADMIN','INFOSEC_MANAGER','CISO']) THEN RAISE EXCEPTION 'AppSec authority is required'; END IF;
 SELECT * INTO r FROM threat_model_revisions WHERE id=NEW.revision_id;
 SELECT * INTO m FROM threat_models WHERE id=r.threat_model_id;
 IF r.status<>'IN_REVIEW' OR NEW.decided_by_user_id IN(r.created_by_user_id,r.submitted_by_user_id,m.business_owner_id,m.technical_owner_id,m.security_owner_id) THEN RAISE EXCEPTION 'Independent reviewer and in-review revision required'; END IF;
 IF NEW.decision='APPROVED' AND EXISTS(SELECT 1 FROM threat_model_approvals a WHERE a.revision_id=r.id AND a.review_cycle=r.review_cycle AND a.decided_by_user_id=NEW.decided_by_user_id AND a.stage<>NEW.stage AND a.decision='APPROVED') THEN RAISE EXCEPTION 'Separate stage reviewers required'; END IF;
 IF NEW.decision='APPROVED' AND EXISTS(SELECT 1 FROM threat_model_audit_events WHERE revision_id=r.id AND actor_id=NEW.decided_by_user_id AND action IN ('COVERAGE_DISPOSITION','BUSINESS_CAPABILITY_CREATED')) THEN RAISE EXCEPTION 'Contributing author cannot approve'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER threat_stage_authority BEFORE INSERT ON threat_model_approvals FOR EACH ROW EXECUTE FUNCTION guard_threat_stage_authority();
CREATE FUNCTION guard_threat_release_authority() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM bank_users WHERE id=NEW.issued_by AND is_active AND roles ? 'RELEASE_AUTHORITY' AND NOT roles ? 'AUDITOR') THEN RAISE EXCEPTION 'Explicit release authority required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER threat_release_authority BEFORE INSERT ON threat_release_authorizations FOR EACH ROW EXECUTE FUNCTION guard_threat_release_authority();
