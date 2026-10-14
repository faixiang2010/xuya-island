package com.xuya.island.codex.decision;

import io.agentscope.core.agent.Agent;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.event.AgentEvent;
import io.agentscope.core.middleware.AgentInput;
import io.agentscope.core.middleware.MiddlewareBase;
import io.agentscope.core.middleware.ModelCallInput;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import reactor.core.publisher.Flux;

/** 编码任务路由的语义提示；服务不可用直接进入正常 Harness 流程。 */
public final class DecisionMiddleware implements MiddlewareBase {
    private final DecisionService decisions;

    public DecisionMiddleware(DecisionService decisions) {
        this.decisions = decisions;
    }

    @Override
    public Set<ExtensionPoint> activePoints() {
        return Set.of(
                ExtensionPoint.ON_AGENT,
                ExtensionPoint.ON_SYSTEM_PROMPT,
                ExtensionPoint.ON_MODEL_CALL);
    }

    @Override
    public int order() {
        return -900;
    }

    @Override
    public Flux<AgentEvent> onAgent(
            Agent agent,
            RuntimeContext context,
            AgentInput input,
            Function<AgentInput, Flux<AgentEvent>> next) {
        String request =
                input.msgs().stream()
                        .filter(
                                message ->
                                        message.getRole()
                                                == io.agentscope.core.message.MsgRole.USER)
                        .map(io.agentscope.core.message.Msg::getTextContent)
                        .reduce((first, second) -> second)
                        .orElse("");
        return decisions
                .choice(
                        context,
                        "task-routing",
                        request,
                        "判断适合的任务类别",
                        Map.of("coding", "实施与验证", "research", "研究与规划", "review", "代码审查"),
                        "coding",
                        false)
                .flatMapMany(
                        decision -> {
                            context.put("codex.route-decision", decision);
                            context.put("codex.tool-selection-recorded", false);
                            context.put(
                                    "codex.route-advice",
                                    decision.usedFallback()
                                                    || decision.confidence() == null
                                                    || decision.confidence() < 0.7
                                            ? "coding"
                                            : decision.value());
                            return next.apply(input);
                        });
    }

    @Override
    public reactor.core.publisher.Mono<String> onSystemPrompt(
            Agent agent, RuntimeContext context, String prompt) {
        if (!(context.get("codex.route-decision") instanceof DecisionService.Decision decision)
                || decision.usedFallback()) return reactor.core.publisher.Mono.just(prompt);
        Object route = context.get("codex.route-advice");
        String guidance =
                "review".equals(route)
                        ? "当前任务语义属于代码审查，先提供基于证据的审查结果。"
                        : "research".equals(route)
                                ? "当前任务语义属于研究或规划，先形成实施步骤和验收条件。"
                                : "当前任务按常规编码流程执行。";
        return reactor.core.publisher.Mono.just(
                prompt + "\n" + guidance + "这只是任务组织建议，权限与模式仍由工具引擎控制。");
    }

    @Override
    public Flux<AgentEvent> onModelCall(
            Agent agent,
            RuntimeContext context,
            ModelCallInput input,
            Function<ModelCallInput, Flux<AgentEvent>> next) {
        if (!(context.get("codex.route-decision") instanceof DecisionService.Decision decision)
                || decision.usedFallback()
                || input.tools() == null) return next.apply(input);
        String route = String.valueOf(decision.value());
        var preferred =
                input.tools().stream()
                        .sorted(
                                java.util.Comparator.comparingInt(
                                        tool -> priority(route, tool.getName())))
                        .toList();
        if (!Boolean.TRUE.equals(context.get("codex.tool-selection-recorded"))) {
            context.put("codex.tool-selection-recorded", true);
            decisions.advisory(
                    context,
                    "tool-selection",
                    preferred.stream()
                            .limit(8)
                            .map(io.agentscope.core.model.ToolSchema::getName)
                            .toList(),
                    decision);
        }
        // 只调整同一实际工具集合的展示顺序；权限、审批、计划模式由原生引擎判定。
        return next.apply(
                new ModelCallInput(input.messages(), preferred, input.options(), input.model()));
    }

    private int priority(String route, String name) {
        if (name.equals("read_file") || name.equals("list_files") || name.equals("read_task_state"))
            return 0;
        if (route.equals("review")
                && (name.equals("code_review_advice") || name.equals("agent_spawn"))) return 1;
        if (route.equals("research")
                && (name.equals("plan_write") || name.equals("update_work_plan"))) return 1;
        if (route.equals("coding") && (name.equals("write_file") || name.equals("execute_command")))
            return 1;
        return 2;
    }
}
