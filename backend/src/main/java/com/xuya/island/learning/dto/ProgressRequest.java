package com.xuya.island.learning.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 学习者自评及家长补充观察。 */
public record ProgressRequest(
        @NotBlank @Size(max = 40) String lessonVersion,
        @NotBlank @Pattern(regexp = "not-started|in-progress|completed|needs-review") String status,
        @Min(0) @Max(3) int hintLevel,
        boolean referenceViewed,
        @NotNull @Size(max = 2000) String reflection,
        @NotNull @Size(max = 2000) String parentObservation) {}
