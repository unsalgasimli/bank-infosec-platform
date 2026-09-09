CREATE TABLE threat_owner_attestations (
 id varchar(64) PRIMARY KEY,revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id),
 content_sha256 varchar(64) NOT NULL,attested_by varchar(64) NOT NULL REFERENCES bank_users(id),
 reason text NOT NULL CHECK(length(trim(reason))>=20),attested_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(revision_id,content_sha256,attested_by)
);
CREATE FUNCTION threat_attestation_digest(rid varchar) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object(
 'revision',to_jsonb(r)-ARRAY['status','version','review_cycle','submitted_by_user_id','submitted_at','reviewed_by_user_id','reviewed_at','approved_at','updated_at'],
 'coverage',(SELECT jsonb_agg(jsonb_build_array(id,fingerprint,disposition_id,review_decision) ORDER BY id) FROM threat_analysis_coverage WHERE revision_id=rid),
 'threats',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM threats t WHERE revision_id=rid),
 'requirements',(SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id) FROM threat_security_requirements q WHERE revision_id=rid),
 'controls',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM threat_controls c JOIN threats t ON t.id=c.threat_id WHERE t.revision_id=rid)
 )::text,'UTF8')),'hex') FROM threat_model_revisions r WHERE r.id=rid;
$$;
CREATE FUNCTION guard_threat_owner_attestation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM threat_model_revisions r JOIN threat_models m ON m.current_revision_id=r.id JOIN bank_users u ON u.id=NEW.attested_by
 WHERE r.id=NEW.revision_id AND r.status IN ('DRAFT','CHANGES_REQUIRED') AND u.is_active AND NOT u.roles ? 'AUDITOR' AND u.id=m.technical_owner_id) THEN RAISE EXCEPTION 'Current technical owner attestation required'; END IF;
 IF NEW.content_sha256 IS DISTINCT FROM threat_attestation_digest(NEW.revision_id) THEN RAISE EXCEPTION 'Attestation content changed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER owner_attestation_guard BEFORE INSERT ON threat_owner_attestations FOR EACH ROW EXECUTE FUNCTION guard_threat_owner_attestation();
CREATE TRIGGER owner_attestation_immutable BEFORE UPDATE OR DELETE ON threat_owner_attestations FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
CREATE OR REPLACE FUNCTION guard_threat_coverage_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status IN ('IN_REVIEW','APPROVED') AND OLD.status IS DISTINCT FROM NEW.status THEN
  PERFORM assert_threat_analysis_coverage(NEW.id);
  IF NEW.tier=3 AND NOT EXISTS(SELECT 1 FROM threat_owner_attestations WHERE revision_id=NEW.id AND content_sha256=threat_attestation_digest(NEW.id)) THEN RAISE EXCEPTION 'OWNER_ATTESTATION_MISSING: current technical owner must attest'; END IF;
 END IF; RETURN NEW;
END $$;
