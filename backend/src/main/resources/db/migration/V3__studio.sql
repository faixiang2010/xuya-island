-- 独立创作项目与业务映射；AI 消息和执行事实仍由 SDK 原生日志保存。
CREATE TABLE studio_projects (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, scene TEXT NOT NULL, lesson_id TEXT,
    source_work_id TEXT, revision INTEGER NOT NULL, files TEXT NOT NULL, preferences TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE studio_versions (
    project_id TEXT NOT NULL REFERENCES studio_projects(id), revision INTEGER NOT NULL,
    title TEXT NOT NULL, files TEXT NOT NULL, preferences TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(project_id, revision)
);
CREATE TABLE studio_sessions (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES studio_projects(id),
    scene TEXT NOT NULL, mode TEXT NOT NULL, lesson_id TEXT, created_at TEXT NOT NULL,
    model_capability TEXT NOT NULL DEFAULT 'auto'
);
CREATE TABLE studio_requests (
    session_id TEXT NOT NULL REFERENCES studio_sessions(id), client_request_id TEXT NOT NULL,
    turn_id TEXT NOT NULL, payload TEXT NOT NULL, intent TEXT NOT NULL,
    PRIMARY KEY(session_id, client_request_id), UNIQUE(session_id, turn_id)
);
CREATE TABLE studio_candidates (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES studio_sessions(id),
    project_id TEXT NOT NULL REFERENCES studio_projects(id), base_revision INTEGER NOT NULL,
    files TEXT NOT NULL, explanation TEXT NOT NULL, status TEXT NOT NULL, turn_id TEXT,
    applied_revision INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE studio_executions (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES studio_sessions(id),
    request_id TEXT NOT NULL, candidate_id TEXT NOT NULL REFERENCES studio_candidates(id),
    client_execution_id TEXT NOT NULL, status TEXT NOT NULL, result TEXT,
    lease_until INTEGER NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(session_id, client_execution_id)
);
CREATE UNIQUE INDEX idx_studio_active_execution ON studio_executions(session_id, request_id)
    WHERE status = 'running';
CREATE TABLE studio_runs (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES studio_projects(id),
    project_revision INTEGER NOT NULL, files TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE studio_budgets (
    session_id TEXT NOT NULL REFERENCES studio_sessions(id), turn_id TEXT NOT NULL,
    model_calls INTEGER NOT NULL DEFAULT 0, active_ms INTEGER NOT NULL DEFAULT 0,
    repair_attempts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(session_id, turn_id)
);
