package com.xuya.island.codex.agent;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.agentscope.core.message.Msg;
import io.agentscope.core.model.ChatResponse;
import io.agentscope.core.model.ChatUsage;
import io.agentscope.core.model.GenerateOptions;
import io.agentscope.core.model.Model;
import io.agentscope.core.model.ToolSchema;
import java.util.List;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;

class RuntimeBudgetTest {
    @Test
    void overlappingParentAndChildChargeOneIntervalIncludingChildTail() {
        var clock = new java.util.concurrent.atomic.AtomicLong();
        var budget = new RuntimeBudget(100, 10000, clock::get);
        var parent = org.mockito.Mockito.mock(io.agentscope.core.agent.Agent.class);
        var child = org.mockito.Mockito.mock(io.agentscope.core.agent.Agent.class);
        org.mockito.Mockito.when(parent.getName()).thenReturn("codex");
        org.mockito.Mockito.when(child.getName()).thenReturn("codex-reviewer");
        var parentEvents =
                reactor.core.publisher.Sinks.many()
                        .unicast()
                        .<io.agentscope.core.event.AgentEvent>onBackpressureBuffer();
        var childEvents =
                reactor.core.publisher.Sinks.many()
                        .unicast()
                        .<io.agentscope.core.event.AgentEvent>onBackpressureBuffer();
        var parentContext =
                io.agentscope.core.agent.RuntimeContext.builder()
                        .sessionId("parent")
                        .runId("run-parent")
                        .build();
        var childContext =
                io.agentscope.core.agent.RuntimeContext.builder()
                        .sessionId("child")
                        .runId("run-child")
                        .build();
        budget.onAgent(
                        parent,
                        parentContext,
                        new io.agentscope.core.middleware.AgentInput(List.of()),
                        input -> parentEvents.asFlux())
                .subscribe();
        clock.set(5_000_000_000L);
        budget.onAgent(
                        child,
                        childContext,
                        new io.agentscope.core.middleware.AgentInput(List.of()),
                        input -> childEvents.asFlux())
                .subscribe();
        clock.set(9_000_000_000L);
        parentEvents.tryEmitComplete();
        budget.reconcile(0, 9000);
        assertDoesNotThrow(budget::check);
        clock.set(11_000_000_000L);
        assertThrows(IllegalStateException.class, budget::check);
        childEvents.tryEmitComplete();
        budget.configureRemaining(100, 12000);
        assertDoesNotThrow(budget::check);
    }

    @Test
    void lateChildUsageRemainsDurableAfterParentRecorderCloses() {
        var context = io.agentscope.core.agent.RuntimeContext.empty();
        var log =
                new io.agentscope.core.session.InMemorySessionLogStore()
                        .open(
                                new io.agentscope.core.session.SessionKey(
                                        "user", "codex", "session"),
                                context);
        var recorder = new io.agentscope.core.session.SessionRecorder(log, "turn", "run", null);
        context.put(io.agentscope.core.session.SessionRecorder.CONTEXT_KEY, recorder);
        var budget = new RuntimeBudget(100, 10000);
        budget.bindParentLog(log);
        NativeAudit.record(recorder, "turn/completed", java.util.Map.of());
        recorder.close();
        budget.recordAudit(context, "codex/usage", java.util.Map.of("totalTokens", 21));
        var events = log.readAfter(0, 100);
        org.junit.jupiter.api.Assertions.assertEquals(21, NativeBudgetLedger.read(events).tokens());
        org.junit.jupiter.api.Assertions.assertEquals(2, events.size());
    }

    @Test
    void recoveredUsageIsNotResetByNextTurnAndIncreasingAbsoluteCapAllowsResume() {
        var budget = new RuntimeBudget(100, 10000);
        budget.restore(80, 1000, 100, 10000);
        Model fixture =
                new Model() {
                    @Override
                    public String getModelName() {
                        return "fixture";
                    }

                    @Override
                    public Flux<ChatResponse> stream(
                            List<Msg> messages, List<ToolSchema> tools, GenerateOptions options) {
                        return Flux.just(
                                new ChatResponse(
                                        "1",
                                        List.of(),
                                        new ChatUsage(10, 15, 0),
                                        java.util.Map.of(),
                                        "stop"));
                    }
                };
        budget.model(fixture, "chat").stream(
                        List.of(), List.of(), GenerateOptions.builder().build())
                .collectList()
                .block();
        budget.configureRemaining(100, 10000);
        assertThrows(IllegalStateException.class, budget::check);
        budget.configureRemaining(150, 10000);
        assertDoesNotThrow(budget::check);
    }
}
