package com.xuya.island.codex.plugin;

import com.xuya.island.codex.agent.AgentRuntimeAdapter;
import com.xuya.island.codex.agent.CodexToolProvider;
import com.xuya.island.codex.artifact.ArtifactService;
import com.xuya.island.codex.chrome.ChromeService;
import com.xuya.island.common.BusinessException;
import io.agentscope.core.message.Base64Source;
import io.agentscope.core.message.ImageBlock;
import io.agentscope.core.message.ToolResultBlock;
import io.agentscope.core.tool.Tool;
import io.agentscope.core.tool.ToolParam;
import io.agentscope.core.tool.Toolkit;
import java.nio.file.Files;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.Callable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 外部操作和产物创建通过相同原生权限引擎，图像参考以 SDK ImageBlock 交给多模态模型。 */
@Component
public class PluginAgentTools implements CodexToolProvider {
    private final PluginService plugins;
    private final ArtifactService artifacts;
    private final OfficeService office;
    private final DesignService designs;
    private final ChromeService chrome;

    public PluginAgentTools(
            PluginService plugins,
            ArtifactService artifacts,
            OfficeService office,
            DesignService designs,
            ChromeService chrome) {
        this.plugins = plugins;
        this.artifacts = artifacts;
        this.office = office;
        this.designs = designs;
        this.chrome = chrome;
    }

    @Override
    public Toolkit tools(AgentRuntimeAdapter.RuntimeSpec spec) {
        Toolkit toolkit = new Toolkit();
        toolkit.registerTool(new BoundTools(spec.workspaceId()));
        return toolkit;
    }

    private static <T> Mono<T> blocking(Callable<T> callable) {
        return Mono.fromCallable(callable).subscribeOn(Schedulers.boundedElastic());
    }

    public final class BoundTools {
        private final String workspaceId;

        public BoundTools(String workspaceId) {
            this.workspaceId = workspaceId;
        }

        @Tool(name = "list_artifacts", description = "列出当前工作区真实附件、生成产物及来源。", readOnly = true)
        public Mono<List<ArtifactService.ArtifactInfo>> list() {
            return blocking(() -> artifacts.artifactList(workspaceId));
        }

        @Tool(
                name = "read_artifact",
                description = "读取当前工作区附件预览；图片/PDF首页以真实 ImageBlock 返回，可用于截图到代码。",
                readOnly = true)
        public Mono<ToolResultBlock> read(
                @ToolParam(name = "artifactId", description = "当前工作区产物 ID") String id) {
            return blocking(
                    () -> {
                        if (!artifacts.requireArtifact(id).workspaceId().equals(workspaceId))
                            throw new BusinessException(
                                    "ARTIFACT_WORKSPACE_FORBIDDEN",
                                    "附件不属于当前工作区",
                                    HttpStatus.FORBIDDEN);
                        var preview = artifacts.preview(id);
                        if (preview.type().equals("image"))
                            return ToolResultBlock.of(
                                    new ImageBlock(
                                            new Base64Source(
                                                    "image/png",
                                                    Base64.getEncoder()
                                                            .encodeToString(
                                                                    Files.readAllBytes(
                                                                            artifacts
                                                                                    .previewImagePath(
                                                                                            id))))));
                        return ToolResultBlock.text(
                                preview.text() == null ? "此文件不支持文本预览，可下载原文件" : preview.text());
                    });
        }

        @Tool(name = "capture_artifact", description = "将当前工作区文件保存为正式产物，记录哈希与来源。", readOnly = false)
        public Mono<ArtifactService.ArtifactInfo> capture(
                @ToolParam(name = "path", description = "工作区相对路径") String path) {
            return blocking(
                    () -> artifacts.captureWorkspaceFile(workspaceId, path, "agent-output"));
        }

        @Tool(
                name = "github_query",
                description = "查询真实 GitHub 仓库、PR、Issue 或 CI runs，结果保存为带来源的产物。",
                readOnly = true,
                externalTool = true)
        public Mono<Object> github(
                @ToolParam(name = "repository", description = "owner/repo") String repository,
                @ToolParam(name = "kind", description = "repository、pulls、issues 或 actions")
                        String kind) {
            return blocking(() -> plugins.githubQuery(workspaceId, repository, kind));
        }

        @Tool(
                name = "github_create_draft_pull_request",
                description = "在 GitHub 创建草稿 PR；head 必须已推送，不会替用户 commit 或 push。",
                readOnly = false,
                externalTool = true)
        public Mono<Object> pull(
                @ToolParam(name = "repository", description = "owner/repo") String repository,
                @ToolParam(name = "title", description = "PR 标题") String title,
                @ToolParam(name = "body", description = "PR 正文") String body,
                @ToolParam(name = "head", description = "已存在的远端分支") String head,
                @ToolParam(name = "base", description = "目标分支") String base) {
            return blocking(
                    () ->
                            plugins.githubPullRequest(
                                    workspaceId, repository, title, body, head, base));
        }

        @Tool(
                name = "github_create_issue",
                description = "经批准后在真实 GitHub 仓库创建 Issue。",
                readOnly = false,
                externalTool = true)
        public Mono<Object> issue(
                @ToolParam(name = "repository", description = "owner/repo") String repository,
                @ToolParam(name = "title", description = "Issue 标题") String title,
                @ToolParam(name = "body", description = "正文") String body) {
            return blocking(() -> plugins.githubIssue(workspaceId, repository, title, body));
        }

        @Tool(
                name = "design_export_svg",
                description = "导出不含活动内容和外链的真实 SVG 设计产物。",
                readOnly = false)
        public Mono<ArtifactService.ArtifactInfo> svg(
                @ToolParam(name = "name", description = "文件名") String name,
                @ToolParam(name = "svg", description = "完整 SVG") String svg) {
            return blocking(() -> plugins.design(workspaceId, name, svg));
        }

