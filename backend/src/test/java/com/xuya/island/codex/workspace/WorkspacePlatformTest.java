package com.xuya.island.codex.workspace;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.codex.config.CodexProperties;
import com.xuya.island.common.BusinessException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** 临时真实 Git 验证输入脏文件、双向审阅 CAS、三方合并及原索引保护。 */
class WorkspacePlatformTest {
    @Test
    void dockerWorktreeUsesMountedMetadataInsteadOfWindowsGitPointer() throws IOException {
        initialize();
        Path child = root.resolve("docker-worktree");
        git("worktree", "add", "--detach", child.toString(), "HEAD");
        String pointer = Files.readString(child.resolve(".git"));
        var command = WorkspaceService.dockerCommand("fixture", child, "local:test");
        assertTrue(command.contains("GIT_COMMON_DIR=/codex-git"));
        assertTrue(
                command.stream()
                        .anyMatch(value -> value.startsWith("GIT_DIR=/codex-git/worktrees/")));
        assertTrue(command.contains("GIT_WORK_TREE=/workspace"));
        assertEquals(pointer, Files.readString(child.resolve(".git")));
    }

    private Path root;
    private Path repository;
    private WorkspaceService workspaces;
    private CodexProperties properties;

    @BeforeEach
    void setup() throws IOException {
        Path parent = Path.of("target/codex-platform-tests").toAbsolutePath().normalize();
        Files.createDirectories(parent);
        root = Files.createTempDirectory(parent, "workspace-");
        repository = root.resolve("repository");
        Files.createDirectories(repository);
        properties = new CodexProperties(root.resolve("data"), 0, 0, 0, 0, 0, null, null);
        workspaces = new WorkspaceService(new PlatformStore(properties));
    }

