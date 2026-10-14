CREATE TABLE python_runs (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    executable TEXT NOT NULL,
    status TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(owner_id, client_id)
);
CREATE INDEX python_runs_owner ON python_runs(owner_id, created_at);
