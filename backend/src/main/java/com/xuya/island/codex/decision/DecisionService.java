package com.xuya.island.codex.decision;

import com.xuya.island.codex.agent.NativeAudit;
import com.xuya.island.codex.config.CodexProperties;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.model.transport.HttpTransportConfig;
import io.agentscope.core.model.transport.JdkHttpTransport;
import io.agentscope.core.session.SessionRecorder;
import io.agentscope.extensions.judge.jev.Answer;
import io.agentscope.extensions.judge.jev.ChoiceAnswer;
import io.agentscope.extensions.judge.jev.ChoiceQuestion;
import io.agentscope.extensions.judge.jev.JevClient;
import io.agentscope.extensions.judge.jev.JevRetryPolicy;
import io.agentscope.extensions.judge.jev.NoulAnswer;
import io.agentscope.extensions.judge.jev.NoulQuestion;
import io.agentscope.extensions.judge.jev.Question;
import io.agentscope.extensions.judge.jev.ScoreAnswer;
import io.agentscope.extensions.judge.jev.ScoreQuestion;
import io.agentscope.extensions.judge.jev.SystemOneRequest;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

/** JEV 是可选语义判断服务；安全权限、测试结果与成功状态始终由确定性规则决定。 */
@Service
public class DecisionService implements AutoCloseable {
    private static final org.slf4j.Logger LOG =
            org.slf4j.LoggerFactory.getLogger(DecisionService.class);

    public record Decision(
            String source,
            String scenario,
            Object value,
            Double confidence,
            boolean usedFallback,
            String reason,
            long durationMs) {}

    private final CodexProperties.Jev config;
    private final LongSupplier clock;
    private final com.xuya.island.codex.config.OptionalServiceSettings settings;
    private final Semaphore concurrency = new Semaphore(2);
    private final AtomicLong openUntil = new AtomicLong();
    private final AtomicInteger consecutiveFailures = new AtomicInteger();
    private final AtomicInteger openCount = new AtomicInteger();
    private final AtomicLong circuitEpoch = new AtomicLong();
    private final AtomicBoolean halfOpen = new AtomicBoolean();
    private final AtomicLong downgraded = new AtomicLong();
    private final ConcurrentLinkedDeque<Decision> history = new ConcurrentLinkedDeque<>();
    private volatile JdkHttpTransport interactiveTransport;
    private volatile JdkHttpTransport explicitTransport;
    private volatile JevClient interactive;
    private volatile JevClient explicit;
    private volatile String state = "waiting-first-request";

    public DecisionService(CodexProperties properties) {
        this(properties, System::currentTimeMillis, null);
    }

    @Autowired
    public DecisionService(
            CodexProperties properties,
            com.xuya.island.codex.config.OptionalServiceSettings settings) {
        this(properties, System::currentTimeMillis, settings);
    }

    DecisionService(CodexProperties properties, LongSupplier clock) {
        this(properties, clock, null);
    }

    private DecisionService(
            CodexProperties properties,
            LongSupplier clock,
            com.xuya.island.codex.config.OptionalServiceSettings settings) {
        config = properties.jev();
        this.clock = clock;
        this.settings = settings;
    }

    private boolean enabled() {
        // 地址留空表示 JEV 未配置（本机私有地址只从 application-local.yml 注入）：视为关闭，
        // 避免对空地址发起无效请求并触发熔断噪音。
        if (config.baseUrl() == null || config.baseUrl().isBlank()) return false;
        return settings == null ? config.enabled() : settings.jevEnabled();
    }

    public Mono<Decision> choice(
            RuntimeContext context,
            String scenario,
            String stateText,
            String instructions,
            Map<String, Object> choices,
            String fallback,
            boolean explicitEvaluation) {
        return evaluate(
                context,
                scenario,
                stateText,
                new ChoiceQuestion(instructions, choices),
                fallback,
                explicitEvaluation);
    }

    public Mono<Decision> yesNo(
            RuntimeContext context,
            String scenario,
            String stateText,
            String instructions,
            boolean fallback,
            boolean explicitEvaluation) {
        return evaluate(
                context,
                scenario,
                stateText,
                new NoulQuestion(instructions, null),
                fallback,
                explicitEvaluation);
    }

    public Mono<Decision> score(
            RuntimeContext context,
            String scenario,
            String stateText,
            String instructions,
            List<Object> orderedLevels,
            double fallback,
            boolean explicitEvaluation) {
        return evaluate(
                context,
                scenario,
                stateText,
                new ScoreQuestion(instructions, orderedLevels),
                fallback,
                explicitEvaluation);
    }

