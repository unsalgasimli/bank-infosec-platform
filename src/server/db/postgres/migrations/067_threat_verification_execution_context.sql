-- A passing verification must be independently reproducible, not just described.
ALTER TABLE control_verifications
  ADD COLUMN IF NOT EXISTS execution_context JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE control_verifications
  ADD CONSTRAINT control_verifications_execution_context_object
  CHECK (jsonb_typeof(execution_context) = 'object') NOT VALID;
