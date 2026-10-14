package com.xuya.island.codex.chrome;

import com.xuya.island.codex.workspace.PlatformStore;
import com.xuya.island.codex.workspace.ProcessCommands;
import com.xuya.island.common.BusinessException;
import io.agentscope.core.util.JsonUtils;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** 只有用户安装的 Chrome 扩展回报成功才表示连接；Native Host 密钥独立于成人会话凭证。 */
@Service
public class ChromeService {
    private static final Set<String> ACTIONS =
            Set.of("listTabs", "selectTab", "snapshot", "navigate", "click", "fill", "screenshot");
    private final PlatformStore store;

    private static final class Connection {
        final Map<String, CompletableFuture<Map<String, Object>>> pending =
                new ConcurrentHashMap<>();
        final LinkedBlockingQueue<Command> commands = new LinkedBlockingQueue<>(32);
        volatile long lastSeen;
        volatile String extensionId = "";
        volatile Long selectedTabId;
        volatile List<Map<String, Object>> tabs = List.of();
        byte[] bridgeKey;
    }

    private final Map<String, Connection> connections = new ConcurrentHashMap<>();

    private Connection connection() {
        return connections.computeIfAbsent(
                com.xuya.island.account.AccountScope.id(), ignored -> new Connection());
    }

    public ChromeService(PlatformStore store) {
        this.store = store;
    }

    @Schema(name = "CodexChromeStatus")
    public record Status(
            boolean connected,
            String lastSeen,
            boolean registrationPresent,
            boolean extensionInstalled,
            Long selectedTabId,
            String message) {}

    @Schema(name = "CodexChromeAction")
    public record Action(String action, Long tabId, String url, String selector, String text) {}

    @Schema(name = "CodexChromeCommand")
    public record Command(
            String requestId,
            String action,
            Long tabId,
            String url,
            String selector,
            String text) {}

    @Schema(name = "CodexChromeActionResult")
    public record ActionResult(String requestId, String status, Map<String, Object> result) {}

    @Schema(name = "CodexChromeExchange")
    public record Exchange(
            String type, String requestId, Map<String, Object> result, String extensionId) {}

    public synchronized Path ensureBridgeConfiguration() throws IOException {
        Path directory = store.root().resolve("chrome");
        Files.createDirectories(directory);
        Path path = directory.resolve("bridge-secret.txt");
        if (!Files.isRegularFile(path)) {
            byte[] random = new byte[32];
            new SecureRandom().nextBytes(random);
            Files.writeString(
                    path,
                    Base64.getUrlEncoder().withoutPadding().encodeToString(random),
                    StandardCharsets.UTF_8,
                    java.nio.file.StandardOpenOption.CREATE_NEW);
        }
        connection().bridgeKey =
                Files.readString(path, StandardCharsets.UTF_8)
                        .strip()
                        .getBytes(StandardCharsets.UTF_8);
        return path;
    }

    public Status status() throws IOException {
        ensureBridgeConfiguration();
        boolean connected = connected();
        boolean registered = registrationPresent();
        return new Status(
                connected,
                connection().lastSeen == 0
                        ? null
                        : Instant.ofEpochMilli(connection().lastSeen).toString(),
                registered,
                connected && !connection().extensionId.isBlank(),
                connection().selectedTabId,
                connected
                        ? "已连接当前 Chrome"
                        : "请加载 codex/chrome/extension，并运行 backend/scripts/codex-chrome.ps1 Install 注册当前用户 Native Host；完成后打开扩展连接");
    }

