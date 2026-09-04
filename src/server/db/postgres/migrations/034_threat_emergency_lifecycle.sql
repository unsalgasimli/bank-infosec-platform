-- Emergency governance is additional authorization, never a normal-release gate bypass.
CREATE TABLE threat_emergency_changes (
  id varchar(64) PRIMARY KEY,
  threat_model_id varchar(64) NOT NULL REFERENCES threat_models(id) ON DELETE RESTRICT,
  revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id) ON DELETE RESTRICT,
  change_id varchar(64) NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  policy_version_id varchar(64) NOT NULL REFERENCES threat_governance_policy_versions(id) ON DELETE RESTRICT,
  calendar_id varchar(64) NOT NULL REFERENCES orchestration_business_calendars(id) ON DELETE RESTRICT,
  calendar_snapshot jsonb NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','APPROVED','REJECTED','REVOKED','DEPLOYED','CLOSED')),
  reason text NOT NULL,
  security_impact text NOT NULL,
  compensating_controls text NOT NULL,
  rollback_plan text NOT NULL,
  requested_by varchar(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by varchar(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  authorization_expires_at timestamptz,
  deployed_by varchar(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
  deployed_at timestamptz,
  execution_reference varchar(500),
  deployment_attachment_id varchar(64) REFERENCES ticket_attachments(id) ON DELETE RESTRICT,
  release_authorization_id varchar(64) UNIQUE REFERENCES threat_release_authorizations(id) ON DELETE RESTRICT,
  review_due_at timestamptz,
  model_update_due_at timestamptz,
  reviewed_by varchar(64) REFERENCES bank_users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_findings text,
  review_attachment_id varchar(64) REFERENCES ticket_attachments(id) ON DELETE RESTRICT,
  updated_revision_id varchar(64) REFERENCES threat_model_revisions(id) ON DELETE RESTRICT,
  model_updated_at timestamptz,
  closed_at timestamptz,
  review_breached_at timestamptz,
  model_update_breached_at timestamptz,
  CHECK(approved_by IS NULL OR approved_by<>requested_by),
  CHECK(status NOT IN ('APPROVED','DEPLOYED','CLOSED') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND authorization_expires_at>approved_at)),
  CHECK(status NOT IN ('DEPLOYED','CLOSED') OR (deployed_at IS NOT NULL AND deployed_by IS NOT NULL AND release_authorization_id IS NOT NULL AND deployment_attachment_id IS NOT NULL AND review_due_at IS NOT NULL AND model_update_due_at IS NOT NULL)),
  CHECK(reviewed_by IS NULL OR (reviewed_by<>requested_by AND reviewed_by<>deployed_by AND reviewed_by<>approved_by)),
  CHECK(deployed_at IS NULL OR (approved_at IS NOT NULL AND deployed_at>=approved_at AND review_due_at>deployed_at AND model_update_due_at>=review_due_at)),
  CHECK(status<>'CLOSED' OR (reviewed_at IS NOT NULL AND updated_revision_id IS NOT NULL AND model_updated_at IS NOT NULL)),
  UNIQUE(threat_model_id,execution_reference)
);
CREATE UNIQUE INDEX threat_emergency_active_change ON threat_emergency_changes(threat_model_id,change_id) WHERE status IN ('REQUESTED','APPROVED','DEPLOYED');
CREATE INDEX threat_emergency_review_due ON threat_emergency_changes(review_due_at) WHERE status='DEPLOYED' AND reviewed_at IS NULL;
CREATE INDEX threat_emergency_update_due ON threat_emergency_changes(model_update_due_at) WHERE status='DEPLOYED' AND model_updated_at IS NULL;
ALTER TABLE threat_release_authorizations ADD COLUMN emergency_change_id varchar(64) REFERENCES threat_emergency_changes(id) ON DELETE RESTRICT;

CREATE FUNCTION protect_threat_emergency_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Emergency governance history is append-only' USING ERRCODE='55000'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','approved_by','approved_at','authorization_expires_at','deployed_by','deployed_at','execution_reference','deployment_attachment_id','release_authorization_id','review_due_at','model_update_due_at','reviewed_by','reviewed_at','review_findings','review_attachment_id','updated_revision_id','model_updated_at','closed_at','review_breached_at','model_update_breached_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','approved_by','approved_at','authorization_expires_at','deployed_by','deployed_at','execution_reference','deployment_attachment_id','release_authorization_id','review_due_at','model_update_due_at','reviewed_by','reviewed_at','review_findings','review_attachment_id','updated_revision_id','model_updated_at','closed_at','review_breached_at','model_update_breached_at']) THEN
    RAISE EXCEPTION 'Emergency assessment is immutable; submit a new request' USING ERRCODE='55000';
  END IF;
  IF OLD.status IN ('CLOSED','REJECTED','REVOKED') THEN RAISE EXCEPTION 'Terminal emergency record is immutable' USING ERRCODE='55000'; END IF;
  IF NEW.status<>OLD.status AND NOT ((OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED')) OR (OLD.status='APPROVED' AND NEW.status IN ('DEPLOYED','REVOKED')) OR (OLD.status='DEPLOYED' AND NEW.status='CLOSED')) THEN
    RAISE EXCEPTION 'Invalid emergency lifecycle transition' USING ERRCODE='23514';
  END IF;
  IF OLD.approved_at IS NOT NULL AND (NEW.approved_at,NEW.approved_by,NEW.authorization_expires_at) IS DISTINCT FROM (OLD.approved_at,OLD.approved_by,OLD.authorization_expires_at) THEN RAISE EXCEPTION 'Emergency approval is immutable' USING ERRCODE='55000'; END IF;
  IF OLD.deployed_at IS NOT NULL AND (NEW.deployed_at,NEW.deployed_by,NEW.execution_reference,NEW.deployment_attachment_id,NEW.release_authorization_id,NEW.review_due_at,NEW.model_update_due_at) IS DISTINCT FROM (OLD.deployed_at,OLD.deployed_by,OLD.execution_reference,OLD.deployment_attachment_id,OLD.release_authorization_id,OLD.review_due_at,OLD.model_update_due_at) THEN RAISE EXCEPTION 'Deployment evidence and SLA dates are immutable' USING ERRCODE='55000'; END IF;
  IF OLD.reviewed_at IS NOT NULL AND (NEW.reviewed_at,NEW.reviewed_by,NEW.review_findings,NEW.review_attachment_id) IS DISTINCT FROM (OLD.reviewed_at,OLD.reviewed_by,OLD.review_findings,OLD.review_attachment_id) THEN RAISE EXCEPTION 'Post-change review is immutable' USING ERRCODE='55000'; END IF;
  IF OLD.model_updated_at IS NOT NULL AND (NEW.model_updated_at,NEW.updated_revision_id) IS DISTINCT FROM (OLD.model_updated_at,OLD.updated_revision_id) THEN RAISE EXCEPTION 'Model update completion is immutable' USING ERRCODE='55000'; END IF;
  IF (OLD.review_breached_at IS NOT NULL AND NEW.review_breached_at IS DISTINCT FROM OLD.review_breached_at) OR (OLD.model_update_breached_at IS NOT NULL AND NEW.model_update_breached_at IS DISTINCT FROM OLD.model_update_breached_at) THEN RAISE EXCEPTION 'SLA breach history is immutable' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_emergency_history BEFORE UPDATE OR DELETE ON threat_emergency_changes FOR EACH ROW EXECUTE FUNCTION protect_threat_emergency_history();
