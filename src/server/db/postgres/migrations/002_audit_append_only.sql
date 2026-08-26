-- Audit evidence must remain append-only after it is committed.
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_events(correlation_id) WHERE correlation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only; % is not permitted', TG_OP
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
