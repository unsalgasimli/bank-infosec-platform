-- The generic Risk Register and Threat Model risk links share this
-- PostgreSQL-authoritative table. Existing installations may predate the
-- source_payload compatibility column in schema.sql, so make the migration
-- explicit and safe to rerun.
ALTER TABLE risk_register_items ADD COLUMN IF NOT EXISTS source_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_risk_register_owner_updated ON risk_register_items(risk_owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_register_department ON risk_register_items((source_payload->>'departmentId'));
