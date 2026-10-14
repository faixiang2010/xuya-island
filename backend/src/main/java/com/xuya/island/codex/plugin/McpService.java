package com.xuya.island.codex.plugin;

import com.xuya.island.codex.agent.AgentRuntimeAdapter;
import com.xuya.island.codex.agent.CodexToolProvider;
import com.xuya.island.codex.workspace.PlatformStore;
import com.xuya.island.codex.workspace.WorkspaceService;
import com.xuya.island.common.BusinessException;
import io.agentscope.core.message.ToolResultBlock;
import io.agentscope.core.message.ToolResultState;
import io.agentscope.core.tool.ToolBase;
import io.agentscope.core.tool.ToolCallParam;
import io.agentscope.core.tool.Toolkit;
import io.agentscope.core.tool.mcp.McpClientBuilder;
import io.agentscope.core.tool.mcp.McpClientWrapper;
import io.agentscope.core.tool.mcp.McpTool;
import io.agentscope.core.util.JsonUtils;
import io.modelcontextprotocol.spec.McpSchema;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 人工配置的 MCP 来源和工具双白名单；只有 Agent 获得调用入口，配置更新撤销旧连接。 */
@Service
public class McpService implements CodexToolProvider {
    private final PlatformStore store;
    private final McpSecretStore secrets;
    private final Map<String, Connection> connections = new ConcurrentHashMap<>();
    private final Map<String, String> errors = new ConcurrentHashMap<>();
    private final AtomicLong configurationRevision = new AtomicLong();
    private boolean closed;

    public McpService(PlatformStore store, McpSecretStore secrets) {
        this.store = store;
        this.secrets = secrets;
    }

    @Schema(name = "CodexMcpServerInput")
    public record ServerInput(
            String name,
            String transport,
            String url,
            String command,
            List<String> args,
            boolean enabled,
            List<String> allowedTools,
            List<String> readOnlyTools,
            Map<String, String> headers,
            Map<String, String> environment) {
        @Override
        public String toString() {
            return "ServerInput[credentials=REDACTED]";
        }
    }

    @Schema(name = "CodexMcpStoredServer")
    public record StoredServer(
            String id,
            String name,
            String transport,
            String url,
            String command,
            List<String> args,
            boolean enabled,
            List<String> allowedTools,
            List<String> readOnlyTools,
            Map<String, String> secretHeaders,
            Map<String, String> secretEnvironment,
            String revision) {}

    @Schema(name = "CodexMcpToolInfo")
    public record ToolInfo(
            String name, String description, boolean readOnly, Map<String, Object> inputSchema) {}

    @Schema(name = "CodexMcpServerView")
    public record ServerView(
            String id,
            String name,
            String transport,
            String url,
            String command,
            List<String> args,
            boolean enabled,
            List<String> allowedTools,
            List<String> readOnlyTools,
            List<String> headerNames,
            List<String> environmentNames,
            boolean hasSecrets,
            String status,
            String lastError,
            List<ToolInfo> tools,
            String appliesTo) {}

    private record Connection(
            String revision, McpClientWrapper client, List<McpSchema.Tool> tools) {}

    public synchronized List<ServerView> list() throws IOException {
        return store.list("mcp-servers", StoredServer.class).stream().map(this::view).toList();
    }

    public synchronized ServerView put(String id, ServerInput input) throws IOException {
        validateId(id);
        validate(input);
        StoredServer previous = store.read("mcp-servers", id, StoredServer.class);
        Map<String, String> headers =
                input.headers() == null
                        ? previous == null ? Map.of() : previous.secretHeaders()
                        : secrets.seal(input.headers());
        Map<String, String> environment =
                input.environment() == null
                        ? previous == null ? Map.of() : previous.secretEnvironment()
                        : secrets.seal(input.environment());
        StoredServer config =
                new StoredServer(
                        id,
                        input.name(),
                        input.transport(),
                        input.url(),
                        input.command(),
                        safeList(input.args()),
                        input.enabled(),
                        safeList(input.allowedTools()),
                        safeList(input.readOnlyTools()),
                        headers,
                        environment,
                        UUID.randomUUID().toString());
        store.save("mcp-servers", id, config);
        disconnect(id);
        errors.remove(scoped(id));
        configurationRevision.incrementAndGet();
        return view(config);
    }

    public synchronized void delete(String id) throws IOException {
        validateId(id);
        disconnect(id);
        errors.remove(scoped(id));
        Files.deleteIfExists(store.root().resolve("mcp-servers").resolve(id + ".json"));
        configurationRevision.incrementAndGet();
    }

