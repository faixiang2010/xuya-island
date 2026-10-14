package com.xuya.island.codex.decision;

import com.xuya.island.codex.agent.AgentRuntimeAdapter;
import com.xuya.island.codex.agent.CodexToolProvider;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.tool.Tool;
import io.agentscope.core.tool.ToolParam;
import io.agentscope.core.tool.Toolkit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

/** 专业审阅时显式调用 JEV 判断证据的复核优先级；不替代真实测试或验收。 */
@Component
public final class CodeReviewAdviceTools implements CodexToolProvider {
    private final DecisionService decisions;

    public CodeReviewAdviceTools(DecisionService decisions) {
        this.decisions = decisions;
    }

    @Override
    public Toolkit tools(AgentRuntimeAdapter.RuntimeSpec spec) {
        Toolkit toolkit = new Toolkit();
        toolkit.registerTool(new Review());
        return toolkit;
    }

    public final class Review {
        @Tool(
                name = "code_review_advice",
                description = "在已读取代码和验证证据后，类型化判断复核优先级。服务不可用使用普通审阅流程，不代表测试通过或失败。",
                readOnly = true)
        public Mono<Map<String, Object>> advice(
                @ToolParam(name = "evidence", description = "已观察到的约束、变更和真实验证证据，禁止凭据或未读取代码的猜测")
                        String evidence,
                RuntimeContext context) {
            return decisions
                    .score(
                            context,
                            "code-review",
                            evidence,
                            "仅根据给出的已验证事实判断仍需人工复核的风险优先级；缺少测试不等于实现失败。",
                            List.of("常规复核", "重点检查", "优先调查"),
                            1.0,
                            true)
                    .map(
                            decision -> {
                                var result = new LinkedHashMap<String, Object>();
                                result.put("source", decision.source());
                                result.put("priority", decision.value());
                                result.put("confidence", decision.confidence());
                                result.put("usedFallback", decision.usedFallback());
                                result.put("reason", decision.reason());
                                result.put(
                                        "advice",
                                        decision.usedFallback()
                                                ? "沿用普通代码审阅流程，基于实际文件与测试证据输出结论。"
                                                : "这只是复核优先级建议，仍需读取代码、运行真实测试并说明未验证事项。");
                                return result;
                            });
        }
    }
}
