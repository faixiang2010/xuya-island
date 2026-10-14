package com.xuya.island.codex.artifact;

import com.xuya.island.codex.config.CodexProperties;
import com.xuya.island.codex.workspace.PlatformStore;
import com.xuya.island.codex.workspace.WorkspaceService;
import com.xuya.island.common.BusinessException;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** 附件与正式产物统一保存原文件、来源、哈希及可安全预览的派生内容。 */
@Service
public class ArtifactService {
    private static final int MAX_PREVIEW_CHARS = 100_000;
    private static final Set<String> TEXT_EXTENSIONS =
            Set.of(
                    "txt", "md", "json", "csv", "java", "js", "ts", "vue", "css", "html", "svg",
                    "xml", "yml", "yaml", "log");
    private final PlatformStore store;
    private final WorkspaceService workspaces;
    private final CodexProperties properties;

    public ArtifactService(
            PlatformStore store, WorkspaceService workspaces, CodexProperties properties) {
        this.store = store;
        this.workspaces = workspaces;
        this.properties = properties;
    }

    @Schema(name = "CodexArtifactInfo")
    public record ArtifactInfo(
            String id,
            String workspaceId,
            String name,
            String mediaType,
            long size,
            String sha256,
            String sourceKind,
            String source,
            String createdAt,
            String previewType) {}

    @Schema(name = "CodexArtifactSource")
    public record SourceInfo(
            String id, String name, String kind, String uri, String artifactId, String createdAt) {}

    @Schema(name = "CodexArtifactPreview")
    public record Preview(
            String id, String type, String text, String mediaType, String imagePath) {}

    public List<ArtifactInfo> artifactList(String workspaceId) throws IOException {
        workspaces.requireWorkspace(workspaceId);
        return store.list("artifacts", ArtifactInfo.class).stream()
                .filter(item -> item.workspaceId().equals(workspaceId))
                .toList();
    }

    public List<SourceInfo> sourceList(String workspaceId) throws IOException {
        return artifactList(workspaceId).stream()
                .filter(item -> item.source() != null && !item.source().isBlank())
                .map(
                        item ->
                                new SourceInfo(
                                        item.id(),
                                        item.name(),
                                        item.sourceKind(),
                                        item.source(),
                                        item.id(),
                                        item.createdAt()))
                .toList();
    }

    public ArtifactInfo requireArtifact(String id) throws IOException {
        ArtifactInfo item = store.read("artifacts", id, ArtifactInfo.class);
        if (item == null)
            throw new BusinessException("ARTIFACT_NOT_FOUND", "附件或产物不存在", HttpStatus.NOT_FOUND);
        return item;
    }

    public Path contentPath(String id) throws IOException {
        requireArtifact(id);
        return directory(id).resolve("content");
    }

    public Path previewImagePath(String id) throws IOException {
        requireArtifact(id);
        Path path = directory(id).resolve("preview.png");
        if (!Files.isRegularFile(path))
            throw new BusinessException("PREVIEW_NOT_AVAILABLE", "该产物没有图片预览", HttpStatus.NOT_FOUND);
        return path;
    }

    public Preview preview(String id) throws IOException {
        requireArtifact(id);
        Preview result = store.read("artifact-previews", id, Preview.class);
        return result == null ? new Preview(id, "unavailable", "该格式可下载原文件", null, null) : result;
    }

    public ArtifactInfo ingest(
            Path upload,
            String fileName,
            String mediaType,
            String workspaceId,
            String sourceKind,
            String source)
            throws IOException {
        workspaces.requireWorkspace(workspaceId);
        if (!Files.isRegularFile(upload) || Files.size(upload) > properties.maxUploadBytes())
            throw new BusinessException(
                    "UPLOAD_TOO_LARGE", "附件不存在或超过大小限制", HttpStatus.PAYLOAD_TOO_LARGE);
        String name = safeName(fileName);
        String id = UUID.randomUUID().toString();
        Path directory = directory(id);
        Files.createDirectories(directory);
        Path content = directory.resolve("content");
        Files.copy(upload, content, StandardCopyOption.REPLACE_EXISTING);
        if (Files.size(content) > properties.maxUploadBytes()) {
            Files.delete(content);
            Files.delete(directory);
            throw new BusinessException(
                    "UPLOAD_TOO_LARGE", "附件超过大小限制", HttpStatus.PAYLOAD_TOO_LARGE);
        }
        Preview preview;
        try {
            preview = createPreview(id, name, content, directory);
        } catch (IOException | RuntimeException exception) {
            // 原文件保留，可下载；非法文档或不支持的格式不能破坏正常对话。
            preview = new Preview(id, "unavailable", "无法预览此文件，请下载原文件检查", null, null);
        }
        ArtifactInfo artifact =
                new ArtifactInfo(
                        id,
                        workspaceId,
                        name,
                        safeMediaType(mediaType),
                        Files.size(content),
                        WorkspaceService.hash(Files.readAllBytes(content)),
                        sourceKind == null ? "attachment" : sourceKind,
                        source == null ? "" : source,
                        Instant.now().toString(),
                        preview.type());
        store.save("artifact-previews", id, preview);
        store.save("artifacts", id, artifact);
        return artifact;
    }

