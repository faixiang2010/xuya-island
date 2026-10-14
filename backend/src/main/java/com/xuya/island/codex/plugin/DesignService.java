package com.xuya.island.codex.plugin;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.xuya.island.codex.artifact.ArtifactService;
import com.xuya.island.codex.chrome.ChromeService;
import com.xuya.island.codex.config.CodexProperties;
import com.xuya.island.codex.terminal.TerminalService;
import com.xuya.island.codex.workspace.PlatformStore;
import com.xuya.island.codex.workspace.ProcessCommands;
import com.xuya.island.codex.workspace.WorkspaceService;
import com.xuya.island.common.BusinessException;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** 设计参考、真实源码构建、独立来源静态预览和 Chrome 验证共用登记工作区。 */
@Service
public class DesignService {
    private final WorkspaceService workspaces;
    private final TerminalService terminals;
    private final ArtifactService artifacts;
    private final ChromeService chrome;
    private final CodexProperties properties;
    private final PlatformStore store;
    private final Map<String, PreviewGrant> grants = new ConcurrentHashMap<>();
    private HttpServer server;
    private ThreadPoolExecutor executor;

    public DesignService(
            WorkspaceService workspaces,
            TerminalService terminals,
            ArtifactService artifacts,
            ChromeService chrome,
            CodexProperties properties,
            PlatformStore store) {
        this.workspaces = workspaces;
        this.terminals = terminals;
        this.artifacts = artifacts;
        this.chrome = chrome;
        this.properties = properties;
        this.store = store;
    }

    @Schema(name = "CodexDesignBuild")
    public record Build(
            String workspaceId,
            String directory,
            String command,
            String outputDirectory,
            String referenceArtifactId) {}

    @Schema(name = "CodexDesignPreviewInfo")
    public record PreviewInfo(
            String id,
            String workspaceId,
            String url,
            String expiresAt,
            String referenceArtifactId,
            ProcessCommands.Result build,
            String status) {}

    private record PreviewGrant(PreviewInfo info, Path directory, long expiresAt, String token) {}

    public PreviewInfo build(Build request) throws IOException {
        validateReference(request.workspaceId(), request.referenceArtifactId());
        if (request.command() == null || request.command().isBlank())
            throw error(
                    "DESIGN_BUILD_COMMAND_REQUIRED",
                    "请明确构建命令；静态源码预览可使用 preview 接口",
                    HttpStatus.BAD_REQUEST);
        ProcessCommands.Result result =
                terminals.execute(
                        request.workspaceId(), request.command(), request.directory(), 180);
        if (result.exitCode() != 0 || result.timedOut())
            return new PreviewInfo(
                    UUID.randomUUID().toString(),
                    request.workspaceId(),
                    null,
                    null,
                    request.referenceArtifactId(),
                    result,
                    "build-failed");
        return preview(
                request.workspaceId(),
                request.outputDirectory(),
                request.referenceArtifactId(),
                result);
    }

    public PreviewInfo preview(
            String workspaceId,
            String relativeOutput,
            String referenceId,
            ProcessCommands.Result result)
            throws IOException {
        validateReference(workspaceId, referenceId);
        Path output =
                WorkspaceService.resolve(
                        workspaces.workspacePath(workspaceId), relativeOutput, false);
        if (!Files.isDirectory(output) || !Files.isRegularFile(output.resolve("index.html")))
            throw error("DESIGN_OUTPUT_MISSING", "预览目录必须包含真实 index.html", HttpStatus.CONFLICT);
        startServer();
        String id = UUID.randomUUID().toString();
        byte[] entropy = new byte[24];
        new SecureRandom().nextBytes(entropy);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(entropy);
        long expiry = System.currentTimeMillis() + 10 * 60_000L;
        String url =
                "http://127.0.0.1:"
                        + server.getAddress().getPort()
                        + "/preview/"
                        + id
                        + "/"
                        + token
                        + "/index.html";
        var info =
                new PreviewInfo(
                        id,
                        workspaceId,
                        url,
                        Instant.ofEpochMilli(expiry).toString(),
                        referenceId,
                        result,
                        "ready");
        grants.entrySet()
                .removeIf(entry -> entry.getValue().expiresAt() < System.currentTimeMillis());
        grants.put(id, new PreviewGrant(info, output, expiry, token));
        store.save(
                "design-previews",
                id,
                Map.of(
                        "workspaceId",
                        workspaceId,
                        "directory",
                        output.toString(),
                        "referenceArtifactId",
                        referenceId == null ? "" : referenceId,
                        "createdAt",
                        Instant.now().toString()));
        return info;
    }

