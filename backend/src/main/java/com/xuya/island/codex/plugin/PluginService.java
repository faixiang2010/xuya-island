package com.xuya.island.codex.plugin;

import com.xuya.island.codex.artifact.ArtifactService;
import com.xuya.island.codex.workspace.WorkspaceService;
import com.xuya.island.common.BusinessException;
import io.agentscope.core.util.JsonUtils;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.w3c.dom.Element;
import org.w3c.dom.Node;

/** 真实外部 GitHub 操作与本机正式格式导出；无凭证时提供明确的配置状态。 */
@Service
public class PluginService {
    private final ArtifactService artifacts;
    private final WorkspaceService workspaces;
    private final HttpClient client =
            HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .build();

    public PluginService(ArtifactService artifacts, WorkspaceService workspaces) {
        this.artifacts = artifacts;
        this.workspaces = workspaces;
    }

    @Schema(name = "CodexPluginInfo")
    public record PluginInfo(String id, String name, String status, List<String> actions) {}

    public List<PluginInfo> list() {
        return List.of(
                new PluginInfo(
                        "github",
                        "GitHub",
                        token() == null ? "unconfigured" : "ready",
                        List.of("query", "draft-pull-request")),
                new PluginInfo(
                        "design",
                        "Design",
                        "ready",
                        List.of(
                                "reference-image",
                                "code-build",
                                "isolated-preview",
                                "chrome-screenshot-verification",
                                "svg-export")),
                new PluginInfo(
                        "documents",
                        "Documents",
                        "ready",
                        List.of(
                                "docx-export",
                                "docx-read",
                                "docx-edit",
                                "libreoffice-render-if-installed")),
                new PluginInfo(
                        "pdf",
                        "PDF",
                        "ready",
                        List.of("pdf-export", "pdf-text-and-image-preview")));
    }

    public Map<String, Object> githubQuery(String workspaceId, String repository, String kind)
            throws IOException {
        workspaces.requireWorkspace(workspaceId);
        requireRepository(repository);
        String suffix =
                switch (kind) {
                    case "pulls" -> "/pulls?state=open&per_page=30";
                    case "issues" -> "/issues?state=open&per_page=30";
                    case "repository" -> "";
                    case "actions" -> "/actions/runs?per_page=30";
                    default ->
                            throw error(
                                    "GITHUB_QUERY_INVALID",
                                    "请选择 repository、pulls、issues 或 actions",
                                    HttpStatus.BAD_REQUEST);
                };
        String uri = "https://api.github.com/repos/" + repository + suffix;
        String result = github(uri, "GET", null, false);
        var artifact =
                artifacts.create(
                        workspaceId,
                        repository.replace('/', '-') + "-" + kind + ".json",
                        "application/json",
                        result.getBytes(StandardCharsets.UTF_8),
                        "github",
                        uri);
        return Map.of(
                "result",
                JsonUtils.getJsonCodec().fromJson(result, Object.class),
                "artifact",
                artifact,
                "source",
                uri);
    }

    public Map<String, Object> githubIssue(
            String workspaceId, String repository, String title, String body) throws IOException {
        workspaces.requireWorkspace(workspaceId);
        requireRepository(repository);
        if (title == null
                || title.isBlank()
                || title.length() > 256
                || (body != null && body.length() > 65536))
            throw error("GITHUB_ISSUE_INVALID", "Issue 标题或正文无效", HttpStatus.BAD_REQUEST);
        String uri = "https://api.github.com/repos/" + repository + "/issues";
        String result =
                github(
                        uri,
                        "POST",
                        JsonUtils.getJsonCodec()
                                .toJson(Map.of("title", title, "body", body == null ? "" : body)),
                        true);
        var artifact =
                artifacts.create(
                        workspaceId,
                        "github-created-issue.json",
                        "application/json",
                        result.getBytes(StandardCharsets.UTF_8),
                        "github",
                        uri);
        return Map.of(
                "result",
                JsonUtils.getJsonCodec().fromJson(result, Object.class),
                "artifact",
                artifact);
    }

