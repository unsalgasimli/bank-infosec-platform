-- Garden Flight arcade: per-run score log feeding the workplace leaderboard.
-- The login-page miniature keeps its best score locally (no identity there yet);
-- authenticated play inside the main app records runs here for the acting user.
CREATE TABLE IF NOT EXISTS game_flight_scores (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE CASCADE,
    username VARCHAR(128) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_flight_scores_user_best
    ON game_flight_scores (user_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_game_flight_scores_created_at
    ON game_flight_scores (created_at DESC);
