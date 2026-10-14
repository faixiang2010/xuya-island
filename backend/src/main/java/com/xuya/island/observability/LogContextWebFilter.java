package com.xuya.island.observability;

import com.xuya.island.codex.config.CodexConfiguration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.HandlerMapping;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class LogContextWebFilter implements WebFilter {
    private static final Logger LOG = LoggerFactory.getLogger(LogContextWebFilter.class);

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String supplied = exchange.getRequest().getHeaders().getFirst("X-Request-Id");
        String id =
                supplied != null && supplied.matches("[a-zA-Z0-9_-]{1,80}")
                        ? supplied
                        : UUID.randomUUID().toString();
        exchange.getAttributes().put("requestId", id);
        exchange.getResponse().getHeaders().set("X-Request-Id", id);
        // 记录路由模板而非URL/查询串，终端票据、附件路径和业务正文不会进入运行日志。
        boolean api = exchange.getRequest().getPath().value().startsWith("/api/");
        return Mono.defer(
                        () -> {
                            long started = System.nanoTime();
                            String method = exchange.getRequest().getMethod().name();
                            if (api && !method.equals("GET"))
                                LOG.info("HTTP request started request={} method={}", id, method);
                            return chain.filter(exchange)
                                    .doOnError(
                                            error ->
                                                    LOG.error(
                                                            "HTTP request failed request={} errorType={}",
                                                            id,
                                                            error.getClass().getSimpleName()))
                                    .doFinally(
                                            signal -> {
                                                if (!api) return;
                                                int status =
                                                        exchange.getResponse().getStatusCode()
                                                                        == null
                                                                ? 200
                                                                : exchange.getResponse()
                                                                        .getStatusCode()
                                                                        .value();
                                                Object matchedRoute =
                                                        exchange.getAttribute(
                                                                HandlerMapping
                                                                        .BEST_MATCHING_PATTERN_ATTRIBUTE);
                                                String route =
                                                        matchedRoute == null
                                                                ? "unmatched"
                                                                : matchedRoute.toString();
                                                long elapsed =
                                                        TimeUnit.NANOSECONDS.toMillis(
                                                                System.nanoTime() - started);
                                                if (status >= 400)
                                                    LOG.warn(
                                                            "HTTP request ended request={} method={} route={} status={} durationMs={} signal={}",
                                                            id,
                                                            method,
                                                            route,
                                                            status,
                                                            elapsed,
                                                            signal);
                                                else if (!method.equals("GET")
                                                        || route.contains("events")
                                                        || route.contains("socket"))
                                                    LOG.info(
                                                            "HTTP request ended request={} method={} route={} status={} durationMs={} signal={}",
                                                            id,
                                                            method,
                                                            route,
                                                            status,
                                                            elapsed,
                                                            signal);
                                                else
                                                    LOG.debug(
                                                            "HTTP request ended request={} method={} route={} status={} durationMs={}",
                                                            id,
                                                            method,
                                                            route,
                                                            status,
                                                            elapsed);
                                            });
                        })
                .contextWrite(
                        view ->
                                view.put(
                                        CodexConfiguration.LOG_CONTEXT_KEY,
                                        Map.of("requestId", id)));
    }
}
