-- Phase 1 identity-resolution integrity hardening.
--
-- cmdb_source_records is the existing source-identity ledger: the connector,
-- object type and external object id are immutable as a composite identity.
-- This migration does not introduce a second source-identity abstraction.

-- Use the public, source-neutral outcome names in all newly persisted
-- decisions. Preserve prior evidence by translating the earlier vocabulary.
-- Existing checks must be removed before the in-place translation can run.
ALTER TABLE cmdb_source_records DROP CONSTRAINT IF EXISTS cmdb_source_records_last_correlation_outcome_check;
ALTER TABLE cmdb_correlation_decisions DROP CONSTRAINT IF EXISTS cmdb_correlation_decisions_outcome_check;
ALTER TABLE cmdb_correlation_decisions DROP CONSTRAINT IF EXISTS cmdb_correlation_decisions_check;
ALTER TABLE cmdb_correlation_cases DROP CONSTRAINT IF EXISTS cmdb_correlation_cases_outcome_check;

UPDATE cmdb_source_records
SET last_correlation_outcome = CASE last_correlation_outcome
    WHEN 'MATCHED' THEN 'AUTO_LINK'
    WHEN 'NO_MATCH' THEN 'CREATE_NEW'
    WHEN 'POSSIBLE_MATCH' THEN 'REVIEW_REQUIRED'
    WHEN 'CONFLICT' THEN 'IDENTITY_CONFLICT'
    ELSE last_correlation_outcome
END
WHERE last_correlation_outcome IN ('MATCHED','NO_MATCH','POSSIBLE_MATCH','CONFLICT');

UPDATE cmdb_correlation_decisions
SET outcome = CASE outcome
    WHEN 'MATCHED' THEN 'AUTO_LINK'
    WHEN 'NO_MATCH' THEN 'CREATE_NEW'
    WHEN 'POSSIBLE_MATCH' THEN 'REVIEW_REQUIRED'
    WHEN 'CONFLICT' THEN 'IDENTITY_CONFLICT'
    ELSE outcome
END
WHERE outcome IN ('MATCHED','NO_MATCH','POSSIBLE_MATCH','CONFLICT');

UPDATE cmdb_correlation_cases
SET outcome = CASE outcome
    WHEN 'POSSIBLE_MATCH' THEN 'REVIEW_REQUIRED'
    WHEN 'CONFLICT' THEN 'IDENTITY_CONFLICT'
    ELSE outcome
END
WHERE outcome IN ('POSSIBLE_MATCH','CONFLICT');

ALTER TABLE cmdb_source_records ADD CONSTRAINT cmdb_source_records_last_correlation_outcome_check
    CHECK (last_correlation_outcome IS NULL OR last_correlation_outcome IN ('AUTO_LINK','CREATE_NEW','REVIEW_REQUIRED','IDENTITY_CONFLICT'));

ALTER TABLE cmdb_correlation_decisions ADD CONSTRAINT cmdb_correlation_decisions_outcome_check
    CHECK (outcome IN ('AUTO_LINK','CREATE_NEW','REVIEW_REQUIRED','IDENTITY_CONFLICT'));
ALTER TABLE cmdb_correlation_decisions ADD CONSTRAINT cmdb_correlation_decisions_selected_asset_check
    CHECK ((outcome IN ('AUTO_LINK','CREATE_NEW')) OR selected_asset_id IS NULL);

ALTER TABLE cmdb_correlation_cases ADD CONSTRAINT cmdb_correlation_cases_outcome_check
    CHECK (outcome IN ('REVIEW_REQUIRED','IDENTITY_CONFLICT'));

-- A strong canonical identifier has exactly one active claimant. The claims
-- table provides a real database uniqueness boundary, while the trigger keeps
-- it synchronized even if a future adapter writes identifiers directly.
CREATE TABLE IF NOT EXISTS cmdb_strong_identity_claims (
    identifier_type_id VARCHAR(64) NOT NULL REFERENCES cmdb_identifier_types(id) ON DELETE RESTRICT,
    namespace VARCHAR(255) NOT NULL,
    normalized_value VARCHAR(512) NOT NULL,
    asset_id VARCHAR(64) NOT NULL REFERENCES configuration_items(id) ON DELETE RESTRICT,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (identifier_type_id, namespace, normalized_value),
    CHECK (btrim(namespace) <> ''),
    CHECK (btrim(normalized_value) <> '')
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM cmdb_asset_identifiers ai
        JOIN cmdb_identifier_types it ON it.id=ai.identifier_type_id AND it.is_strong_identity
        WHERE ai.retired_at IS NULL
        GROUP BY ai.identifier_type_id, ai.namespace, ai.normalized_value
        HAVING count(DISTINCT ai.asset_id) > 1
    ) THEN
        RAISE EXCEPTION 'CMDB strong identifier collision requires reconciliation before identity claims can be enabled'
            USING ERRCODE = '23505';
    END IF;
