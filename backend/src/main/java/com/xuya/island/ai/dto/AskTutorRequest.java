package com.xuya.island.ai.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 区分正在编辑的代码与最近执行的代码，避免 AI 把旧输出当作新代码的结果。
 *
 * @author Codex代码助手
 */
public record AskTutorRequest(
        @NotBlank @Pattern(regexp = "[a-zA-Z0-9-]{1,80}") String sessionId,
        @NotBlank @Size(max = 64) String lessonId,
        @NotBlank @Size(max = 2000) String question,
        @NotNull @Size(max = 65536) String currentCode,
        @NotNull @Size(max = 65536) String executedCode,
        @NotNull @Size(max = 20000) String output,
        @NotNull @Size(max = 20000) String error,
        @Size(max = 40) String lessonVersion,
        @Size(max = 64) String exerciseId,
        @Min(0) @Max(3) Integer hintLevel,
        Boolean referenceViewed,
        @Size(max = 50) List<@NotNull @Size(max = 4096) String> input) {

    public AskTutorRequest {
        hintLevel = hintLevel == null ? 0 : hintLevel;
        referenceViewed = Boolean.TRUE.equals(referenceViewed);
        input = input == null ? List.of() : List.copyOf(input);
    }

    public AskTutorRequest(
            String sessionId,
            String lessonId,
            String question,
            String currentCode,
            String executedCode,
            String output,
            String error) {
        this(
                sessionId,
                lessonId,
                question,
                currentCode,
                executedCode,
                output,
                error,
                null,
                null,
                0,
                false,
                List.of());
    }
}
