CREATE TABLE event_consumer_attempts (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,event_id varchar(64) NOT NULL REFERENCES outbox_events(id),
 consumer_name varchar(128) NOT NULL,attempt integer NOT NULL CHECK(attempt>=0),
 state varchar(16) NOT NULL CHECK(state IN ('SUCCEEDED','RETRY','DEAD_LETTER')),error_code varchar(128),
 observed_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,consumer_name,attempt,state)
);
CREATE INDEX event_consumer_attempt_latest ON event_consumer_attempts(event_id,sequence DESC);
CREATE TRIGGER consumer_attempt_history BEFORE UPDATE OR DELETE ON event_consumer_attempts FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
