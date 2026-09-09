-- Capture an actionable source change in the same transaction, including when
-- the source is resolved again before the periodic worker observes it.
CREATE FUNCTION capture_threat_finding_impact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 WITH added AS (
  INSERT INTO threat_finding_impact_events(id,model_id,revision_id,threat_id,control_id,finding_id,policy_id,fingerprint,effect,reason)
  SELECT gen_random_uuid()::text,model_id,revision_id,threat_id,control_id,finding_id,policy_id,fingerprint,effect,reason FROM threat_automatic_finding_impacts WHERE finding_id=NEW.id
  ON CONFLICT DO NOTHING RETURNING *
 ) INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload,correlation_id,occurred_at)
 SELECT gen_random_uuid()::text,'threat-control.verification.required','THREAT_CONTROL',control_id,
 jsonb_build_object('threatModelId',model_id,'controlId',control_id,'threatId',threat_id,'reason','FINDING_REASSESSMENT_REQUIRED','findingId',finding_id,'policyId',policy_id,'fingerprint',fingerprint),id,now() FROM added;
 RETURN NEW;
END $$;
CREATE TRIGGER finding_threat_capture AFTER INSERT OR UPDATE OF severity,state,details,finding_type,asset_id ON cmdb_security_findings FOR EACH ROW EXECUTE FUNCTION capture_threat_finding_impact();
