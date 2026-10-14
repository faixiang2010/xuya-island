package com.xuya.island.work.vo;

import com.xuya.island.work.entity.WorkDO;

/**
 * 客户端作品视图；转换逻辑集中，持久化对象不直接作为接口返回值。
 *
 * @author Codex代码助手
 */
public record WorkVO(
        String id,
        String lessonId,
        String title,
        String code,
        int revision,
        String createdAt,
        String updatedAt) {

    public static WorkVO from(WorkDO work) {
        return new WorkVO(
                work.id(),
                work.lessonId(),
                work.title(),
                work.code(),
                work.revision(),
                work.gmtCreate(),
                work.gmtModified());
    }
}
