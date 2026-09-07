ALTER TABLE threat_models DROP CONSTRAINT threat_models_status_check;
ALTER TABLE threat_models ADD CONSTRAINT threat_models_status_check CHECK(status IN ('DRAFT','IN_REVIEW','CHANGES_REQUIRED','APPROVED','REVIEW_REQUIRED','SUPERSEDED','RETIRED','ARCHIVED'));
ALTER TABLE threat_models ADD COLUMN retired_at timestamptz, ADD COLUMN archived_at timestamptz,
  ADD COLUMN retention_policy_version_id varchar(64) REFERENCES threat_governance_policy_versions(id);
CREATE TABLE threat_retirement_requests (
  id varchar(64) PRIMARY KEY, threat_model_id varchar(64) NOT NULL REFERENCES threat_models(id),
  revision_id varchar(64) NOT NULL REFERENCES threat_model_revisions(id), model_version integer NOT NULL,
  change_ticket_id varchar(64) NOT NULL REFERENCES tickets(id), attachment_id varchar(64) NOT NULL REFERENCES ticket_attachments(id),
  reason varchar(4000) NOT NULL CHECK(length(trim(reason))>0),requested_by varchar(64) NOT NULL REFERENCES bank_users(id),requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE threat_retirement_decisions (
  id varchar(64) PRIMARY KEY, request_id varchar(64) NOT NULL UNIQUE REFERENCES threat_retirement_requests(id),
  decision varchar(16) NOT NULL CHECK(decision IN ('APPROVED','REJECTED')), reason varchar(4000) NOT NULL CHECK(length(trim(reason))>0),
  decided_by varchar(64) NOT NULL REFERENCES bank_users(id),decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION guard_threat_retirement_request() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE model threat_models; roles jsonb;
BEGIN
  SELECT * INTO model FROM threat_models WHERE id=NEW.threat_model_id FOR UPDATE;
  SELECT u.roles INTO roles FROM bank_users u WHERE u.id=NEW.requested_by AND u.is_active;
  IF roles IS NULL OR roles ? 'AUDITOR' OR NOT(COALESCE(NEW.requested_by IN (model.business_owner_id,model.technical_owner_id,model.security_owner_id),false) OR roles ?| ARRAY['CISO','INFOSEC_ADMIN','INFOSEC_MANAGER','APPSEC_ANALYST']) THEN RAISE EXCEPTION 'Model owner or security authority required for retirement request' USING ERRCODE='23514'; END IF;
  IF model.version<>NEW.model_version OR model.current_revision_id<>NEW.revision_id OR model.status NOT IN ('APPROVED','REVIEW_REQUIRED','DRAFT','CHANGES_REQUIRED') THEN RAISE EXCEPTION 'Current active model assessment required for retirement' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM threat_retirement_requests q LEFT JOIN threat_retirement_decisions d ON d.request_id=q.id WHERE q.threat_model_id=model.id AND q.model_version=model.version AND d.id IS NULL) THEN RAISE EXCEPTION 'An undecided retirement request already exists for this model version' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER retirement_request_guard BEFORE INSERT ON threat_retirement_requests FOR EACH ROW EXECUTE FUNCTION guard_threat_retirement_request();
CREATE TABLE threat_retention_events (
  id varchar(64) PRIMARY KEY, threat_model_id varchar(64) NOT NULL REFERENCES threat_models(id),
  action varchar(32) NOT NULL CHECK(action IN ('HOLD_SET','HOLD_RELEASED','ARCHIVED','RETENTION_EXTENDED')),
  retain_until timestamptz, reason varchar(4000) NOT NULL CHECK(length(trim(reason))>0),
  actor_id varchar(64) NOT NULL REFERENCES bank_users(id),occurred_at timestamptz NOT NULL DEFAULT now(),event_sequence bigint GENERATED ALWAYS AS IDENTITY
);
CREATE FUNCTION apply_threat_retirement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request threat_retirement_requests; model threat_models; policy threat_governance_policy_versions; roles jsonb;
BEGIN
  SELECT * INTO request FROM threat_retirement_requests WHERE id=NEW.request_id;
  SELECT * INTO model FROM threat_models WHERE id=request.threat_model_id FOR UPDATE;
  SELECT u.roles INTO roles FROM bank_users u WHERE u.id=NEW.decided_by AND u.is_active;
  IF roles IS NULL OR NOT roles ? 'CISO' OR roles ? 'AUDITOR' OR NEW.decided_by=request.requested_by THEN RAISE EXCEPTION 'Independent CISO retirement approval is required' USING ERRCODE='23514'; END IF;
  IF NEW.decision='REJECTED' THEN RETURN NEW; END IF;
  IF model.version<>request.model_version OR model.current_revision_id<>request.revision_id OR model.status NOT IN ('APPROVED','REVIEW_REQUIRED','DRAFT','CHANGES_REQUIRED') THEN RAISE EXCEPTION 'Model changed; fresh retirement assessment is required' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM threat_emergency_changes WHERE threat_model_id=model.id AND status IN ('REQUESTED','APPROVED','DEPLOYED')) THEN RAISE EXCEPTION 'Open emergency obligations block retirement' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM ticket_attachments a JOIN tickets t ON t.id=a.ticket_id WHERE a.id=request.attachment_id AND t.id=request.change_ticket_id AND t.category='CHANGE_REQUEST' AND a.source_payload->>'virusScanStatus'='CLEAN' AND a.sha256_hash ~ '^[a-fA-F0-9]{64}$') THEN RAISE EXCEPTION 'Clean retained decommission evidence is required' USING ERRCODE='23514'; END IF;
  SELECT * INTO policy FROM threat_governance_policy_versions WHERE organization_id=model.organization_id AND effective_at<=now() ORDER BY version DESC LIMIT 1;
  IF policy.id IS NULL THEN RAISE EXCEPTION 'An effective retention policy is required' USING ERRCODE='23514'; END IF;
  UPDATE threat_models SET status='RETIRED',retired_at=now(),next_review_at=NULL,
    retain_until=GREATEST(retain_until,now()+make_interval(years=>GREATEST(7,COALESCE((policy.config->>'retentionYearsAfterDecommission')::integer,7)))),
    retention_policy_version_id=policy.id,version=version+1,updated_at=now() WHERE id=model.id;
  RETURN NEW;
