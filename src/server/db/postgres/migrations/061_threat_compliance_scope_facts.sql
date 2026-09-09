CREATE TABLE threat_compliance_scope_facts (
 id varchar(64) PRIMARY KEY,revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id),facts jsonb NOT NULL CHECK(jsonb_typeof(facts)='object'),
 source_reference text NOT NULL,reason text NOT NULL CHECK(length(trim(reason))>=20),created_by varchar(64) NOT NULL REFERENCES bank_users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE threat_compliance_scope_reviews (
 facts_id varchar(64) PRIMARY KEY REFERENCES threat_compliance_scope_facts(id),reviewed_by varchar(64) NOT NULL REFERENCES bank_users(id),
 decision varchar(16) NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),reason text NOT NULL CHECK(length(trim(reason))>=20),reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION guard_threat_compliance_scope_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f threat_compliance_scope_facts; BEGIN
 SELECT * INTO f FROM threat_compliance_scope_facts WHERE id=NEW.facts_id;
 IF f.created_by=NEW.reviewed_by OR NOT EXISTS(SELECT 1 FROM bank_users WHERE id=NEW.reviewed_by AND is_active AND roles ? 'GRC_ANALYST' AND NOT roles ? 'AUDITOR') THEN RAISE EXCEPTION 'Independent compliance scope review required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM threat_model_revisions r JOIN threat_models m ON m.current_revision_id=r.id WHERE r.id=f.revision_id AND r.status IN ('DRAFT','CHANGES_REQUIRED')) THEN RAISE EXCEPTION 'Current mutable compliance scope required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER compliance_scope_mutable BEFORE INSERT ON threat_compliance_scope_facts FOR EACH ROW EXECUTE FUNCTION protect_threat_revision_content();
CREATE TRIGGER compliance_scope_authority BEFORE INSERT ON threat_compliance_scope_facts FOR EACH ROW EXECUTE FUNCTION guard_threat_compliance_authority();
CREATE TRIGGER compliance_scope_review_authority BEFORE INSERT ON threat_compliance_scope_reviews FOR EACH ROW EXECUTE FUNCTION guard_threat_compliance_scope_review();
CREATE TRIGGER compliance_scope_immutable BEFORE UPDATE OR DELETE ON threat_compliance_scope_facts FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
CREATE TRIGGER compliance_scope_review_immutable BEFORE UPDATE OR DELETE ON threat_compliance_scope_reviews FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
