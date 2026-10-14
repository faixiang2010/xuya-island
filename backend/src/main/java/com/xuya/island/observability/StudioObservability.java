package com.xuya.island.observability;

import com.xuya.island.codex.config.CodexProperties;
import io.agentscope.core.hook.ErrorEvent;
import io.agentscope.core.hook.Hook;
import io.agentscope.core.hook.HookEvent;
import io.agentscope.core.hook.PostActingEvent;
import io.agentscope.core.hook.PostCallEvent;
import io.agentscope.core.hook.PostReasoningEvent;
import io.agentscope.core.hook.PreActingEvent;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.MsgRole;
import io.agentscope.core.message.ToolUseBlock;
import io.agentscope.core.middleware.MiddlewareBase;
import io.agentscope.core.studio.StudioClient;
import io.agentscope.core.studio.StudioConfig;
import io.agentscope.core.studio.StudioWebSocketClient;
import io.agentscope.core.tracing.OtelTracingMiddleware;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.common.CompletableResultCode;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import io.opentelemetry.sdk.trace.export.SpanExporter;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

/** 全局 Studio 观测：HTTP 注册/推送 + WebSocket 保活（对齐 demo 生命周期，进程退出后 Studio 标记 run 结束）。消息推送为全量调试模式（仅内网 Studio）。 */
@Service
public class StudioObservability implements AutoCloseable {
    private static final Logger LOG = LoggerFactory.getLogger(StudioObservability.class);
    private static final int MAX_PUSH_CHARS = 8000;
    private static final int QUEUE_CAPACITY = 2048;
    private final CodexProperties.Studio config;
    private final com.xuya.island.codex.config.OptionalServiceSettings settings;
    private final String runId = UUID.randomUUID().toString();
    private final AtomicLong dropped = new AtomicLong();
    private final AtomicBoolean registered = new AtomicBoolean();
    private final AtomicLong spanPending = new AtomicLong();
    private final AtomicLong spansDropped = new AtomicLong();
    private final ThreadPoolExecutor sender;
    private volatile String state = "waiting-first-request";
    private volatile long retryAfter;
    private volatile StudioClient client;
    private volatile StudioWebSocketClient wsClient;
    private volatile StudioConfig studioConfig;
    private volatile SdkTracerProvider tracerProvider;
    private volatile MiddlewareBase tracing;