    public ArtifactInfo captureWorkspaceFile(String workspaceId, String relative, String sourceKind)
            throws IOException {
        Path path =
                WorkspaceService.resolve(workspaces.workspacePath(workspaceId), relative, false);
        return ingest(
                path,
                path.getFileName().toString(),
                Files.probeContentType(path),
                workspaceId,
                sourceKind,
                "workspace:" + relative);
    }

    public ArtifactInfo create(
            String workspaceId,
            String name,
            String mediaType,
            byte[] bytes,
            String sourceKind,
            String source)
            throws IOException {
        if (bytes.length > properties.maxUploadBytes())
            throw new BusinessException(
                    "UPLOAD_TOO_LARGE", "产物超过大小限制", HttpStatus.PAYLOAD_TOO_LARGE);
        Files.createDirectories(properties.artifactsDir());
        Path temporary = Files.createTempFile(properties.artifactsDir(), "export-", ".tmp");
        try {
            Files.write(temporary, bytes);
            return ingest(temporary, name, mediaType, workspaceId, sourceKind, source);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private Preview createPreview(String id, String name, Path content, Path directory)
            throws IOException {
        String extension =
                name.contains(".")
                        ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT)
                        : "";
        if (extension.equals("pdf")) {
            try (var pdf = Loader.loadPDF(content.toFile())) {
                var stripper = new PDFTextStripper();
                stripper.setStartPage(1);
                stripper.setEndPage(Math.min(pdf.getNumberOfPages(), 30));
                String text = truncate(stripper.getText(pdf));
                if (pdf.getNumberOfPages() > 0
                        && pdf.getPage(0).getMediaBox().getWidth() <= 4000
                        && pdf.getPage(0).getMediaBox().getHeight() <= 4000) {
                    ImageIO.write(
                            new PDFRenderer(pdf).renderImageWithDPI(0, 72),
                            "png",
                            directory.resolve("preview.png").toFile());
                    return new Preview(id, "image", text, "image/png", imageRoute(id));
                }
                return new Preview(id, "text", text, "text/plain", null);
            }
        }
        if (extension.equals("docx")) {
            try (var input = Files.newInputStream(content);
                    var document = new XWPFDocument(input)) {
                StringBuilder text = new StringBuilder();
                document.getParagraphs()
                        .forEach(paragraph -> text.append(paragraph.getText()).append('\n'));
                document.getTables()
                        .forEach(
                                table ->
                                        table.getRows()
                                                .forEach(
                                                        row -> {
                                                            row.getTableCells()
                                                                    .forEach(
                                                                            cell ->
                                                                                    text.append(
                                                                                                    cell
                                                                                                            .getText())
                                                                                            .append(
                                                                                                    '\t'));
                                                            text.append('\n');
                                                        }));
                return new Preview(id, "text", truncate(text.toString()), "text/plain", null);
            }
        }
        if (Set.of("png", "jpg", "jpeg", "gif", "bmp").contains(extension)) {
            try (var input = ImageIO.createImageInputStream(content.toFile())) {
                var readers = ImageIO.getImageReaders(input);
                if (readers.hasNext()) {
                    var reader = readers.next();
                    try {
                        reader.setInput(input);
                        if ((long) reader.getWidth(0) * reader.getHeight(0) > 16_000_000)
                            throw new IOException("image size");
                        ImageIO.write(
                                reader.read(0), "png", directory.resolve("preview.png").toFile());
                        return new Preview(id, "image", null, "image/png", imageRoute(id));
                    } finally {
                        reader.dispose();
                    }
                }
            }
        }
        if (TEXT_EXTENSIONS.contains(extension) && Files.size(content) <= 2 * 1024 * 1024)
            return new Preview(
                    id,
                    "text",
                    truncate(Files.readString(content, StandardCharsets.UTF_8)),
                    "text/plain",
                    null);
        return new Preview(id, "unavailable", "该格式可下载原文件", null, null);
    }

    private Path directory(String id) {
        return properties.artifactsDir().toAbsolutePath().normalize().resolve(id);
    }

    private static String imageRoute(String id) {
        return "/api/v1/codex/artifacts/" + id + "/preview/image";
    }

    private static String truncate(String text) {
        return text.length() > MAX_PREVIEW_CHARS
                ? text.substring(0, MAX_PREVIEW_CHARS) + "\n[预览已截断]"
                : text;
    }

    private static String safeName(String name) {
        if (name == null || name.isBlank()) return "attachment";
        String value = name.replace('\\', '/');
        value = value.substring(value.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "");
        return value.length() > 200 ? value.substring(0, 200) : value;
    }

    private static String safeMediaType(String value) {
        return value != null && value.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+")
                ? value
                : "application/octet-stream";
    }
}
