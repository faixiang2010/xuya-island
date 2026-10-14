package com.xuya.island.observability;

import io.agentscope.core.agent.Agent;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.event.AgentEvent;
import io.agentscope.core.event.RequestStopEvent;
import io.agentscope.core.hook.Hook;
import io.agentscope.core.hook.HookEvent;
import io.agentscope.core.hook.PostActingEvent;
import io.agentscope.core.hook.PreActingEvent;
import io.agentscope.core.middleware.AgentInput;
import io.agentscope.core.middleware.MiddlewareBase;
import io.agentscope.core.middleware.ModelCallInput;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** 记录真实 Harness 生命周期元数据，独立于 Studio，不消费提示词、参数或工具输出。 */
public final class AgentExecutionLogging implements MiddlewareBase {
    private static final Logger LOG = LoggerFactory.getLogger("com.xuya.island.codex.execution");
    private static final Logger TEACHING_LOG =
            LoggerFactory.getLogger("com.xuya.island.ai.execution");

    private static Logger logger(Agent agent) {
        return agent.getName().startsWith("codex") ? LOG : TEACHING_LOG;
    }

    @Override
    public Set<ExtensionPoint> activePoints() {
        return Set.of(ExtensionPoint.ON_AGENT, ExtensionPoint.ON_MODEL_CALL);
    }

    @Override
    public Flux<AgentEvent> onAgent(
            Agent agent,
            RuntimeContext context,
            AgentInput input,
            Function<AgentInput, Flux<AgentEvent>> next) {
        return Flux.defer(
                () -> {
                    long started = System.nanoTime();
                    Logger logger = logger(agent);
                    var status = new AtomicReference<>("completed");
                    logger.info(
                            "Agent started session={} run={} agent={} inputMessages={}",
                            context.getSessionId(),
                            context.getRunId(),
                            agent.getName(),
                            input.msgs().size());
                    return next.apply(input)
                            .doOnNext(
                                    event -> {
                                        if (event instanceof RequestStopEvent)
                                            status.set("awaiting-interaction");
                                    })
                            .doOnError(
                                    error -> {
                                        status.set("failed");
                                        logger.error(
                                                "Agent failed session={} run={} agent={} errorType={} origin={}",
                                                context.getSessionId(),
                                                context.getRunId(),
                                                agent.getName(),
                                                error.getClass().getSimpleName(),
                                                error.getStackTrace().length == 0
                                                        ? "unknown"
                                                        : error.getStackTrace()[0].toString());
                                    })
                            .doOnCancel(() -> status.set("cancelled"))
                            .doFinally(
                                    signal ->
                                            logger.info(
                                                    "Agent ended session={} run={} agent={} status={} durationMs={} signal={}",
                                                    context.getSessionId(),
                                                    context.getRunId(),
                                                    agent.getName(),
                                                    status.get(),
                                                    elapsed(started),
                                                    signal));
                });
    }

    @Override
    public Flux<AgentEvent> onModelCall(
            Agent agent,
            RuntimeContext context,
            ModelCallInput input,
            Function<ModelCallInput, Flux<AgentEvent>> next) {
        return Flux.defer(
                () -> {
                    long started = System.nanoTime();
                    Logger logger = logger(agent);
                    logger.debug(
                            "Model started session={} run={} agent={} model={} messages={} tools={}",
                            context.getSessionId(),
                            context.getRunId(),
                            agent.getName(),
                            input.model().getModelName(),
                            input.messages().size(),
                            input.tools() == null ? 0 : input.tools().size());
                    return next.apply(input)
                            .doFinally(
                                    signal ->
                                            logger.debug(
                                                    "Model ended session={} run={} agent={} durationMs={} signal={}",
                                                    context.getSessionId(),
                                                    context.getRunId(),
                                                    agent.getName(),
                                                    elapsed(started),
                                                    signal));
                });
    }

    /** 每个工厂实例使用独立工具计时表，防止父子任务和会话间串日志。 */
    public static Hook toolHook(String sessionId) {
        Map<String, Long> starts = new ConcurrentHashMap<>();
        return new Hook() {
            @Override
            public <T extends HookEvent> Mono<T> onEvent(T event) {
                return Mono.fromSupplier(
                        () -> {
                            Logger logger = logger(event.getAgent());
                            if (event instanceof PreActingEvent before
                                    && before.getToolUse() != null) {
                                var tool = before.getToolUse();
                                starts.put(tool.getId(), System.nanoTime());
                                logger.info(
                                        "Tool started session={} agent={} tool={} toolCall={}",
                                        sessionId,
                                        event.getAgent().getName(),
                                        safeName(tool.getName()),
                                        safeName(tool.getId()));
                            } else if (event instanceof PostActingEvent after
                                    && after.getToolUse() != null) {
                                var tool = after.getToolUse();
                                Long start = starts.remove(tool.getId());
                                var result = after.getToolResult();
                                logger.info(
                                        "Tool ended session={} agent={} tool={} toolCall={} status={} durationMs={}",
                                        sessionId,
                                        event.getAgent().getName(),
                                        safeName(tool.getName()),
                                        safeName(tool.getId()),
                                        result == null ? "unknown" : result.getState(),
                                        start == null ? 0 : elapsed(start));
                            }
                            return event;
                        });
            }
        };
    }

    private static String safeName(String value) {
        return value != null && value.matches("[a-zA-Z0-9_.:-]{1,128}") ? value : "external-tool";
    }

    private static long elapsed(long started) {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
    }
}
