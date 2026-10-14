package com.xuya.island.codex.decision;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.xuya.island.codex.config.CodexProperties;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.MsgRole;
import io.agentscope.core.message.TextBlock;
import io.agentscope.core.model.ChatResponse;
import io.agentscope.core.model.GenerateOptions;
import io.agentscope.core.model.Model;
import io.agentscope.core.model.ToolSchema;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;

class DecisionAwareModelTest {
    private final AtomicInteger calls = new AtomicInteger();
    private final AtomicReference<List<Msg>> received = new AtomicReference<>();
    private final Model delegate =
            new Model() {
                @Override
                public String getModelName() {
                    return "local-fixture";
                }

                @Override
                public Flux<ChatResponse> stream(
                        List<Msg> messages, List<ToolSchema> tools, GenerateOptions options) {
                    calls.incrementAndGet();
                    received.set(messages);
                    return Flux.just(
                            new ChatResponse(
                                    "fixture",
                                    List.of(TextBlock.builder().text("native summary").build()),
                                    null,
                                    Map.of(),
                                    "stop"));
                }
            };

    @Test
    void optionalServiceFailurePreservesNativeMemoryAndCompactionInputs() {
        var properties =
                new CodexProperties(
                        null,
                        0,
                        0,
                        0,
                        0,
                        0,
                        new CodexProperties.Jev(false, "http://unreachable.invalid", "fixture", ""),
                        null);
        List<Msg> messages =
                List.of(
                        Msg.builder()
                                .role(MsgRole.USER)
                                .textContent("project constraints")
                                .build());
        try (var decisions = new DecisionService(properties)) {
            new DecisionAwareModel(delegate, decisions, "memory-gate")
                    .stream(messages, List.of(), null).blockLast();
            assertSame(messages, received.get());
            new DecisionAwareModel(delegate, decisions, "compaction-priority")
                    .stream(messages, List.of(), null).blockLast();
            assertSame(messages, received.get());
            assertEquals(2, calls.get());
        }
    }

    @Test
    void validNegativeMemorySkipsNativeFlushAndValidCompactionGuidesActualModel() {
        var decisions = mock(DecisionService.class);
        when(decisions.yesNo(any(), eq("memory-gate"), any(), any(), eq(true), eq(false)))
                .thenReturn(
                        reactor.core.publisher.Mono.just(
                                new DecisionService.Decision(
                                        "jev",
                                        "memory-gate",
                                        false,
                                        0.95,
                                        false,
                                        "typed-response",
                                        1)));
        List<Msg> messages =
                List.of(Msg.builder().role(MsgRole.USER).textContent("temporary output").build());
        var response =
                new DecisionAwareModel(delegate, decisions, "memory-gate")
                        .stream(messages, List.of(), null).blockLast();
        assertEquals(0, calls.get());
        assertEquals("NO_REPLY", ((TextBlock) response.getContent().get(0)).getText());
        when(decisions.score(
                        any(), eq("compaction-priority"), any(), any(), any(), eq(1.0), eq(false)))
                .thenReturn(
                        reactor.core.publisher.Mono.just(
                                new DecisionService.Decision(
                                        "jev",
                                        "compaction-priority",
                                        2.0,
                                        0.95,
                                        false,
                                        "typed-response",
                                        1)));
        new DecisionAwareModel(delegate, decisions, "compaction-priority")
                .stream(messages, List.of(), null).blockLast();
        assertEquals(1, calls.get());
        assertEquals(2, received.get().size());
        assertTrue(received.get().get(1).getTextContent().contains("禁止把未测试内容写成成功"));
    }
}
