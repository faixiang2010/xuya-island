package com.xuya.island.codex.decision;

import com.xuya.island.codex.agent.RuntimeBudget;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.MsgRole;
import io.agentscope.core.message.TextBlock;
import io.agentscope.core.model.ChatResponse;
import io.agentscope.core.model.GenerateOptions;
import io.agentscope.core.model.Model;
import io.agentscope.core.model.ToolSchema;
import java.util.ArrayList;
import java.util.List;
import reactor.core.publisher.Flux;

/** 在原生 Memory/Compaction 的模型边界加入 typed 判断，保留原生存储及压缩实现。 */
public final class DecisionAwareModel implements Model {
    private final Model delegate;
    private final DecisionService decisions;
    private final String scenario;

    public DecisionAwareModel(Model delegate, DecisionService decisions, String scenario) {
        this.delegate = delegate;
        this.decisions = decisions;
        this.scenario = scenario;
    }

    @Override
    public String getModelName() {
        return delegate.getModelName();
    }

    @Override
    public Flux<ChatResponse> stream(
            List<Msg> messages, List<ToolSchema> tools, GenerateOptions options) {
        return Flux.deferContextual(
                view -> {
                    RuntimeContext context =
                            view.getOrDefault(RuntimeBudget.CONTEXT_KEY, RuntimeContext.empty());
                    String text =
                            messages.stream()
                                    .map(Msg::getTextContent)
                                    .reduce((first, second) -> first + "\n" + second)
                                    .orElse("");
                    if ("memory-gate".equals(scenario)) {
                        return decisions
                                .yesNo(
                                        context,
                                        scenario,
                                        text,
                                        "是否含值得留作后续任务使用的新项目约束、已验证结论或持久偏好？一次性输出不保留。",
                                        true,
                                        false)
                                .flatMapMany(
                                        decision ->
                                                Boolean.FALSE.equals(decision.value())
                                                        ? Flux.just(
                                                                new ChatResponse(
                                                                        "memory-skipped",
                                                                        List.of(
                                                                                TextBlock.builder()
                                                                                        .text(
                                                                                                "NO_REPLY")
                                                                                        .build()),
                                                                        null,
                                                                        java.util.Map.of(
                                                                                "synthetic", true),
                                                                        "stop"))
                                                        : delegate.stream(
                                                                messages, tools, options));
                    }
                    return decisions
                            .score(
                                    context,
                                    "compaction-priority",
                                    text,
                                    "判断摘要需要保留任务约束、尚未执行计划和测试证据的详细程度",
                                    List.of("简洁", "标准", "详细"),
                                    1.0,
                                    false)
                            .flatMapMany(
                                    decision -> {
                                        if (decision.usedFallback())
                                            return delegate.stream(messages, tools, options);
                                        double level =
                                                decision.value() instanceof Number number
                                                        ? number.doubleValue()
                                                        : 1.0;
                                        var guided = new ArrayList<>(messages);
                                        guided.add(
                                                Msg.builder()
                                                        .role(MsgRole.SYSTEM)
                                                        .textContent(
                                                                level >= 2
                                                                        ? "摘要必须保留具体项目约束、未完成步骤、失败与已验证证据；禁止把未测试内容写成成功。"
                                                                        : "用简洁摘要保留项目约束、未完成步骤与已验证结论；不重述大量工具输出。")
                                                        .build());
                                        return delegate.stream(guided, tools, options);
                                    });
                });
    }
}
