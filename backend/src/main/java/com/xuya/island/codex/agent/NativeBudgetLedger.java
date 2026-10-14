package com.xuya.island.codex.agent;

import io.agentscope.core.session.SessionEvent;
import java.util.HashMap;
import java.util.Map;

/** 从父原生 run 分段恢复计量；没有自定义耗时的旧记录采用 run/start→run/end。 */
final class NativeBudgetLedger {
    record Spent(long tokens, long activeMs) {}

    private NativeBudgetLedger() {}

    static Spent read(Iterable<SessionEvent> events) {
        long tokens = 0, unassociatedMs = 0;
        Map<String, Long> starts = new HashMap<>(),
                nativeDurations = new HashMap<>(),
                measured = new HashMap<>();
        for (SessionEvent event : events) {
            String runId = event.executionRunId();
            if (event.type().equals("codex/usage")
                    && event.data().get("totalTokens") instanceof Number count)
                tokens += Math.max(0, count.longValue());
            if (event.type().equals("run/start") && runId != null)
                starts.put(runId, event.occurredAt());
            if (event.type().equals("run/end") && runId != null && starts.containsKey(runId))
                nativeDurations.put(runId, Math.max(0, event.occurredAt() - starts.remove(runId)));
            if (event.type().equals("codex/budget")
                    && event.data().get("elapsedMs") instanceof Number count) {
                // 后台审计writer有独立运行ID，用显式关联避免重复计算原生运行耗时。
                if (event.data().get("runId") instanceof String originalRun) runId = originalRun;
                if (runId == null) unassociatedMs += Math.max(0, count.longValue());
                else measured.merge(runId, Math.max(0, count.longValue()), Math::max);
            }
        }
        nativeDurations.forEach((id, duration) -> measured.putIfAbsent(id, duration));
        return new Spent(
                tokens,
                unassociatedMs + measured.values().stream().mapToLong(Long::longValue).sum());
    }
}
