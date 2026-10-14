package com.xuya.island.studio.dto;

import com.xuya.island.studio.vo.StudioViews;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 独立项目、会话与候选操作的 HTTP 输入。 */
public final class StudioRequests {
    private StudioRequests() {}

    public record CreateProject(
            @NotBlank @Size(max = 80) String title,
            @Pattern(regexp = "milk-tea|free") String scene,
            @Size(max = 64) String lessonId,
            @NotNull List<StudioViews.ProjectFile> files,
            StudioViews.Preferences preferences) {}

    public record SaveProject(
            @NotBlank @Size(max = 80) String title,
            @Min(1) int revision,
            @NotNull List<StudioViews.ProjectFile> files,
            StudioViews.Preferences preferences) {}

    public record CopyWork(@Size(max = 80) String title) {}

    public record Restore(@Min(1) int revision, @Min(1) int expectedRevision) {}

    public record Revision(@Min(1) int revision) {}

    public record CreateSession(
            @NotBlank String projectId,
            @Pattern(regexp = "milk-tea|free") String scene,
            @Pattern(regexp = "lesson|studio") String mode,
            @Size(max = 64) String lessonId) {}

    public record Message(
            @NotBlank @Pattern(regexp = "[a-zA-Z0-9-]{1,100}") String clientRequestId,
            @NotBlank @Size(max = 2000) String question,
            @Pattern(regexp = "think|edit|build") String intent,
            boolean explicitBuild) {}

    public record Resume(@NotBlank String turnId) {}

    public record Interrupt(String runId) {}

    public record Claim(
            @NotBlank @Pattern(regexp = "[a-zA-Z0-9-]{1,100}") String clientExecutionId) {}

    public record ManualRun(
            @NotNull List<StudioViews.ProjectFile> files,
            @NotNull @Valid StudioViews.RunResult result) {}
}