    public synchronized ServerView connect(String id) throws IOException {
        var config = require(id);
        if (!config.enabled()) throw error("MCP_DISABLED", "服务器未启用，未建立连接", HttpStatus.CONFLICT);
        connection(config);
        return view(config);
    }

    private String scoped(String id) {
        return com.xuya.island.account.AccountScope.id() + ":" + id;
    }

    private StoredServer require(String id) throws IOException {
        validateId(id);
        var config = store.read("mcp-servers", id, StoredServer.class);
        if (config == null) throw error("MCP_SERVER_NOT_FOUND", "MCP 来源未注册", HttpStatus.NOT_FOUND);
        return config;
    }

    private ServerView view(StoredServer config) {
        Connection connection = connections.get(scoped(config.id()));
        var tools =
                connection == null
                        ? List.<ToolInfo>of()
                        : connection.tools().stream()
                                .map(
                                        tool ->
                                                new ToolInfo(
                                                        tool.name(),
                                                        limit(tool.description()),
                                                        tool.annotations() != null
                                                                && Boolean.TRUE.equals(
                                                                        tool.annotations()
                                                                                .readOnlyHint()),
                                                        McpTool.convertMcpSchemaToParameters(
                                                                tool.inputSchema(), Set.of())))
                                .toList();
        String status =
                !config.enabled() || connection == null
                        ? errors.containsKey(scoped(config.id())) ? "unavailable" : "disconnected"
                        : "connected";
        return new ServerView(
                config.id(),
                config.name(),
                config.transport(),
                config.url(),
                config.command(),
                config.args(),
                config.enabled(),
                config.allowedTools(),
                config.readOnlyTools(),
                config.secretHeaders().keySet().stream().sorted().toList(),
                config.secretEnvironment().keySet().stream().sorted().toList(),
                !config.secretHeaders().isEmpty() || !config.secretEnvironment().isEmpty(),
                status,
                errors.get(scoped(config.id())),
                tools,
                "next-turn");
    }

