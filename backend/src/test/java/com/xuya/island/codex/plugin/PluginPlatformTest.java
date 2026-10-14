package com.xuya.island.codex.plugin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.codex.agent.AgentRuntimeAdapter;
import com.xuya.island.codex.artifact.ArtifactService;
import com.xuya.island.codex.chrome.ChromeService;
import com.xuya.island.codex.config.CodexProperties;
import com.xuya.island.codex.terminal.TerminalService;
import com.xuya.island.codex.workspace.PlatformStore;
import com.xuya.island.codex.workspace.WorkspaceService;
import com.xuya.island.common.BusinessException;
import com.xuya.island.execution.world.DockerExecutionProvider;
import com.xuya.island.execution.world.ExecutionProviderResolver;
import com.xuya.island.execution.world.HostExecutionProvider;
import io.agentscope.core.message.ImageBlock;
import io.agentscope.core.message.ToolUseBlock;
import io.agentscope.core.tool.ToolCallParam;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** 真格式往返、图像 Agent 工具、源码构建和独立来源静态预览；不向外部服务写入。 */
class PluginPlatformTest {
    private Path root;
    private String workspaceId;
    private WorkspaceService workspaces;
    private ArtifactService artifacts;
    private PluginService plugins;
    private OfficeService office;
    private DesignService designs;
    private TerminalService terminals;
    private ChromeService chrome;

    @BeforeEach
    void setup() throws IOException {
        Path parent = Path.of("target/codex-platform-tests").toAbsolutePath().normalize();
        Files.createDirectories(parent);
        root = Files.createTempDirectory(parent, "plugin-");
        Path source = root.resolve("source");
        Files.createDirectories(source);
        Files.writeString(
                source.resolve("index.html"),
                "<!doctype html><html><body><h1>真实设计产物</h1></body></html>");
        var properties = new CodexProperties(root.resolve("data"), 0, 0, 0, 0, 43310, null, null);
        var store = new PlatformStore(properties);
        workspaces = new WorkspaceService(store);
        var project = workspaces.register("插件夹具", source.toString(), "isolated-copy");
        workspaceId = workspaces.create(project.id(), null, null, "host", null).id();
        artifacts = new ArtifactService(store, workspaces, properties);
        plugins = new PluginService(artifacts, workspaces);
        office = new OfficeService(artifacts, properties);
        terminals =
                new TerminalService(
                        workspaces,
                        properties,
                        store,
                        new ExecutionProviderResolver(
                                List.of(
                                        new HostExecutionProvider(),
                                        new DockerExecutionProvider())));
        chrome = new ChromeService(store);
        designs = new DesignService(workspaces, terminals, artifacts, chrome, properties, store);
    }

    @AfterEach
    void cleanup() throws IOException {
        if (designs != null) designs.close();
        if (terminals != null) terminals.shutdown();
        if (root != null
                && root.startsWith(
                        Path.of("target/codex-platform-tests").toAbsolutePath().normalize()))
            try (var walk = Files.walk(root)) {
                for (Path path : walk.sorted(Comparator.reverseOrder()).toList())
                    Files.deleteIfExists(path);
            }
    }

    @Test
    void docxReadsEditsAndPreservesOriginalWithProvenance() throws IOException {
        var original = plugins.document(workspaceId, "说明", "叙芽岛标题", "第一段\n第二段");
        assertTrue(Files.size(artifacts.contentPath(original.id())) > 0);
        assertTrue(artifacts.preview(original.id()).text().contains("第一段"));
        var content = office.read(workspaceId, original.id());
        assertEquals(3, ((List<?>) content.get("paragraphs")).size());
        var edited =
                office.edit(
                        workspaceId,
                        original.id(),
                        "修订说明",
                        List.of(new OfficeService.Edit(1, "修改后的第一段")));
        assertTrue(artifacts.preview(edited.id()).text().contains("修改后的第一段"));
        assertTrue(artifacts.preview(original.id()).text().contains("第一段"));
        assertEquals("artifact:" + original.id(), edited.source());
        assertEquals(2, artifacts.sourceList(workspaceId).size());
        assertThrows(
                BusinessException.class,
                () ->
                        office.edit(
                                workspaceId,
                                original.id(),
                                "invalid",
                                List.of(new OfficeService.Edit(999, "bad"))));
        if (office.status().get("status").equals("unavailable"))
            assertEquals(
                    "LIBREOFFICE_UNAVAILABLE",
                    assertThrows(
                                    BusinessException.class,
                                    () -> office.render(workspaceId, original.id()))
                            .getCode());
        else {
            var rendered = office.render(workspaceId, original.id());
            assertEquals("application/pdf", rendered.mediaType());
            assertTrue(Files.exists(artifacts.previewImagePath(rendered.id())));
        }
    }

