-- Expressbank Vault Breaker arcade: per-run score log feeding the workplace leaderboard.
CREATE TABLE IF NOT EXISTS game_breaker_scores (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE CASCADE,
    username VARCHAR(128) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0),
    stage INTEGER NOT NULL DEFAULT 1 CHECK (stage >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_breaker_scores_user_best
    ON game_breaker_scores (user_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_game_breaker_scores_created_at
    ON game_breaker_scores (created_at DESC);