    private Mono<Decision> evaluate(
            RuntimeContext context,
            String scenario,
            String stateText,
            Question question,
            Object fallback,
            boolean explicitEvaluation) {
        return Mono.defer(
                () -> {
                    long started = System.nanoTime();
                    if (!enabled())
                        return Mono.just(
                                fallback(context, scenario, fallback, "disabled", started));
                    long opened = openUntil.get();
                    if (clock.getAsLong() < opened)
                        return Mono.just(
                                fallback(context, scenario, fallback, "circuit-open", started));
                    boolean probe = opened != 0;
                    if (probe && !halfOpen.compareAndSet(false, true))
                        return Mono.just(
                                fallback(context, scenario, fallback, "half-open-busy", started));
                    if (!concurrency.tryAcquire()) {
                        if (probe) halfOpen.set(false);
                        return Mono.just(fallback(context, scenario, fallback, "busy", started));
                    }
                    long generation = circuitEpoch.get();
                    var released = new AtomicBoolean();
                    Runnable release =
                            () -> {
                                if (released.compareAndSet(false, true)) {
                                    concurrency.release();
                                    if (probe) halfOpen.set(false);
                                }
                            };
                    try {
                        var request =
                                SystemOneRequest.builder()
                                        .state(sanitize(stateText))
                                        .question("decision", question)
                                        .build();
                        return client(explicitEvaluation)
                                .systemOne(request)
                                .timeout(Duration.ofSeconds(explicitEvaluation ? 3 : 1))
                                .map(
                                        result -> {
                                            Answer answer = result.answers().get("decision");
                                            Object value;
                                            Double confidence;
                                            if (answer instanceof ChoiceAnswer choice) {
                                                value = choice.choice();
                                                confidence = choice.confidence();
                                            } else if (answer instanceof NoulAnswer yesNo) {
                                                value = yesNo.noul() >= 0.5;
                                                confidence =
                                                        Math.max(yesNo.noul(), 1 - yesNo.noul());
                                            } else if (answer instanceof ScoreAnswer score) {
                                                value = score.score();
                                                confidence = score.confidence();
                                            } else
                                                throw new IllegalStateException(
                                                        "JEV_RESPONSE_INVALID");
                                            if (confidence != null
                                                    && (!Double.isFinite(confidence)
                                                            || confidence < 0
                                                            || confidence > 1))
                                                throw new IllegalStateException(
                                                        "JEV_RESPONSE_INVALID");
                                            success(generation, probe);
                                            if (result.usage() != null) {
                                                var budget =
                                                        context.get(
                                                                com.xuya.island.codex.agent
                                                                        .RuntimeBudget.class);
                                                if (budget != null)
                                                    budget.externalUsage(
                                                            result.usage().inputTokens()
                                                                    + result.usage()
                                                                            .outputTokens());
                                                audit(
                                                        context,
                                                        "codex/usage",
                                                        Map.of(
                                                                "source",
                                                                "jev",
                                                                "model",
                                                                result.model(),
                                                                "usageId",
                                                                UUID.randomUUID().toString(),
                                                                "inputTokens",
                                                                result.usage().inputTokens(),
                                                                "outputTokens",
                                                                result.usage().outputTokens(),
                                                                "totalTokens",
                                                                result.usage().inputTokens()
                                                                        + result.usage()
                                                                                .outputTokens()));
                                            }
                                            if (confidence == null || confidence < 0.7)
                                                return fallback(
                                                        context,
                                                        scenario,
                                                        fallback,
                                                        "uncertain",
                                                        started);
                                            Decision decision =
                                                    new Decision(
                                                            "jev",
                                                            scenario,
                                                            value,
                                                            confidence,
                                                            false,
                                                            "typed-response",
                                                            elapsed(started));
                                            record(context, decision);
                                            return decision;
                                        })
                                .onErrorResume(
                                        error -> {
                                            LOG.warn(
                                                    "JEV request failed scenario={} errorType={} causeType={} fallback=Harness",
                                                    scenario,
                                                    error.getClass().getSimpleName(),
                                                    error.getCause() == null
                                                            ? "none"
                                                            : error.getCause()
                                                                    .getClass()
                                                                    .getSimpleName());
                                            if ("CODEX_BUDGET_EXHAUSTED".equals(error.getMessage()))
                                                return Mono.error(error);
                                            failure(probe, generation);
                                            String reason =
                                                    error
                                                                            instanceof
                                                                            io.agentscope.extensions
                                                                                    .judge.jev
                                                                                    .JevException
                                                                    && error.getCause()
                                                                            instanceof
                                                                            com.fasterxml.jackson
                                                                                    .core
                                                                                    .JsonProcessingException
                                                            ? "invalid-response"
                                                            : "unavailable";
                                            return Mono.just(
                                                    fallback(
                                                            context, scenario, fallback, reason,
                                                            started));
                                        })
                                .doOnTerminate(release)
                                .doFinally(signal -> release.run());
                    } catch (RuntimeException exception) {
                        release.run();
                        failure(probe, generation);
                        return Mono.just(
                                fallback(
                                        context,
                                        scenario,
                                        fallback,
                                        "configuration-invalid",
                                        started));
                    }
                });
    }

