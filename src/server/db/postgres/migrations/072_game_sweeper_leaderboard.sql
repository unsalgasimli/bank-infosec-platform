-- Expressbank Cyber Sweeper arcade: per-run score log feeding the workplace leaderboard.
CREATE TABLE IF NOT EXISTS game_sweeper_scores (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES bank_users(id) ON DELETE CASCADE,
    username VARCHAR(128) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    seconds INTEGER NOT NULL CHECK (seconds >= 0),
    difficulty VARCHAR(32) NOT NULL DEFAULT 'novice',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_sweeper_scores_user_best
    ON game_sweeper_scores (user_id, difficulty, seconds ASC);
CREATE INDEX IF NOT EXISTS idx_game_sweeper_scores_created_at
    ON game_sweeper_scores (created_at DESC);
