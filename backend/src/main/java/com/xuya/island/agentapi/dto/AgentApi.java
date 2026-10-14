package com.xuya.island.agentapi.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;

/** 前端无关的会话契约；框架对象仅留在运行适配器内。 */
public final class AgentApi {
    private AgentApi() {}

    public record Settings(
            String modelId,
            String reasoningEffort,
            String permissionMode,
            boolean planMode,
            long maxTokens,
            long maxActiveMs) {}

    public record CreateConversation(
            @Schema(description = "可选项目标识；省略时创建独立会话，项目聊天须同时提供工作区") String projectId,
            @Schema(description = "项目工作区标识；独立会话由服务端自动分配目录") String workspaceId,
            @Size(max = 200) String title,
            String modelId,
            String reasoningEffort,
            String permissionMode,
            Boolean planMode,
            Long maxTokens,
            Long maxActiveMs) {}

    public record Conversation(
            String id,
            String projectId,
            String workspaceId,
            String title,
            String modelId,
            String reasoningEffort,
            String permissionMode,
            boolean planMode,
            long maxTokens,
            long maxActiveMs,
            boolean archived,
            @Schema(description = "聊天置顶偏好，归档与恢复保留此值") boolean pinned,
            String createdAt,
            String updatedAt) {}

    public record SubmitRun(
            @NotBlank @Size(max = 160) String clientRequestId,
            @NotBlank @Size(max = 200000) String text,
            List<Map<String, Object>> attachments) {}

    @Schema(
            name = "ConversationPatch",
            description = "仅发送需修改的字段；偏好变更不启动 Agent",
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    public record ConversationPatch(
            @Size(min = 1, max = 200) String title,
            Boolean archived,
            Boolean pinned,
            String modelId,
            String reasoningEffort,
            String permissionMode,
            Boolean planMode,
            Long maxTokens,
            Long maxActiveMs) {}

    public record RunReceipt(
            String conversationId,
            String executionId,
            String clientRequestId,
            String status,
            String eventsUrl) {}

    public record Run(
            String executionId, String clientRequestId, String status, String createdAt) {}

    public record Message(
            String id, String role, String content, List<Map<String, Object>> attachments) {}

    public record InteractionRequest(
            String id,
            String kind,
            String toolCallId,
            String toolName,
            Map<String, Object> arguments,
            Map<String, Object> responseSchema,
            String message) {}

    public record Usage(long tokens, long activeMs) {}

    public record ConversationSnapshot(
            Conversation conversation,
            long cursor,
            List<Message> messages,
            List<Run> runs,
            List<InteractionRequest> pendingInteractions,
            Usage usage,
            List<Goal> goals,
            Plan plan) {}

    public record Respond(@NotBlank String clientRequestId, Map<String, Object> payload) {}

    public record Action(
            @NotBlank String clientRequestId,
            @NotBlank String action,
            String executionId,
            String text,
            Map<String, Object> settings) {}

    public record Goal(
            String id,
            String conversationId,
            String title,
            String status,
            long maxTokens,
            long maxActiveMs,
            String createdAt,
            String updatedAt) {}

    public record Plan(
            String conversationId,
            String title,
            List<Map<String, Object>> steps,
            int revision,
            String updatedAt) {}

    public record Automation(
            String id,
            String conversationId,
            String name,
            String prompt,
            int intervalMinutes,
            boolean enabled,
            long nextRunAt,
            String lastStatus,
            String createdAt,
            String updatedAt) {}

    public record Event(long cursor, String runId, String json) {}
}
