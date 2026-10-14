CREATE TABLE codex_conversations (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
    title TEXT NOT NULL, settings TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE codex_runs (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES codex_conversations(id),
    client_request_id TEXT NOT NULL, payload TEXT NOT NULL, native_turn_id TEXT,
    native_execution_id TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(conversation_id, client_request_id)
);
CREATE TABLE codex_events (
    cursor INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES codex_conversations(id),
    source_key TEXT NOT NULL, run_id TEXT, event TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(conversation_id, source_key)
);
CREATE INDEX codex_events_conversation_cursor ON codex_events(conversation_id, cursor);
CREATE TABLE codex_projection (
    conversation_id TEXT PRIMARY KEY REFERENCES codex_conversations(id),
    native_seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE codex_responses (
    conversation_id TEXT NOT NULL REFERENCES codex_conversations(id),
    interaction_id TEXT NOT NULL, client_request_id TEXT NOT NULL,
    payload TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(conversation_id, interaction_id),
    UNIQUE(conversation_id, client_request_id)
);
CREATE TABLE codex_agui_requests (
    conversation_id TEXT NOT NULL REFERENCES codex_conversations(id),
    run_id TEXT NOT NULL, payload_hash TEXT NOT NULL, execution_id TEXT,
    start_cursor INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(conversation_id, run_id)
);
CREATE TABLE codex_input_messages (
    conversation_id TEXT NOT NULL REFERENCES codex_conversations(id),
    message_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
    PRIMARY KEY(conversation_id, message_id)
);
CREATE TABLE codex_goals (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES codex_conversations(id),
    title TEXT NOT NULL, status TEXT NOT NULL, max_tokens INTEGER NOT NULL,
    max_active_ms INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX codex_one_active_goal ON codex_goals(conversation_id) WHERE status='active';
CREATE TABLE codex_plans (
    conversation_id TEXT PRIMARY KEY REFERENCES codex_conversations(id),
    title TEXT NOT NULL, steps TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
);
CREATE TABLE codex_automations (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES codex_conversations(id),
    name TEXT NOT NULL, prompt TEXT NOT NULL, interval_minutes INTEGER NOT NULL,
    enabled INTEGER NOT NULL, next_run_at INTEGER NOT NULL, last_status TEXT NOT NULL DEFAULT 'never',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE codex_actions (
    conversation_id TEXT NOT NULL REFERENCES codex_conversations(id),
    client_request_id TEXT NOT NULL, payload TEXT NOT NULL, result TEXT NOT NULL,
    PRIMARY KEY(conversation_id, client_request_id)
);
