CREATE TABLE learning_sessions (
    id TEXT PRIMARY KEY, learner_id TEXT NOT NULL, module TEXT NOT NULL,
    activity_id TEXT NOT NULL, content_version TEXT NOT NULL, mode TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', cursor INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 1, specification TEXT NOT NULL,
    started_at TEXT NOT NULL, updated_at TEXT NOT NULL, ended_at TEXT
);
CREATE INDEX learning_sessions_owner ON learning_sessions(learner_id,started_at);
CREATE TABLE learning_events (
    event_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES learning_sessions(id),
    sequence INTEGER NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL,
    client_at TEXT NOT NULL, received_at TEXT NOT NULL, UNIQUE(session_id,sequence)
);
CREATE TABLE skill_evidence (
    id TEXT PRIMARY KEY, learner_id TEXT NOT NULL, session_id TEXT NOT NULL,
    knowledge_id TEXT NOT NULL, summary TEXT NOT NULL, source TEXT NOT NULL,
    independent INTEGER NOT NULL, received_at TEXT NOT NULL, UNIQUE(session_id,knowledge_id)
);
CREATE INDEX skill_evidence_owner ON skill_evidence(learner_id,received_at);
CREATE TABLE reward_balances (
    learner_id TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0),
    frozen INTEGER NOT NULL DEFAULT 0 CHECK(frozen>=0 AND frozen<=balance), revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE reward_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT, learner_id TEXT NOT NULL,
    award_key TEXT NOT NULL, delta INTEGER NOT NULL, frozen_delta INTEGER NOT NULL,
    reason TEXT NOT NULL, rule_version TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(learner_id,award_key)
);
CREATE TABLE family_rewards (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, cost INTEGER NOT NULL CHECK(cost>0),
    stock INTEGER NOT NULL CHECK(stock>=0), enabled INTEGER NOT NULL DEFAULT 1,
    revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE reward_redemptions (
    id TEXT PRIMARY KEY, learner_id TEXT NOT NULL, reward_id TEXT NOT NULL,
    client_id TEXT NOT NULL, title TEXT NOT NULL, cost INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', revision INTEGER NOT NULL DEFAULT 1,
    actor_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(learner_id,client_id)
);
CREATE TABLE learning_reports (
    id TEXT PRIMARY KEY, learner_id TEXT NOT NULL, period TEXT NOT NULL, cutoff INTEGER NOT NULL,
    rule_version TEXT NOT NULL, report TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(learner_id,period,cutoff,rule_version)
);
CREATE TABLE learning_reviews (
    learner_id TEXT NOT NULL, knowledge_id TEXT NOT NULL, activity_id TEXT NOT NULL,
    module TEXT NOT NULL, next_at TEXT NOT NULL, stage INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(learner_id,knowledge_id)
);
INSERT INTO sys_settings VALUES ('growth_rule','family-v1');
INSERT INTO sys_settings VALUES ('daily_point_cap','40');