    private synchronized void success(long generation, boolean probe) {
        if (circuitEpoch.get() != generation) return;
        if (!state.equals("connected"))
            LOG.info("JEV connected generation={} halfOpen={}", generation, probe);
        state = "connected";
        consecutiveFailures.set(0);
        if (probe) {
            openUntil.set(0);
            openCount.set(0);
        }
    }

    private synchronized void failure(boolean probe, long generation) {
        if (circuitEpoch.get() != generation) return;
        state = "unavailable";
        if (probe || consecutiveFailures.incrementAndGet() >= 2) {
            long backoff = Math.min(300000, 30000L << Math.min(4, openCount.getAndIncrement()));
            circuitEpoch.incrementAndGet();
            openUntil.set(clock.getAsLong() + backoff);
            LOG.warn(
                    "JEV circuit opened failures={} backoffMs={} fallback=Harness",
                    consecutiveFailures.get(),
                    backoff);
        }
    }

    private synchronized JevClient client(boolean explicitEvaluation) {
        if (explicitEvaluation && explicit != null) return explicit;
        if (!explicitEvaluation && interactive != null) return interactive;
        Duration timeout = Duration.ofSeconds(explicitEvaluation ? 3 : 1);
        var transport =
                JdkHttpTransport.builder()
                        .config(
                                HttpTransportConfig.builder()
                                        .connectTimeout(Duration.ofMillis(300))
                                        .responseTimeout(timeout)
                                        .readTimeout(timeout)
                                        .build())
                        .build();
        var client =
                JevClient.builder()
                        .baseUrl(config.baseUrl())
                        .model(config.model())
                        .apiKey(config.apiKey())
                        .transport(transport)
                        .timeout(timeout)
                        .retryPolicy(new JevRetryPolicy(0, Duration.ofMillis(500)))
                        .build();
        if (explicitEvaluation) {
            explicit = client;
            explicitTransport = transport;
        } else {
            interactive = client;
            interactiveTransport = transport;
        }
        return client;
    }

    private Decision fallback(
            RuntimeContext context, String scenario, Object value, String reason, long started) {
        var decision = new Decision("rule", scenario, value, null, true, reason, elapsed(started));
        downgraded.incrementAndGet();
        LOG.debug(
                "JEV fallback scenario={} reason={} durationMs={}",
                scenario,
                reason,
                decision.durationMs());
        record(context, decision);
        return decision;
    }

    private void record(RuntimeContext context, Decision decision) {
        addHistory(decision);
        audit(
                context,
                "codex/decision",
                Map.of(
                        "source",
                        decision.source(),
                        "scenario",
                        decision.scenario(),
                        "value",
                        decision.value(),
                        "fallback",
                        decision.usedFallback(),
                        "reason",
                        decision.reason(),
                        "durationMs",
                        decision.durationMs()));
    }

    private void audit(RuntimeContext context, String type, Map<String, Object> data) {
        var budget = context.get(com.xuya.island.codex.agent.RuntimeBudget.class);
        if (budget != null) budget.recordAudit(context, type, data);
        else NativeAudit.record(SessionRecorder.from(context), type, data);
    }

    private void addHistory(Decision decision) {
        history.addFirst(decision);
        while (history.size() > 100) history.pollLast();
    }

    private long elapsed(long started) {
        return Duration.ofNanos(System.nanoTime() - started).toMillis();
    }

    public Map<String, Object> diagnostics() {
        var result = new java.util.LinkedHashMap<String, Object>();
        result.put("enabled", enabled());
        result.put("state", enabled() ? state : "disabled");
        result.put("baseUrl", config.baseUrl());
        result.put("model", config.model());
        result.put("configured", config.apiKey() != null && !config.apiKey().isBlank());
        result.put("active", 2 - concurrency.availablePermits());
        result.put("connectTimeoutMs", 300);
        result.put("interactiveTimeoutMs", 1000);
        result.put("evaluationTimeoutMs", 3000);
        result.put("retries", 0);
        result.put("consecutiveFailures", consecutiveFailures.get());
        result.put("circuitOpenUntil", openUntil.get());
        result.put("halfOpen", halfOpen.get());
        result.put("downgraded", downgraded.get());
        return result;
    }

    public List<Decision> history() {
        return List.copyOf(history);
    }

    public void advisory(RuntimeContext context, String scenario, Object value, Decision basis) {
        record(
                context,
                new Decision(
                        basis.source(),
                        scenario,
                        value,
                        basis.confidence(),
                        basis.usedFallback(),
                        "reuse-semantic-route",
                        0));
    }

    private String sanitize(String value) {
        return com.xuya.island.observability.DiagnosticRedaction.text(value, 8000);
    }

    @Override
    @PreDestroy
    public void close() {
        if (interactiveTransport != null) interactiveTransport.close();
        if (explicitTransport != null) explicitTransport.close();
    }
}
