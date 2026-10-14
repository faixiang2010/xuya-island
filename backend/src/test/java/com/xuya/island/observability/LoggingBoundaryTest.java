package com.xuya.island.observability;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.codex.config.CodexConfiguration;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.appender.AsyncAppender;
import org.apache.logging.log4j.core.config.AppenderRef;
import org.apache.logging.log4j.core.config.DefaultConfiguration;
import org.apache.logging.log4j.core.config.Property;
import org.apache.logging.log4j.core.impl.Log4jLogEvent;
import org.apache.logging.log4j.message.SimpleMessage;
import org.apache.logging.log4j.util.SortedArrayStringMap;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Hooks;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

class LoggingBoundaryTest {
    @Test
    void usesSoleLog4jBindingAndRemovesSecretsAndThrowableBeforeOutput() {
        assertEquals(
                "org.apache.logging.slf4j.Log4jLoggerFactory",
                LoggerFactory.getILoggerFactory().getClass().getName());
        assertThrows(
                ClassNotFoundException.class,
                () -> Class.forName("ch.qos.logback.classic.LoggerContext"));
        assertThrows(
                ClassNotFoundException.class,
                () -> Class.forName("org.apache.logging.slf4j.SLF4JLoggerContext"));
        var values = new SortedArrayStringMap();
        values.putValue("sessionId", "session-safe");
        values.putValue("traceId", "bad private value");
        values.putValue("apiKey", "private-context");
        var event =
                Log4jLogEvent.newBuilder()
                        .setLevel(Level.ERROR)
                        .setLoggerName("fixture")
                        .setMessage(
                                new SimpleMessage(
                                        "Authorization: Bearer private-bearer {\"api_key\":\"private quoted key\"} token=private-token"))
                        .setThrown(new IllegalStateException("private-stack-secret"))
                        .setContextData(values)
                        .build();
        var safe = SafeLogRewritePolicy.createPolicy().rewrite(event);
        assertFalse(safe.getMessage().getFormattedMessage().contains("private"));
        assertNull(safe.getThrown());
        assertNull(safe.getThrownProxy());
        assertEquals(1, safe.getContextData().size());
        assertEquals("session-safe", safe.getContextData().getValue("sessionId"));
    }

    @Test
    void actualAsyncAppenderSaturates4096WithoutBlockingAndCountsEveryDrop() throws Exception {
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        var slow =
                new AbstractAppender("SlowFixture", null, null, true, Property.EMPTY_ARRAY) {
                    @Override
                    public void append(LogEvent event) {
                        entered.countDown();
                        try {
                            release.await(5, TimeUnit.SECONDS);
                        } catch (InterruptedException exception) {
                            Thread.currentThread().interrupt();
                        }
                    }
                };
        var configuration = new DefaultConfiguration();
        var counter = LogDropCounter.createAppender("FixtureCounter");
        slow.start();
        counter.start();
        configuration.addAppender(slow);
        configuration.addAppender(counter);
        var async =
                AsyncAppender.newBuilder()
                        .setName("BoundedFixture")
                        .setConfiguration(configuration)
                        .setAppenderRefs(
                                new AppenderRef[] {
                                    AppenderRef.createAppenderRef(slow.getName(), null, null)
                                })
                        .setErrorRef(counter.getName())
                        .setBufferSize(4096)
                        .setBlocking(false)
                        .setShutdownTimeout(2000)
                        .build();
        async.start();
        var event =
                Log4jLogEvent.newBuilder()
                        .setLevel(Level.INFO)
                        .setLoggerName("fixture")
                        .setMessage(new SimpleMessage("queue-fixture"))
                        .build();
        try {
            async.append(event);
            assertTrue(entered.await(1, TimeUnit.SECONDS));
            long before = LogDropCounter.dropped(), started = System.nanoTime();
            for (int index = 0; index < 4160; index++) async.append(event);
            assertEquals(4096, async.getQueueCapacity());
            assertEquals(4096, async.getQueueSize());
            assertEquals(64, LogDropCounter.dropped() - before);
            assertTrue(Duration.ofNanos(System.nanoTime() - started).toMillis() < 3000);
        } finally {
            release.countDown();
            async.stop(2, TimeUnit.SECONDS);
            slow.stop();
            counter.stop();
        }
    }

    private record ContextResult(String expected, String actual, String token) {}

    @Test
    void concurrentReactorRequestsRetainTheirOwnWhitelistedMdc() {
        new CodexConfiguration();
        Hooks.enableAutomaticContextPropagation();
        var results =
                Flux.range(0, 100)
                        .flatMap(
                                index ->
                                        Mono.delay(Duration.ofMillis(1))
                                                .then(
                                                        Mono.fromCallable(
                                                                () ->
                                                                        new ContextResult(
                                                                                "session-" + index,
                                                                                MDC.get(
                                                                                        "sessionId"),
                                                                                MDC.get("apiKey"))))
                                                .subscribeOn(Schedulers.parallel())
                                                .contextWrite(
                                                        view ->
                                                                view.put(
                                                                        CodexConfiguration
                                                                                .LOG_CONTEXT_KEY,
                                                                        Map.of(
                                                                                "sessionId",
                                                                                "session-" + index,
                                                                                "apiKey",
                                                                                "private-context"))),
                                8)
                        .collectList()
                        .block(Duration.ofSeconds(5));
        assertEquals(100, results.size());
        results.forEach(
                item -> {
                    assertEquals(item.expected(), item.actual());
                    assertNull(item.token());
                });
        assertNull(MDC.get("sessionId"));
        assertNull(MDC.get("apiKey"));
    }
}
