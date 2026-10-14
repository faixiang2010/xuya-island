package com.xuya.island.codex.workspace;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.concurrent.Callable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 工作区协议层，文件与 Git 操作统一离开 WebFlux 事件循环。 */
@RestController
@RequestMapping("/api/v1/codex")
public class WorkspaceController {
    private final WorkspaceService workspaces;

    public WorkspaceController(WorkspaceService workspaces) {
        this.workspaces = workspaces;
    }

    @Schema(name = "CodexProjectRegister")
    public record Register(@NotBlank String name, @NotBlank String path, String mode) {}

    @Schema(name = "CodexWorkspaceCreate")
    public record Create(String mode, String baseRef, String environment, String dockerImage) {}

    @Schema(name = "CodexWorkspaceWrite")
    public record Write(@NotBlank String path, String content, String expectedHash) {}

    @Schema(name = "CodexWorkspaceApply")
    public record Apply(
            @NotBlank String expectedSourceRevision,
            @NotBlank String resultRevision,
            String strategy) {}

    private <T> Mono<T> blocking(Callable<T> work) {
        return Mono.fromCallable(work).subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/projects")
    public Mono<List<WorkspaceService.ProjectInfo>> projects() {
        return blocking(workspaces::projects);
    }

    @PostMapping("/projects")
    public Mono<WorkspaceService.ProjectInfo> register(@Valid @RequestBody Register request) {
        return blocking(() -> workspaces.register(request.name(), request.path(), request.mode()));
    }

    @GetMapping("/projects/{id}")
    public Mono<WorkspaceService.ProjectInfo> project(@PathVariable String id) {
        return blocking(() -> workspaces.project(id));
    }

    @GetMapping("/projects/{id}/workspaces")
    public Mono<List<WorkspaceService.WorkspaceInfo>> list(@PathVariable String id) {
        return blocking(() -> workspaces.workspaces(id));
    }

    @PostMapping("/projects/{id}/workspaces")
    public Mono<WorkspaceService.WorkspaceInfo> create(
            @PathVariable String id, @RequestBody Create request) {
        return blocking(
                () ->
                        workspaces.create(
                                id,
                                request.mode(),
                                request.baseRef(),
                                request.environment() == null ? "host" : request.environment(),
                                request.dockerImage()));
    }

    @GetMapping("/workspaces/{id}")
    public Mono<WorkspaceService.WorkspaceInfo> workspace(@PathVariable String id) {
        return blocking(() -> workspaces.requireWorkspace(id));
    }

    @GetMapping("/workspaces/{id}/tree")
    public Mono<WorkspaceService.TreeView> tree(
            @PathVariable String id, @RequestParam(defaultValue = "") String path) {
        return blocking(() -> workspaces.tree(id, path));
    }

    @GetMapping("/workspaces/{id}/file")
    public Mono<WorkspaceService.FileView> file(
            @PathVariable String id, @RequestParam String path) {
        return blocking(() -> workspaces.read(id, path));
    }

    @PutMapping("/workspaces/{id}/file")
    public Mono<WorkspaceService.FileView> write(
            @PathVariable String id, @Valid @RequestBody Write request) {
        return blocking(
                () ->
                        workspaces.write(
                                id,
                                request.path(),
                                request.content() == null ? "" : request.content(),
                                request.expectedHash()));
    }

    @GetMapping("/workspaces/{id}/diff")
    public Mono<WorkspaceService.DiffView> diff(@PathVariable String id) {
        return blocking(() -> workspaces.diff(id));
    }

    @PostMapping("/workspaces/{id}/apply")
    public Mono<WorkspaceService.ApplyResult> apply(
            @PathVariable String id, @Valid @RequestBody Apply request) {
        return blocking(
                () ->
                        workspaces.apply(
                                id,
                                request.expectedSourceRevision(),
                                request.resultRevision(),
                                request.strategy() == null ? "cas" : request.strategy()));
    }
}