    public Map<String, Object> githubPullRequest(
            String workspaceId,
            String repository,
            String title,
            String body,
            String head,
            String base)
            throws IOException {
        workspaces.requireWorkspace(workspaceId);
        requireRepository(repository);
        if (title == null
                || title.isBlank()
                || head == null
                || head.isBlank()
                || base == null
                || base.isBlank())
            throw error(
                    "GITHUB_PR_FIELDS_REQUIRED",
                    "标题、已推送的 head 和 base 分支不能为空",
                    HttpStatus.BAD_REQUEST);
        String uri = "https://api.github.com/repos/" + repository + "/pulls";
        String request =
                JsonUtils.getJsonCodec()
                        .toJson(
                                Map.of(
                                        "title",
                                        title,
                                        "body",
                                        body == null ? "" : body,
                                        "head",
                                        head,
                                        "base",
                                        base,
                                        "draft",
                                        true));
        String result = github(uri, "POST", request, true);
        var artifact =
                artifacts.create(
                        workspaceId,
                        "github-draft-pull-request.json",
                        "application/json",
                        result.getBytes(StandardCharsets.UTF_8),
                        "github",
                        uri);
        return Map.of(
                "result",
                JsonUtils.getJsonCodec().fromJson(result, Object.class),
                "artifact",
                artifact);
    }

    public ArtifactService.ArtifactInfo design(String workspaceId, String name, String svg)
            throws IOException {
        if (svg == null || svg.getBytes(StandardCharsets.UTF_8).length > 2 * 1024 * 1024)
            throw error("DESIGN_INVALID", "请提供不超过 2MB 的 SVG 设计", HttpStatus.BAD_REQUEST);
        try {
            var factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            var document =
                    factory.newDocumentBuilder()
                            .parse(new ByteArrayInputStream(svg.getBytes(StandardCharsets.UTF_8)));
            if (!document.getDocumentElement().getLocalName().equals("svg"))
                throw new IllegalArgumentException("svg required");
            validateSvg(document.getDocumentElement());
        } catch (Exception exception) {
            throw error("DESIGN_SVG_UNSAFE", "SVG 不能包含脚本、外部资源、事件处理或嵌入页面", HttpStatus.BAD_REQUEST);
        }
        return artifacts.create(
                workspaceId,
                extension(name, ".svg"),
                "image/svg+xml",
                svg.getBytes(StandardCharsets.UTF_8),
                "design",
                "plugin:design/svg");
    }

    public ArtifactService.ArtifactInfo document(
            String workspaceId, String name, String title, String text) throws IOException {
        validateText(title, text);
        try (var document = new XWPFDocument();
                var output = new ByteArrayOutputStream()) {
            var heading = document.createParagraph();
            heading.setStyle("Title");
            heading.createRun().setText(title == null ? "" : title);
            for (String line : text.split("\\R", -1))
                document.createParagraph().createRun().setText(line);
            document.write(output);
            return artifacts.create(
                    workspaceId,
                    extension(name, ".docx"),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    output.toByteArray(),
                    "documents",
                    "plugin:documents/docx");
        }
    }

    public ArtifactService.ArtifactInfo pdf(
            String workspaceId, String name, String title, String text) throws IOException {
        validateText(title, text);
        try (var document = new PDDocument();
                var output = new ByteArrayOutputStream()) {
            Path fontPath = fontPath();
            PDFont font =
                    fontPath == null
                            ? new PDType1Font(Standard14Fonts.FontName.HELVETICA)
                            : PDType0Font.load(document, fontPath.toFile());
            String combined = (title == null ? "" : title + "\n\n") + text;
            List<String> lines =
                    wrap(font, combined.replace('\t', ' '), 11, PDRectangle.A4.getWidth() - 96);
            int offset = 0;
            while (offset < lines.size()) {
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                try (var stream = new PDPageContentStream(document, page)) {
                    stream.beginText();
                    stream.setFont(font, 11);
                    stream.setLeading(16);
                    stream.newLineAtOffset(48, page.getMediaBox().getHeight() - 56);
                    for (int row = 0; row < 44 && offset < lines.size(); row++, offset++) {
                        stream.showText(lines.get(offset));
                        stream.newLine();
                    }
                    stream.endText();
                }
            }
            document.save(output);
            return artifacts.create(
                    workspaceId,
                    extension(name, ".pdf"),
                    "application/pdf",
                    output.toByteArray(),
                    "pdf",
                    "plugin:pdf/export");
        } catch (IllegalArgumentException exception) {
            throw error(
                    "PDF_FONT_UNAVAILABLE",
                    "当前字体缺少文档中的字形；请设置 XUYA_CODEX_PDF_FONT 为支持该语言的 TTF 字体",
                    HttpStatus.CONFLICT);
        }
    }

