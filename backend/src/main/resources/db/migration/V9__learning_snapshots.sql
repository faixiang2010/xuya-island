CREATE TABLE learning_progress_events (
    id TEXT PRIMARY KEY, learner_id TEXT NOT NULL, lesson_id TEXT NOT NULL,
    content_version TEXT NOT NULL, source TEXT NOT NULL, payload TEXT NOT NULL, received_at TEXT NOT NULL
);
CREATE INDEX learning_progress_events_owner ON learning_progress_events(learner_id,received_at);
CREATE TABLE learning_imports (
    id TEXT PRIMARY KEY, learner_id TEXT NOT NULL, source TEXT NOT NULL, source_version TEXT NOT NULL,
    payload_hash TEXT NOT NULL, payload TEXT NOT NULL, received_at TEXT NOT NULL,
    UNIQUE(learner_id,payload_hash)
);
