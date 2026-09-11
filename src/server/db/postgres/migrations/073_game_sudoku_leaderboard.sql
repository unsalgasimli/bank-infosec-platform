-- Expressbank Cyber Sudoku arcade: per-run score log feeding the workplace leaderboard.
CREATE TABLE IF NOT EXISTS game_sudoku_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    username VARCHAR(64) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    seconds INTEGER NOT NULL,
    difficulty VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_sudoku_scores_user_best
    ON game_sudoku_scores (user_id, difficulty, seconds ASC);

CREATE INDEX IF NOT EXISTS idx_game_sudoku_scores_created_at
    ON game_sudoku_scores (created_at DESC);
