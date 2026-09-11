-- A daily CMDB refresh is one durable, serial batch.  It intentionally does
-- not depend on an open browser tab: completion of one source advances the
-- next source through the transactional outbox consumer.
CREATE TABLE IF NOT EXISTS cmdb_discovery_sync_batches (
    id VARCHAR(64) PRIMARY KEY,
    state VARCHAR(24) NOT NULL CHECK (state IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED')),
    requested_by_user_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
    correlation_id VARCHAR(128) NOT NULL UNIQUE,
    source_count INTEGER NOT NULL CHECK (source_count > 0),
    completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
    failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmdb_discovery_active_sync_batch
    ON cmdb_discovery_sync_batches ((1)) WHERE state='RUNNING';

CREATE TABLE IF NOT EXISTS cmdb_discovery_sync_batch_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_sync_batches(id) ON DELETE RESTRICT,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    connector_id VARCHAR(64) NOT NULL REFERENCES cmdb_discovery_connectors(id) ON DELETE RESTRICT,
    connector_type_id VARCHAR(64) NOT NULL,
    sync_run_id VARCHAR(64) REFERENCES cmdb_discovery_sync_runs(id) ON DELETE RESTRICT,
    state VARCHAR(24) NOT NULL CHECK (state IN ('PENDING','QUEUED','RUNNING','SUCCEEDED','PARTIAL','FAILED','SKIPPED')),
    queued_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failure_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(batch_id, sequence),
    UNIQUE(batch_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_cmdb_discovery_sync_batch_items_progress
    ON cmdb_discovery_sync_batch_items(batch_id, sequence, state);
