package com.xuya.island.codex.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;

import io.agentscope.core.session.SessionEvent;
import java.util.List;
import org.junit.jupiter.api.Test;

class NativeBudgetLedgerTest {
    @Test
    void sharedIntervalUsesLatestCumulativeDurationWithoutCountingOverlapTwice() {
        var events =
                List.of(
                        event("run/start", "parent", 1000, "{}"),
                        event("run/end", "parent", 10000, "{}"),
                        event(
                                "codex/budget",
                                "audit-first",
                                10000,
                                "{\"elapsedMs\":9000,\"runId\":\"parent\"}"),
                        event(
                                "codex/budget",
                                "audit-tail",
                                12000,
                                "{\"elapsedMs\":11000,\"runId\":\"parent\"}"));
        assertEquals(11000, NativeBudgetLedger.read(events).activeMs());
    }

    @Test
    void lateAuditWriterKeepsOriginalDurationAssociation() {
        var events =
                List.of(
                        event("run/start", "parent", 1000, "{}"),
                        event("run/end", "parent", 1200, "{}"),
                        event(
                                "codex/budget",
                                "audit-new-writer",
                                1300,
                                "{\"elapsedMs\":190,\"runId\":\"parent\"}"));
        assertEquals(190, NativeBudgetLedger.read(events).activeMs());
    }

    private SessionEvent event(String type, String run, long timestamp, String payload) {
        return new SessionEvent(
                1, type + run, timestamp, timestamp, type, run, "turn", false, payload);
    }

    @Test
    void nativeRunsRestoreOnlyActiveSegmentsAndDoNotDoubleCountMeasuredDuration() {
        var events =
                List.of(
                        event("run/start", "first", 1000, "{}"),
                        event("codex/usage", "first", 1010, "{\"totalTokens\":7}"),
                        event("run/end", "first", 1200, "{\"status\":\"suspended\"}"),
                        event("run/start", "resumed", 9000, "{}"),
                        event("codex/budget", "resumed", 9350, "{\"elapsedMs\":350}"),
                        event("run/end", "resumed", 9400, "{\"status\":\"completed\"}"));
        var spent = NativeBudgetLedger.read(events);
        assertEquals(7, spent.tokens());
        assertEquals(550, spent.activeMs());
        var recovered = NativeBudgetLedger.read(events);
        assertEquals(spent, recovered);
    }
}
