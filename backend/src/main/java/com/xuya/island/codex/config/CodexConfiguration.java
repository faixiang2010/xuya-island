package com.xuya.island.codex.config;

import io.micrometer.context.ContextRegistry;
import io.micrometer.context.ThreadLocalAccessor;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.slf4j.MDC;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** 注册自有日志字段；不触碰 Studio 或 OpenTelemetry 全局注册表。 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(CodexProperties.class)
public class CodexConfiguration {
    public static final String LOG_CONTEXT_KEY = "xuya.log-context";
    private static final Set<String> LOG_KEYS =
            Set.of("requestId", "traceId", "sessionId", "turnId", "toolCallId");

    public CodexConfiguration() {
        ContextRegistry.getInstance()
                .registerThreadLocalAccessor(
                        new ThreadLocalAccessor<Map<String, String>>() {
                            public Object key() {
                                return LOG_CONTEXT_KEY;
                            }

                            public Map<String, String> getValue() {
                                Map<String, String> values = new LinkedHashMap<>();
                                LOG_KEYS.forEach(
                                        key -> {
                                            if (MDC.get(key) != null) values.put(key, MDC.get(key));
                                        });
                                return values;
                            }

                            public void setValue(Map<String, String> value) {
                                setValue();
                                value.forEach(
                                        (key, item) -> {
                                            if (LOG_KEYS.contains(key)
                                                    && item.matches("[a-zA-Z0-9:_-]{1,128}"))
                                                MDC.put(key, item);
                                        });
                            }

                            public void setValue() {
                                LOG_KEYS.forEach(MDC::remove);
                            }
                        });
    }
}
