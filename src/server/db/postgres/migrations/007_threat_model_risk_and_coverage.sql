-- Threat Models retain their dedicated security domain while making their
-- governance relationship to enterprise risks and migration coverage queryable.

CREATE TABLE IF NOT EXISTS threat_model_risk_links (
  id VARCHAR(64) PRIMARY KEY,
  threat_model_id VARCHAR(64) NOT NULL REFERENCES threat_models(id) ON DELETE RESTRICT,
  threat_id VARCHAR(64) NOT NULL REFERENCES threats(id) ON DELETE RESTRICT,
  risk_register_item_id VARCHAR(64) NOT NULL REFERENCES risk_register_items(id) ON DELETE RESTRICT,
  link_reason TEXT NOT NULL,
  created_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(threat_id),
  UNIQUE(risk_register_item_id)
);

CREATE INDEX IF NOT EXISTS idx_tm_risk_links_model ON threat_model_risk_links(threat_model_id, created_at DESC);

CREATE TABLE IF NOT EXISTS threat_model_migration_backlog (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL,
  system_name VARCHAR(255) NOT NULL,
  service_id VARCHAR(64),
  asset_id VARCHAR(64),
  project_id VARCHAR(64),
  tier VARCHAR(16) NOT NULL CHECK (tier IN ('TIER_1','TIER_2','TIER_3')),
  status VARCHAR(32) NOT NULL CHECK (status IN ('NOT_STARTED','PLANNED','IN_PROGRESS','APPROVED','OVERDUE')),
  criticality VARCHAR(16) NOT NULL CHECK (criticality IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  owner_id VARCHAR(64) REFERENCES bank_users(id) ON DELETE SET NULL,
  target_date DATE,
  current_threat_model_id VARCHAR(64) REFERENCES threat_models(id) ON DELETE SET NULL,
  notes TEXT,
  created_by_user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, system_name)
);

CREATE INDEX IF NOT EXISTS idx_tm_migration_backlog_tier_status ON threat_model_migration_backlog(organization_id, tier, status);
