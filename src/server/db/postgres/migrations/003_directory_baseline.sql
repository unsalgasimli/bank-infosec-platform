-- External HR workbook baseline for safe AD reconciliation.
-- These rows are reference evidence only; they never create login identities.
CREATE TABLE IF NOT EXISTS directory_baseline_entries (
    employee_id VARCHAR(64) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    structure_name VARCHAR(255) NOT NULL,
    hire_date DATE,
    normalized_full_name VARCHAR(255) NOT NULL,
    department_id VARCHAR(128) NOT NULL,
    section_id VARCHAR(128),
    section_name VARCHAR(255),
    unit_id VARCHAR(128),
    unit_name VARCHAR(255),
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_directory_baseline_current_name
    ON directory_baseline_entries(is_current, normalized_full_name);
CREATE INDEX IF NOT EXISTS idx_directory_baseline_current_structure
    ON directory_baseline_entries(is_current, structure_name);
