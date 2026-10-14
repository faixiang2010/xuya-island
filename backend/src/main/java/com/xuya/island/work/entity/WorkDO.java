package com.xuya.island.work.entity;

/**
 * 作品持久化对象，与数据库列保持对应。
 *
 * @author Codex代码助手
 */
public record WorkDO(
        String id,
        String lessonId,
        String title,
        String code,
        int revision,
        String gmtCreate,
        String gmtModified) {}
