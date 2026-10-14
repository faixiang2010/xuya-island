-- 业务表只保存作品和实际运行快照。AI 对话由 AgentScope 原生存储负责。
CREATE TABLE works (
    id TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL,
    title TEXT NOT NULL,
    code TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    gmt_create TEXT NOT NULL,
    gmt_modified TEXT NOT NULL
);

CREATE INDEX idx_works_modified ON works (gmt_modified DESC);

CREATE TABLE work_versions (
    id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL REFERENCES works(id),
    revision INTEGER NOT NULL,
    title TEXT NOT NULL,
    code TEXT NOT NULL,
    gmt_create TEXT NOT NULL,
    UNIQUE (work_id, revision)
);

CREATE TABLE attempts (
    id TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL,
    code TEXT NOT NULL,
    output TEXT NOT NULL,
    error TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'stopped', 'timeout')),
    duration_ms INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'browser-pyodide',
    gmt_create TEXT NOT NULL
);

CREATE INDEX idx_attempts_lesson ON attempts (lesson_id, gmt_create DESC);
