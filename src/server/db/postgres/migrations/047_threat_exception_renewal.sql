ALTER TABLE threat_model_exceptions
  ADD COLUMN renewal_of varchar(64) REFERENCES threat_model_exceptions(id),
  ADD COLUMN renewal_rationale varchar(4000), ADD COLUMN remediation_status varchar(4000),
  ADD COLUMN assessment_evidence_id varchar(64) REFERENCES threat_model_evidence(id),
  ADD COLUMN assessment_sha256 varchar(64), ADD COLUMN escalation_required boolean NOT NULL DEFAULT false;
CREATE FUNCTION threat_exception_assessment_hash(tid varchar) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT encode(digest(jsonb_build_object('threatId',t.id,'contentVersion',t.content_version,'architectureVersion',r.architecture_version,'inherentScore',t.inherent_score,'residualScore',t.residual_score,'residualRationale',t.residual_risk_rationale,'residualAssessedAt',t.residual_risk_calculated_at)::text,'sha256'),'hex') FROM threats t JOIN threat_model_revisions r ON r.id=t.revision_id WHERE t.id=tid
$$;
CREATE TABLE threat_exception_escalation_reviews (
  exception_id varchar(64) PRIMARY KEY REFERENCES threat_model_exceptions(id),
  assessment_sha256 varchar(64) NOT NULL, reason varchar(4000) NOT NULL CHECK(length(trim(reason))>0),
  reviewed_by varchar(64) NOT NULL REFERENCES bank_users(id),reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION guard_threat_exception_renewal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior varchar(64); t threats; rid varchar(64); mid varchar(64); review threat_exception_escalation_reviews;
BEGIN
  SELECT * INTO t FROM threats WHERE id=NEW.threat_id;
  SELECT r.id,r.threat_model_id INTO rid,mid FROM threat_model_revisions r WHERE r.id=t.revision_id;
  SELECT e.id INTO prior FROM threat_model_exceptions e JOIN threats p ON p.id=e.threat_id WHERE p.lineage_id=t.lineage_id AND e.approved_at IS NOT NULL AND e.id<>NEW.id ORDER BY e.approved_at DESC,e.id DESC LIMIT 1;
  IF TG_OP='INSERT' THEN
    NEW.renewal_of:=prior;NEW.escalation_required:=prior IS NOT NULL AND NEW.risk_level IN ('HIGH','CRITICAL');
    IF prior IS NOT NULL THEN
      IF NULLIF(trim(NEW.renewal_rationale),'') IS NULL OR NULLIF(trim(NEW.remediation_status),'') IS NULL OR NEW.assessment_evidence_id IS NULL THEN RAISE EXCEPTION 'Renewal requires a fresh assessment, remediation status and current evidence' USING ERRCODE='23514'; END IF;
      NEW.assessment_sha256:=threat_exception_assessment_hash(t.id);
    END IF;
  ELSIF (NEW.renewal_of,NEW.renewal_rationale,NEW.remediation_status,NEW.assessment_evidence_id,NEW.assessment_sha256,NEW.escalation_required) IS DISTINCT FROM (OLD.renewal_of,OLD.renewal_rationale,OLD.remediation_status,OLD.assessment_evidence_id,OLD.assessment_sha256,OLD.escalation_required) THEN RAISE EXCEPTION 'Renewal assessment is immutable; create a fresh request' USING ERRCODE='55000'; END IF;
  IF NEW.renewal_of IS NOT NULL AND (TG_OP='INSERT' OR NEW.status='APPROVED' AND OLD.status IS DISTINCT FROM 'APPROVED') THEN
    IF NEW.renewal_of IS DISTINCT FROM prior OR NEW.assessment_sha256 IS DISTINCT FROM threat_exception_assessment_hash(t.id) THEN RAISE EXCEPTION 'Renewal assessment is stale; reassess current residual risk and prior approval' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM threat_model_evidence e JOIN ticket_attachments a ON a.id=e.attachment_id WHERE e.id=NEW.assessment_evidence_id AND e.threat_model_id=mid AND e.revision_id=rid AND a.source_payload->>'virusScanStatus'='CLEAN' AND a.sha256_hash ~ '^[a-fA-F0-9]{64}$') THEN RAISE EXCEPTION 'Renewal requires clean evidence retained in the current revision' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND NEW.escalation_required THEN
      SELECT * INTO review FROM threat_exception_escalation_reviews WHERE exception_id=NEW.id;
      IF review.exception_id IS NULL OR review.reviewed_by=NEW.approver_id OR review.assessment_sha256<>NEW.assessment_sha256 THEN RAISE EXCEPTION 'Repeated High or Critical exception requires independent escalation review before CISO approval' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER exception_renewal_guard BEFORE INSERT OR UPDATE ON threat_model_exceptions FOR EACH ROW EXECUTE FUNCTION guard_threat_exception_renewal();
CREATE FUNCTION guard_threat_exception_escalation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e threat_model_exceptions; roles jsonb;
BEGIN
  SELECT * INTO e FROM threat_model_exceptions WHERE id=NEW.exception_id FOR UPDATE;
  SELECT u.roles INTO roles FROM bank_users u WHERE u.id=NEW.reviewed_by AND u.is_active;
  IF roles IS NULL OR roles ? 'AUDITOR' OR NOT(roles ?| ARRAY['CISO','INFOSEC_ADMIN','INFOSEC_MANAGER','APPSEC_ANALYST']) OR e.requested_by_user_id=NEW.reviewed_by THEN RAISE EXCEPTION 'Independent security escalation reviewer required' USING ERRCODE='23514'; END IF;
  IF NOT e.escalation_required OR e.status NOT IN ('REQUESTED','UNDER_REVIEW') OR e.assessment_sha256 IS DISTINCT FROM threat_exception_assessment_hash(e.threat_id) THEN RAISE EXCEPTION 'Current pending renewal assessment required for escalation' USING ERRCODE='23514'; END IF;
  NEW.assessment_sha256:=e.assessment_sha256;RETURN NEW;
END $$;
CREATE TRIGGER exception_escalation_guard BEFORE INSERT ON threat_exception_escalation_reviews FOR EACH ROW EXECUTE FUNCTION guard_threat_exception_escalation();
CREATE TRIGGER exception_escalation_immutable BEFORE UPDATE OR DELETE ON threat_exception_escalation_reviews FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