    public StudioObservability(CodexProperties properties) {
        this(properties, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public StudioObservability(
            CodexProperties properties,
            com.xuya.island.codex.config.OptionalServiceSettings settings) {
        config = properties.studio();
        this.settings = settings;
        sender =
                new ThreadPoolExecutor(
                        1,
                        1,
                        30,
                        TimeUnit.SECONDS,
                        new ArrayBlockingQueue<>(QUEUE_CAPACITY),
                        runnable -> {
                            var thread = new Thread(runnable, "codex-studio-export");
                            thread.setDaemon(true);
                            return thread;
                        },
                        (runnable, executor) -> dropped.incrementAndGet());
        sender.allowCoreThreadTimeOut(true);
    }

    private boolean enabled() {
        // 地址留空表示 Studio 未配置（本机私有地址只从 application-local.yml 注入）：视为关闭，
        // 避免对空地址反复发起重连。
        if (config.url() == null || config.url().isBlank()) return false;
        return settings == null ? config.enabled() : settings.studioEnabled();
    }

    public void settingsChanged() {
        if (!enabled()) {
            registered.set(false);
            dropped.addAndGet(sender.getQueue().size());
            sender.getQueue().clear();
        } else retryAfter = 0;
    }

    public void onRealRequest(String sessionId) {
        if (!enabled() || registered.get() || System.currentTimeMillis() < retryAfter) return;
        sender.execute(() -> connect());
    }

    private synchronized void connect() {
        if (!enabled() || registered.get() || System.currentTimeMillis() < retryAfter) return;
        try {
            if (client == null) {
                studioConfig =
                        StudioConfig.builder()
                                .studioUrl(config.url())
                                .tracingUrl(config.url().replaceAll("/$", "") + "/v1/traces")
                                .project(config.project())
                                .runName(config.runName() + "-" + runId)
                                .runId(runId)
                                .maxRetries(0)
                                .reconnectAttempts(0)
                                .build();
                client = new StudioClient(studioConfig);
                boundSdkHttpClient(client);
                client.registerRun().block();
                // 与 demo 一致：后台建立 WebSocket 保活连接，进程退出 close() 后 Studio 检测断开并标记 run 结束。失败不阻断注册与推送。
                new Thread(this::connectWebSocket, "codex-studio-ws").start();
            }
            registered.set(enabled());
            state = "connected";
            LOG.info(
                    "Studio run registered: project={}, run={}",
                    config.project(),
                    config.runName() + "-" + runId);
        } catch (RuntimeException exception) {
            LOG.warn(
                    "Studio connect failed (will retry in 30s): url={}, error={}",
                    config.url(),
                    exception.toString());
            unavailable();
        }
    }

    /** 后台连接 WebSocket 保活（不持主锁，成功后原子赋值）；失败仅记日志，不影响注册与推送。 */
    private void connectWebSocket() {
        try {
            StudioWebSocketClient ws = new StudioWebSocketClient(studioConfig);
            ws.connect().block(java.time.Duration.ofSeconds(3));
            wsClient = ws;
            LOG.info("Studio websocket connected");
        } catch (RuntimeException wsException) {
            LOG.warn(
                    "Studio websocket unavailable (run stays registered, no end-mark on shutdown): {}",
                    wsException.toString());
        }
    }

    private void unavailable() {
        state = "unavailable";
        registered.set(false);
        retryAfter = System.currentTimeMillis() + 30000;
        dropped.addAndGet(sender.getQueue().size());
        sender.getQueue().clear();
    }

    private void boundSdkHttpClient(StudioClient sdkClient) {
        // 2.1.0-BETA1 没有 transport 注入入口；把固定版本适配集中在此边界，并用真实 HTTP 测试锁定。
        try {
            var field = StudioClient.class.getDeclaredField("httpClient");
            field.setAccessible(true);
            var original = (okhttp3.OkHttpClient) field.get(sdkClient);
            var bounded =
                    original.newBuilder()
                            .connectTimeout(Duration.ofMillis(300))
                            .readTimeout(Duration.ofMillis(500))
                            .writeTimeout(Duration.ofMillis(500))
                            .callTimeout(Duration.ofMillis(500))
                            .retryOnConnectionFailure(false)
                            .build();
            field.set(sdkClient, bounded);
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException("STUDIO_SDK_INCOMPATIBLE");
        }
    }

    /** 全量调试 Hook：最终回复、每轮模型输出、工具调用参数、工具结果与错误都推送（仅内网 Studio，调试模式）。 */
    public Hook safeMessageHook(String sessionId, String agentName) {
        return new Hook() {
            @Override
            public <T extends HookEvent> Mono<T> onEvent(T event) {
                if (enabled() && event instanceof PostCallEvent completed) {
                    String output =
                            completed.getFinalMessage() == null
                                    ? ""
                                    : completed.getFinalMessage().getTextContent();
                    sender.execute(() -> push(sessionId, agentName, MsgRole.ASSISTANT, output));
                } else if (enabled() && event instanceof PostReasoningEvent reasoning) {
                    sender.execute(
                            () ->
                                    push(
                                            sessionId,
                                            agentName,
                                            MsgRole.ASSISTANT,
                                            "【调试·模型输出】"
                                                    + flatten(reasoning.getReasoningMessage())));
                } else if (enabled() && event instanceof PreActingEvent acting) {
                    var toolUse = acting.getToolUse();
                    sender.execute(
                            () ->
                                    push(
                                            sessionId,
                                            agentName,
                                            MsgRole.ASSISTANT,
                                            "【调试·工具调用】"
                                                    + (toolUse == null
                                                            ? ""
                                                            : toolUse.getName()
                                                                    + " "
                                                                    + toolUse.getInput())));
                } else if (enabled() && event instanceof PostActingEvent acted) {
                    var result = acted.getToolResult();
                    sender.execute(
                            () ->
                                    push(
                                            sessionId,
                                            agentName,
                                            MsgRole.ASSISTANT,
                                            "【调试·工具结果】"
                                                    + (result == null
                                                            ? ""
                                                            : result.getName()
                                                                    + " → "
                                                                    + result.getOutput())));
                } else if (enabled() && event instanceof ErrorEvent failure) {
                    sender.execute(
                            () ->
                                    push(
                                            sessionId,
                                            agentName,
                                            MsgRole.ASSISTANT,
                                            "【调试·错误】" + failure.getError()));
                }
                return Mono.just(event);
            }
        };
    }

    /** 模型消息扁平化：文本优先，纯工具调用轮提取工具名与参数，避免落到对象 toString。 */
    private static String flatten(Msg message) {
        if (message == null) return "";
        StringBuilder sb = new StringBuilder();
        String text = message.getTextContent();
        if (text != null && !text.isBlank()) sb.append(text);
        for (ToolUseBlock tool : message.getContentBlocks(ToolUseBlock.class))
            sb.append(sb.length() > 0 ? "\n" : "")
                    .append("（工具调用 ")
                    .append(tool.getName())
                    .append("）")
                    .append(tool.getInput());
        return sb.length() > 0 ? sb.toString() : "";
    }

    /** 用户输入原文推送（教学域与 codex 域共用）；Studio 不可用时静默丢弃，不阻塞请求线程。 */
    public void pushUserMessage(String sessionId, String agentName, String text) {
        if (!enabled() || text == null || text.isBlank()) return;
        sender.execute(() -> push(sessionId, agentName, MsgRole.USER, text));
    }

    private void push(String sessionId, String agentName, MsgRole role, String text) {
        if (!enabled()) {
            dropped.incrementAndGet();
            return;
        }
        String content =
                text.length() > MAX_PUSH_CHARS
                        ? text.substring(0, MAX_PUSH_CHARS) + "…（已截断）"
                        : text;
        Msg message =
                Msg.builder()
                        .name(agentName)
                        .role(role)
                        .textContent(content)
                        .metadata(Map.of("sessionId", sessionId, "studioRunId", runId))
                        .build();
        if (!registered.get()) {
            connect();
            if (!registered.get()) {
                dropped.incrementAndGet();
                return;
            }
        }
        try {
            client.pushMessage(message).block();
        } catch (RuntimeException exception) {
            dropped.incrementAndGet();
            unavailable();
        }
    }

    public synchronized MiddlewareBase tracingMiddleware() {
        if (!enabled()) return null;
        if (tracing != null) return tracing;
        try {
            return createTracingMiddleware();
        } catch (RuntimeException exception) {
            state = "configuration-invalid";
            return null;
        }
    }

    private MiddlewareBase createTracingMiddleware() {
        SpanExporter sanitized =
                new SanitizingSpanExporter(
                        OtlpHttpSpanExporter.builder()
                                .setEndpoint(config.url().replaceAll("/$", "") + "/v1/traces")
                                .setTimeout(Duration.ofMillis(500))
                                .build(),
                        runId);
        var exporter =
                new SpanExporter() {
                    @Override
                    public CompletableResultCode export(Collection<SpanData> spans) {
                        CompletableResultCode result;
                        if (!enabled()) {
                            spansDropped.addAndGet(spans.size());
                            result = CompletableResultCode.ofSuccess();
                        } else result = sanitized.export(spans);
                        result.whenComplete(
                                () -> {
                                    spanPending.addAndGet(-spans.size());
                                    if (!result.isSuccess()) spansDropped.addAndGet(spans.size());
                                });
                        return result;
                    }

                    @Override
                    public CompletableResultCode flush() {
                        return sanitized.flush();
                    }

                    @Override
                    public CompletableResultCode shutdown() {
                        return sanitized.shutdown();
                    }
                };
        var processor =
                BatchSpanProcessor.builder(exporter)
                        .setMaxQueueSize(256)
                        .setMaxExportBatchSize(64)
                        .setExporterTimeout(Duration.ofMillis(500))
                        .setScheduleDelay(Duration.ofSeconds(1))
                        .build();
        tracerProvider =
                SdkTracerProvider.builder()
                        .addSpanProcessor(
                                new BoundedSpanProcessor(processor, spanPending, spansDropped))
                        .setResource(
                                Resource.create(
                                        Attributes.builder()
                                                .put("service.name", config.project())
                                                .put("service.instance.id", runId)
                                                .put("agentscope.run_id", runId)
                                                .build()))
                        .build();
        // build() 不注册为 GlobalOpenTelemetry；观测组件由各域 Agent 显式挂载。
        var sdk = OpenTelemetrySdk.builder().setTracerProvider(tracerProvider).build();
        tracing =
                new OtelTracingMiddleware(sdk) {
                    @Override
                    public reactor.core.publisher.Flux<io.agentscope.core.event.AgentEvent> onAgent(
                            io.agentscope.core.agent.Agent agent,
                            io.agentscope.core.agent.RuntimeContext context,
                            io.agentscope.core.middleware.AgentInput input,
                            java.util.function.Function<
                                            io.agentscope.core.middleware.AgentInput,
                                            reactor.core.publisher.Flux<
                                                    io.agentscope.core.event.AgentEvent>>
                                    next) {
                        return super.onAgent(
                                agent,
                                context,
                                input,
                                messages ->
                                        reactor.core.publisher.Flux.deferContextual(
                                                view -> {
                                                    var otelContext =
                                                            io.opentelemetry.instrumentation.reactor
                                                                    .v3_1.ContextPropagationOperator
                                                                    .getOpenTelemetryContextFromContextView(
                                                                            view,
                                                                            io.opentelemetry.context
                                                                                    .Context
                                                                                    .root());
                                                    var span =
                                                            io.opentelemetry.api.trace.Span
                                                                    .fromContext(otelContext);
                                                    if (context.getSessionId() != null)
                                                        span.setAttribute(
                                                                "codex.session.id",
                                                                context.getSessionId());
                                                    var recorder =
                                                            io.agentscope.core.session
                                                                    .SessionRecorder.from(context);
                                                    span.setAttribute(
                                                            "codex.run.id",
                                                            recorder == null
                                                                    ? context.getRunId()
                                                                    : recorder.runId());
                                                    if (recorder != null
                                                            && recorder.turnId() != null)
                                                        span.setAttribute(
                                                                "codex.turn.id", recorder.turnId());
                                                    return next.apply(messages);
                                                }));
                    }
                };
        return tracing;
    }

    public Map<String, Object> diagnostics() {
        var result = new java.util.LinkedHashMap<String, Object>();
        result.put("enabled", enabled());
        result.put("state", enabled() ? state : "disabled");
        result.put("url", config.url());
        result.put("project", config.project());
        result.put("runName", config.runName() + "-" + runId);
        result.put("lifecycle", "websocket-keepalive");
        result.put("queueSize", sender.getQueue().size());
        result.put("queueCapacity", QUEUE_CAPACITY);
        result.put("dropped", dropped.get());
        result.put("spanQueueSize", spanPending.get());
        result.put("spansDropped", spansDropped.get());
        result.put("mode", "full-debug");
        return result;
    }

    @Override
    @PreDestroy
    public void close() {
        dropped.addAndGet(sender.shutdownNow().size());
        if (wsClient != null) wsClient.close();
        if (client != null) client.shutdown();
        if (tracerProvider != null) tracerProvider.shutdown();
    }
}