    public Map<String, Object> verify(String workspaceId, String previewId, Long tabId)
            throws IOException {
        PreviewGrant grant = grants.get(previewId);
        if (grant == null
                || grant.expiresAt() < System.currentTimeMillis()
                || !grant.info().workspaceId().equals(workspaceId))
            throw error("DESIGN_PREVIEW_EXPIRED", "预览已到期，请重新打开", HttpStatus.GONE);
        var navigation =
                chrome.action(
                        new ChromeService.Action(
                                "navigate", tabId, grant.info().url(), null, null));
        if (!navigation.status().equals("completed"))
            return Map.of("status", "failed", "navigation", navigation);
        var snapshot = chrome.action(new ChromeService.Action("snapshot", tabId, null, null, null));
        var screenshot =
                chrome.action(new ChromeService.Action("screenshot", tabId, null, null, null));
        if (!screenshot.status().equals("completed")
                || !(screenshot.result().get("dataUrl") instanceof String url))
            return Map.of("status", "failed", "snapshot", snapshot, "screenshot", screenshot);
        String prefix = "data:image/jpeg;base64,";
        if (!url.startsWith(prefix))
            throw error("DESIGN_SCREENSHOT_INVALID", "Chrome 未返回支持的图片格式", HttpStatus.BAD_GATEWAY);
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(url.substring(prefix.length()));
        } catch (IllegalArgumentException exception) {
            throw error("DESIGN_SCREENSHOT_INVALID", "截图编码无效", HttpStatus.BAD_GATEWAY);
        }
        var artifact =
                artifacts.create(
                        workspaceId,
                        "design-preview-" + previewId + ".jpg",
                        "image/jpeg",
                        bytes,
                        "design-verification",
                        "preview:" + previewId);
        return Map.of(
                "status",
                "captured",
                "snapshot",
                snapshot,
                "artifact",
                artifact,
                "referenceArtifactId",
                grant.info().referenceArtifactId() == null
                        ? ""
                        : grant.info().referenceArtifactId());
    }

    public void validateReference(String workspaceId, String referenceId) throws IOException {
        workspaces.requireWorkspace(workspaceId);
        if (referenceId != null
                && !referenceId.isBlank()
                && !artifacts.requireArtifact(referenceId).workspaceId().equals(workspaceId))
            throw error("DESIGN_REFERENCE_FORBIDDEN", "设计参考必须属于当前工作区", HttpStatus.FORBIDDEN);
    }

    private synchronized void startServer() throws IOException {
        if (server != null) return;
        for (int offset = 0; offset < 20; offset++) {
            int port = properties.previewBasePort() + offset;
            if (Set.of(43171, 43172, 43173).contains(port)) continue;
            try {
                server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 32);
                break;
            } catch (java.net.BindException exception) {
                server = null;
            }
        }
        if (server == null)
            throw error(
                    "PREVIEW_PORT_UNAVAILABLE",
                    "独立预览端口不可用，请调整 xuya.codex.preview-base-port",
                    HttpStatus.SERVICE_UNAVAILABLE);
        executor =
                new ThreadPoolExecutor(
                        2,
                        4,
                        30,
                        TimeUnit.SECONDS,
                        new ArrayBlockingQueue<>(32),
                        runnable -> {
                            Thread thread = Executors.defaultThreadFactory().newThread(runnable);
                            thread.setName("codex-design-preview");
                            thread.setDaemon(true);
                            return thread;
                        },
                        new ThreadPoolExecutor.AbortPolicy());
        server.setExecutor(executor);
        server.createContext("/preview/", this::serve);
        server.createContext("/", this::serveRootResource);
        server.start();
    }

    /** 根路径构建资源先跳转至票据前缀；后续模块/CSS 的相对资源沿授权地址加载。 */
    private void serveRootResource(HttpExchange exchange) throws IOException {
        try {
            if (!Set.of("GET", "HEAD").contains(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }
            String referer = exchange.getRequestHeaders().getFirst("Referer");
            if (referer == null) {
                exchange.sendResponseHeaders(403, -1);
                return;
            }
            URI source = URI.create(referer);
            if (!"http".equals(source.getScheme())
                    || !"127.0.0.1".equals(source.getHost())
                    || source.getPort() != server.getAddress().getPort()
                    || source.getUserInfo() != null) {
                exchange.sendResponseHeaders(403, -1);
                return;
            }
            String[] parts = source.getRawPath().split("/", 5);
            if (parts.length != 5 || !parts[1].equals("preview")) {
                exchange.sendResponseHeaders(403, -1);
                return;
            }
            PreviewGrant grant = grants.get(parts[2]);
            if (!validGrant(grant, parts[3])) {
                exchange.sendResponseHeaders(403, -1);
                return;
            }
            String relative = exchange.getRequestURI().getRawPath().substring(1);
            if (relative.isEmpty()) relative = "index.html";
            Path file =
                    WorkspaceService.resolve(
                            grant.directory(),
                            URLDecoder.decode(relative, StandardCharsets.UTF_8),
                            false);
            if (!Files.isRegularFile(file)) {
                exchange.sendResponseHeaders(404, -1);
                return;
            }
            String query = exchange.getRequestURI().getRawQuery();
            exchange.getResponseHeaders()
                    .set(
                            "Location",
                            "/preview/"
                                    + parts[2]
                                    + "/"
                                    + parts[3]
                                    + "/"
                                    + relative
                                    + (query == null ? "" : "?" + query));
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            exchange.getResponseHeaders().set("Referrer-Policy", "same-origin");
            exchange.sendResponseHeaders(307, -1);
        } catch (BusinessException | IllegalArgumentException exception) {
            exchange.sendResponseHeaders(403, -1);
        } finally {
            exchange.close();
        }
    }

    private static boolean validGrant(PreviewGrant grant, String token) {
        return grant != null
                && grant.expiresAt() >= System.currentTimeMillis()
                && java.security.MessageDigest.isEqual(
                        grant.token().getBytes(StandardCharsets.UTF_8),
                        token.getBytes(StandardCharsets.UTF_8));
    }

    private void serve(HttpExchange exchange) throws IOException {
        try {
            if (!Set.of("GET", "HEAD").contains(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }
            String[] parts = exchange.getRequestURI().getRawPath().split("/", 5);
            if (parts.length != 5) {
                exchange.sendResponseHeaders(404, -1);
                return;
            }
            PreviewGrant grant = grants.get(parts[2]);
            if (!validGrant(grant, parts[3])) {
                exchange.sendResponseHeaders(403, -1);
                return;
            }
            Path file =
                    WorkspaceService.resolve(
                            grant.directory(),
                            URLDecoder.decode(parts[4], StandardCharsets.UTF_8),
                            false);
            if (!Files.isRegularFile(file) || Files.size(file) > 25 * 1024 * 1024) {
                exchange.sendResponseHeaders(404, -1);
                return;
            }
            String type = Files.probeContentType(file);
            if (type == null) type = "application/octet-stream";
            exchange.getResponseHeaders().set("Content-Type", type);
            exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            exchange.getResponseHeaders().set("Referrer-Policy", "same-origin");
            exchange.getResponseHeaders()
                    .set(
                            "Content-Security-Policy",
                            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
            exchange.sendResponseHeaders(
                    200, exchange.getRequestMethod().equals("HEAD") ? -1 : Files.size(file));
            if (!exchange.getRequestMethod().equals("HEAD"))
                try (var output = exchange.getResponseBody()) {
                    Files.copy(file, output);
                }
        } catch (BusinessException | IllegalArgumentException exception) {
            exchange.sendResponseHeaders(403, -1);
        } finally {
            exchange.close();
        }
    }

    @PreDestroy
    public synchronized void close() {
        if (server != null) server.stop(0);
        if (executor != null) executor.shutdownNow();
        grants.clear();
    }

    private static BusinessException error(String code, String message, HttpStatus status) {
        return new BusinessException(code, message, status);
    }
}
