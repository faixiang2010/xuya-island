package com.xuya.island.codex.agent;

import io.agentscope.core.agent.Agent;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.event.AgentEvent;
import io.agentscope.core.message.Msg;
import io.agentscope.core.middleware.AgentInput;
import io.agentscope.core.middleware.MiddlewareBase;
import io.agentscope.core.middleware.ModelCallInput;
import io.agentscope.core.model.ChatResponse;
import io.agentscope.core.model.GenerateOptions;
import io.agentscope.core.model.Model;
import io.agentscope.core.model.ToolSchema;
import io.agentscope.core.session.SessionLog;
import io.agentscope.core.session.SessionRecorder;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import reactor.core.publisher.Flux;

/** 所有推理、压缩、记忆与子 Agent 共用绝对上限；计量由原生日志持久恢复。 */
public final class RuntimeBudget implements MiddlewareBase {
    public static final String CONTEXT_KEY = "codex.runtime";
    private final AtomicLong tokens = new AtomicLong();
    private final AtomicLong activeMs = new AtomicLong();
    private volatile long tokenLimit;
    private volatile long timeLimit;
    private final AtomicReference<SessionRecorder> parentRecorder = new AtomicReference<>();
    private volatile SessionLog parentLog;
    private final java.util.function.LongSupplier nanoClock;
    private int activeAgents;
    private long intervalStarted;
    private String intervalRunId;
    private SessionRecorder intervalRecorder;

    private synchronized long ongoingMs() {
        return activeAgents == 0
                ? 0
                : Duration.ofNanos(nanoClock.getAsLong() - intervalStarted).toMillis();
    }

    private synchronized void beginActivity(RuntimeContext context) {
        if (activeAgents++ == 0) {
            intervalStarted = nanoClock.getAsLong();
            intervalRunId = context.getRunId();
            intervalRecorder = recorder(context);
        }
    }

    /** 父子运行共用时间区间，重叠只计一次，父结束后子任务尾段继续计费。 */
    private synchronized void endActivity(RuntimeContext context, boolean primary) {
        long elapsed = ongoingMs();
        boolean last = --activeAgents == 0;
        if (primary && !context.getRunId().equals(intervalRunId)) {
            persistAudit(
                    recorder(context),
                    "codex/budget",
                    Map.of("elapsedMs", 0, "runId", context.getRunId()));
        }
        if (primary || last) {
            persistAudit(
                    intervalRecorder,
                    "codex/budget",
                    Map.of("elapsedMs", elapsed, "runId", intervalRunId));
        }
        if (last) activeMs.addAndGet(elapsed);
    }

    public void bindParentLog(SessionLog log) {
        parentLog = log;
    }

    /** 父运行已结束时，后台子任务仍需把用量写入同一日志，供重启恢复预算。 */
    private synchronized void persistAudit(SessionRecorder recorder, String type, Object data) {
        if (NativeAudit.record(recorder, type, data)) return;
        if (recorder == null || parentLog == null) return;
        var lateRecorder =
                new SessionRecorder(
                        parentLog,
                        "audit-turn-" + UUID.randomUUID(),
                        "audit-" + UUID.randomUUID(),
                        null);
        try {
            NativeAudit.record(lateRecorder, type, data);
        } finally {
            lateRecorder.close();
        }
    }

    private record DeferredAudit(String type, Map<String, Object> data) {}

    private final ConcurrentLinkedQueue<DeferredAudit> deferred = new ConcurrentLinkedQueue<>();

    public RuntimeBudget(long tokenLimit, long timeLimit) {
        this(tokenLimit, timeLimit, System::nanoTime);
    }

    RuntimeBudget(long tokenLimit, long timeLimit, java.util.function.LongSupplier nanoClock) {
        this.nanoClock = nanoClock;
        configureRemaining(tokenLimit, timeLimit);
    }

    public void restore(long spentTokens, long spentMs, long remainingTokens, long remainingMs) {
        tokens.set(spentTokens);
        activeMs.set(spentMs);
        configureRemaining(remainingTokens, remainingMs);
    }

    public void configureRemaining(long remainingTokens, long remainingMs) {
        tokenLimit = Math.max(0, remainingTokens);
        timeLimit = Math.max(0, remainingMs);
    }

    public void externalUsage(long count) {
        tokens.addAndGet(Math.max(0, count));
    }

    public synchronized void reconcile(long durableTokens, long durableActiveMs) {
        tokens.accumulateAndGet(durableTokens, Math::max);
        activeMs.accumulateAndGet(Math.max(0, durableActiveMs - ongoingMs()), Math::max);
    }

    private SessionRecorder recorder(RuntimeContext context) {
        var parent = parentRecorder.get();
        return parent != null ? parent : SessionRecorder.from(context);
    }

    public void recordAudit(RuntimeContext context, String type, Map<String, Object> data) {
        var recorder = recorder(context);
        if (recorder != null) persistAudit(recorder, type, data);
        else deferred.add(new DeferredAudit(type, Map.copyOf(data)));
    }

    private void flushAudit(SessionRecorder recorder) {
        if (recorder == null) return;
        DeferredAudit event;
        while ((event = deferred.poll()) != null)
            persistAudit(recorder, event.type(), event.data());
    }

    public synchronized void check() {
        if (tokenLimit <= 0
                || timeLimit <= 0
                || tokens.get() >= tokenLimit
                || activeMs.get() + ongoingMs() >= timeLimit) {
            throw new IllegalStateException("CODEX_BUDGET_EXHAUSTED");
        }
    }

