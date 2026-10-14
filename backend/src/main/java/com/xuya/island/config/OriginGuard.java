package com.xuya.island.config;

import com.xuya.island.account.RequestTrust;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

/**
 * 本机 API 写操作只接受配置中的前端来源，隔离执行域没有写权限。
 *
 * @author Codex代码助手
 */
@Component
public class OriginGuard implements WebFilter {

    private final XuyaProperties properties;

    public OriginGuard(XuyaProperties properties) {
        this.properties = properties;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        exchange.getResponse().getHeaders().set("Cross-Origin-Opener-Policy", "same-origin");
        exchange.getResponse().getHeaders().set("Cross-Origin-Embedder-Policy", "require-corp");
        exchange.getResponse()
                .getHeaders()
                .set(
                        "Permissions-Policy",
                        "cross-origin-isolated=(self \"http://127.0.0.1:"
                                + properties.runnerPort()
                                + "\")");
        HttpMethod method = exchange.getRequest().getMethod();
        String path = exchange.getRequest().getPath().value();
        boolean mutation =
                !HttpMethod.GET.equals(method)
                        && !HttpMethod.HEAD.equals(method)
                        && !HttpMethod.OPTIONS.equals(method);
        if (path.startsWith("/api/") && !path.startsWith("/api/v1/") && mutation) {
            if (!RequestTrust.origin(exchange, properties.allowedOrigins())) {
                exchange.getResponse().setStatusCode(HttpStatus.FORBIDDEN);
                return exchange.getResponse().setComplete();
            }
        }
        return chain.filter(exchange);
    }
}
