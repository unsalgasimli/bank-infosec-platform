-- Policy changes alter release-affecting governance thresholds and therefore
-- need their own append-only history, separate from individual model history.
CREATE TABLE IF NOT EXISTS threat_model_policy_audit_events (
    id VARCHAR(64) PRIMARY KEY,
    policy_id VARCHAR(64) NOT NULL REFERENCES threat_model_policies(id) ON DELETE RESTRICT,
    organization_id VARCHAR(64) NOT NULL,
    actor_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
    old_policy JSONB,
    new_policy JSONB NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_threat_model_policy_audit_org ON threat_model_policy_audit_events(organization_id, occurred_at DESC);
DROP TRIGGER IF EXISTS threat_model_policy_audit_append_only ON threat_model_policy_audit_events;
CREATE TRIGGER threat_model_policy_audit_append_only BEFORE UPDATE OR DELETE ON threat_model_policy_audit_events FOR EACH ROW EXECUTE FUNCTION prevent_threat_model_history_mutation();
