package com.xuya.island.observability;

import java.util.Set;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.appender.rewrite.RewritePolicy;
import org.apache.logging.log4j.core.config.plugins.Plugin;
import org.apache.logging.log4j.core.config.plugins.PluginFactory;
import org.apache.logging.log4j.core.impl.Log4jLogEvent;
import org.apache.logging.log4j.message.SimpleMessage;
import org.apache.logging.log4j.util.SortedArrayStringMap;

/** 文件和控制台写入前的统一脱敏边界，删除异常正文及非白名单 MDC。 */
@Plugin(name = "CodexSafeLog", category = "Core", elementType = "rewritePolicy", printObject = true)
public final class SafeLogRewritePolicy implements RewritePolicy {
    private static final Set<String> KEYS =
            Set.of("requestId", "traceId", "sessionId", "turnId", "toolCallId");

    @PluginFactory
    public static SafeLogRewritePolicy createPolicy() {
        return new SafeLogRewritePolicy();
    }

    @Override
    public LogEvent rewrite(LogEvent event) {
        var context = new SortedArrayStringMap();
        event.getContextData()
                .forEach(
                        (key, value) -> {
                            if (KEYS.contains(key)
                                    && value instanceof String item
                                    && item.matches("[a-zA-Z0-9:_-]{1,128}"))
                                context.putValue(key, item);
                        });
        return new Log4jLogEvent.Builder(event)
                .setContextData(context)
                .setThrown(null)
                .setThrownProxy(null)
                .setMessage(
                        new SimpleMessage(
                                DiagnosticRedaction.text(
                                        event.getMessage().getFormattedMessage(), 4096)))
                .build();
    }
}