END $$;
CREATE TRIGGER retirement_decision_guard BEFORE INSERT ON threat_retirement_decisions FOR EACH ROW EXECUTE FUNCTION apply_threat_retirement();
CREATE FUNCTION apply_threat_retention_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE model threat_models; roles jsonb; last_holder varchar(64);
BEGIN
  SELECT * INTO model FROM threat_models WHERE id=NEW.threat_model_id FOR UPDATE;
  SELECT u.roles INTO roles FROM bank_users u WHERE u.id=NEW.actor_id AND u.is_active;
  IF roles IS NULL OR roles ? 'AUDITOR' OR NOT(roles ?| ARRAY['CISO','INFOSEC_ADMIN','INFOSEC_MANAGER','GRC_ANALYST']) THEN RAISE EXCEPTION 'Retention governance authority is required' USING ERRCODE='23514'; END IF;
  IF NEW.action='HOLD_SET' THEN
    IF model.legal_hold THEN RAISE EXCEPTION 'Legal hold is already active' USING ERRCODE='23514'; END IF;
    UPDATE threat_models SET legal_hold=true,version=version+1 WHERE id=model.id;
  ELSIF NEW.action='HOLD_RELEASED' THEN
    SELECT actor_id INTO last_holder FROM threat_retention_events WHERE threat_model_id=model.id AND action='HOLD_SET' ORDER BY event_sequence DESC LIMIT 1;
    IF NOT model.legal_hold OR NOT roles ? 'CISO' OR last_holder=NEW.actor_id THEN RAISE EXCEPTION 'Independent CISO approval required to release a legal hold' USING ERRCODE='23514'; END IF;
    UPDATE threat_models SET legal_hold=false,version=version+1 WHERE id=model.id;
  ELSIF NEW.action='ARCHIVED' THEN
    IF model.status<>'RETIRED' THEN RAISE EXCEPTION 'Only a retired model may be archived' USING ERRCODE='23514'; END IF;
    UPDATE threat_models SET status='ARCHIVED',archived_at=now(),version=version+1 WHERE id=model.id;
  ELSE
    IF NEW.retain_until IS NULL OR NEW.retain_until<=COALESCE(model.retain_until,now()) THEN RAISE EXCEPTION 'Retention may only be extended' USING ERRCODE='23514'; END IF;
    UPDATE threat_models SET retain_until=NEW.retain_until,version=version+1 WHERE id=model.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER retention_event_guard BEFORE INSERT ON threat_retention_events FOR EACH ROW EXECUTE FUNCTION apply_threat_retention_event();
CREATE FUNCTION guard_threat_retention_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth()<2 AND (NEW.legal_hold IS DISTINCT FROM OLD.legal_hold OR NEW.retain_until IS DISTINCT FROM OLD.retain_until OR NEW.retired_at IS DISTINCT FROM OLD.retired_at OR NEW.archived_at IS DISTINCT FROM OLD.archived_at OR NEW.retention_policy_version_id IS DISTINCT FROM OLD.retention_policy_version_id OR (NEW.status<>OLD.status AND (NEW.status IN ('RETIRED','ARCHIVED') OR OLD.status IN ('RETIRED','ARCHIVED')))) THEN RAISE EXCEPTION 'Retention and retirement require an audited governance decision' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER retention_metadata_guard BEFORE UPDATE ON threat_models FOR EACH ROW EXECUTE FUNCTION guard_threat_retention_metadata();
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['threat_retirement_requests','threat_retirement_decisions','threat_retention_events'] LOOP
    EXECUTE format('CREATE TRIGGER retention_history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation()',tbl);
  END LOOP;
END $$;
