package com.xuya.island.account;

import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 登录协议及超级管理员管理入口，不提供公开注册API。 */
@RestController
public class AccountController {
    private final AccountGateway gateway;
    private final AccountService accounts;

    public AccountController(AccountGateway gateway, AccountService accounts) {
        this.gateway = gateway;
        this.accounts = accounts;
    }

    @GetMapping("/api/v1/auth/state")
    public Mono<AccountViews.State> state(ServerWebExchange exchange) {
        return blocking(() -> gateway.state(exchange));
    }

    @PostMapping("/api/v1/auth/captcha")
    public Mono<Map<String, String>> captcha(ServerWebExchange exchange) {
        return blocking(() -> gateway.captcha(exchange));
    }

    @PostMapping("/api/v1/auth/login")
    public Mono<AccountViews.State> login(
            ServerWebExchange exchange, @Valid @RequestBody AccountRequests.Login request) {
        return blocking(() -> gateway.login(exchange, request));
    }

    @PostMapping("/api/v1/auth/setup")
    public Mono<AccountViews.State> setup(
            ServerWebExchange exchange, @Valid @RequestBody AccountRequests.Setup request) {
        return blocking(() -> gateway.setup(exchange, request));
    }

    @PostMapping("/api/v1/auth/logout")
    public Mono<Map<String, Boolean>> logout(ServerWebExchange exchange) {
        return blocking(
                () -> {
                    gateway.logout(exchange);
                    return Map.of("ok", true);
                });
    }

    @PostMapping("/api/v1/auth/password")
    public Mono<Map<String, Boolean>> password(
            @Valid @RequestBody AccountRequests.Password request) {
        return blocking(
                () -> {
                    accounts.changePassword(AccountScope.id(), request);
                    return Map.of("ok", true);
                });
    }

    @GetMapping("/api/v1/system/users")
    public Mono<List<AccountViews.User>> users() {
        return blocking(accounts::users);
    }

    @PostMapping("/api/v1/system/users")
    public Mono<AccountViews.User> createUser(
            @Valid @RequestBody AccountRequests.SaveUser request) {
        return blocking(() -> accounts.user(accounts.createUser(request, true)));
    }

    @PutMapping("/api/v1/system/users/{id}")
    public Mono<AccountViews.User> updateUser(
            @PathVariable String id, @Valid @RequestBody AccountRequests.SaveUser request) {
        return blocking(
                () -> {
                    accounts.saveUser(id, request);
                    return accounts.user(id);
                });
    }

    @GetMapping("/api/v1/system/roles")
    public Mono<List<AccountViews.Role>> roles() {
        return blocking(accounts::allRoles);
    }

    @PostMapping("/api/v1/system/roles")
    public Mono<Map<String, String>> createRole(
            @Valid @RequestBody AccountRequests.SaveRole request) {
        return blocking(() -> Map.of("id", accounts.saveRole(null, request)));
    }

    @PutMapping("/api/v1/system/roles/{id}")
    public Mono<Map<String, String>> updateRole(
            @PathVariable String id, @Valid @RequestBody AccountRequests.SaveRole request) {
        return blocking(() -> Map.of("id", accounts.saveRole(id, request)));
    }

    @GetMapping("/api/v1/system/menus")
    public Mono<List<AccountViews.Menu>> menus() {
        return blocking(accounts::menus);
    }

    @PostMapping("/api/v1/system/menus")
    public Mono<Map<String, String>> createMenu(
            @Valid @RequestBody AccountRequests.SaveMenu request) {
        return blocking(() -> Map.of("id", accounts.saveMenu(null, request)));
    }

    @PutMapping("/api/v1/system/menus/{id}")
    public Mono<Map<String, String>> updateMenu(
            @PathVariable String id, @Valid @RequestBody AccountRequests.SaveMenu request) {
        return blocking(() -> Map.of("id", accounts.saveMenu(id, request)));
    }

    @GetMapping("/api/v1/system/security")
    public Mono<Map<String, String>> security() {
        return blocking(() -> Map.of("captchaMode", accounts.setting("captcha_mode", "always")));
    }

    @PutMapping("/api/v1/system/security")
    public Mono<Map<String, String>> security(@RequestBody Map<String, String> request) {
        return blocking(
                () -> {
                    String mode = request.get("captchaMode");
                    if (!List.of("always", "adaptive", "off").contains(mode))
                        throw AccountService.invalid("验证码策略无效");
                    accounts.setSetting("captcha_mode", mode);
                    accounts.audit("security:update", "captcha", true);
                    return Map.of("captchaMode", mode);
                });
    }

    @GetMapping("/api/v1/system/audit")
    public Mono<List<Map<String, Object>>> audit() {
        return blocking(accounts::auditLog);
    }

    private <T> Mono<T> blocking(Supplier<T> action) {
        return Mono.fromCallable(action::get).subscribeOn(Schedulers.boundedElastic());
    }
}