        @Tool(
                name = "design_build_preview",
                description =
                        "先使用 read_artifact 研究图像，再使用 write_file 实现源码。此工具执行真实构建，并启动短效票据的独立来源预览。",
                readOnly = false)
        public Mono<DesignService.PreviewInfo> build(
                @ToolParam(name = "directory", description = "构建相对目录") String directory,
                @ToolParam(name = "command", description = "明确构建命令") String command,
                @ToolParam(name = "outputDirectory", description = "生成的静态 index.html 相对目录")
                        String output,
                @ToolParam(
                                name = "referenceArtifactId",
                                required = false,
                                description = "参考图像产物 ID")
                        String reference) {
            return blocking(
                    () ->
                            designs.build(
                                    new DesignService.Build(
                                            workspaceId, directory, command, output, reference)));
        }

        @Tool(
                name = "design_static_preview",
                description = "为当前工作区已有 index.html 目录提供独立来源预览；不执行构建命令。",
                readOnly = false)
        public Mono<DesignService.PreviewInfo> preview(
                @ToolParam(name = "directory", description = "静态输出相对目录") String directory,
                @ToolParam(name = "referenceArtifactId", required = false, description = "参考产物 ID")
                        String reference) {
            return blocking(() -> designs.preview(workspaceId, directory, reference, null));
        }

        @Tool(
                name = "design_verify_screenshot",
                description = "经批准后在已连接 Chrome 中打开预览，返回 DOM 快照与真实截图产物，用 read_artifact 比较参考。",
                readOnly = false,
                externalTool = true)
        public Mono<Object> verify(
                @ToolParam(name = "previewId", description = "预览 ID") String id,
                @ToolParam(name = "tabId", required = false, description = "选定 Chrome 标签 ID")
                        Long tabId) {
            return blocking(() -> designs.verify(workspaceId, id, tabId));
        }

        @Tool(
                name = "documents_export_docx",
                description = "生成可下载 DOCX 正式产物，保存来源。",
                readOnly = false)
        public Mono<ArtifactService.ArtifactInfo> docx(
                @ToolParam(name = "name", description = "文件名") String name,
                @ToolParam(name = "title", description = "标题") String title,
                @ToolParam(name = "text", description = "正文") String text) {
            return blocking(() -> plugins.document(workspaceId, name, title, text));
        }

        @Tool(
                name = "documents_read_docx",
                description = "读取当前工作区 DOCX 段落和表格，返回真实段落索引。",
                readOnly = true)
        public Mono<Object> readDocx(
                @ToolParam(name = "artifactId", description = "DOCX 产物 ID") String id) {
            return blocking(() -> office.read(workspaceId, id));
        }

        @Tool(
                name = "documents_edit_docx",
                description = "编辑 DOCX 中指定段落，保留其余文档结构，保存新版本产物。",
                readOnly = false)
        public Mono<ArtifactService.ArtifactInfo> editDocx(
                @ToolParam(name = "artifactId", description = "DOCX ID") String id,
                @ToolParam(name = "name", description = "输出文件名") String name,
                @ToolParam(name = "edits", description = "段落修改数组，每项 index 和 text")
                        List<OfficeService.Edit> edits) {
            return blocking(() -> office.edit(workspaceId, id, name, edits));
        }

        @Tool(
                name = "documents_render",
                description = "用本机 LibreOffice 真实将 DOCX 排版渲染为 PDF 和首页预览。未安装会明确不可用。",
                readOnly = false)
        public Mono<ArtifactService.ArtifactInfo> render(
                @ToolParam(name = "artifactId", description = "DOCX ID") String id) {
            return blocking(() -> office.render(workspaceId, id));
        }

        @Tool(
                name = "pdf_export",
                description = "生成分页 PDF 和真实首页图片预览；缺字形时要求配置本机字体。",
                readOnly = false)
        public Mono<ArtifactService.ArtifactInfo> pdf(
                @ToolParam(name = "name", description = "文件名") String name,
                @ToolParam(name = "title", description = "标题") String title,
                @ToolParam(name = "text", description = "正文") String text) {
            return blocking(() -> plugins.pdf(workspaceId, name, title, text));
        }

        @Tool(
                name = "chrome_tabs",
                description = "读取当前 Chrome 扩展真实标签；未连接不返回模拟数据。",
                readOnly = true,
                externalTool = true)
        public Mono<Object> tabs() {
            return blocking(chrome::tabs);
        }

        @Tool(
                name = "chrome_snapshot",
                description = "读取选定 Chrome 页面的真实 DOM 文本与定位器。",
                readOnly = true,
                externalTool = true)
        public Mono<ChromeService.ActionResult> snapshot(
                @ToolParam(name = "tabId", required = false, description = "标签 ID") Long tabId) {
            return blocking(
                    () ->
                            chrome.action(
                                    new ChromeService.Action("snapshot", tabId, null, null, null)));
        }

        @Tool(
                name = "chrome_action",
                description = "经批准操作当前 Chrome：selectTab、navigate、click、fill 或 screenshot。",
                readOnly = false,
                externalTool = true)
        public Mono<ChromeService.ActionResult> chromeAction(
                @ToolParam(name = "action", description = "操作名") String action,
                @ToolParam(name = "tabId", required = false, description = "标签 ID") Long tabId,
                @ToolParam(name = "url", required = false, description = "导航地址") String url,
                @ToolParam(name = "selector", required = false, description = "快照中的 CSS 定位器")
                        String selector,
                @ToolParam(name = "text", required = false, description = "填写文本") String text) {
            return blocking(
                    () ->
                            chrome.action(
                                    new ChromeService.Action(action, tabId, url, selector, text)));
        }
    }
}
