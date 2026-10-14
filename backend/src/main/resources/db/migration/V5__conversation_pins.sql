-- 置顶与运行设置分别保存，历史会话默认不置顶，归档时保留偏好。
ALTER TABLE codex_conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