    private Connection connection(StoredServer config) throws IOException {
        if (closed) throw error("MCP_SERVICE_CLOSED", "MCP 服务已关闭", HttpStatus.SERVICE_UNAVAILABLE);
        Connection existing = connections.get(scoped(config.id()));
        if (existing != null && existing.revision().equals(config.revision())) return existing;
        disconnect(config.id());
        McpClientWrapper client = null;
        try {
            var builder =
                    McpClientBuilder.create(config.id())
                            .timeout(Duration.ofSeconds(6))
                            .initializationTimeout(Duration.ofSeconds(5))
                            .propagateMeta(false);
            if (config.transport().equals("stdio"))
                builder.stdioTransport(
                        config.command(),
                        config.args(),
                        stdioEnvironment(secrets.open(config.secretEnvironment())));
            else
                builder.streamableHttpTransport(config.url())
                        .headers(secrets.open(config.secretHeaders()))
                        .customizeStreamableHttpClient(
                                http ->
                                        http.connectTimeout(Duration.ofSeconds(4))
                                                .followRedirects(HttpClient.Redirect.NEVER));
            client = builder.buildSync();
            client.initialize().block(Duration.ofSeconds(6));
            List<McpSchema.Tool> tools = client.listTools().block(Duration.ofSeconds(7));
            var connection =
                    new Connection(
                            config.revision(),
                            client,
                            tools == null ? List.of() : List.copyOf(tools));
            connections.put(scoped(config.id()), connection);
            errors.remove(scoped(config.id()));
            return connection;
        } catch (RuntimeException | IOException exception) {
            if (client != null) closeClient(client);
            errors.put(scoped(config.id()), "MCP 初始化或工具发现失败，请检查已注册来源、凭证与协议");
            throw error(
                    "MCP_UNAVAILABLE", "MCP 来源无法连接；正常会话仍可使用其余工具", HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    @Override
    public synchronized Toolkit tools(AgentRuntimeAdapter.RuntimeSpec spec) {
        Toolkit toolkit = new Toolkit();
        try {
            for (StoredServer config : store.list("mcp-servers", StoredServer.class)) {
                if (!config.enabled() || config.allowedTools().isEmpty()) continue;
                try {
                    Connection connection = connection(config);
                    for (McpSchema.Tool tool : connection.tools()) {
                        if (!config.allowedTools().contains(tool.name())) continue;
                        boolean readOnly =
                                config.readOnlyTools().contains(tool.name())
                                        && tool.annotations() != null
                                        && Boolean.TRUE.equals(tool.annotations().readOnlyHint());
                        String name = toolName(config.id(), tool.name());
                        var delegate =
                                new McpTool(
                                        name,
                                        tool.name(),
                                        limit(tool.description()),
                                        McpTool.convertMcpSchemaToParameters(
                                                tool.inputSchema(), Set.of()),
                                        tool.outputSchema(),
                                        connection.client(),
                                        Map.of(),
                                        config.id(),
                                        readOnly);
                        delegate.setPropagateMeta(false);
                        toolkit.registerAgentTool(
                                new RegisteredTool(config, tool.name(), delegate));
                    }
                } catch (IOException | RuntimeException exception) {
                    errors.put(scoped(config.id()), "MCP 来源不可用，本次会话使用其余工具");
                }
            }
        } catch (IOException exception) {
            return toolkit;
        }
        return toolkit;
    }

    @Override
    public long revision() {
        return configurationRevision.get();
    }

    private final class RegisteredTool extends ToolBase {
        private final StoredServer registered;
        private final String remoteName;
        private final McpTool delegate;

        private RegisteredTool(StoredServer config, String remoteName, McpTool delegate) {
            super(
                    ToolBase.builder()
                            .name(delegate.getName())
                            .description(delegate.getDescription())
                            .inputSchema(delegate.getParameters())
                            .readOnly(delegate.isReadOnly())
                            .concurrencySafe(false)
                            .mcp(config.id()));
            this.registered = config;
            this.remoteName = remoteName;
            this.delegate = delegate;
        }

        @Override
        public Mono<ToolResultBlock> callAsync(ToolCallParam param) {
            return Mono.defer(
                            () -> {
                                synchronized (McpService.this) {
                                    try {
                                        StoredServer current = require(registered.id());
                                        if (!current.enabled()
                                                || !current.allowedTools().contains(remoteName)
                                                || !current.revision().equals(registered.revision())
                                                || closed)
                                            return Mono.error(
                                                    error(
                                                            "MCP_CONFIGURATION_CHANGED",
                                                            "MCP 配置已撤销或更新，请新建会话使用当前白名单",
                                                            HttpStatus.CONFLICT));
                                    } catch (IOException | BusinessException exception) {
                                        return Mono.error(
                                                error(
                                                        "MCP_CONFIGURATION_CHANGED",
                                                        "MCP 来源已移除，请使用当前配置",
                                                        HttpStatus.CONFLICT));
                                    }
                                }
                                return delegate.callAsync(param)
                                        .timeout(Duration.ofSeconds(8))
                                        .map(this::safeResult)
                                        .onErrorResume(
                                                exception ->
                                                        Mono.just(
                                                                ToolResultBlock.error(
                                                                        "MCP 工具调用失败或超时，请检查来源；未自动重试操作")));
                            })
                    .subscribeOn(Schedulers.boundedElastic());
        }

        private ToolResultBlock safeResult(ToolResultBlock result) {
            if (result.getState() == ToolResultState.ERROR)
                return ToolResultBlock.error("MCP 工具返回失败，请检查参数与已注册来源");
            String json = JsonUtils.getJsonCodec().toJson(result);
            if (json.length() > 2_000_000) return ToolResultBlock.error("MCP 工具结果过大，请缩小查询范围");
            try {
                var values = new ArrayList<>(secrets.open(registered.secretHeaders()).values());
                values.addAll(secrets.open(registered.secretEnvironment()).values());
                for (String value : values) {
                    if (value.isBlank()) continue;
                    String encoded = JsonUtils.getJsonCodec().toJson(value);
                    if (json.contains(value)
                            || json.contains(encoded.substring(1, encoded.length() - 1)))
                        return ToolResultBlock.error("MCP 来源返回了私有配置内容，结果已拦截；请检查来源");
                }
                return result;
            } catch (IOException exception) {
                return ToolResultBlock.error("MCP 私有配置不可读取，结果未转发");
            }
        }
    }

    private static Map<String, String> stdioEnvironment(Map<String, String> configured) {
        Map<String, String> environment = new HashMap<>();
        // SDK stdio 在 ProcessBuilder 原环境上 putAll；覆盖空值避免自动继承其他业务的凭证。
        for (String key : System.getenv().keySet()) {
            String name = key.toUpperCase(Locale.ROOT);
            if (name.contains("TOKEN")
                    || name.contains("PASSWORD")
                    || name.contains("SECRET")
                    || name.contains("API_KEY")
                    || name.contains("APIKEY")
                    || name.endsWith("_KEY")
                    || name.contains("CREDENTIAL")) environment.put(key, "");
        }
        environment.putAll(configured);
        return environment;
    }

    private synchronized void disconnect(String id) {
        Connection existing = connections.remove(scoped(id));
        if (existing != null) closeClient(existing.client());
    }

    private static void closeClient(McpClientWrapper client) {
        try {
            client.close();
        } catch (RuntimeException exception) {
            /* SDK close failure must not retain registration. */
        }
    }

    @PreDestroy
    public synchronized void close() {
        closed = true;
        new ArrayList<>(connections.values()).forEach(value -> closeClient(value.client()));
        connections.clear();
    }

    public static String toolName(String id, String name) {
        String normalized = name.replaceAll("[^a-zA-Z0-9_]", "_");
        return "mcp__"
                + id
                + "__"
                + normalized.substring(0, Math.min(23, normalized.length()))
                + "_"
                + WorkspaceService.hash(name.getBytes(StandardCharsets.UTF_8)).substring(0, 12);
    }

    private static void validate(ServerInput input) {
        if (input.name() == null
                || input.name().isBlank()
                || input.name().length() > 100
                || input.transport() == null
                || !Set.of("stdio", "streamable-http").contains(input.transport()))
            throw error(
                    "MCP_CONFIG_INVALID",
                    "请选择合法名称与 stdio/streamable-http 类型",
                    HttpStatus.BAD_REQUEST);
        if (input.transport().equals("stdio")) {
            if (input.command() == null
                    || !Path.of(input.command()).isAbsolute()
                    || !Files.isRegularFile(Path.of(input.command())))
                throw error("MCP_COMMAND_INVALID", "stdio 必须选择已安装程序的绝对路径", HttpStatus.BAD_REQUEST);
        } else {
            URI uri;
            try {
                uri = URI.create(input.url());
            } catch (RuntimeException exception) {
                throw error("MCP_URL_INVALID", "无效 MCP 服务地址", HttpStatus.BAD_REQUEST);
            }
            if (uri.getScheme() == null
                    || !Set.of("http", "https").contains(uri.getScheme())
                    || uri.getHost() == null
                    || uri.getUserInfo() != null
                    || uri.getQuery() != null
                    || uri.getFragment() != null)
                throw error(
                        "MCP_URL_INVALID",
                        "地址须为 HTTP/HTTPS，凭证请放后端 headers 字段",
                        HttpStatus.BAD_REQUEST);
        }
        List<String> allowed = safeList(input.allowedTools());
        if (allowed.size() > 128
                || !allowed.containsAll(safeList(input.readOnlyTools()))
                || allowed.stream().anyMatch(name -> name.isBlank() || name.length() > 200))
            throw error(
                    "MCP_TOOL_WHITELIST_INVALID",
                    "只读工具必须属于允许名单，每个名称不超过 200 字",
                    HttpStatus.BAD_REQUEST);
        if (safeList(input.args()).size() > 100
                || safeList(input.args()).stream()
                        .anyMatch(
                                value ->
                                        value.length() > 4000
                                                || value.matches(
                                                        "(?i)--?(?:token|api-key|api_key|password|secret|authorization)(?:=.*)?")))
            throw error("MCP_ARGS_INVALID", "命令参数无效，凭证请放后端 environment 字段", HttpStatus.BAD_REQUEST);
        validateCredentials(input.headers(), true);
        validateCredentials(input.environment(), false);
    }

    private static void validateCredentials(Map<String, String> values, boolean headers) {
        if (values == null) return;
        if (values.size() > 64
                || values.entrySet().stream()
                        .anyMatch(
                                item ->
                                        item.getKey() == null
                                                || !item.getKey()
                                                        .matches(
                                                                headers
                                                                        ? "[a-zA-Z0-9-]{1,100}"
                                                                        : "[a-zA-Z_][a-zA-Z0-9_]{0,99}")
                                                || item.getValue() == null
                                                || item.getValue().length() > 16_000
                                                || item.getValue().contains("\n")
                                                || item.getValue().contains("\r")))
            throw error("MCP_CREDENTIALS_INVALID", "凭证字段无效；内容不会返回前端", HttpStatus.BAD_REQUEST);
    }

    private static List<String> safeList(List<String> values) {
        if (values == null) return List.of();
        if (values.stream().anyMatch(java.util.Objects::isNull))
            throw error("MCP_CONFIG_INVALID", "配置列表不可包含空项", HttpStatus.BAD_REQUEST);
        return List.copyOf(values);
    }

    private static void validateId(String id) {
        if (id == null || !id.matches("[a-zA-Z0-9_-]{1,20}"))
            throw error(
                    "MCP_ID_INVALID", "MCP 来源 ID 只能包含 1-20 位字母、数字、下划线或连字符", HttpStatus.BAD_REQUEST);
    }

    private static String limit(String value) {
        if (value == null) return "";
        return value.length() > 4000 ? value.substring(0, 4000) : value;
    }

    private static BusinessException error(String code, String message, HttpStatus status) {
        return new BusinessException(code, message, status);
    }
}
