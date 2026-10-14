package com.xuya.island.observability;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** 启动后给出实际端口、日志位置和可选服务开关；不探测服务、不打印私有配置。 */
@Component
public final class BackendLifecycleLogging {
    private static final Logger LOG = LoggerFactory.getLogger(BackendLifecycleLogging.class);

    @EventListener
    public void ready(ApplicationReadyEvent event) {
        var environment = event.getApplicationContext().getEnvironment();
        LOG.info(
                "Backend ready port={} profiles={} mainLog={} codexLog={} logFallback={}",
                environment.getProperty("local.server.port", "unknown"),
                String.join(",", environment.getActiveProfiles()),
                environment.getProperty("logging.file.name"),
                environment.getProperty("xuya.codex.log-file"),
                environment.getProperty("xuya.logging.fallback", "false"));
        LOG.info(
                "Backend diagnostics logLevel={} swagger=/swagger-ui.html frontend=React",
                environment.getProperty("logging.level.com.xuya.island", "INFO"));
    }
}
