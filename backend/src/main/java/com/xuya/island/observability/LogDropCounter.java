package com.xuya.island.observability;

import java.util.concurrent.atomic.AtomicLong;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.config.Property;
import org.apache.logging.log4j.core.config.plugins.Plugin;
import org.apache.logging.log4j.core.config.plugins.PluginAttribute;
import org.apache.logging.log4j.core.config.plugins.PluginFactory;

/** AsyncAppender 满队列时的非阻塞计数出口，业务审计另存原生事件日志。 */
@Plugin(name = "CodexDropCounter", category = "Core", elementType = "appender", printObject = true)
public final class LogDropCounter extends AbstractAppender {
    private static final AtomicLong COUNT = new AtomicLong();

    private LogDropCounter(String name) {
        super(name, null, null, true, Property.EMPTY_ARRAY);
    }

    @PluginFactory
    public static LogDropCounter createAppender(
            @PluginAttribute(value = "name", defaultString = "DropCounter") String name) {
        return new LogDropCounter(name);
    }

    @Override
    public void append(LogEvent event) {
        COUNT.incrementAndGet();
    }

    public static long dropped() {
        return COUNT.get();
    }
}
