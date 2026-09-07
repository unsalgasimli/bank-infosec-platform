CREATE TABLE threat_compliance_profiles (
 id varchar(64) PRIMARY KEY, organization_id varchar(64) NOT NULL, code varchar(128) NOT NULL, version integer NOT NULL,
 effective_at timestamptz NOT NULL, predicates jsonb NOT NULL, compliance_ids jsonb NOT NULL,
 human_review boolean NOT NULL DEFAULT true, reason text NOT NULL, created_by varchar(64) NOT NULL REFERENCES bank_users(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,code,version)
);
CREATE TABLE threat_compliance_profile_reviews (
 profile_id varchar(64) PRIMARY KEY REFERENCES threat_compliance_profiles(id), reviewer_id varchar(64) NOT NULL REFERENCES bank_users(id),
 decision varchar(16) NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE threat_compliance_applicability_decisions (
 id varchar(64) PRIMARY KEY,revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id),profile_id varchar(64) NOT NULL REFERENCES threat_compliance_profiles(id),
 facts_hash varchar(64) NOT NULL,source_facts jsonb NOT NULL,
 decision varchar(32) NOT NULL CHECK(decision IN ('APPLICABLE','NOT_APPLICABLE','CONDITIONAL','REQUIRES_REVIEW')),
 reason text NOT NULL CHECK(length(trim(reason))>=20),decided_by varchar(64) NOT NULL REFERENCES bank_users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION guard_threat_compliance_authority() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aid varchar(64); original varchar(64); BEGIN
 aid:=COALESCE(to_jsonb(NEW)->>'reviewer_id',to_jsonb(NEW)->>'decided_by',to_jsonb(NEW)->>'created_by');
 IF NOT EXISTS(SELECT 1 FROM bank_users WHERE id=aid AND is_active AND roles ? 'GRC_ANALYST' AND NOT roles ? 'AUDITOR') THEN RAISE EXCEPTION 'Compliance owner authority required'; END IF;
 IF TG_TABLE_NAME='threat_compliance_profile_reviews' THEN SELECT created_by INTO original FROM threat_compliance_profiles WHERE id=NEW.profile_id;IF original=aid THEN RAISE EXCEPTION 'Independent compliance profile review required'; END IF; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE tbl text; BEGIN FOREACH tbl IN ARRAY ARRAY['threat_compliance_profiles','threat_compliance_profile_reviews','threat_compliance_applicability_decisions'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation()',tbl);
 EXECUTE format('CREATE TRIGGER authority_guard BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION guard_threat_compliance_authority()',tbl);
END LOOP;END $$;
CREATE TRIGGER applicability_mutable BEFORE INSERT ON threat_compliance_applicability_decisions FOR EACH ROW EXECUTE FUNCTION protect_threat_revision_content();
