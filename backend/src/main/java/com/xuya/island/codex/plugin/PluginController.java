package com.xuya.island.codex.plugin;

import com.xuya.island.codex.artifact.ArtifactService;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

@RestController
@RequestMapping("/api/v1/codex/plugins")
public class PluginController {
    private final PluginService plugins;
    private final DesignService designs;
    private final OfficeService office;

    public PluginController(PluginService plugins, DesignService designs, OfficeService office) {
        this.plugins = plugins;
        this.designs = designs;
        this.office = office;
    }

    @Schema(name = "CodexGithubQuery")
    public record Query(
            @NotBlank String workspaceId, @NotBlank String repository, @NotBlank String kind) {}

    @Schema(name = "CodexGithubPullRequest")
    public record PullRequest(
            @NotBlank String workspaceId,
            @NotBlank String repository,
            @NotBlank String title,
            String body,
            @NotBlank String head,
            @NotBlank String base) {}

    @Schema(name = "CodexDesignExport")
    public record Design(@NotBlank String workspaceId, String name, @NotBlank String svg) {}

    @Schema(name = "CodexDocumentExport")
    public record Document(
            @NotBlank String workspaceId, String name, String title, @NotBlank String text) {}

    @Schema(name = "CodexGithubIssue")
    public record Issue(
            @NotBlank String workspaceId,
            @NotBlank String repository,
            @NotBlank String title,
            String body) {}

    @Schema(name = "CodexDocumentRead")
    public record DocxRead(@NotBlank String workspaceId, @NotBlank String artifactId) {}

    @Schema(name = "CodexDocumentEdit")
    public record DocxEdit(
            @NotBlank String workspaceId,
            @NotBlank String artifactId,
            String name,
            List<OfficeService.Edit> edits) {}

    @Schema(name = "CodexDesignPreview")
    public record Preview(
            @NotBlank String workspaceId, String directory, String referenceArtifactId) {}

    @Schema(name = "CodexDesignVerify")
    public record Verify(@NotBlank String workspaceId, @NotBlank String previewId, Long tabId) {}

    @GetMapping
    public List<PluginService.PluginInfo> list() {
        return plugins.list();
    }

    @PostMapping("/github/query")
    public Mono<Map<String, Object>> query(@Valid @RequestBody Query request) {
        return Mono.fromCallable(
                        () ->
                                plugins.githubQuery(
                                        request.workspaceId(),
                                        request.repository(),
                                        request.kind()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/github/pull-requests")
    public Mono<Map<String, Object>> pull(@Valid @RequestBody PullRequest request) {
        return Mono.fromCallable(
                        () ->
                                plugins.githubPullRequest(
                                        request.workspaceId(),
                                        request.repository(),
                                        request.title(),
                                        request.body(),
                                        request.head(),
                                        request.base()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/github/issues")
    public Mono<Map<String, Object>> issue(@Valid @RequestBody Issue request) {
        return Mono.fromCallable(
                        () ->
                                plugins.githubIssue(
                                        request.workspaceId(),
                                        request.repository(),
                                        request.title(),
                                        request.body()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/design/export")
    public Mono<ArtifactService.ArtifactInfo> design(@Valid @RequestBody Design request) {
        return Mono.fromCallable(
                        () -> plugins.design(request.workspaceId(), request.name(), request.svg()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/documents/export")
    public Mono<ArtifactService.ArtifactInfo> document(@Valid @RequestBody Document request) {
        return Mono.fromCallable(
                        () ->
                                plugins.document(
                                        request.workspaceId(),
                                        request.name(),
                                        request.title(),
                                        request.text()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/pdf/export")
    public Mono<ArtifactService.ArtifactInfo> pdf(@Valid @RequestBody Document request) {
        return Mono.fromCallable(
                        () ->
                                plugins.pdf(
                                        request.workspaceId(),
                                        request.name(),
                                        request.title(),
                                        request.text()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/documents/render-status")
    public Mono<Map<String, Object>> officeStatus() {
        return Mono.fromCallable(office::status).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/documents/read")
    public Mono<Map<String, Object>> read(@Valid @RequestBody DocxRead request) {
        return Mono.fromCallable(() -> office.read(request.workspaceId(), request.artifactId()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/documents/edit")
    public Mono<ArtifactService.ArtifactInfo> edit(@Valid @RequestBody DocxEdit request) {
        return Mono.fromCallable(
                        () ->
                                office.edit(
                                        request.workspaceId(),
                                        request.artifactId(),
                                        request.name(),
                                        request.edits()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/documents/render")
    public Mono<ArtifactService.ArtifactInfo> render(@Valid @RequestBody DocxRead request) {
        return Mono.fromCallable(() -> office.render(request.workspaceId(), request.artifactId()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/design/build")
    public Mono<DesignService.PreviewInfo> build(@RequestBody DesignService.Build request) {
        return Mono.fromCallable(() -> designs.build(request))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/design/preview")
    public Mono<DesignService.PreviewInfo> preview(@Valid @RequestBody Preview request) {
        return Mono.fromCallable(
                        () ->
                                designs.preview(
                                        request.workspaceId(),
                                        request.directory(),
                                        request.referenceArtifactId(),
                                        null))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/design/verify")
    public Mono<Map<String, Object>> verify(@Valid @RequestBody Verify request) {
        return Mono.fromCallable(
                        () ->
                                designs.verify(
                                        request.workspaceId(),
                                        request.previewId(),
                                        request.tabId()))
                .subscribeOn(Schedulers.boundedElastic());
    }
}
