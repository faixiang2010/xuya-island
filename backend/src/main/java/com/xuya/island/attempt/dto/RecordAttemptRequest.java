package com.xuya.island.attempt.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 浏览器报告的真实执行快照；不能作为考试成绩或服务端验证结果。
 *
 * @author Codex代码助手
 */
public record RecordAttemptRequest(
        @NotNull UUID runId,
        @NotBlank @Size(max = 64) String lessonId,
        @NotBlank @Size(max = 65536) String code,
        @NotNull @Size(max = 20000) String output,
        @NotNull @Size(max = 20000) String error,
        @NotBlank @Pattern(regexp = "success|error|stopped|timeout") String status,
        @Min(0) @Max(600000) long durationMs,
        @Size(max = 40) String lessonVersion,
        @Size(max = 64) String exerciseId,
        @Size(max = 50) List<@NotNull @Size(max = 4096) String> input) {

    public RecordAttemptRequest(
            UUID runId,
            String lessonId,
            String code,
            String output,
            String error,
            String status,
            long durationMs) {
        this(runId, lessonId, code, output, error, status, durationMs, null, null, List.of());
    }
}
