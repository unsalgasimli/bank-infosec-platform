-- 047 used the API/view alias; the canonical threats column is threat_lineage_id.
CREATE OR REPLACE FUNCTION guard_threat_exception_renewal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior varchar(64); current_threat threats; rid varchar(64); mid varchar(64); review threat_exception_escalation_reviews; model_status varchar(32);
BEGIN
  SELECT * INTO current_threat FROM threats WHERE id=NEW.threat_id;
  SELECT r.id,r.threat_model_id,m.status INTO rid,mid,model_status FROM threat_model_revisions r JOIN threat_models m ON m.id=r.threat_model_id WHERE r.id=current_threat.revision_id FOR UPDATE OF m;
  IF TG_OP='UPDATE' AND NEW.status='APPROVED' AND OLD.status IS DISTINCT FROM 'APPROVED' AND (model_status IN ('RETIRED','ARCHIVED') OR NOT EXISTS(SELECT 1 FROM threat_models WHERE id=mid AND current_revision_id=rid)) THEN RAISE EXCEPTION 'Only the current active model revision may approve an exception' USING ERRCODE='23514'; END IF;
  SELECT e.id INTO prior FROM threat_model_exceptions e JOIN threats p ON p.id=e.threat_id WHERE p.threat_lineage_id=current_threat.threat_lineage_id AND e.approved_at IS NOT NULL AND e.id<>NEW.id ORDER BY e.approved_at DESC,e.id DESC LIMIT 1;
  IF TG_OP='INSERT' THEN
    NEW.renewal_of:=prior;NEW.escalation_required:=prior IS NOT NULL AND NEW.risk_level IN ('HIGH','CRITICAL');
    IF prior IS NOT NULL THEN
      IF NULLIF(trim(NEW.renewal_rationale),'') IS NULL OR NULLIF(trim(NEW.remediation_status),'') IS NULL OR NEW.assessment_evidence_id IS NULL THEN RAISE EXCEPTION 'Renewal requires a fresh assessment, remediation status and current evidence' USING ERRCODE='23514'; END IF;
      NEW.assessment_sha256:=threat_exception_assessment_hash(current_threat.id);
    END IF;
  ELSIF (NEW.renewal_of,NEW.renewal_rationale,NEW.remediation_status,NEW.assessment_evidence_id,NEW.assessment_sha256,NEW.escalation_required) IS DISTINCT FROM (OLD.renewal_of,OLD.renewal_rationale,OLD.remediation_status,OLD.assessment_evidence_id,OLD.assessment_sha256,OLD.escalation_required) THEN RAISE EXCEPTION 'Renewal assessment is immutable; create a fresh request' USING ERRCODE='55000'; END IF;
  IF NEW.renewal_of IS NOT NULL AND (TG_OP='INSERT' OR NEW.status='APPROVED' AND OLD.status IS DISTINCT FROM 'APPROVED') THEN
    IF NEW.renewal_of IS DISTINCT FROM prior OR NEW.assessment_sha256 IS DISTINCT FROM threat_exception_assessment_hash(current_threat.id) THEN RAISE EXCEPTION 'Renewal assessment is stale; reassess current residual risk and prior approval' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM threat_model_evidence e JOIN ticket_attachments a ON a.id=e.attachment_id WHERE e.id=NEW.assessment_evidence_id AND e.threat_model_id=mid AND e.revision_id=rid AND a.source_payload->>'virusScanStatus'='CLEAN' AND a.sha256_hash ~ '^[a-fA-F0-9]{64}$') THEN RAISE EXCEPTION 'Renewal requires clean evidence retained in the current revision' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND NEW.escalation_required THEN
      SELECT * INTO review FROM threat_exception_escalation_reviews WHERE exception_id=NEW.id;
      IF review.exception_id IS NULL OR review.reviewed_by=NEW.approver_id OR review.assessment_sha256<>NEW.assessment_sha256 THEN RAISE EXCEPTION 'Repeated High or Critical exception requires independent escalation review before CISO approval' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
