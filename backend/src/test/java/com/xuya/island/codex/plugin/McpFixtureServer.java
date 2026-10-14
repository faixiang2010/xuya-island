package com.xuya.island.codex.plugin;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.regex.Pattern;

/** 测试专用无外部依赖 JSON-RPC stdio 服务，stdout 只输出 MCP 协议行。 */
public final class McpFixtureServer {
    private static final Pattern METHOD = Pattern.compile("\"method\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern ID = Pattern.compile("\"id\"\\s*:\\s*(\"[^\"]*\"|[0-9]+)");
    private static final Pattern VERSION =
            Pattern.compile("\"protocolVersion\"\\s*:\\s*\"([^\"]+)\"");

    private McpFixtureServer() {}

    public static void main(String[] args) throws Exception {
        Path marker = Path.of(args[0]);
        Files.writeString(
                marker, "started\n", StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        try (var input =
                new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = input.readLine()) != null) {
                var method = METHOD.matcher(line);
                var id = ID.matcher(line);
                if (!method.find()) continue;
                Files.writeString(marker, method.group(1) + "\n", StandardOpenOption.APPEND);
                if (!id.find()) continue;
                String result;
                switch (method.group(1)) {
                    case "initialize" -> {
                        var version = VERSION.matcher(line);
                        String protocol = version.find() ? version.group(1) : "2025-06-18";
                        result =
                                "{\"protocolVersion\":\""
                                        + protocol
                                        + "\",\"capabilities\":{\"tools\":{\"listChanged\":false}},\"serverInfo\":{\"name\":\"local-fixture\",\"version\":\"1.0.0\"}}";
                    }
                    case "tools/list" ->
                            result =
                                    "{\"tools\":["
                                            + tool("read_fixture", true)
                                            + ","
                                            + tool("write_fixture", false)
                                            + ","
                                            + tool("blocked_fixture", true)
                                            + "]}";
                    case "tools/call" -> {
                        Files.writeString(marker, "CALL:" + line + "\n", StandardOpenOption.APPEND);
                        String text =
                                line.contains("echo-secret")
                                        ? System.getenv()
                                                .getOrDefault("MCP_FIXTURE_SECRET", "no-secret")
                                        : "fixture:executed";
                        result =
                                "{\"content\":[{\"type\":\"text\",\"text\":\""
                                        + text
                                        + "\"}],\"isError\":false}";
                    }
                    case "ping" -> result = "{}";
                    default -> result = "{}";
                }
                System.out.println(
                        "{\"jsonrpc\":\"2.0\",\"id\":"
                                + id.group(1)
                                + ",\"result\":"
                                + result
                                + "}");
                System.out.flush();
            }
        }
    }

    private static String tool(String name, boolean readOnly) {
        return "{\"name\":\""
                + name
                + "\",\"description\":\"Local protocol fixture\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"text\":{\"type\":\"string\"}}},\"annotations\":{\"readOnlyHint\":"
                + readOnly
                + "}}";
    }
}
