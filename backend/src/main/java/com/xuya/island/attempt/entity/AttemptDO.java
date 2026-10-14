package com.xuya.island.attempt.entity;

/**
 * 实际运行的不可变持久化快照，id 使用本次浏览器执行 UUID。
 *
 * @author Codex代码助手
 */
public record AttemptDO(
        String id,
        String lessonId,
        String code,
        String output,
        String error,
        String status,
        long durationMs,
        String gmtCreate,
        String lessonVersion,
        String exerciseId,
        String input) {

    public boolean sameExecution(AttemptDO other) {
        return id.equals(other.id())
                && lessonId.equals(other.lessonId())
                && code.equals(other.code())
                && output.equals(other.output())
                && error.equals(other.error())
                && status.equals(other.status())
                && durationMs == other.durationMs()
                && java.util.Objects.equals(lessonVersion, other.lessonVersion())
                && java.util.Objects.equals(exerciseId, other.exerciseId())
                && input.equals(other.input());
    }
}
