package com.xuya.island.codex.plugin;

import com.xuya.island.codex.artifact.ArtifactService;
import com.xuya.island.codex.config.CodexProperties;
import com.xuya.island.codex.workspace.ProcessCommands;
import com.xuya.island.common.BusinessException;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** DOCX 段落编辑保留其他样式和表格；LibreOffice 仅在可执行依赖存在时真实渲染。 */
@Service
public class OfficeService {
    private final ArtifactService artifacts;
    private final CodexProperties properties;

    public OfficeService(ArtifactService artifacts, CodexProperties properties) {
        this.artifacts = artifacts;
        this.properties = properties;
    }

    @Schema(name = "CodexDocumentParagraph")
    public record Paragraph(int index, String text) {}

    @Schema(name = "CodexDocumentParagraphEdit")
    public record Edit(int index, String text) {}

    public Map<String, Object> status() {
        Path office = executable();
        return Map.of(
                "status",
                office == null ? "unavailable" : "available",
                "format",
                "docx-to-pdf",
                "message",
                office == null
                        ? "未安装 LibreOffice；可读取编辑 DOCX，排版渲染需安装或设置 XUYA_CODEX_LIBREOFFICE"
                        : "LibreOffice 本机渲染可用");
    }

    public Map<String, Object> read(String workspaceId, String id) throws IOException {
        requireDocx(workspaceId, id);
        try (var input = Files.newInputStream(artifacts.contentPath(id));
                var document = new XWPFDocument(input)) {
            List<Paragraph> paragraphs = new ArrayList<>();
            for (int index = 0; index < document.getParagraphs().size(); index++)
                paragraphs.add(new Paragraph(index, document.getParagraphs().get(index).getText()));
            List<List<List<String>>> tables =
                    document.getTables().stream()
                            .map(
                                    table ->
                                            table.getRows().stream()
                                                    .map(
                                                            row ->
                                                                    row.getTableCells().stream()
                                                                            .map(
                                                                                    cell ->
                                                                                            cell
                                                                                                    .getText())
                                                                            .toList())
                                                    .toList())
                            .toList();
            return Map.of("artifactId", id, "paragraphs", paragraphs, "tables", tables);
        }
    }

    public ArtifactService.ArtifactInfo edit(
            String workspaceId, String id, String name, List<Edit> edits) throws IOException {
        var original = requireDocx(workspaceId, id);
        if (edits == null || edits.size() > 1000)
            throw error("DOCX_EDITS_INVALID", "每次最多编辑 1000 个段落", HttpStatus.BAD_REQUEST);
        try (var input = Files.newInputStream(artifacts.contentPath(id));
                var document = new XWPFDocument(input);
                var output = new ByteArrayOutputStream()) {
            for (Edit edit : edits) {
                if (edit.index() < 0
                        || edit.index() >= document.getParagraphs().size()
                        || edit.text() == null
                        || edit.text().length() > 100_000)
                    throw error("DOCX_PARAGRAPH_INVALID", "段落索引或内容无效", HttpStatus.BAD_REQUEST);
                var paragraph = document.getParagraphs().get(edit.index());
                if (paragraph.getRuns().isEmpty()) paragraph.createRun().setText(edit.text());
                else {
                    var run = paragraph.getRuns().get(0);
                    while (run.getCTR().sizeOfTArray() > 0) run.getCTR().removeT(0);
                    run.setText(edit.text());
                    for (int index = paragraph.getRuns().size() - 1; index >= 1; index--)
                        paragraph.removeRun(index);
                }
            }
            document.write(output);
            return artifacts.create(
                    workspaceId,
                    name == null || name.isBlank()
                            ? "edited-" + original.name()
                            : (name.endsWith(".docx") ? name : name + ".docx"),
                    original.mediaType(),
                    output.toByteArray(),
                    "documents-edit",
                    "artifact:" + id);
        }
    }

    public ArtifactService.ArtifactInfo render(String workspaceId, String id) throws IOException {
        requireDocx(workspaceId, id);
        Path office = executable();
        if (office == null)
            throw error(
                    "LIBREOFFICE_UNAVAILABLE",
                    "未安装 LibreOffice；请安装或设置 XUYA_CODEX_LIBREOFFICE，原 DOCX 保留",
                    HttpStatus.SERVICE_UNAVAILABLE);
        Path renderRoot =
                properties.artifactsDir().toAbsolutePath().normalize().resolve("office-renders");
        Files.createDirectories(renderRoot);
        Path temporary = Files.createTempDirectory(renderRoot, "render-");
        try {
            Path source = temporary.resolve("input.docx");
            Files.copy(artifacts.contentPath(id), source, StandardCopyOption.REPLACE_EXISTING);
            Path output = temporary.resolve("output");
            Files.createDirectories(output);
            var result =
                    ProcessCommands.run(
                            temporary,
                            List.of(
                                    office.toString(),
                                    "-env:UserInstallation=" + temporary.resolve("profile").toUri(),
                                    "--headless",
                                    "--convert-to",
                                    "pdf",
                                    "--outdir",
                                    output.toString(),
                                    source.toString()),
                            Duration.ofSeconds(60));
            Path pdf = output.resolve("input.pdf");
            if (result.exitCode() != 0 || result.timedOut() || !Files.isRegularFile(pdf))
                throw error(
                        "LIBREOFFICE_RENDER_FAILED",
                        "LibreOffice 未成功生成 PDF；原文件保留",
                        HttpStatus.CONFLICT);
            return artifacts.ingest(
                    pdf,
                    "rendered-" + id + ".pdf",
                    "application/pdf",
                    workspaceId,
                    "documents-render",
                    "artifact:" + id);
        } finally {
            if (!temporary.toAbsolutePath().normalize().startsWith(renderRoot))
                throw new IOException("render directory outside root");
            try (var walk = Files.walk(temporary)) {
                for (Path path : walk.sorted(Comparator.reverseOrder()).toList())
                    Files.deleteIfExists(path);
            }
        }
    }

    private ArtifactService.ArtifactInfo requireDocx(String workspaceId, String id)
            throws IOException {
        var item = artifacts.requireArtifact(id);
        if (!item.workspaceId().equals(workspaceId))
            throw error("ARTIFACT_WORKSPACE_FORBIDDEN", "文件必须属于当前工作区", HttpStatus.FORBIDDEN);
        if (!item.name().toLowerCase().endsWith(".docx"))
            throw error("DOCX_REQUIRED", "请选择 DOCX 文件", HttpStatus.BAD_REQUEST);
        return item;
    }

    private static Path executable() {
        String configured = System.getenv("XUYA_CODEX_LIBREOFFICE");
        if (configured != null && Files.isRegularFile(Path.of(configured)))
            return Path.of(configured).toAbsolutePath();
        for (String candidate :
                List.of(
                        "C:/Program Files/LibreOffice/program/soffice.exe",
                        "C:/Program Files (x86)/LibreOffice/program/soffice.exe",
                        "/usr/bin/libreoffice",
                        "/usr/bin/soffice"))
            if (Files.isRegularFile(Path.of(candidate))) return Path.of(candidate);
        return null;
    }

    private static BusinessException error(String code, String message, HttpStatus status) {
        return new BusinessException(code, message, status);
    }
}
