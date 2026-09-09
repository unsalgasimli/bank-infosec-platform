-- Some environments recorded the original governance migration without its
-- audit-chain columns. Reconcile the live schema without rewriting history.
ALTER TABLE threat_model_audit_events
  ADD COLUMN IF NOT EXISTS event_sequence bigint GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN IF NOT EXISTS previous_hash varchar(64),
  ADD COLUMN IF NOT EXISTS event_hash varchar(64);

CREATE INDEX IF NOT EXISTS threat_audit_chain
  ON threat_model_audit_events(threat_model_id, event_sequence DESC);
