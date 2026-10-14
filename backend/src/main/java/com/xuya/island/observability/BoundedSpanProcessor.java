package com.xuya.island.observability;

import io.opentelemetry.context.Context;
import io.opentelemetry.sdk.common.CompletableResultCode;
import io.opentelemetry.sdk.trace.ReadWriteSpan;
import io.opentelemetry.sdk.trace.ReadableSpan;
import io.opentelemetry.sdk.trace.SpanProcessor;
import java.util.concurrent.atomic.AtomicLong;

/** BSP 外层预留有界额度；导出完成即归还，队列满时精确记录丢弃而不阻塞应用。 */
final class BoundedSpanProcessor implements SpanProcessor {
    private final SpanProcessor delegate;
    private final AtomicLong pending;
    private final AtomicLong dropped;

    BoundedSpanProcessor(SpanProcessor delegate, AtomicLong pending, AtomicLong dropped) {
        this.delegate = delegate;
        this.pending = pending;
        this.dropped = dropped;
    }

    @Override
    public void onStart(Context parentContext, ReadWriteSpan span) {}

    @Override
    public boolean isStartRequired() {
        return false;
    }

    @Override
    public void onEnd(ReadableSpan span) {
        if (!span.getSpanContext().isSampled()) return;
        if (pending.incrementAndGet() > 256) {
            pending.decrementAndGet();
            dropped.incrementAndGet();
            return;
        }
        delegate.onEnd(span);
    }

    @Override
    public boolean isEndRequired() {
        return true;
    }

    @Override
    public CompletableResultCode shutdown() {
        return delegate.shutdown();
    }

    @Override
    public CompletableResultCode forceFlush() {
        return delegate.forceFlush();
    }
}