END $$;

INSERT INTO cmdb_strong_identity_claims(identifier_type_id, namespace, normalized_value, asset_id)
SELECT ai.identifier_type_id, ai.namespace, ai.normalized_value, min(ai.asset_id)
FROM cmdb_asset_identifiers ai
JOIN cmdb_identifier_types it ON it.id=ai.identifier_type_id AND it.is_strong_identity
WHERE ai.retired_at IS NULL
GROUP BY ai.identifier_type_id, ai.namespace, ai.normalized_value
ON CONFLICT(identifier_type_id, namespace, normalized_value) DO UPDATE
SET asset_id=EXCLUDED.asset_id, updated_at=NOW();

CREATE OR REPLACE FUNCTION cmdb_enforce_strong_identity_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    old_is_strong BOOLEAN := FALSE;
    new_is_strong BOOLEAN := FALSE;
    claimed_asset_id VARCHAR(64);
    claim_key TEXT;
BEGIN
    IF TG_OP IN ('UPDATE','DELETE') THEN
        SELECT is_strong_identity INTO old_is_strong FROM cmdb_identifier_types WHERE id=OLD.identifier_type_id;
        IF old_is_strong AND OLD.retired_at IS NULL THEN
            claim_key := format('cmdb:strong-claim:%s:%s:%s', OLD.identifier_type_id, OLD.namespace, OLD.normalized_value);
            PERFORM pg_advisory_xact_lock(hashtextextended(claim_key, 0));
            DELETE FROM cmdb_strong_identity_claims
            WHERE identifier_type_id=OLD.identifier_type_id AND namespace=OLD.namespace
              AND normalized_value=OLD.normalized_value AND asset_id=OLD.asset_id;
        END IF;
    END IF;

    IF TG_OP IN ('INSERT','UPDATE') THEN
        SELECT is_strong_identity INTO new_is_strong FROM cmdb_identifier_types WHERE id=NEW.identifier_type_id;
        IF new_is_strong AND NEW.retired_at IS NULL THEN
            claim_key := format('cmdb:strong-claim:%s:%s:%s', NEW.identifier_type_id, NEW.namespace, NEW.normalized_value);
            PERFORM pg_advisory_xact_lock(hashtextextended(claim_key, 0));
            INSERT INTO cmdb_strong_identity_claims(identifier_type_id,namespace,normalized_value,asset_id)
            VALUES(NEW.identifier_type_id,NEW.namespace,NEW.normalized_value,NEW.asset_id)
            ON CONFLICT(identifier_type_id,namespace,normalized_value) DO UPDATE
            SET updated_at=NOW()
            WHERE cmdb_strong_identity_claims.asset_id=EXCLUDED.asset_id
            RETURNING asset_id INTO claimed_asset_id;
            IF claimed_asset_id IS NULL THEN
                SELECT asset_id INTO claimed_asset_id
                FROM cmdb_strong_identity_claims
                WHERE identifier_type_id=NEW.identifier_type_id AND namespace=NEW.namespace
                  AND normalized_value=NEW.normalized_value;
                RAISE EXCEPTION 'Strong CMDB identifier %/% is already claimed by canonical asset %', NEW.identifier_type_id, NEW.normalized_value, claimed_asset_id
                    USING ERRCODE = '23505';
            END IF;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_cmdb_enforce_strong_identity_claim ON cmdb_asset_identifiers;
CREATE TRIGGER trg_cmdb_enforce_strong_identity_claim
BEFORE INSERT OR UPDATE OR DELETE ON cmdb_asset_identifiers
FOR EACH ROW EXECUTE FUNCTION cmdb_enforce_strong_identity_claim();

CREATE INDEX IF NOT EXISTS idx_cmdb_strong_identity_claim_asset
    ON cmdb_strong_identity_claims(asset_id);
