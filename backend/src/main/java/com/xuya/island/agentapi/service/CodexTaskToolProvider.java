package com.xuya.island.agentapi.service;

import com.xuya.island.codex.agent.AgentRuntimeAdapter;
import com.xuya.island.codex.agent.CodexToolProvider;
import io.agentscope.core.permission.PermissionContextState;
import io.agentscope.core.permission.PermissionDecision;
import io.agentscope.core.tool.Tool;
import io.agentscope.core.tool.ToolBase;
import io.agentscope.core.tool.ToolParam;
import io.agentscope.core.tool.Toolkit;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

/** 原生工具接入持久计划与人工提问，不注入会话Service造成运行工厂循环。 */
@Component
public class CodexTaskToolProvider implements CodexToolProvider {
    private final TaskMetadataService metadata;

    public CodexTaskToolProvider(TaskMetadataService metadata) {
        this.metadata = metadata;
    }

    @Override
    public Toolkit tools(AgentRuntimeAdapter.RuntimeSpec spec) {
        Toolkit tools = new Toolkit();
        tools.registerTool(new TaskTools(spec.conversationId(), metadata));
        tools.registerTool(
                new ToolBase(
                        ToolBase.builder()
                                .name("ask_question")
                                .description("向用户提出一个影响任务的具体问题，并持久等待用户回答；提供可选答案")
                                .inputSchema(
                                        Map.of(
                                                "type",
                                                "object",
                                                "properties",
                                                Map.of(
                                                        "question",
                                                        Map.of("type", "string"),
                                                        "options",
                                                        Map.of(
                                                                "type",
                                                                "array",
                                                                "items",
                                                                Map.of("type", "string"))),
                                                "required",
                                                List.of("question")))
                                .readOnly(true)
                                .externalTool(true)) {
                    @Override
                    public Mono<PermissionDecision> checkPermissions(
                            Map<String, Object> input, PermissionContextState context) {
                        if (!(input.get("question") instanceof String text)
                                || text.isBlank()
                                || text.length() > 4000)
                            return Mono.just(PermissionDecision.deny("问题内容不合法"));
                        return Mono.just(PermissionDecision.allow("用户通过持久提问卡片回答"));
                    }
                });
        return tools;
    }

    public static class TaskTools {
        private final String conversationId;
        private final TaskMetadataService metadata;

        public TaskTools(String conversationId, TaskMetadataService metadata) {
            this.conversationId = conversationId;
            this.metadata = metadata;
        }

        @Tool(name = "read_task_state", description = "读取当前会话的持久目标与计划", readOnly = true)
        public Map<String, Object> readTaskState() {
            var state = new java.util.LinkedHashMap<String, Object>();
            state.put("goals", metadata.goals(conversationId));
            state.put("plan", metadata.plan(conversationId));
            return state;
        }

        @Tool(
                name = "update_work_plan",
                description = "保存任务计划与执行进度，步骤状态pending/in_progress/completed；不是退出计划模式",
                readOnly = true)
        public Object updatePlan(
                @ToolParam(name = "title", description = "计划标题") String title,
                @ToolParam(name = "steps", description = "步骤数组，每项id/title/status")
                        List<Map<String, Object>> steps) {
            return metadata.putPlan(conversationId, Map.of("title", title, "steps", steps));
        }

        @Tool(
                name = "report_goal_result",
                description = "持续目标完成工作后提交具体成果和验证证据，转为待用户复核；不会自行宣布验证通过",
                readOnly = true)
        public Object reportGoal(
                @ToolParam(name = "summary", description = "具体改动和结果") String summary,
                @ToolParam(name = "evidence", description = "测试命令、产物、差异及尚存限制的证据数组")
                        List<String> evidence) {
            return metadata.proposeGoalResult(conversationId, summary, evidence);
        }
    }
}
