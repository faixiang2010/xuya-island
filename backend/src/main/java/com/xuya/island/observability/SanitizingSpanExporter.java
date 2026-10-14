package com.xuya.island.observability;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.sdk.common.CompletableResultCode;
import io.opentelemetry.sdk.trace.data.DelegatingSpanData;
import io.opentelemetry.sdk.trace.data.EventData;
import io.opentelemetry.sdk.trace.data.LinkData;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.data.StatusData;
import io.opentelemetry.sdk.trace.export.SpanExporter;
import java.util.Collection;
import java.util.List;
import java.util.Set;

/** 导出边界采用字段白名单；异常消息、堆栈、文件、命令、参数和工具参数不外发。模型 span 保留原名与模型名，供 Studio 统计模型调用与 Token。 */
public final class SanitizingSpanExporter implements SpanExporter {
    // 属性名与 agentscope-core 2.1.0 OtelTracingMiddleware 实际生成的属性对齐（均为元数据与计数，不含对话内容）。
    private static final Set<String> SAFE_IDS =
            Set.of(
                    "codex.session.id",
                    "codex.turn.id",
                    "codex.run.id",
                    "agent.name",
                    "agent.id",
                    "gen_ai.request.model",
                    "gen_ai.response.model",
                    "gen_ai.system",
                    "gen_ai.operation.name",
                    "gen_ai.agent.name",
                    "gen_ai.agent.id",
                    "gen_ai.tool.name",
                    "gen_ai.tool.call.id");
    private static final Set<String> SAFE_COUNTS =
            Set.of(
                    "gen_ai.usage.input_tokens",
                    "gen_ai.usage.output_tokens",
                    "gen_ai.usage.total_tokens",
                    "gen_ai.usage.cache_creation_input_tokens",
                    "gen_ai.usage.cache_read_input_tokens",
                    "gen_ai.usage.reasoning.output_tokens",
                    "gen_ai.request.messages.count",
                    "gen_ai.request.tools.count",
                    "gen_ai.tool.call.count",
                    "agent.reasoning_count",
                    "agent.tool_count");
    private final SpanExporter delegate;
    private final String studioRunId;

    public SanitizingSpanExporter(SpanExporter delegate) {
        this(delegate, null);
    }

    public SanitizingSpanExporter(SpanExporter delegate, String studioRunId) {
        this.delegate = delegate;
        this.studioRunId = studioRunId;
    }

    @Override
    public CompletableResultCode export(Collection<SpanData> spans) {
        return delegate.export(spans.stream().map(this::sanitize).toList());
    }

    public SpanData sanitize(SpanData span) {
        var attributes = Attributes.builder();
        span.getAttributes()
                .forEach(
                        (key, value) -> {
                            if (value instanceof Number number
                                    && SAFE_COUNTS.contains(key.getKey()))
                                attributes.put(
                                        AttributeKey.longKey(key.getKey()), number.longValue());
                            if (SAFE_IDS.contains(key.getKey())
                                    && value instanceof String text
                                    && text.matches("[a-zA-Z0-9:_-]{1,128}"))
                                attributes.put(AttributeKey.stringKey(key.getKey()), text);
                        });
        // Studio 1.0.9 以该属性把 trace 关联注册 run；产品会话另用 codex.session.id。
        if (studioRunId != null && studioRunId.matches("[a-zA-Z0-9:_-]{1,128}"))
            attributes.put("gen_ai.conversation.id", studioRunId);
        return new DelegatingSpanData(span) {
            @Override
            public String getName() {
                String name = span.getName();
                // 工具 span 名可能携带参数摘要，保持改写脱敏；模型/Agent span 名是固定模式，保留供 Studio 统计。
                if (name.contains("tool")) return "codex.tool";
                return name.matches("[a-zA-Z0-9._:/ -]{1,128}") ? name : "codex.agent";
            }

            @Override
            public Attributes getAttributes() {
                return attributes.build();
            }

            @Override
            public List<EventData> getEvents() {
                return List.of();
            }

            @Override
            public List<LinkData> getLinks() {
                return List.of();
            }

            @Override
            public int getTotalRecordedEvents() {
                return 0;
            }

            @Override
            public int getTotalRecordedLinks() {
                return 0;
            }

            @Override
            public int getTotalAttributeCount() {
                return attributes.build().size();
            }

            @Override
            public StatusData getStatus() {
                return StatusData.create(span.getStatus().getStatusCode(), "");
            }
        };
    }

    @Override
    public CompletableResultCode flush() {
        return delegate.flush();
    }

    @Override
    public CompletableResultCode shutdown() {
        return delegate.shutdown();
    }
}
