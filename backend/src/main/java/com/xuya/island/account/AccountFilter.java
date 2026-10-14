package com.xuya.island.account;

import cn.dev33.satoken.stp.StpUtil;
import com.xuya.island.codex.chrome.ChromeService;
import com.xuya.island.common.BusinessException;
import com.xuya.island.config.XuyaProperties;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import tools.jackson.databind.json.JsonMapper;

/** 所有教学/管理/开发API先检查真实账户，再检查功能权限和来源。 */
@Component
@Order(-200)
public class AccountFilter implements WebFilter {
    private static final Set<String> PUBLIC =
            Set.of(
                    "/api/health",
                    "/api/readiness",
                    "/api/v1/auth/state",
                    "/api/v1/auth/captcha",
                    "/api/v1/auth/login",
                    "/api/v1/auth/setup");
    private final AccountGateway gateway;
    private final AccountService accounts;
    private final XuyaProperties properties;
    private final boolean enabled;
    private final ChromeService chrome;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public AccountFilter(
            AccountGateway gateway,
            AccountService accounts,
            XuyaProperties properties,
            ChromeService chrome,
            @Value("${xuya.auth.enabled:true}") boolean enabled) {
        this.gateway = gateway;
        this.accounts = accounts;
        this.properties = properties;
        this.chrome = chrome;
        this.enabled = enabled;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().value();
        if (!enabled || !path.startsWith("/api/")) return chain.filter(exchange);
        exchange.getResponse().getHeaders().setCacheControl("no-store");
        if (exchange.getRequest().getMethod() == HttpMethod.OPTIONS) return chain.filter(exchange);
        return Mono.fromCallable(
                        () -> {
                            boolean mutation =
                                    !Set.of(HttpMethod.GET, HttpMethod.HEAD)
                                            .contains(exchange.getRequest().getMethod());
                            boolean nativeBridge =
                                    path.equals("/api/v1/codex/chrome/bridge/exchange");
                            if (nativeBridge
                                    && (!AccountGateway.local(exchange)
                                            || exchange.getRequest().getHeaders().getOrigin()
                                                    != null))
                                throw AccountGateway.denied("浏览器连接只接受主机原生桥请求");
                            if (mutation
                                    && !nativeBridge
                                    && !RequestTrust.origin(exchange, properties.allowedOrigins()))
                                throw AccountGateway.denied("这个来源不能修改家庭学习空间");
                            if (PUBLIC.contains(path)) return "";
                            String id =
                                    nativeBridge
                                            ? chrome.resolveBridgeOwner(
                                                    exchange.getRequest()
                                                            .getHeaders()
                                                            .getFirst("X-Codex-Chrome-Bridge"),
                                                    accounts.users())
                                            : gateway.requireAccount(exchange);
                            if (!accounts.user(id).enabled()) throw AccountGateway.denied("账户已停用");
                            String expectedAccount =
                                    exchange.getRequest().getHeaders().getFirst("X-Xuya-Account");
                            if (expectedAccount != null && !expectedAccount.equals(id))
                                throw new BusinessException(
                                        "ACCOUNT_CHANGED",
                                        "家庭账户已切换，请重新打开你的学习空间",
                                        org.springframework.http.HttpStatus.UNAUTHORIZED);
                            if (mutation && !nativeBridge) gateway.requireCsrf(exchange);
                            if (accounts.user(id).changePassword()
                                    && !path.startsWith("/api/v1/auth/"))
                                throw AccountGateway.denied("请先修改初始密码，再开始探险");
                            String permission = permission(path);
                            if ((path.startsWith("/api/v1/system/")
                                            || path.startsWith("/api/v1/admin/"))
                                    && !accounts.roles(id).contains("super-admin"))
                                throw AccountGateway.denied("家庭管理暂时只向超级管理员开放");
                            if (mutation
                                    && path.startsWith("/api/v1/codex/settings")
                                    && !accounts.roles(id).contains("super-admin"))
                                throw AccountGateway.denied("公共模型配置只能由家庭管理员修改");
                            if (!permission.isBlank()
                                    && !(isSharedLearningResource(path)
                                            && accounts.permissions(id).contains("classroom:use"))
                                    && !(path.startsWith("/api/v1/learning/sessions")
                                            && accounts.permissions(id).stream()
                                                    .anyMatch(
                                                            value ->
                                                                    Set.of(
                                                                                    "games:use",
                                                                                    "classroom:use",
                                                                                    "adventure:use")
                                                                            .contains(value)))
                                    && !(path.equals("/api/v1/learning/typing-progress")
                                            && accounts.permissions(id).contains("games:use"))
                                    && !StpUtil.getStpLogic().hasPermission(id, permission))
                                throw AccountGateway.denied("这个账户暂时没有使用此功能的权限");
                            if (permission.startsWith("codex:") && !AccountGateway.local(exchange))
                                throw AccountGateway.denied("开发工作台只在主机本地开放");
                            exchange.getAttributes().put(AccountScope.CONTEXT_KEY, id);
                            return id;
                        })
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(
                        id ->
                                chain.filter(exchange)
                                        .contextWrite(
                                                context ->
                                                        context.put(AccountScope.CONTEXT_KEY, id)))
                .onErrorResume(
                        BusinessException.class,
                        exception -> {
                            if (exchange.getResponse().isCommitted()) return Mono.error(exception);
                            exchange.getResponse().setStatusCode(exception.getStatus());
                            exchange.getResponse()
                                    .getHeaders()
                                    .setContentType(MediaType.APPLICATION_JSON);
                            byte[] data =
                                    mapper.writeValueAsBytes(
                                            Map.of(
                                                    "code",
                                                    exception.getCode(),
                                                    "message",
                                                    exception.getMessage()));
                            return exchange.getResponse()
                                    .writeWith(
                                            Mono.just(
                                                    exchange.getResponse()
                                                            .bufferFactory()
                                                            .wrap(data)));
                        });
    }

    private String permission(String path) {
        if (path.startsWith("/api/v1/auth/")) return "";
        if (path.startsWith("/api/v1/system/") || path.startsWith("/api/v1/admin/"))
            return "system:manage";
        if (path.startsWith("/api/v1/execution")) return "execution:run";
        if (path.startsWith("/api/v1/learning") || path.startsWith("/api/v1/rewards"))
            return "learning:read";
        if (path.startsWith("/api/v1/")) {
            if (path.contains("/terminal")) return "codex:terminal";
            if (path.contains("/workspaces") || path.contains("/files") || path.contains("/git"))
                return "codex:workspace";
            if (path.contains("/plugins")
                    || path.contains("/mcp")
                    || path.contains("/documents")
                    || path.contains("/pdf")
                    || path.contains("/design")
                    || path.contains("/chrome")) return "codex:plugin";
            return "codex:access";
        }
        if (path.startsWith("/api/works")) return "works:manage";
        if (path.startsWith("/api/projects")
                || path.startsWith("/api/study-sessions")
                || path.startsWith("/api/candidates")
                || path.startsWith("/api/tutor")) return "studio:use";
        if (path.startsWith("/api/adventure")) return "adventure:use";
        return "learning:read";
    }

    private boolean isSharedLearningResource(String path) {
        return path.startsWith("/api/lessons")
                || path.startsWith("/api/curriculum")
                || path.startsWith("/api/progress")
                || path.startsWith("/api/exercise-attempts");
    }
}
