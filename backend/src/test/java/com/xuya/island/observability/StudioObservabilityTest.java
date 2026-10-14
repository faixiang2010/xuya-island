package com.xuya.island.observability;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.sun.net.httpserver.HttpServer;
import com.xuya.island.codex.config.CodexProperties;
import io.agentscope.core.agent.Agent;
import io.agentscope.core.hook.PostCallEvent;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.MsgRole;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.context.Context;
import io.opentelemetry.sdk.common.CompletableResultCode;
import io.opentelemetry.sdk.trace.ReadWriteSpan;
import io.opentelemetry.sdk.trace.ReadableSpan;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.SpanProcessor;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.export.SimpleSpanProcessor;
import io.opentelemetry.sdk.trace.export.SpanExporter;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class StudioObservabilityTest {
    @Test
    void privateStudioUsesRealSdkOnlyAfterRequestAndExportsMetadata() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        List<String> bodies = new CopyOnWriteArrayList<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/",
                exchange -> {
                    calls.incrementAndGet();
                    bodies.add(
                            new String(
                                    exchange.getRequestBody().readAllBytes(),
                                    StandardCharsets.UTF_8));
                    byte[] response = "{}".getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(200, response.length);
                    exchange.getResponseBody().write(response);
                    exchange.close();
                });
        server.start();
        var properties =
                new CodexProperties(
                        null,
                        0,
                        0,
                        0,
                        0,
                        0,
                        null,
                        new CodexProperties.Studio(
                                true,
                                "http://127.0.0.1:" + server.getAddress().getPort(),
                                "codex-fixture",
                                "test"));
        Object global = GlobalOpenTelemetry.get();
        try (var studio = new StudioObservability(properties)) {
            assertEquals(0, calls.get());
            studio.tracingMiddleware();
            assertSame(global, GlobalOpenTelemetry.get());
            studio.onRealRequest("session-fixture");
            long deadline = System.nanoTime() + 3_000_000_000L;
            while (!"connected".equals(studio.diagnostics().get("state"))
                    && System.nanoTime() < deadline) Thread.sleep(10);
            assertEquals("connected", studio.diagnostics().get("state"));
            studio.safeMessageHook("session-fixture", "codex")
                    .onEvent(
                            new PostCallEvent(
                                    mock(Agent.class),
                                    Msg.builder()
                                            .role(MsgRole.ASSISTANT)
                                            .textContent(
                                                    "/private/file API_KEY=very-private-secret")
                                            .build()))
                    .block();
            long pushDeadline = System.nanoTime() + 3_000_000_000L;
            while (bodies.stream().noneMatch(body -> body.contains("API_KEY"))
                    && System.nanoTime() < pushDeadline) Thread.sleep(10);
            String combined = String.join("", bodies);
            // 摘要已改为推送完整输出原文（仅内网 Studio）；sessionId 元数据保留用于关联。
            assertTrue(
                    combined.contains("API_KEY=very-private-secret"), () -> "bodies=" + combined);
            assertTrue(combined.contains("session-fixture"));
        } finally {
            server.stop(0);
        }
    }

    @Test
    void exporterWhitelistsFieldsAndStripsNamesEventsExceptionAndStatus() {
        List<SpanData> captured = new CopyOnWriteArrayList<>();
        SpanExporter capture =
                new SpanExporter() {
                    @Override
                    public CompletableResultCode export(Collection<SpanData> spans) {
                        captured.addAll(spans);
                        return CompletableResultCode.ofSuccess();
                    }

                    @Override
                    public CompletableResultCode flush() {
                        return CompletableResultCode.ofSuccess();
                    }

                    @Override
                    public CompletableResultCode shutdown() {
                        return CompletableResultCode.ofSuccess();
                    }
                };
        try (var provider =
                SdkTracerProvider.builder()
                        .addSpanProcessor(
                                SimpleSpanProcessor.create(new SanitizingSpanExporter(capture)))
                        .build()) {
            var span = provider.get("fixture").spanBuilder("tool very-private-secret").startSpan();
            span.setAttribute("codex.session.id", "session-safe")
                    .setAttribute("api_token_count", 12345)
                    .setAttribute("tool.arguments", "very-private-secret")
                    .setAttribute("gen_ai.usage.input_tokens", 10)
                    .recordException(new IllegalStateException("very-private-secret"));
            span.end();
            var sanitized = captured.get(0);
            assertEquals("codex.tool", sanitized.getName());
            assertEquals(0, sanitized.getEvents().size());
            assertEquals(2, sanitized.getAttributes().size());
            assertEquals("", sanitized.getStatus().getDescription());
            assertEquals(
                    "session-safe",
                    sanitized.getAttributes().get(AttributeKey.stringKey("codex.session.id")));
            // 模型 span 保留原名与模型名属性，供 Studio 统计模型调用次数与 Token。
            var modelSpan = provider.get("fixture").spanBuilder("model.call").startSpan();
            modelSpan
                    .setAttribute("gen_ai.request.model", "deepseek-flash")
                    .setAttribute("gen_ai.usage.input_tokens", 7)
                    .setAttribute("gen_ai.prompt", "very-private-secret")
                    .end();
            var modelSanitized = captured.get(1);
            assertEquals("model.call", modelSanitized.getName());
            assertEquals(
                    "deepseek-flash",
                    modelSanitized
                            .getAttributes()
                            .get(AttributeKey.stringKey("gen_ai.request.model")));
            assertFalse(
                    modelSanitized.getAttributes().get(AttributeKey.stringKey("gen_ai.prompt"))
                            != null);
        }
    }

    @Test
    void saturatedStudioMessagesDoNotBlockCoreAndCountQueueDrops() throws Exception {
        CountDownLatch pushEntered = new CountDownLatch(1), release = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(executor);
        AtomicInteger calls = new AtomicInteger();
        server.createContext(
                "/",
                exchange -> {
                    if (calls.incrementAndGet() > 1) {
                        pushEntered.countDown();
                        try {
                            release.await(2, TimeUnit.SECONDS);
                        } catch (InterruptedException exception) {
                            Thread.currentThread().interrupt();
                        }
                    }
                    try {
                        byte[] response = "{}".getBytes(StandardCharsets.UTF_8);
                        exchange.sendResponseHeaders(200, response.length);
                        exchange.getResponseBody().write(response);
                    } catch (java.io.IOException exception) {
                        /* 超时后的真实断线 */
                    } finally {
                        exchange.close();
                    }
                });
        server.start();
        var properties =
                new CodexProperties(
                        null,
                        0,
                        0,
                        0,
                        0,
                        0,
                        null,
                        new CodexProperties.Studio(
                                true,
                                "http://127.0.0.1:" + server.getAddress().getPort(),
                                "queue-fixture",
                                "test"));
        try (var studio = new StudioObservability(properties)) {
            studio.onRealRequest("session-queue");
            long deadline = System.nanoTime() + 2_000_000_000L;
            while (!"connected".equals(studio.diagnostics().get("state"))
                    && System.nanoTime() < deadline) Thread.sleep(5);
            assertEquals("connected", studio.diagnostics().get("state"));
            var hook = studio.safeMessageHook("session-queue", "codex");
            var event =
                    new PostCallEvent(
                            mock(Agent.class),
                            Msg.builder()
                                    .role(MsgRole.ASSISTANT)
                                    .textContent("private-message-data")
                                    .build());
            hook.onEvent(event).block();
            assertTrue(pushEntered.await(1, TimeUnit.SECONDS));
            long started = System.nanoTime();
            for (int index = 0; index < 2100; index++) hook.onEvent(event).block();
            assertTrue(Duration.ofNanos(System.nanoTime() - started).toMillis() < 400);
            assertEquals(2048, studio.diagnostics().get("queueCapacity"));
            assertTrue(((Number) studio.diagnostics().get("queueSize")).intValue() <= 2048);
            assertTrue(((Number) studio.diagnostics().get("dropped")).longValue() >= 50);
        } finally {
            release.countDown();
            server.stop(0);
            executor.shutdownNow();
        }
    }

    @Test
    void stalledSpanExporterHasBoundedOutstandingSpansAndExactDropCount() {
        var pending = new AtomicLong();
        var dropped = new AtomicLong();
        var stalled =
                new SpanProcessor() {
                    public void onStart(Context parent, ReadWriteSpan span) {}

                    public boolean isStartRequired() {
                        return false;
                    }

                    public void onEnd(ReadableSpan span) {}

                    public boolean isEndRequired() {
                        return true;
                    }

                    public CompletableResultCode shutdown() {
                        return CompletableResultCode.ofSuccess();
                    }

                    public CompletableResultCode forceFlush() {
                        return CompletableResultCode.ofSuccess();
                    }
                };
        try (var provider =
                SdkTracerProvider.builder()
                        .addSpanProcessor(new BoundedSpanProcessor(stalled, pending, dropped))
                        .build()) {
            for (int index = 0; index < 500; index++)
                provider.get("queue-fixture").spanBuilder("safe").startSpan().end();
            assertEquals(256L, pending.get());
            assertEquals(244L, dropped.get());
        }
    }
}
