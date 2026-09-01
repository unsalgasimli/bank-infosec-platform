-- Transport progress is source-neutral: adapters account for records fetched
-- from a remote API while the ingestion engine accounts for decisions.
ALTER TABLE cmdb_discovery_sync_runs
    ADD COLUMN IF NOT EXISTS requested_count BIGINT NOT NULL DEFAULT 0 CHECK (requested_count >= 0),
    ADD COLUMN IF NOT EXISTS received_count BIGINT NOT NULL DEFAULT 0 CHECK (received_count >= 0),
    ADD COLUMN IF NOT EXISTS processed_count BIGINT NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
    ADD COLUMN IF NOT EXISTS linked_count BIGINT NOT NULL DEFAULT 0 CHECK (linked_count >= 0),
    ADD COLUMN IF NOT EXISTS ambiguous_count BIGINT NOT NULL DEFAULT 0 CHECK (ambiguous_count >= 0),
    ADD COLUMN IF NOT EXISTS conflict_count BIGINT NOT NULL DEFAULT 0 CHECK (conflict_count >= 0);