    @AfterEach
    void cleanup() throws IOException {
        if (root != null
                && root.toAbsolutePath()
                        .normalize()
                        .startsWith(
                                Path.of("target/codex-platform-tests")
                                        .toAbsolutePath()
                                        .normalize()))
            try (var paths = Files.walk(root)) {
                for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                    if (Files.isRegularFile(path)) path.toFile().setWritable(true);
                    Files.deleteIfExists(path);
                }
            }
    }

    private void git(String... args) {
        var command = new java.util.ArrayList<String>();
        command.add("git");
        command.addAll(List.of(args));
        var result = ProcessCommands.run(repository, command, Duration.ofSeconds(10));
        assertEquals(0, result.exitCode(), result.output());
    }

    private void initialize() throws IOException {
        git("init");
        git("config", "user.name", "Codex isolated test");
        git("config", "user.email", "codex-test@example.invalid");
        Files.writeString(
                repository.resolve("main.txt"), "alpha\nbeta\ngamma\ndelta\nepsilon\nzeta\n");
        Files.writeString(repository.resolve("keep.txt"), "unchanged\n");
        Files.writeString(repository.resolve("deleted.txt"), "delete later\n");
        git("add", ".");
        git("commit", "-m", "isolated fixture");
    }

    private WorkspaceService.WorkspaceInfo create() throws IOException {
        var project = workspaces.register("临时项目", repository.toString(), "worktree");
        return workspaces.create(project.id(), null, null, "host", null);
    }

    @Test
    void dirtyInputIsBaselineAndDeliveryPreservesUnrelatedDirtyFilesAndGitIndex()
            throws IOException {
        initialize();
        Files.writeString(
                repository.resolve("main.txt"), "staged\nbeta\ngamma\ndelta\nepsilon\nzeta\n");
        git("add", "main.txt");
        Files.writeString(
                repository.resolve("main.txt"), "unstaged\nbeta\ngamma\ndelta\nepsilon\nzeta\n");
        Files.writeString(repository.resolve("keep.txt"), "user dirty\n");
        Files.writeString(repository.resolve("new-input.txt"), "untracked input\n");
        Files.delete(repository.resolve("deleted.txt"));
        byte[] index = Files.readAllBytes(repository.resolve(".git/index"));
        var workspace = create();
        assertEquals(
                "untracked input\n", workspaces.read(workspace.id(), "new-input.txt").content());
        assertFalse(Files.exists(workspaces.workspacePath(workspace.id()).resolve("deleted.txt")));
        assertTrue(workspaces.diff(workspace.id()).files().isEmpty());
        var original = workspaces.read(workspace.id(), "main.txt");
        workspaces.write(
                workspace.id(),
                "main.txt",
                original.content().replace("zeta", "agent result"),
                original.hash());
        workspaces.write(workspace.id(), "agent-output.txt", "generated\n", null);
        var diff = workspaces.diff(workspace.id());
        assertEquals(2, diff.files().size());
        assertEquals(
                "applied",
                workspaces
                        .apply(
                                workspace.id(),
                                diff.currentSourceRevision(),
                                diff.resultRevision(),
                                "cas")
                        .status());
        assertEquals("user dirty\n", Files.readString(repository.resolve("keep.txt")));
        assertEquals("untracked input\n", Files.readString(repository.resolve("new-input.txt")));
        assertTrue(
                java.util.Arrays.equals(
                        index, Files.readAllBytes(repository.resolve(".git/index"))));
        assertTrue(Files.readString(repository.resolve("main.txt")).contains("agent result"));
    }

    @Test
    void sourceOrAgentChangeAfterReviewRequiresNewReview() throws IOException {
        initialize();
        var workspace = create();
        var file = workspaces.read(workspace.id(), "main.txt");
        var first = workspaces.write(workspace.id(), "main.txt", "first\n", file.hash());
        var review = workspaces.diff(workspace.id());
        workspaces.write(workspace.id(), "main.txt", "second\n", first.hash());
        var changed =
                assertThrows(
                        BusinessException.class,
                        () ->
                                workspaces.apply(
                                        workspace.id(),
                                        review.currentSourceRevision(),
                                        review.resultRevision(),
                                        "cas"));
        assertEquals("RESULT_CHANGED", changed.getCode());
        var refreshed = workspaces.diff(workspace.id());
        Files.writeString(repository.resolve("keep.txt"), "concurrent edit\n");
        var source =
                assertThrows(
                        BusinessException.class,
                        () ->
                                workspaces.apply(
                                        workspace.id(),
                                        refreshed.currentSourceRevision(),
                                        refreshed.resultRevision(),
                                        "cas"));
        assertEquals("SOURCE_CHANGED", source.getCode());
        assertTrue(Files.readString(repository.resolve("main.txt")).startsWith("alpha"));
    }

    @Test
    void conflictsDoNotWriteAndThreeWayPreservesNonoverlappingEdits() throws IOException {
        initialize();
        var workspace = create();
        var file = workspaces.read(workspace.id(), "main.txt");
        workspaces.write(
                workspace.id(),
                "main.txt",
                file.content().replace("zeta", "agent ending"),
                file.hash());
        Files.writeString(
                repository.resolve("main.txt"), file.content().replace("alpha", "user beginning"));
        var review = workspaces.diff(workspace.id());
        assertEquals(
                "conflict",
                workspaces
                        .apply(
                                workspace.id(),
                                review.currentSourceRevision(),
                                review.resultRevision(),
                                "cas")
                        .status());
        assertEquals(
                "applied",
                workspaces
                        .apply(
                                workspace.id(),
                                review.currentSourceRevision(),
                                review.resultRevision(),
                                "three-way")
                        .status());
        String result = Files.readString(repository.resolve("main.txt"));
        assertTrue(result.contains("user beginning"));
        assertTrue(result.contains("agent ending"));
    }

    @Test
    void overlappingMergeLeavesOriginalUntouched() throws IOException {
        initialize();
        var workspace = create();
        var file = workspaces.read(workspace.id(), "main.txt");
        workspaces.write(
                workspace.id(), "main.txt", file.content().replace("alpha", "agent"), file.hash());
        String original = file.content().replace("alpha", "user");
        Files.writeString(repository.resolve("main.txt"), original);
        var diff = workspaces.diff(workspace.id());
        var result =
                workspaces.apply(
                        workspace.id(),
                        diff.currentSourceRevision(),
                        diff.resultRevision(),
                        "three-way");
        assertEquals("conflict", result.status());
        assertTrue(result.applied().isEmpty());
        assertEquals(original, Files.readString(repository.resolve("main.txt")));
    }

    @Test
    void nonGitRequiresExplicitIsolationAndFileToolsProtectBoundaries() throws IOException {
        Files.writeString(repository.resolve("hello.txt"), "original\n");
        assertEquals(
                "WORKTREE_REQUIRES_GIT",
                assertThrows(
                                BusinessException.class,
                                () -> workspaces.register("非Git", repository.toString(), null))
                        .getCode());
        var project = workspaces.register("非Git", repository.toString(), "isolated-copy");
        var workspace = workspaces.create(project.id(), null, null, "host", null);
        var file = workspaces.read(workspace.id(), "hello.txt");
        assertThrows(
                BusinessException.class,
                () -> workspaces.write(workspace.id(), "hello.txt", "wrong", "wrong-hash"));
        assertThrows(
                BusinessException.class,
                () -> workspaces.write(workspace.id(), "../escape.txt", "escape", null));
        assertThrows(BusinessException.class, () -> workspaces.read(workspace.id(), ".git/config"));
        workspaces.write(workspace.id(), "hello.txt", "changed\n", file.hash());
        assertEquals("original\n", Files.readString(repository.resolve("hello.txt")));
        var diff = workspaces.diff(workspace.id());
        assertEquals(
                "applied",
                workspaces
                        .apply(
                                workspace.id(),
                                diff.currentSourceRevision(),
                                diff.resultRevision(),
                                "cas")
                        .status());
        assertEquals("changed\n", Files.readString(repository.resolve("hello.txt")));
        var reopened = new WorkspaceService(new PlatformStore(properties));
        assertEquals(project.id(), reopened.requireWorkspace(workspace.id()).projectId());
    }
}
