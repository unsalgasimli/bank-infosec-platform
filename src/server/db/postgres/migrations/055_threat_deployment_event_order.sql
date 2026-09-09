-- A timestamp is not an event order: multiple transitions can commit together.
ALTER TABLE threat_deployment_events ADD COLUMN event_sequence bigint GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX threat_deployment_event_sequence ON threat_deployment_events(event_sequence);
CREATE OR REPLACE FUNCTION guard_threat_deployment_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous text; BEGIN
 PERFORM 1 FROM threat_deployment_authorizations WHERE id=NEW.authorization_id FOR UPDATE;
 SELECT state INTO previous FROM threat_deployment_events WHERE authorization_id=NEW.authorization_id ORDER BY event_sequence DESC LIMIT 1;
 IF NOT COALESCE((previous IS NULL AND NEW.state='AUTHORIZED') OR
   (previous='AUTHORIZED' AND NEW.state IN ('CONSUMED','EXPIRED_UNUSED','RECONCILIATION_REQUIRED')) OR
   (previous='CONSUMED' AND NEW.state IN ('DEPLOYMENT_STARTED','FAILED','RECONCILIATION_REQUIRED')) OR
   (previous IN ('DEPLOYMENT_STARTED','RECONCILIATION_REQUIRED') AND NEW.state IN ('DEPLOYMENT_STARTED','SUCCEEDED','FAILED','RECONCILIATION_REQUIRED')),false)
 THEN RAISE EXCEPTION 'Invalid deployment lifecycle transition'; END IF;
 IF NEW.state IN ('DEPLOYMENT_STARTED','SUCCEEDED','FAILED') AND NEW.provider_deployment_id IS NULL THEN RAISE EXCEPTION 'Provider execution receipt required'; END IF;
 RETURN NEW;
END $$;
