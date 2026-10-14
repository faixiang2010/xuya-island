package com.xuya.island.codex.chrome;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.sun.net.httpserver.HttpServer;
import com.xuya.island.codex.config.CodexProperties;
import com.xuya.island.codex.workspace.PlatformStore;
import com.xuya.island.codex.workspace.ProcessCommands;
import com.xuya.island.common.BusinessException;
import io.agentscope.core.util.JsonUtils;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** 独立桥鉴权、已发命令响应配对及真实 Native Messaging 长度帧；不操作用户 Chrome。 */
class ChromeBridgeTest {
    private Path root;
    private ChromeService chrome;
    private String key;

    @BeforeEach
    void setup() throws IOException {
        Path parent = Path.of("target/codex-platform-tests").toAbsolutePath().normalize();
        Files.createDirectories(parent);
        root = Files.createTempDirectory(parent, "chrome-");
        chrome =
                new ChromeService(
                        new PlatformStore(
                                new CodexProperties(
                                        root.resolve("data"), 0, 0, 0, 0, 0, null, null)));
        key = Files.readString(chrome.ensureBridgeConfiguration()).strip();
    }

    @AfterEach
    void cleanup() {
        com.xuya.island.account.AccountScope.clear();
        if (root == null
                || !root.startsWith(
                        Path.of("target/codex-platform-tests").toAbsolutePath().normalize()))
            return;
        // Windows 上刚编译并执行过的 NativeBridge.exe 可能被安全软件短暂占用，删除会抛 AccessDenied；
        // 重试消化这类瞬时锁，避免清理动作掩盖真实测试结果（残留目录仍位于 target/ 下，由构建清理）。
        for (int attempt = 0; attempt < 6; attempt++) {
            try {
                deleteTree(root);
                return;
            } catch (IOException locked) {
                if (attempt == 5) {
                    System.err.println("清理临时目录时仍被占用，已保留：" + root);
                    return;
                }
            }
            try {
                Thread.sleep(250L * (attempt + 1));
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private static void deleteTree(Path directory) throws IOException {
        try (var walk = Files.walk(directory)) {
            for (Path path : walk.sorted(Comparator.reverseOrder()).toList())
                Files.deleteIfExists(path);
        }
    }

    @Test
    void bridgeKeysTabsAndConnectionStateBelongToTheirAccount() throws Exception {
        var adultA =
                new com.xuya.island.account.AccountViews.User(
                        "adult-a",
                        "adult-a",
                        "甲",
                        true,
                        false,
                        List.of("developer"),
                        List.of("codex:access"));
        var adultB =
                new com.xuya.island.account.AccountViews.User(
                        "adult-b",
                        "adult-b",
                        "乙",
                        true,
                        false,
                        List.of("developer"),
                        List.of("codex:access"));
        com.xuya.island.account.AccountScope.set(adultA.id());
        String firstKey = Files.readString(chrome.ensureBridgeConfiguration()).strip();
        chrome.exchange(
                firstKey,
                new ChromeService.Exchange(
                        "state",
                        null,
                        Map.of("tabs", List.of(Map.of("id", 7, "title", "甲的页面"))),
                        "a".repeat(32)));
        com.xuya.island.account.AccountScope.set(adultB.id());
        String secondKey = Files.readString(chrome.ensureBridgeConfiguration()).strip();
        assertFalse(chrome.status().connected());
        assertThrows(
                BusinessException.class,
                () ->
                        chrome.exchange(
                                firstKey,
                                new ChromeService.Exchange("poll", null, null, "a".repeat(32))));
        assertEquals(adultA.id(), chrome.resolveBridgeOwner(firstKey, List.of(adultA, adultB)));
        assertEquals(adultB.id(), chrome.resolveBridgeOwner(secondKey, List.of(adultA, adultB)));
        com.xuya.island.account.AccountScope.set(adultA.id());
        assertTrue(chrome.status().connected());
        assertEquals(
                "甲的页面",
                ((List<Map<String, Object>>) chrome.tabs().get("tabs")).get(0).get("title"));
        var disabled =
                new com.xuya.island.account.AccountViews.User(
                        adultA.id(),
                        "adult-a",
                        "甲",
                        false,
                        false,
                        List.of("developer"),
                        List.of("codex:access"));
        assertThrows(
                BusinessException.class,
                () -> chrome.resolveBridgeOwner(firstKey, List.of(disabled, adultB)));
    }

    @Test
    void bridgeDoesNotClaimConnectedWithoutAuthenticatedExtensionAndPairsResponses()
            throws Exception {
        String extension = "a".repeat(32);
        assertFalse(chrome.status().connected());
        assertEquals(
                "CHROME_NOT_CONNECTED",
                assertThrows(
                                BusinessException.class,
                                () ->
                                        chrome.action(
                                                new ChromeService.Action(
                                                        "snapshot", 1L, null, null, null)))
                        .getCode());
        assertEquals(
                "CHROME_BRIDGE_UNAUTHORIZED",
                assertThrows(
                                BusinessException.class,
                                () ->
                                        chrome.exchange(
                                                "wrong",
                                                new ChromeService.Exchange(
                                                        "poll", null, null, extension)))
                        .getCode());
        chrome.exchange(
                key,
                new ChromeService.Exchange(
                        "state",
                        null,
                        Map.of(
                                "tabs",
                                List.of(
                                        Map.of(
                                                "id",
                                                1L,
                                                "title",
                                                "fixture",
                                                "url",
                                                "https://example.invalid",
                                                "active",
                                                true))),
                        extension));
        assertTrue(chrome.status().connected());
        assertEquals(1, ((List<?>) chrome.tabs().get("tabs")).size());
        var future =
                CompletableFuture.supplyAsync(
                        () -> {
                            try {
                                return chrome.action(
                                        new ChromeService.Action("snapshot", 1L, null, null, null));
                            } catch (IOException exception) {
                                throw new java.util.concurrent.CompletionException(exception);
                            }
                        });
        List<?> batch = List.of();
        for (int attempt = 0; attempt < 100 && batch.isEmpty(); attempt++) {
            batch =
                    (List<?>)
                            chrome.exchange(
                                            key,
                                            new ChromeService.Exchange(
                                                    "poll", null, null, extension))
                                    .get("commands");
            if (batch.isEmpty()) Thread.sleep(10);
        }
        assertEquals(1, batch.size());
        var command = (ChromeService.Command) batch.get(0);
        chrome.exchange(
                key,
                new ChromeService.Exchange("result", "unknown", Map.of("ok", true), extension));
        assertFalse(future.isDone());
        chrome.exchange(
                key,
                new ChromeService.Exchange(
                        "result",
                        command.requestId(),
                        Map.of("ok", true, "text", "isolated protocol fixture"),
                        extension));
        assertEquals("completed", future.get(3, TimeUnit.SECONDS).status());
    }

    @Test
    void nativeHostCompilesAndExchangesLittleEndianFramesWithLocalBackend() throws Exception {
        String windows = System.getenv("WINDIR");
        assumeTrue(windows != null);
        Path compiler = Path.of(windows, "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
        assumeTrue(Files.isRegularFile(compiler));
        Path executable = root.resolve("NativeBridge.exe");
        var compilation =
                ProcessCommands.run(
                        root,
                        List.of(
                                compiler.toString(),
                                "/nologo",
                                "/target:exe",
                                "/reference:System.Web.Extensions.dll",
                                "/out:" + executable,
                                Path.of("src/main/resources/codex/chrome/native/NativeBridge.cs")
                                        .toAbsolutePath()
                                        .toString()),
                        Duration.ofSeconds(30));
        assertEquals(0, compilation.exitCode(), compilation.output());
        var suppliedKey = new AtomicReference<String>();
        var body = new AtomicReference<String>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 2);
        server.createContext(
                "/api/v1/codex/chrome/bridge/exchange",
                exchange -> {
                    suppliedKey.set(exchange.getRequestHeaders().getFirst("X-Codex-Chrome-Bridge"));
                    body.set(
                            new String(
                                    exchange.getRequestBody().readAllBytes(),
                                    StandardCharsets.UTF_8));
                    byte[] response =
                            "{\"commands\":[],\"connected\":true}".getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(200, response.length);
                    exchange.getResponseBody().write(response);
                    exchange.close();
                });
        server.start();
        Files.writeString(
                root.resolve("bridge-config.json"),
                JsonUtils.getJsonCodec()
                        .toJson(
                                Map.of(
                                        "baseUrl",
                                        "http://127.0.0.1:" + server.getAddress().getPort(),
                                        "bridgeSecret",
                                        "isolated-test-key")));
        Process process =
                new ProcessBuilder(executable.toString()).directory(root.toFile()).start();
        try {
            byte[] payload =
                    "{\"type\":\"poll\",\"extensionId\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}"
                            .getBytes(StandardCharsets.UTF_8);
            process.getOutputStream()
                    .write(
                            ByteBuffer.allocate(4)
                                    .order(ByteOrder.LITTLE_ENDIAN)
                                    .putInt(payload.length)
                                    .array());
            process.getOutputStream().write(payload);
            process.getOutputStream().flush();
            var output =
                    CompletableFuture.supplyAsync(
                                    () -> {
                                        try {
                                            byte[] header = process.getInputStream().readNBytes(4);
                                            int length =
                                                    ByteBuffer.wrap(header)
                                                            .order(ByteOrder.LITTLE_ENDIAN)
                                                            .getInt();
                                            return new String(
                                                    process.getInputStream().readNBytes(length),
                                                    StandardCharsets.UTF_8);
                                        } catch (IOException exception) {
                                            throw new java.util.concurrent.CompletionException(
                                                    exception);
                                        }
                                    })
                            .get(10, TimeUnit.SECONDS);
            assertTrue(output.contains("connected"));
            assertEquals("isolated-test-key", suppliedKey.get());
            assertTrue(body.get().contains("poll"));
            process.getOutputStream().close();
            assertTrue(process.waitFor(5, TimeUnit.SECONDS));
            assertEquals(0, process.exitValue());
        } finally {
            ProcessCommands.kill(process);
            server.stop(0);
        }
    }
}
