package com.xuya.island.codex.plugin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.codex.agent.AgentRuntimeAdapter;
import com.xuya.island.codex.agent.ScopedAgentTool;
import com.xuya.island.codex.config.CodexProperties;
import com.xuya.island.codex.workspace.PlatformStore;
import com.xuya.island.common.BusinessException;
import io.agentscope.core.message.ToolResultState;
import io.agentscope.core.message.ToolUseBlock;
import io.agentscope.core.permission.PermissionBehavior;
import io.agentscope.core.permission.PermissionContextState;
import io.agentscope.core.permission.PermissionMode;
import io.agentscope.core.tool.ToolCallParam;
import io.agentscope.core.util.JsonUtils;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** 使用真实 SDK MCP 客户端与本机子进程验证协议调用、双白名单、密钥隔离及撤销。 */
class McpPlatformTest {
    private Path root;
    private Path marker;
    private PlatformStore store;
    private McpService mcp;
    private AgentRuntimeAdapter.RuntimeSpec spec;

    @BeforeEach
    void setup() throws IOException {
        Path parent = Path.of("target/codex-platform-tests").toAbsolutePath().normalize();
        Files.createDirectories(parent);
        root = Files.createTempDirectory(parent, "mcp-");
        marker = root.resolve("protocol.log");
        store =
                new PlatformStore(
                        new CodexProperties(root.resolve("data"), 0, 0, 0, 0, 0, null, null));
        mcp = new McpService(store, new McpSecretStore(store));
        spec =
                new AgentRuntimeAdapter.RuntimeSpec(
                        "fixture",
                        "project",
                        "workspace",
                        root.toString(),
                        "model",
                        "default",
                        "ask",
                        false,
                        1000,
                        10000);
    }

    @AfterEach
    void cleanup() throws IOException {
        if (mcp != null) mcp.close();
        if (root != null
                && root.startsWith(
                        Path.of("target/codex-platform-tests").toAbsolutePath().normalize()))
            try (var walk = Files.walk(root)) {
                for (Path path : walk.sorted(Comparator.reverseOrder()).toList())
                    Files.deleteIfExists(path);
            }
    }

    private McpService.ServerInput fixture(
            boolean enabled, List<String> allowed, Map<String, String> environment) {
        Path java =
                Path.of(
                        System.getProperty("java.home"),
                        "bin",
                        System.getProperty("os.name").toLowerCase().contains("win")
                                ? "java.exe"
                                : "java");
        return new McpService.ServerInput(
                "本机协议夹具",
                "stdio",
                null,
                java.toString(),
                List.of(
                        "-cp",
                        Path.of("target/test-classes").toAbsolutePath().toString(),
                        McpFixtureServer.class.getName(),
                        marker.toString()),
                enabled,
                allowed,
                allowed.contains("read_fixture") ? List.of("read_fixture") : List.of(),
                null,
                environment);
    }

    @Test
    void defaultDisabledAndEmptyToolWhitelistNeverConnectOrLaunch() throws IOException {
        assertTrue(mcp.list().isEmpty());
        assertTrue(mcp.tools(spec).getToolNames().isEmpty());
        mcp.put("local", fixture(false, List.of("read_fixture"), Map.of()));
        assertTrue(mcp.tools(spec).getToolNames().isEmpty());
        assertFalse(Files.exists(marker));
        assertEquals(
                "MCP_DISABLED",
                assertThrows(BusinessException.class, () -> mcp.connect("local")).getCode());
        mcp.put("local", fixture(true, List.of(), Map.of()));
        assertTrue(mcp.tools(spec).getToolNames().isEmpty());
        assertFalse(Files.exists(marker));
    }