    private String github(String uri, String method, String body, boolean requireToken)
            throws IOException {
        String token = token();
        if (requireToken && token == null)
            throw error(
                    "GITHUB_UNCONFIGURED", "请在后端环境配置 XUYA_CODEX_GITHUB_TOKEN", HttpStatus.CONFLICT);
        var builder =
                HttpRequest.newBuilder(URI.create(uri))
                        .timeout(Duration.ofSeconds(20))
                        .header("Accept", "application/vnd.github+json")
                        .header("X-GitHub-Api-Version", "2022-11-28")
                        .header("User-Agent", "xuya-island-codex");
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (method.equals("POST"))
            builder.header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body));
        else builder.GET();
        try {
            var response = client.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
            try (var input = response.body()) {
                byte[] bytes = input.readNBytes(2 * 1024 * 1024 + 1);
                if (response.statusCode() < 200 || response.statusCode() >= 300)
                    throw error(
                            "GITHUB_REQUEST_FAILED",
                            "GitHub 返回 HTTP " + response.statusCode() + "；请检查仓库、远端分支和凭证权限",
                            HttpStatus.BAD_GATEWAY);
                if (bytes.length > 2 * 1024 * 1024)
                    throw error(
                            "GITHUB_RESPONSE_TOO_LARGE", "GitHub 返回内容超过限制", HttpStatus.BAD_GATEWAY);
                return new String(bytes, StandardCharsets.UTF_8);
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw error("GITHUB_INTERRUPTED", "GitHub 操作已中断", HttpStatus.SERVICE_UNAVAILABLE);
        } catch (IOException exception) {
            throw error("GITHUB_UNAVAILABLE", "无法连接 GitHub，请检查网络", HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private static void validateSvg(Node node) {
        if (node instanceof Element element) {
            String tag = element.getLocalName();
            if (Set.of(
                            "script",
                            "foreignObject",
                            "iframe",
                            "object",
                            "embed",
                            "style",
                            "animate",
                            "set")
                    .contains(tag)) throw new IllegalArgumentException("active SVG");
            for (int index = 0; index < element.getAttributes().getLength(); index++) {
                Node attribute = element.getAttributes().item(index);
                String key = attribute.getNodeName().toLowerCase();
                String value = attribute.getNodeValue().trim();
                if (key.startsWith("on")
                        || key.equals("style")
                        || (key.endsWith("href") && !value.startsWith("#"))
                        || (value.toLowerCase().contains("url(")
                                && !value.matches("url\\(#[a-zA-Z0-9_-]+\\)")))
                    throw new IllegalArgumentException("external SVG");
            }
        }
        for (Node child = node.getFirstChild(); child != null; child = child.getNextSibling())
            validateSvg(child);
    }

    private static List<String> wrap(PDFont font, String text, float size, float width)
            throws IOException {
        List<String> result = new ArrayList<>();
        for (String paragraph : text.split("\\R", -1)) {
            StringBuilder line = new StringBuilder();
            for (int codepoint : paragraph.codePoints().toArray()) {
                if (Character.isISOControl(codepoint)) continue;
                String glyph = new String(Character.toChars(codepoint));
                if (!line.isEmpty() && font.getStringWidth(line + glyph) * size / 1000 > width) {
                    result.add(line.toString());
                    line.setLength(0);
                }
                line.append(glyph);
            }
            result.add(line.toString());
            if (result.size() > 5000)
                throw error("PDF_TOO_LONG", "导出最多 5000 行，请拆分文档", HttpStatus.PAYLOAD_TOO_LARGE);
        }
        return result;
    }

    private static Path fontPath() {
        String configured = System.getenv("XUYA_CODEX_PDF_FONT");
        if (configured != null && Files.isRegularFile(Path.of(configured)))
            return Path.of(configured);
        for (String name :
                List.of(
                        "C:/Windows/Fonts/simhei.ttf",
                        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
            if (Files.isRegularFile(Path.of(name))) return Path.of(name);
        return null;
    }

    private static void validateText(String title, String text) {
        if (text == null || text.length() > 100_000 || (title != null && title.length() > 300))
            throw error("DOCUMENT_TOO_LARGE", "标题限 300 字，正文限 100000 字", HttpStatus.BAD_REQUEST);
    }

    private static void requireRepository(String repository) {
        if (repository == null || !repository.matches("[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+"))
            throw error("GITHUB_REPOSITORY_INVALID", "仓库格式应为 owner/repo", HttpStatus.BAD_REQUEST);
    }

    private static String extension(String name, String extension) {
        String value = name == null || name.isBlank() ? "codex-export" : name;
        return value.endsWith(extension) ? value : value + extension;
    }

    private static String token() {
        String value = System.getenv("XUYA_CODEX_GITHUB_TOKEN");
        return value == null || value.isBlank() ? null : value;
    }

    private static BusinessException error(String code, String message, HttpStatus status) {
        return new BusinessException(code, message, status);
    }
}
