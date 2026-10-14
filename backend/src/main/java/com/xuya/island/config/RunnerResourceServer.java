package com.xuya.island.config;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * 独立来源的静态执行资源服务。没有业务路由、认证信息或 Electron 桥。
 *
 * @author Codex代码助手
 */
@Component
public class RunnerResourceServer implements AutoCloseable {

    private static final Map<String, String> CONTENT_TYPES =
            Map.of(
                    "html",
                    "text/html; charset=utf-8",
                    "js",
                    "text/javascript; charset=utf-8",
                    "mjs",
                    "text/javascript; charset=utf-8",
                    "wasm",
                    "application/wasm",
                    "json",
                    "application/json",
                    "zip",
                    "application/zip",
                    "css",
                    "text/css; charset=utf-8");

    private final HttpServer server;
    private final ExecutorService executor;
    private final String frameAncestors;

    public RunnerResourceServer(
            XuyaProperties properties,
            @Value("${xuya.legacy-runner.enabled:false}") boolean enabled)
            throws IOException {
        frameAncestors = String.join(" ", properties.allowedOrigins());
        if (!enabled) {
            server = null;
            executor = null;
            return;
        }
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", properties.runnerPort()), 0);
        executor = Executors.newFixedThreadPool(2);
        server.setExecutor(executor);
        server.createContext("/", this::serve);
        server.start();
    }

    public String getOrigin() {
        if (server == null) return "";
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    private void serve(HttpExchange exchange) throws IOException {
        try (exchange) {
            String path = exchange.getRequestURI().getPath();
            String method = exchange.getRequestMethod();
            if (!("GET".equals(method) || "HEAD".equals(method))) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }
            if (!isAllowedPath(path)) {
                exchange.sendResponseHeaders(404, -1);
                return;
            }
            ClassPathResource resource = new ClassPathResource("runner" + path);
            if (!resource.exists() || !resource.isReadable()) {
                exchange.sendResponseHeaders(404, -1);
                return;
            }
            String extension = path.substring(path.lastIndexOf('.') + 1);
            exchange.getResponseHeaders()
                    .set(
                            "Content-Type",
                            CONTENT_TYPES.getOrDefault(extension, "application/octet-stream"));
            exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");
            exchange.getResponseHeaders().set("Cross-Origin-Opener-Policy", "same-origin");
            exchange.getResponseHeaders().set("Cross-Origin-Embedder-Policy", "require-corp");
            exchange.getResponseHeaders().set("Cross-Origin-Resource-Policy", "cross-origin");
            exchange.getResponseHeaders()
                    .set(
                            "Content-Security-Policy",
                            "default-src 'none'; "
                                    + "script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'; "
                                    + "style-src 'self'; frame-ancestors "
                                    + frameAncestors);
            if ("HEAD".equals(method)) {
                exchange.sendResponseHeaders(200, -1);
                return;
            }
            exchange.sendResponseHeaders(200, resource.contentLength());
            try (var input = resource.getInputStream()) {
                input.transferTo(exchange.getResponseBody());
            }
        }
    }

    /**
     * 只允许打包的执行器和 Python 资源，拒绝路径穿越和 API 请求。
     */
    public static boolean isAllowedPath(String path) {
        if (path == null || path.contains("..") || path.contains("\\") || path.contains("\0")) {
            return false;
        }
        return path.equals("/index.html")
                || path.equals("/frame.js")
                || path.equals("/worker.js")
                || (path.startsWith("/pyodide/") && !path.endsWith("/"));
    }

    @Override
    public void close() {
        if (server == null) return;
        server.stop(0);
        executor.shutdownNow();
    }
}
