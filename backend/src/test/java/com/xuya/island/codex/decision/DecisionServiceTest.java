package com.xuya.island.codex.decision;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.xuya.island.codex.config.CodexProperties;
import io.agentscope.core.agent.RuntimeContext;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class DecisionServiceTest {
    private static final String YES =
            "{\"model\":\"fixture\",\"answers\":{\"decision\":{\"type\":\"noul\",\"noul\":0.95}},\"usage\":{\"input_tokens\":0,\"output_tokens\":0}}";
    private static final String NO =
            "{\"model\":\"fixture\",\"answers\":{\"decision\":{\"type\":\"noul\",\"noul\":0.05}},\"usage\":{\"input_tokens\":0,\"output_tokens\":0}}";

    private interface Handler {
        void handle(HttpExchange exchange) throws Exception;
    }

    private static final class Fixture implements AutoCloseable {
        final HttpServer server;
        final ExecutorService executor = Executors.newFixedThreadPool(4);

        Fixture(Handler handler) throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(executor);
            server.createContext(
                    "/v1/systemone",
                    exchange -> {
                        try {
                            handler.handle(exchange);
                        } catch (Exception exception) {
                            exchange.close();
                        }
                    });
            server.start();
        }

        String url() {
            return "http://127.0.0.1:" + server.getAddress().getPort();
        }

        @Override
        public void close() {
            server.stop(0);
            executor.shutdownNow();
        }
    }

    private static void reply(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private CodexProperties properties(String url, boolean enabled) {
        return new CodexProperties(
                null,
                0,
                0,
                0,
                0,
                0,
                new CodexProperties.Jev(enabled, url, "fixture", "test-only-key"),
                null);
    }

    @Test
    void firstRealRequestUsesTypedSdkAndRedactsKnownSecrets() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        AtomicReference<String> body = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/v1/systemone",
                exchange -> {
                    calls.incrementAndGet();
                    body.set(
                            new String(
                                    exchange.getRequestBody().readAllBytes(),
                                    StandardCharsets.UTF_8));
                    byte[] response =
                            ("{\"model\":\"fixture\",\"answers\":{\"decision\":{\"type\":\"choice\",\"choice\":\"review\",\"probabilities\":{\"coding\":0.1,\"review\":0.9},\"confidence\":0.9}},\"usage\":{\"input_tokens\":10,\"output_tokens\":2}}")
                                    .getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(200, response.length);
                    exchange.getResponseBody().write(response);
                    exchange.close();
                });
        server.start();
        try (var service =
                new DecisionService(
                        properties(
                                "http://127.0.0.1:" + server.getAddress().getPort() + "/", true))) {
            assertEquals(0, calls.get());
            var decision =
                    service.choice(
                                    RuntimeContext.empty(),
                                    "routing",
                                    "Authorization: Bearer very-private-value {\"api_key\":\"another-private-value\"}",
                                    "choose",
                                    Map.of("coding", "code", "review", "review"),
                                    "coding",
                                    false)
                            .block(Duration.ofSeconds(2));
            assertEquals("review", decision.value());
            assertFalse(decision.usedFallback());
            assertEquals(1, calls.get());
            assertFalse(body.get().contains("very-private-value"));
            assertFalse(body.get().contains("another-private-value"));
            assertEquals(1, service.history().size());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void twoFailuresOpenCircuitWithoutRetriesAndEveryFallbackIsAuditedOnce() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/v1/systemone",
                exchange -> {
                    calls.incrementAndGet();
                    exchange.sendResponseHeaders(503, -1);
                    exchange.close();
                });
        server.start();
        try (var service =
                new DecisionService(
                        properties("http://127.0.0.1:" + server.getAddress().getPort(), true))) {
            var first =
                    service.choice(
                                    RuntimeContext.empty(),
                                    "routing",
                                    "state",
                                    "choose",
                                    Map.of("coding", "code", "review", "review"),
                                    "coding",
                                    false)
                            .block(Duration.ofSeconds(2));
            var second =
                    service.choice(
                                    RuntimeContext.empty(),
                                    "routing",
                                    "state",
                                    "choose",
                                    Map.of("coding", "code", "review", "review"),
                                    "coding",
                                    false)
                            .block();
            var third =
                    service.choice(
                                    RuntimeContext.empty(),
                                    "routing",
                                    "state",
                                    "choose",
                                    Map.of("coding", "code", "review", "review"),
                                    "coding",
                                    false)
                            .block();
            assertTrue(first.usedFallback());
            assertTrue(second.usedFallback());
            assertEquals("circuit-open", third.reason());
            assertEquals(2, calls.get());
            assertEquals(3, service.history().size());
            assertEquals(3L, service.diagnostics().get("downgraded"));
        } finally {
            server.stop(0);
        }
    }

    @Test
    void disabledServiceDoesNotConstructOrProbeClient() {
        try (var service = new DecisionService(properties("http://unreachable.invalid", false))) {
            var decision =
                    service.yesNo(
                                    RuntimeContext.empty(),
                                    "memory-gate",
                                    "state",
                                    "retain",
                                    true,
                                    false)
                            .block();
            assertEquals(true, decision.value());
            assertEquals("disabled", decision.reason());
            assertEquals(1, service.history().size());
        }
    }

    @Test
    void validNegativeAndUncertainAnswersHaveDifferentSemantics() throws Exception {
        AtomicReference<String> body = new AtomicReference<>(NO);
        try (var fixture = new Fixture(exchange -> reply(exchange, body.get()));
                var service = new DecisionService(properties(fixture.url(), true))) {
            var negative =
                    service.yesNo(
                                    RuntimeContext.empty(),
                                    "memory-gate",
                                    "temporary output",
                                    "retain",
                                    true,
                                    false)
                            .block();
            assertEquals(false, negative.value(), negative.toString());
            assertFalse(negative.usedFallback());
            assertEquals("jev", negative.source());
            body.set(YES.replace("0.95", "0.52"));
            var uncertain =
                    service.yesNo(
                                    RuntimeContext.empty(),
                                    "memory-gate",
                                    "ambiguous",
                                    "retain",
                                    true,
                                    false)
                            .block();
            assertEquals(true, uncertain.value());
            assertTrue(uncertain.usedFallback());
            assertEquals("uncertain", uncertain.reason());
            assertEquals(0, service.diagnostics().get("consecutiveFailures"));
            assertEquals(1L, service.diagnostics().get("downgraded"));
            assertEquals(2, service.history().size());
        }
    }

    @Test
    void refusalMalformedAndMissingAnswersAllReturnOrdinaryBaseline() throws Exception {
        for (String response :
                java.util.List.of(
                        "not json",
                        "{\"model\":\"fixture\",\"refusal\":\"cannot decide\"}",
                        "{\"model\":\"fixture\",\"answers\":{}}")) {
            try (var fixture = new Fixture(exchange -> reply(exchange, response));
                    var service = new DecisionService(properties(fixture.url(), true))) {
                var decision =
                        service.yesNo(
                                        RuntimeContext.empty(),
                                        "memory-gate",
                                        "state",
                                        "retain",
                                        true,
                                        false)
                                .block(Duration.ofSeconds(2));
                assertEquals(true, decision.value());
                assertTrue(decision.usedFallback());
                assertEquals(1, service.history().size());
                assertEquals(1, service.diagnostics().get("consecutiveFailures"));
            }
        }
    }

    @Test
    void refusedConnectionAndOneSecondTimeoutAreBoundedWithoutRetries() throws Exception {
        int port;
        try (var reservation =
                new ServerSocket(0, 0, java.net.InetAddress.getByName("127.0.0.1"))) {
            port = reservation.getLocalPort();
        }
        try (var service = new DecisionService(properties("http://127.0.0.1:" + port, true))) {
            assertTrue(
                    service.yesNo(
                                    RuntimeContext.empty(),
                                    "memory-gate",
                                    "state",
                                    "retain",
                                    true,
                                    false)
                            .block(Duration.ofSeconds(2))
                            .usedFallback());
        }
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        try (var fixture =
                        new Fixture(
                                exchange -> {
                                    calls.incrementAndGet();
                                    release.await(4, TimeUnit.SECONDS);
                                    reply(exchange, YES);
                                });
                var service = new DecisionService(properties(fixture.url(), true))) {
            long started = System.nanoTime();
            var decision =
                    service.yesNo(
                                    RuntimeContext.empty(),
                                    "memory-gate",
                                    "state",
                                    "retain",
                                    true,
                                    false)
                            .block(Duration.ofSeconds(2));
            assertTrue(decision.usedFallback());
            assertTrue(Duration.ofNanos(System.nanoTime() - started).toMillis() < 1800);
            assertEquals(1, calls.get());
            assertEquals(0, service.diagnostics().get("active"));
        } finally {
            release.countDown();
        }
    }

    @Test
    void twoConcurrentCallsUseNoQueueAndThirdFallsBackImmediately() throws Exception {
        CountDownLatch entered = new CountDownLatch(2), release = new CountDownLatch(1);
        try (var fixture =
                        new Fixture(
                                exchange -> {
                                    entered.countDown();
                                    release.await(2, TimeUnit.SECONDS);
                                    reply(exchange, YES);
                                });
                var service = new DecisionService(properties(fixture.url(), true))) {
            var first =
                    service.yesNo(RuntimeContext.empty(), "one", "state", "retain", true, false)
                            .toFuture();
            var second =
                    service.yesNo(RuntimeContext.empty(), "two", "state", "retain", true, false)
                            .toFuture();
            assertTrue(entered.await(700, TimeUnit.MILLISECONDS));
            long started = System.nanoTime();
            var third =
                    service.yesNo(RuntimeContext.empty(), "three", "state", "retain", true, false)
                            .block();
            assertEquals("busy", third.reason());
            assertTrue(Duration.ofNanos(System.nanoTime() - started).toMillis() < 300);
            release.countDown();
            assertFalse(first.get(2, TimeUnit.SECONDS).usedFallback());
            assertFalse(second.get(2, TimeUnit.SECONDS).usedFallback());
            assertEquals(3, service.history().size());
        } finally {
            release.countDown();
        }
    }

    @Test
    void singleHalfOpenProbeBacksOffToFiveMinutesAndThenRecovers() throws Exception {
        AtomicLong clock = new AtomicLong(1000);
        AtomicInteger calls = new AtomicInteger();
        AtomicReference<CountDownLatch> probeEntered = new AtomicReference<>(),
                probeRelease = new AtomicReference<>();
        AtomicReference<Boolean> healthy = new AtomicReference<>(false);
        try (var fixture =
                        new Fixture(
                                exchange -> {
                                    calls.incrementAndGet();
                                    if (probeEntered.get() != null) {
                                        probeEntered.get().countDown();
                                        probeRelease.get().await(700, TimeUnit.MILLISECONDS);
                                    }
                                    if (healthy.get()) reply(exchange, YES);
                                    else {
                                        exchange.sendResponseHeaders(503, -1);
                                        exchange.close();
                                    }
                                });
                var service = new DecisionService(properties(fixture.url(), true), clock::get)) {
            service.yesNo(RuntimeContext.empty(), "memory-gate", "state", "retain", true, false)
                    .block();
            service.yesNo(RuntimeContext.empty(), "memory-gate", "state", "retain", true, false)
                    .block();
            assertEquals(31000L, service.diagnostics().get("circuitOpenUntil"));
            clock.set(31001);
            probeEntered.set(new CountDownLatch(1));
            probeRelease.set(new CountDownLatch(1));
            var probe =
                    service.yesNo(RuntimeContext.empty(), "probe", "state", "retain", true, false)
                            .toFuture();
            assertTrue(probeEntered.get().await(700, TimeUnit.MILLISECONDS));
            assertEquals(
                    "half-open-busy",
                    service.yesNo(RuntimeContext.empty(), "other", "state", "retain", true, false)
                            .block()
                            .reason());
            probeRelease.get().countDown();
            assertTrue(probe.get(2, TimeUnit.SECONDS).usedFallback());
            assertEquals(91001L, service.diagnostics().get("circuitOpenUntil"));
            probeEntered.set(null);
            probeRelease.set(null);
            for (long delay : java.util.List.of(120000L, 240000L, 300000L, 300000L)) {
                clock.set(((Number) service.diagnostics().get("circuitOpenUntil")).longValue() + 1);
                service.yesNo(RuntimeContext.empty(), "probe", "state", "retain", true, false)
                        .block();
                assertEquals(clock.get() + delay, service.diagnostics().get("circuitOpenUntil"));
            }
            clock.set(((Number) service.diagnostics().get("circuitOpenUntil")).longValue() + 1);
            healthy.set(true);
            assertFalse(
                    service.yesNo(RuntimeContext.empty(), "probe", "state", "retain", true, false)
                            .block()
                            .usedFallback());
            assertEquals(0L, service.diagnostics().get("circuitOpenUntil"));
            assertEquals(0, service.diagnostics().get("consecutiveFailures"));
            assertEquals(8, calls.get());
        }
    }
}