    @Test
    void pdfAndImagesHaveRealPreviewAndAgentReceivesImageBlock() throws IOException {
        boolean chineseFont = Files.isRegularFile(Path.of("C:/Windows/Fonts/simhei.ttf"));
        String title = chineseFont ? "中文标题" : "PDF title";
        var pdf =
                plugins.pdf(
                        workspaceId,
                        "审阅",
                        title,
                        chineseFont ? "这是正式 PDF。\n第二行内容。" : "Formal PDF content.\nSecond line.");
        assertEquals("image", artifacts.preview(pdf.id()).type());
        assertTrue(artifacts.preview(pdf.id()).text().contains(title));
        assertNotNull(ImageIO.read(artifacts.previewImagePath(pdf.id()).toFile()));
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(30, 20, BufferedImage.TYPE_INT_RGB), "png", output);
        var image =
                artifacts.create(
                        workspaceId,
                        "reference.png",
                        "image/png",
                        output.toByteArray(),
                        "attachment",
                        "local:reference");
        var provider = new PluginAgentTools(plugins, artifacts, office, designs, chrome);
        var spec =
                new AgentRuntimeAdapter.RuntimeSpec(
                        "fixture",
                        "project",
                        workspaceId,
                        workspaces.workspacePath(workspaceId).toString(),
                        "model",
                        "medium",
                        "default",
                        false,
                        1000,
                        60000);
        var toolkit = provider.tools(spec);
        assertTrue(
                toolkit.getToolNames()
                        .containsAll(
                                List.of(
                                        "github_query",
                                        "github_create_issue",
                                        "design_build_preview",
                                        "documents_edit_docx",
                                        "pdf_export")));
        assertTrue(toolkit.getTool("github_query").isReadOnly());
        assertFalse(toolkit.getTool("github_create_issue").isReadOnly());
        var params =
                ToolCallParam.builder()
                        .toolUseBlock(
                                new ToolUseBlock(
                                        "read-id",
                                        "read_artifact",
                                        Map.of("artifactId", image.id())))
                        .input(Map.of("artifactId", image.id()))
                        .build();
        var result =
                toolkit.getTool("read_artifact").callAsync(params).block(Duration.ofSeconds(10));
        assertNotNull(result);
        assertInstanceOf(ImageBlock.class, result.getOutput().get(0));
    }

    @Test
    void designValidatesSvgAndBuildPreviewHasSeparateOriginAndTicket() throws Exception {
        var svg =
                plugins.design(
                        workspaceId,
                        "card",
                        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"80\"><rect width=\"100\" height=\"80\" fill=\"blue\"/></svg>");
        assertEquals("image/svg+xml", svg.mediaType());
        assertThrows(
                BusinessException.class,
                () ->
                        plugins.design(
                                workspaceId,
                                "active",
                                "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"));
        boolean windows = System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win");
        String command =
                windows
                        ? "New-Item -ItemType Directory -Path preview-output -Force | Out-Null; Copy-Item -LiteralPath index.html -Destination preview-output/index.html"
                        : "mkdir -p preview-output && cp index.html preview-output/index.html";
        var preview =
                designs.build(
                        new DesignService.Build(workspaceId, "", command, "preview-output", null));
        assertEquals("ready", preview.status());
        assertEquals(0, preview.build().exitCode());
        URI url = URI.create(preview.url());
        assertFalse(List.of(43171, 43172, 43173).contains(url.getPort()));
        var client = HttpClient.newHttpClient();
        var response =
                client.send(
                        HttpRequest.newBuilder(url).GET().build(),
                        HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("真实设计产物"));
        assertTrue(
                response.headers()
                        .firstValue("Content-Security-Policy")
                        .orElseThrow()
                        .contains("connect-src 'none'"));
        var noTicket =
                client.send(
                        HttpRequest.newBuilder(
                                        URI.create(
                                                preview.url()
                                                        .replace(
                                                                url.getPath().split("/")[3],
                                                                "wrong-ticket")))
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.discarding());
        assertEquals(403, noTicket.statusCode());
        Path asset =
                workspaces
                        .workspacePath(workspaceId)
                        .resolve("preview-output/assets/application.js");
        Files.createDirectories(asset.getParent());
        Files.writeString(asset, "document.title='真实模块资源';");
        URI rootAsset = url.resolve("/assets/application.js");
        assertEquals(
                403,
                client.send(
                                HttpRequest.newBuilder(rootAsset).GET().build(),
                                HttpResponse.BodyHandlers.discarding())
                        .statusCode());
        var redirected =
                client.send(
                        HttpRequest.newBuilder(rootAsset)
                                .header("Referer", preview.url())
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.discarding());
        assertEquals(307, redirected.statusCode());
        URI authorizedAsset =
                url.resolve(redirected.headers().firstValue("Location").orElseThrow());
        assertTrue(authorizedAsset.getPath().startsWith(url.getPath().replace("index.html", "")));
        assertTrue(
                client.send(
                                HttpRequest.newBuilder(authorizedAsset).GET().build(),
                                HttpResponse.BodyHandlers.ofString())
                        .body()
                        .contains("真实模块资源"));
        assertEquals(
                403,
                client.send(
                                HttpRequest.newBuilder(rootAsset)
                                        .header("Referer", "http://other.invalid/" + url.getPath())
                                        .GET()
                                        .build(),
                                HttpResponse.BodyHandlers.discarding())
                        .statusCode());
        var traversal =
                client.send(
                        HttpRequest.newBuilder(
                                        URI.create(
                                                preview.url()
                                                        .replace(
                                                                "index.html",
                                                                "%2e%2e/%2e%2e/.git/config")))
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.discarding());
        assertEquals(403, traversal.statusCode());
        assertEquals(
                "CHROME_NOT_CONNECTED",
                assertThrows(
                                BusinessException.class,
                                () -> designs.verify(workspaceId, preview.id(), null))
                        .getCode());
        var failed =
                designs.build(
                        new DesignService.Build(workspaceId, "", "exit 7", "preview-output", null));
        assertEquals("build-failed", failed.status());
        assertEquals(7, failed.build().exitCode());
        assertEquals(null, failed.url());
    }

    @Test
    void artifactWorkspaceScopeAndGithubRepositoryValidationAreReal() throws IOException {
        var original = plugins.document(workspaceId, "file", "title", "body");
        assertEquals(
                "ARTIFACT_WORKSPACE_FORBIDDEN",
                assertThrows(
                                BusinessException.class,
                                () -> office.read("other-workspace", original.id()))
                        .getCode());
        assertEquals(
                "GITHUB_REPOSITORY_INVALID",
                assertThrows(
                                BusinessException.class,
                                () ->
                                        plugins.githubQuery(
                                                workspaceId, "https://other-host/repo", "actions"))
                        .getCode());
        if (System.getenv("XUYA_CODEX_GITHUB_TOKEN") == null)
            assertEquals(
                    "GITHUB_UNCONFIGURED",
                    assertThrows(
                                    BusinessException.class,
                                    () ->
                                            plugins.githubIssue(
                                                    workspaceId,
                                                    "owner/repo",
                                                    "fixture",
                                                    "no external write"))
                            .getCode());
    }
}
