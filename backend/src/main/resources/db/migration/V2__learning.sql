-- 课程完成由学习者选择；练习通过和作品保存不等同于掌握。
CREATE TABLE lesson_progress (
    lesson_id TEXT NOT NULL,
    lesson_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('not-started', 'in-progress', 'completed', 'needs-review')),
    hint_level INTEGER NOT NULL DEFAULT 0 CHECK (hint_level BETWEEN 0 AND 3),
    reference_viewed INTEGER NOT NULL DEFAULT 0,
    reflection TEXT NOT NULL DEFAULT '',
    parent_observation TEXT NOT NULL DEFAULT '',
    gmt_modified TEXT NOT NULL,
    PRIMARY KEY (lesson_id, lesson_version)
);
CREATE TABLE exercise_attempts (
    id TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL,
    lesson_version TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    gmt_create TEXT NOT NULL
);
CREATE INDEX idx_exercise_lesson ON exercise_attempts (lesson_id, lesson_version, gmt_create DESC);
ALTER TABLE attempts ADD COLUMN lesson_version TEXT;
ALTER TABLE attempts ADD COLUMN exercise_id TEXT;
ALTER TABLE attempts ADD COLUMN input TEXT NOT NULL DEFAULT '[]';
