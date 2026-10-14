package com.xuya.island.agentapi.config;

import com.xuya.island.agentapi.service.AccessService;
import com.xuya.island.config.XuyaProperties;
import java.net.URI;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;

/** 新版成人API所有方法的鉴权与来源边界，旧教学协议保持兼容。 */
@Component
@Order(-100)
public class AgentAccessFilter implements WebFilter {
    private final AccessService access;
    private final XuyaProperties properties;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public AgentAccessFilter(AccessService access, XuyaProperties properties) {
        this.access = access;
        this.properties = properties;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().value();
        if (!path.startsWith("/api/v1/")) return chain.filter(exchange);
        if (path.startsWith("/api/v1/auth/")
                || path.startsWith("/api/v1/system/")
                || path.startsWith("/api/v1/execution")
                || path.startsWith("/api/v1/learning")
                || path.startsWith("/api/v1/rewards")
                || path.startsWith("/api/v1/admin/")) {
            return chain.filter(exchange);
        }
        String requestId =
                exchange.getAttributeOrDefault("requestId", UUID.randomUUID().toString());
        exchange.getAttributes().put("requestId", requestId);
        exchange.getResponse().getHeaders().set("X-Request-Id", requestId);
        exchange.getResponse().getHeaders().setCacheControl("no-store");
        String origin = exchange.getRequest().getHeaders().getOrigin();
        String referer = exchange.getRequest().getHeaders().getFirst("Referer");
        String fetchSite = exchange.getRequest().getHeaders().getFirst("Sec-Fetch-Site");
        boolean browser = origin != null || referer != null || fetchSite != null;
        String source = origin != null ? origin : originOf(referer);
        boolean trusted =
                source != null
                        && (properties.allowedOrigins().contains(source)
                                || source.equals("http://127.0.0.1:" + localPort(exchange))
                                || source.equals("http://localhost:" + localPort(exchange)));
        if (browser && !trusted)
            return failure(
                    exchange, HttpStatus.FORBIDDEN, "ORIGIN_DENIED", "这个来源不能访问开发工作台", requestId);
        if (exchange.getRequest().getMethod().name().equals("OPTIONS")) {
            if (!trusted)
                return failure(
                        exchange, HttpStatus.FORBIDDEN, "ORIGIN_DENIED", "预检请求需要受信来源", requestId);
            return chain.filter(exchange);
        }
        if (path.equals("/api/v1/codex/access/bootstrap")) {
            if (!trusted || !"POST".equals(exchange.getRequest().getMethod().name())) {
                return failure(
                        exchange,
                        HttpStatus.FORBIDDEN,
                        "TRUSTED_ENTRY_REQUIRED",
                        "请从本机开发工作台进入",
                        requestId);
            }
        } else if (path.equals("/api/v1/codex/terminal/socket")) {
            // 升级请求由终端handler消费一次性票据；不能用查询字符串里的Bearer。
            if (!trusted)
                return failure(
                        exchange, HttpStatus.FORBIDDEN, "ORIGIN_DENIED", "终端需要受信本机来源", requestId);
        } else if (path.startsWith("/api/v1/codex/chrome/bridge/")) {
            // Native Messaging独立桥需要handler自身的随机配对凭据。
            if (browser)
                return failure(
                        exchange, HttpStatus.FORBIDDEN, "BRIDGE_ONLY", "本机浏览器桥不接受页面调用", requestId);
        } else if (!access.accepts(exchange.getRequest().getHeaders().getFirst("Authorization"))) {
            return failure(
                    exchange,
                    HttpStatus.UNAUTHORIZED,
                    "ACCESS_EXPIRED",
                    "开发工作台连接已过期，请重新连接",
                    requestId);
        }
        return chain.filter(exchange)
                .contextWrite(
                        context ->
                                context.put("requestId", requestId)
                                        .put("xuya.log-context", Map.of("requestId", requestId)));
    }

    private String originOf(String value) {
        if (value == null) return null;
        try {
            URI uri = URI.create(value);
            if (uri.getScheme() == null || uri.getHost() == null || uri.getUserInfo() != null)
                return null;
            return uri.getScheme()
                    + "://"
                    + uri.getHost()
                    + (uri.getPort() < 0 ? "" : ":" + uri.getPort());
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private int localPort(ServerWebExchange exchange) {
        return exchange.getRequest().getLocalAddress() == null
                ? -1
                : exchange.getRequest().getLocalAddress().getPort();
    }

    private Mono<Void> failure(
            ServerWebExchange exchange,
            HttpStatus status,
            String code,
            String message,
            String requestId) {
        exchange.getResponse().setStatusCode(status);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        byte[] bytes =
                mapper.writeValueAsBytes(
                        Map.of(
                                "type",
                                "about:blank",
                                "status",
                                status.value(),
                                "title",
                                status.getReasonPhrase(),
                                "detail",
                                message,
                                "code",
                                code,
                                "traceId",
                                requestId));
        return exchange.getResponse()
                .writeWith(Mono.just(exchange.getResponse().bufferFactory().wrap(bytes)));
    }
}