    public Model model(Model delegate, String source) {
        return new Model() {
            @Override
            public String getModelName() {
                return delegate.getModelName();
            }

            @Override
            public int getContextWindowSize() {
                return delegate.getContextWindowSize();
            }

            @Override
            public boolean supportsNativeStructuredOutput() {
                return delegate.supportsNativeStructuredOutput();
            }

            @Override
            public boolean supportsNativeStructuredOutputWithTools() {
                return delegate.supportsNativeStructuredOutputWithTools();
            }

            @Override
            public Flux<ChatResponse> stream(
                    List<Msg> messages, List<ToolSchema> tools, GenerateOptions options) {
                return Flux.deferContextual(
                        view -> {
                            check();
                            RuntimeContext context =
                                    view.getOrDefault(CONTEXT_KEY, RuntimeContext.empty());
                            AtomicLong reported = new AtomicLong();
                            String usageId = UUID.randomUUID().toString();
                            int maxOutput =
                                    (int) Math.min(16384, Math.max(1, tokenLimit - tokens.get()));
                            if (options != null && options.getMaxTokens() != null)
                                maxOutput = Math.min(maxOutput, options.getMaxTokens());
                            GenerateOptions limited =
                                    GenerateOptions.mergeOptions(
                                            options,
                                            GenerateOptions.builder().maxTokens(maxOutput).build());
                            return delegate.stream(messages, tools, limited)
                                    .doOnNext(
                                            response -> {
                                                if (response.getUsage() == null) return;
                                                var usage = response.getUsage();
                                                long delta =
                                                        Math.max(
                                                                0,
                                                                usage.getTotalTokens()
                                                                        - reported.getAndSet(
                                                                                usage
                                                                                        .getTotalTokens()));
                                                tokens.addAndGet(delta);
                                                var recorder = recorder(context);
                                                persistAudit(
                                                        recorder,
                                                        "codex/usage",
                                                        Map.of(
                                                                "source",
                                                                source,
                                                                "model",
                                                                getModelName(),
                                                                "usageId",
                                                                usageId,
                                                                "inputTokens",
                                                                usage.getInputTokens(),
                                                                "outputTokens",
                                                                usage.getOutputTokens(),
                                                                "totalTokens",
                                                                delta,
                                                                "cumulativeTokens",
                                                                usage.getTotalTokens()));
                                            });
                        });
            }
        };
    }

    @Override
    public Set<ExtensionPoint> activePoints() {
        return Set.of(ExtensionPoint.ON_AGENT, ExtensionPoint.ON_MODEL_CALL);
    }

    @Override
    public Flux<AgentEvent> onModelCall(
            Agent agent,
            RuntimeContext context,
            ModelCallInput input,
            Function<ModelCallInput, Flux<AgentEvent>> next) {
        return Flux.defer(
                () -> {
                    var recorder = SessionRecorder.from(context);
                    if (recorder != null && "codex".equals(agent.getName()))
                        parentRecorder.set(recorder);
                    flushAudit(recorder(context));
                    context.put(RuntimeBudget.class, this);
                    check();
                    return next.apply(input).contextWrite(view -> view.put(CONTEXT_KEY, context));
                });
    }

    @Override
    public int order() {
        return -1000;
    }

    @Override
    public Flux<AgentEvent> onAgent(
            Agent agent,
            RuntimeContext context,
            AgentInput input,
            Function<AgentInput, Flux<AgentEvent>> next) {
        return Flux.defer(
                () -> {
                    check();
                    boolean primary = "codex".equals(agent.getName());
                    if (primary) parentRecorder.set(SessionRecorder.from(context));
                    else
                        persistAudit(
                                parentRecorder.get(),
                                "subagent/start",
                                Map.of(
                                        "agent",
                                        agent.getName(),
                                        "childRunId",
                                        context.getRunId(),
                                        "sessionId",
                                        context.getSessionId()));
                    context.put(RuntimeBudget.class, this);
                    long started = nanoClock.getAsLong();
                    long remaining = Math.max(1, timeLimit - activeMs.get() - ongoingMs());
                    beginActivity(context);
                    var recorded = new AtomicBoolean();
                    Runnable finish =
                            () -> {
                                if (!recorded.compareAndSet(false, true)) return;
                                endActivity(context, primary);
                                if (!primary) {
                                    persistAudit(
                                            parentRecorder.get(),
                                            "subagent/completed",
                                            Map.of(
                                                    "agent",
                                                    agent.getName(),
                                                    "childRunId",
                                                    context.getRunId(),
                                                    "sessionId",
                                                    context.getSessionId()));
                                    return;
                                }
                            };
                    return Flux.defer(() -> next.apply(input))
                            .timeout(
                                    reactor.core.publisher.Mono.delay(Duration.ofMillis(remaining)),
                                    event ->
                                            reactor.core.publisher.Mono.delay(
                                                    Duration.ofMillis(
                                                            Math.max(
                                                                    1,
                                                                    remaining
                                                                            - Duration.ofNanos(
                                                                                            nanoClock
                                                                                                            .getAsLong()
                                                                                                    - started)
                                                                                    .toMillis()))))
                            .contextWrite(
                                    view ->
                                            view.put(CONTEXT_KEY, context)
                                                    .put(
                                                            "xuya.log-context",
                                                            Map.of(
                                                                    "sessionId",
                                                                    context.getSessionId(),
                                                                    "traceId",
                                                                    context.getRunId())))
                            .doOnNext(
                                    event -> {
                                        if (event instanceof io.agentscope.core.event.AgentEndEvent
                                                || event
                                                        instanceof
                                                        io.agentscope.core.event.RequestStopEvent)
                                            finish.run();
                                    })
                            .doOnComplete(finish)
                            .doOnError(error -> finish.run())
                            .doOnCancel(finish);
                });
    }
}
