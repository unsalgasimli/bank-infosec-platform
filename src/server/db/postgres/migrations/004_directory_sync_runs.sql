-- PII-free operational history for every directory reconciliation attempt.
-- Full user names, emails, encrypted identity, and raw LDAP payloads are not stored here.
CREATE TABLE IF NOT EXISTS directory_sync_runs (
    id VARCHAR(128) PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('SUCCEEDED', 'REJECTED', 'FAILED')),
    trigger VARCHAR(64) NOT NULL,
    snapshot_hash CHAR(64),
    total_ldap_users INTEGER NOT NULL DEFAULT 0,
    active_users INTEGER NOT NULL DEFAULT 0,
    disabled_users INTEGER NOT NULL DEFAULT 0,
    added_users INTEGER NOT NULL DEFAULT 0,
    updated_users INTEGER NOT NULL DEFAULT 0,
    disabled_now INTEGER NOT NULL DEFAULT 0,
    reenabled_users INTEGER NOT NULL DEFAULT 0,
    duplicates_removed INTEGER NOT NULL DEFAULT 0,
    dry_run BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_directory_sync_runs_completed
    ON directory_sync_runs(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_directory_sync_runs_status
    ON directory_sync_runs(status, completed_at DESC);
