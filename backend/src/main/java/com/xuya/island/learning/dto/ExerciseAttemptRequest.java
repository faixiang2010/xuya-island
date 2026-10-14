package com.xuya.island.learning.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** 固定用例的不可变报告；正式账户必须引用本人主机Python运行，由服务端复核。 */
public record ExerciseAttemptRequest(
        @NotNull UUID id,
        @NotBlank @Size(max = 64) String lessonId,
        @NotBlank @Size(max = 40) String lessonVersion,
        @NotBlank @Size(max = 64) String exerciseId,
        @NotBlank @Size(max = 65536) String code,
        @NotBlank @Pattern(regexp = "passed|needs-review") String status,
        @Min(0) @Max(3) int hintLevel,
        boolean referenceViewed,
        @NotNull @Size(min = 1, max = 12) List<@NotNull CaseResult> cases) {

    public record CaseResult(
            @NotBlank @Size(max = 80) String name,
            @NotNull @Size(max = 50) List<@NotNull @Size(max = 4096) String> input,
            @NotNull @Size(max = 20000) String output,
            @NotNull @Size(max = 20000) String error,
            boolean passed,
            @Size(max = 100) String runId) {
        public CaseResult(
                String name, List<String> input, String output, String error, boolean passed) {
            this(name, input, output, error, passed, null);
        }
    }
}