    @Test
    void genuineToolDiscoveryAndCallOnlyExposeExplicitWhitelistWithNativeApproval()
            throws IOException {
        mcp.put("local", fixture(true, List.of("read_fixture", "write_fixture"), Map.of()));
        var view = mcp.connect("local");
        assertEquals("connected", view.status());
        assertEquals(3, view.tools().size());
        var toolkit = mcp.tools(spec);
        String readName = McpService.toolName("local", "read_fixture");
        String writeName = McpService.toolName("local", "write_fixture");
        assertEquals(2, toolkit.getToolNames().size());
        assertFalse(
                toolkit.getToolNames().contains(McpService.toolName("local", "blocked_fixture")));
        assertTrue(toolkit.getTool(readName).isReadOnly());
        var write = new ScopedAgentTool(toolkit.getTool(writeName), false);
        var permission =
                write.checkPermissions(
                                Map.of(),
                                PermissionContextState.builder()
                                        .mode(PermissionMode.DEFAULT)
                                        .build())
                        .block();
        assertEquals(PermissionBehavior.ASK, permission.getBehavior());
        var readonly = new ScopedAgentTool(toolkit.getTool(writeName), true);
        assertEquals(
                PermissionBehavior.DENY,
                readonly.checkPermissions(
                                Map.of(),
                                PermissionContextState.builder()
                                        .mode(PermissionMode.BYPASS)
                                        .build())
                        .block()
                        .getBehavior());
        var input = Map.<String, Object>of("text", "real input");
        var params =
                ToolCallParam.builder()
                        .input(input)
                        .toolUseBlock(new ToolUseBlock("call-id", readName, input))
                        .build();
        var result = toolkit.getTool(readName).callAsync(params).block(Duration.ofSeconds(10));
        assertTrue(
                JsonUtils.getJsonCodec().toJson(result).contains("fixture:executed"),
                JsonUtils.getJsonCodec().toJson(result));
        assertTrue(Files.readString(marker).contains("tools/call"));
        assertTrue(Files.readString(marker).contains("read_fixture"));
        assertFalse(Files.readString(marker).contains("blocked_fixture"));
        mcp.put("local", fixture(false, List.of("read_fixture"), null));
        assertThrows(
                BusinessException.class,
                () -> toolkit.getTool(readName).callAsync(params).block(Duration.ofSeconds(3)));
        assertTrue(mcp.tools(spec).getToolNames().isEmpty());
    }

    @Test
    void credentialsPersistEncryptedNeverAppearInViewAndCanBeRetainedOrCleared()
            throws IOException {
        String credential = "fixture-secret-unique-value";
        var created =
                mcp.put(
                        "local",
                        fixture(false, List.of(), Map.of("MCP_FIXTURE_SECRET", credential)));
        assertTrue(created.hasSecrets());
        assertFalse(JsonUtils.getJsonCodec().toJson(created).contains(credential));
        assertFalse(
                Files.readString(store.root().resolve("mcp-servers/local.json"))
                        .contains(credential));
        mcp.close();
        mcp = new McpService(store, new McpSecretStore(store));
        assertTrue(mcp.list().get(0).hasSecrets());
        long previous = mcp.revision();
        assertTrue(mcp.put("local", fixture(true, List.of("read_fixture"), null)).hasSecrets());
        assertTrue(mcp.revision() > previous);
        String toolName = McpService.toolName("local", "read_fixture");
        var input = Map.<String, Object>of("text", "echo-secret");
        var params =
                ToolCallParam.builder()
                        .input(input)
                        .toolUseBlock(new ToolUseBlock("secret-call", toolName, input))
                        .build();
        var result =
                mcp.tools(spec).getTool(toolName).callAsync(params).block(Duration.ofSeconds(10));
        assertEquals(ToolResultState.ERROR, result.getState());
        assertFalse(JsonUtils.getJsonCodec().toJson(result).contains(credential));
        assertFalse(mcp.put("local", fixture(false, List.of(), Map.of())).hasSecrets());
        mcp.delete("local");
        assertTrue(mcp.list().isEmpty());
    }

    @Test
    void unavailableRegisteredSourceDoesNotBreakOrdinaryAgentTools() throws IOException {
        var input =
                new McpService.ServerInput(
                        "未启动端点",
                        "streamable-http",
                        "http://127.0.0.1:1/mcp",
                        null,
                        List.of(),
                        true,
                        List.of("read_fixture"),
                        List.of(),
                        Map.of(),
                        Map.of());
        mcp.put("offline", input);
        assertTrue(mcp.tools(spec).getToolNames().isEmpty());
        assertEquals("unavailable", mcp.list().get(0).status());
        assertThrows(
                BusinessException.class,
                () ->
                        mcp.put(
                                "invalid",
                                new McpService.ServerInput(
                                        "错误",
                                        "streamable-http",
                                        "https://host.invalid/mcp?token=secret",
                                        null,
                                        List.of(),
                                        false,
                                        List.of(),
                                        List.of(),
                                        Map.of(),
                                        Map.of())));
    }
}
