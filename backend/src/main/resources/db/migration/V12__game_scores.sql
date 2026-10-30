CREATE TABLE IF NOT EXISTS game_scores (
    learner_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    level_id TEXT NOT NULL,
    level_version INTEGER NOT NULL,
    score INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    achieved_at TEXT NOT NULL,
    PRIMARY KEY (learner_id, game_id, level_id, level_version)
);
CREATE INDEX IF NOT EXISTS game_scores_rank
    ON game_scores(game_id, level_id, level_version, score DESC, duration_ms ASC, achieved_at ASC);
