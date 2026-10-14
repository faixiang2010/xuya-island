package com.xuya.island.studio.vo;

import io.agentscope.harness.agent.session.AgentSession;
import java.util.List;
import java.util.Map;

/** 创作室对外视图，文件仅是虚拟项目文本，不映射宿主路径。 */
public final class StudioViews {
    private StudioViews() {}

    public record ProjectFile(String path, String content) {}

    public record Preferences(List<String> favoriteThemes, String humor) {}

    public record Project(
            String id,
            String title,
            String scene,
            String lessonId,
            String sourceWorkId,
            int revision,
            List<ProjectFile> files,
            Preferences preferences,
            String createdAt,
            String updatedAt) {}

    public record ProjectVersion(
            int revision,
            String title,
            List<ProjectFile> files,
            Preferences preferences,
            String createdAt) {}

    public record Candidate(
            String id,
            String projectId,
            int baseRevision,
            List<ProjectFile> files,
            String explanation,
            String status,
            Integer appliedRevision,
            String createdAt) {}

    public record StudySession(
            String id,
            String projectId,
            String scene,
            String mode,
            String lessonId,
            String createdAt) {}

    public record Message(String id, String role, String text) {}

    public record Budget(
            int modelCalls,
            long activeMs,
            int repairAttempts,
            int limitCalls,
            long limitActiveMs,
            int limitRepairs) {}

    public record PendingRun(
            String requestId,
            String toolCallId,
            String candidateId,
            String executionId,
            String status,
            List<ProjectFile> files) {}

    public record RunResult(
            String runId,
            String status,
            String output,
            String error,
            long durationMs,
            List<Map<String, Object>> drawings,
            List<Map<String, String>> files,
            List<String> inputs,
            List<Map<String, Object>> stageEvents,
            Map<String, Object> stageState) {}

    public record RunExecution(
            String id,
            String requestId,
            String candidateId,
            String status,
            List<ProjectFile> files,
            RunResult result) {}

    public record ProjectRun(
            String id,
            String projectId,
            int projectRevision,
            List<ProjectFile> files,
            RunResult result,
            String createdAt) {}

    public record Snapshot(
            StudySession session,
            long cursor,
            List<Message> messages,
            List<AgentSession.Task> tasks,
            List<Candidate> candidates,
            List<PendingRun> pendingRuns,
            Budget budget,
            String capability) {}
}