    private boolean registrationPresent() {
        Path manifest = store.root().resolve("chrome/native-host.json");
        if (!Files.isRegularFile(manifest)
                || !System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win"))
            return false;
        try {
            var registry =
                    ProcessCommands.run(
                            store.root(),
                            List.of(
                                    "reg.exe",
                                    "query",
                                    "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.xuya.codex.chrome",
                                    "/ve"),
                            Duration.ofSeconds(2));
            return registry.exitCode() == 0
                    && registry.output()
                            .toLowerCase(Locale.ROOT)
                            .contains(manifest.toString().toLowerCase(Locale.ROOT))
                    && Files.isRegularFile(manifest.getParent().resolve("bin/NativeBridge.exe"));
        } catch (BusinessException exception) {
            return false;
        }
    }

    public Map<String, Object> tabs() {
        requireConnected();
        return Map.of("tabs", connection().tabs);
    }

    public ActionResult action(Action request) throws IOException {
        if (request.action() == null || !ACTIONS.contains(request.action()))
            throw error("CHROME_ACTION_INVALID", "不支持此浏览器操作", HttpStatus.BAD_REQUEST);
        requireConnected();
        if (request.action().equals("navigate")) {
            java.net.URI uri;
            try {
                uri = java.net.URI.create(request.url());
            } catch (RuntimeException exception) {
                throw error("CHROME_URL_INVALID", "请提供有效的 HTTP 或 HTTPS 地址", HttpStatus.BAD_REQUEST);
            }
            if (uri.getScheme() == null
                    || !Set.of("http", "https").contains(uri.getScheme())
                    || uri.getHost() == null
                    || uri.getUserInfo() != null)
                throw error("CHROME_URL_INVALID", "仅允许 HTTP 或 HTTPS 页面", HttpStatus.BAD_REQUEST);
        }
        if ((request.selector() != null && request.selector().length() > 2000)
                || (request.text() != null && request.text().length() > 65536))
            throw error("CHROME_INPUT_TOO_LARGE", "浏览器操作参数过长", HttpStatus.BAD_REQUEST);
        String id = UUID.randomUUID().toString();
        var future = new CompletableFuture<Map<String, Object>>();
        connection().pending.put(id, future);
        Command command =
                new Command(
                        id,
                        request.action(),
                        request.tabId() == null ? connection().selectedTabId : request.tabId(),
                        request.url(),
                        request.selector(),
                        request.text());
        if (!connection().commands.offer(command)) {
            connection().pending.remove(id);
            throw error("CHROME_BUSY", "浏览器操作队列已满", HttpStatus.TOO_MANY_REQUESTS);
        }
        try {
            Map<String, Object> result = future.get(30, TimeUnit.SECONDS);
            boolean success = Boolean.TRUE.equals(result.get("ok"));
            if (success && request.action().equals("selectTab"))
                connection().selectedTabId = request.tabId();
            store.save(
                    "chrome-results",
                    id,
                    Map.of(
                            "requestId",
                            id,
                            "action",
                            request.action(),
                            "success",
                            success,
                            "at",
                            Instant.now().toString()));
            return new ActionResult(id, success ? "completed" : "failed", result);
        } catch (java.util.concurrent.TimeoutException exception) {
            throw error("CHROME_TIMEOUT", "Chrome 未在 30 秒内返回；请检查扩展连接", HttpStatus.GATEWAY_TIMEOUT);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw error("CHROME_INTERRUPTED", "浏览器操作已中断", HttpStatus.SERVICE_UNAVAILABLE);
        } catch (java.util.concurrent.ExecutionException exception) {
            throw error("CHROME_EXECUTION_FAILED", "浏览器操作失败", HttpStatus.BAD_GATEWAY);
        } finally {
            connection().pending.remove(id);
            connection().commands.remove(command);
        }
    }

    public Map<String, Object> exchange(String suppliedKey, Exchange exchange) throws IOException {
        authenticate(suppliedKey);
        if (exchange.extensionId() == null || !exchange.extensionId().matches("[a-p]{32}"))
            throw error("CHROME_EXTENSION_INVALID", "扩展身份无效", HttpStatus.BAD_REQUEST);
        connection().extensionId = exchange.extensionId();
        connection().lastSeen = System.currentTimeMillis();
        if ("state".equals(exchange.type())
                && exchange.result() != null
                && exchange.result().get("tabs") instanceof List<?> values) {
            List<Map<String, Object>> safeTabs = new ArrayList<>();
            for (Object value : values.stream().limit(200).toList()) {
                if (value instanceof Map<?, ?> item && item.get("id") instanceof Number tabId) {
                    var tab = new LinkedHashMap<String, Object>();
                    tab.put("id", tabId.longValue());
                    tab.put("title", limit(String.valueOf(item.getOrDefault("title", null)), 500));
                    tab.put("url", limit(String.valueOf(item.getOrDefault("url", null)), 4000));
                    tab.put("active", Boolean.TRUE.equals(item.get("active")));
                    safeTabs.add(tab);
                }
            }
            connection().tabs = List.copyOf(safeTabs);
        } else if ("result".equals(exchange.type())
                && exchange.requestId() != null
                && exchange.result() != null) {
            if (JsonUtils.getJsonCodec().toJson(exchange.result()).length() > 4_000_000)
                throw error("CHROME_RESULT_TOO_LARGE", "浏览器结果过大", HttpStatus.PAYLOAD_TOO_LARGE);
            var future = connection().pending.get(exchange.requestId());
            if (future != null) future.complete(exchange.result());
        }
        List<Command> batch = new ArrayList<>();
        if ("poll".equals(exchange.type())) {
            connection().commands.drainTo(batch, 4);
            batch.removeIf(item -> !connection().pending.containsKey(item.requestId()));
        }
        return Map.of("commands", batch, "connected", true);
    }

    public synchronized String resolveBridgeOwner(
            String key, List<com.xuya.island.account.AccountViews.User> users) throws IOException {
        if (key == null || key.length() > 200)
            throw error("CHROME_BRIDGE_UNAUTHORIZED", "浏览器桥凭证无效", HttpStatus.UNAUTHORIZED);
        byte[] supplied = key.getBytes(StandardCharsets.UTF_8);
        for (var user : users) {
            if (!user.enabled()
                    || user.changePassword()
                    || !(user.permissions().contains("*")
                            || user.permissions().contains("codex:access"))) continue;
            try (var identity = com.xuya.island.account.AccountScope.bind(user.id())) {
                Path secret = store.root().resolve("chrome/bridge-secret.txt");
                if (!Files.isRegularFile(secret)) continue;
                byte[] expected =
                        Files.readString(secret, StandardCharsets.UTF_8)
                                .strip()
                                .getBytes(StandardCharsets.UTF_8);
                if (MessageDigest.isEqual(expected, supplied)) {
                    connection().bridgeKey = expected;
                    return user.id();
                }
            }
        }
        throw error("CHROME_BRIDGE_UNAUTHORIZED", "浏览器桥凭证无效", HttpStatus.UNAUTHORIZED);
    }

    private synchronized void authenticate(String key) throws IOException {
        if (connection().bridgeKey == null) ensureBridgeConfiguration();
        if (key == null
                || !MessageDigest.isEqual(
                        connection().bridgeKey, key.getBytes(StandardCharsets.UTF_8)))
            throw error("CHROME_BRIDGE_UNAUTHORIZED", "浏览器桥凭证无效", HttpStatus.UNAUTHORIZED);
    }

    private boolean connected() {
        return connection().lastSeen > 0
                && System.currentTimeMillis() - connection().lastSeen < 10_000;
    }

    private void requireConnected() {
        if (!connected())
            throw error(
                    "CHROME_NOT_CONNECTED",
                    "Chrome 扩展尚未连接，请先安装并检查 Native Host",
                    HttpStatus.SERVICE_UNAVAILABLE);
    }

    private static String limit(String text, int length) {
        return text.length() > length ? text.substring(0, length) : text;
    }

    private static BusinessException error(String code, String message, HttpStatus status) {
        return new BusinessException(code, message, status);
    }
}
