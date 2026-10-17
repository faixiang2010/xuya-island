package com.xuya.island.codex.workspace;

import com.xuya.island.common.BusinessException;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** 真实项目注册、Git worktree、输入基线和安全交付；不在用户原项目运行 Agent。 */
@Service
public class WorkspaceService {
    private static final org.slf4j.Logger LOG =
            org.slf4j.LoggerFactory.getLogger(WorkspaceService.class);
    private static final Duration COMMAND_TIMEOUT = Duration.ofSeconds(30);
    private static final long MAX_BASELINE_BYTES = 256L * 1024 * 1024;
    private static final int MAX_TEXT_BYTES = 2 * 1024 * 1024;
    private static final Set<String> COPY_EXCLUDES =
            Set.of(".git", "node_modules", "target", "dist", ".venv", "__pycache__");
    private final PlatformStore store;
    private final Map<String, Object> projectLocks = new ConcurrentHashMap<>();

    public WorkspaceService(PlatformStore store) {
        this.store = store;
    }

    @Schema(name = "CodexProjectInfo")
    public record ProjectInfo(
            String id,
            String name,
            String path,
            String mode,
            boolean git,
            String headRevision,
            String createdAt) {}

    @Schema(name = "CodexWorkspaceInfo")
    public record WorkspaceInfo(
            String id,
            String projectId,
            String path,
            String mode,
            String environment,
            String containerId,
            String dockerImage,
            String sourceRevision,
            String createdAt,
            String status) {}

    @Schema(name = "CodexExecutionEnvironment")
    public record ExecutionEnvironment(
            String kind, Path hostPath, String containerId, String directory) {}

    @Schema(name = "CodexWorkspaceEntry")
    public record Entry(String path, String name, boolean directory, long size, String hash) {}

    @Schema(name = "CodexWorkspaceTree")
    public record TreeView(String path, List<Entry> entries) {}

    @Schema(name = "CodexWorkspaceFile")
    public record FileView(String path, String content, String hash, long size) {}

    @Schema(name = "CodexWorkspaceDiffFile")
    public record DiffFile(
            String path,
            String status,
            boolean binary,
            String beforeHash,
            String afterHash,
            String before,
            String after,
            String patch) {}

    @Schema(name = "CodexWorkspaceDiff")
    public record DiffView(
            String workspaceId,
            String sourceRevision,
            String currentSourceRevision,
            String resultRevision,
            List<DiffFile> files) {}

    @Schema(name = "CodexWorkspaceConflict")
    public record Conflict(String path, String reason, String mergedContent) {}

    @Schema(name = "CodexWorkspaceApplyResult")
    public record ApplyResult(
            String status, List<String> applied, List<Conflict> conflicts, String sourceRevision) {}

    public List<ProjectInfo> projects() throws IOException {
        return store.list("projects", ProjectInfo.class);
    }

    public ProjectInfo project(String id) throws IOException {
        ProjectInfo project = store.read("projects", id, ProjectInfo.class);
        if (project == null) throw error("PROJECT_NOT_FOUND", "项目不存在", HttpStatus.NOT_FOUND);
        return project;
    }

    public ProjectInfo register(String name, String source, String requestedMode)
            throws IOException {
        Path path = Path.of(source).toAbsolutePath().normalize();
        if (!Files.isDirectory(path) || Files.isSymbolicLink(path))
            throw error("PROJECT_PATH_INVALID", "请选择真实项目目录", HttpStatus.BAD_REQUEST);
        path = path.toRealPath();
        boolean git = isGit(path);
        if (path.startsWith(store.root()) || (!git && store.root().startsWith(path)))
            throw error(
                    "PROJECT_PATH_INVALID", "不能注册平台数据目录或包含平台数据的非 Git 父目录", HttpStatus.BAD_REQUEST);
        String mode = mode(requestedMode);
        if (mode.equals("worktree") && !git)
            throw error(
                    "WORKTREE_REQUIRES_GIT",
                    "该目录不是 Git 项目，请明确选择 isolated-copy 创建隔离副本",
                    HttpStatus.BAD_REQUEST);
        if (git) {
            String root = git(path, List.of("rev-parse", "--show-toplevel")).output().trim();
            if (!Path.of(root).toRealPath().equals(path))
                throw error("PROJECT_ROOT_REQUIRED", "请注册 Git 仓库根目录", HttpStatus.BAD_REQUEST);
        }
        ProjectInfo result =
                new ProjectInfo(
                        UUID.randomUUID().toString(),
                        name.strip(),
                        path.toString(),
                        mode,
                        git,
                        git ? git(path, List.of("rev-parse", "HEAD")).output().trim() : "",
                        Instant.now().toString());
        store.save("projects", result.id(), result);
        LOG.info("Project registered project={} git={} mode={}", result.id(), git, mode);
        return result;
    }

    public List<WorkspaceInfo> workspaces(String projectId) throws IOException {
        project(projectId);
        return store.list("workspaces", WorkspaceInfo.class).stream()
                .filter(workspace -> workspace.projectId().equals(projectId))
                .toList();
    }

    public WorkspaceInfo requireWorkspace(String id) throws IOException {
        WorkspaceInfo workspace = store.read("workspaces", id, WorkspaceInfo.class);
        if (workspace == null) throw error("WORKSPACE_NOT_FOUND", "工作区不存在", HttpStatus.NOT_FOUND);
        if (!workspace.status().equals("ready"))
            throw error("WORKSPACE_NOT_READY", "工作区未就绪", HttpStatus.CONFLICT);
        if (!Files.isDirectory(Path.of(workspace.path())))
            throw error("WORKSPACE_MISSING", "工作区文件目录已不存在", HttpStatus.CONFLICT);
        return workspace;
    }

    public Path workspacePath(String id) throws IOException {
        return Path.of(requireWorkspace(id).path());
    }

    /** 独立聊天的执行目录；不注册虚构项目，也不继承任何用户工程。 */
    public synchronized WorkspaceInfo createScratch() throws IOException {
        String id = UUID.randomUUID().toString();
        Path directory = area(id).resolve("code");
        Files.createDirectories(directory);
        Files.createDirectories(area(id).resolve("baseline"));
        store.save("baseline-manifests", id, Map.of());
        WorkspaceInfo workspace =
                new WorkspaceInfo(
                        id,
                        "",
                        directory.toString(),
                        "scratch",
                        "host",
                        "",
                        "",
                        revision(Map.of()),
                        Instant.now().toString(),
                        "ready");
        store.save("workspaces", id, workspace);
        LOG.info("Independent workspace created workspace={} environment=host", id);
        return workspace;
    }

    public WorkspaceInfo create(
            String projectId,
            String requestedMode,
            String baseRef,
            String environment,
            String image)
            throws IOException {
        ProjectInfo project = project(projectId);
        synchronized (projectLocks.computeIfAbsent(projectId, ignored -> new Object())) {
            String mode = mode(requestedMode == null ? project.mode() : requestedMode);
            if (mode.equals("worktree") && !project.git())
                throw error(
                        "WORKTREE_REQUIRES_GIT",
                        "非 Git 项目需明确选择 isolated-copy",
                        HttpStatus.BAD_REQUEST);
            if (!Set.of("host", "docker").contains(environment))
                throw error("ENVIRONMENT_INVALID", "执行环境必须是 host 或 docker", HttpStatus.BAD_REQUEST);
            if (environment.equals("docker")) checkDocker(image);
            String id = UUID.randomUUID().toString();
            Path source = Path.of(project.path());
            Path area = store.root().resolve("workspace-data").resolve(id);
            Path target = area.resolve("code");
            Path sourceBaseline = area.resolve("source-baseline");
            try {
                Map<String, String> sourceManifest =
                        snapshot(source, sourceBaseline, project.git());
                String ref = baseRef == null || baseRef.isBlank() ? "HEAD" : baseRef;
                if (ref.startsWith("-")
                        || ref.length() > 200
                        || ref.contains("\n")
                        || ref.contains("\r"))
                    throw error("BASE_REF_INVALID", "无效 Git 基线引用", HttpStatus.BAD_REQUEST);
                if (mode.equals("worktree")) {
                    String resolved =
                            git(source, List.of("rev-parse", "--verify", ref + "^{commit}"))
                                    .output()
                                    .trim();
                    git(
                            source,
                            List.of(
                                    "worktree",
                                    "add",
                                    "-b",
                                    "codex/" + id,
                                    target.toString(),
                                    resolved));
                    // 默认 HEAD 基线包含 staged、unstaged 和未忽略的 untracked 文件，不提交用户脏文件。
                    if (ref.equals("HEAD")
                            || resolved.equals(
                                    git(source, List.of("rev-parse", "HEAD")).output().trim())) {
                        replaceCode(target, sourceBaseline, sourceManifest);
                    } else {
                        ProcessCommands.Result patch =
                                git(source, List.of("diff", "--binary", "HEAD"));
                        if (!patch.output().isBlank()) {
                            ProcessCommands.Result applied =
                                    ProcessCommands.run(
                                            target,
                                            List.of("git", "apply", "--binary", "-"),
                                            COMMAND_TIMEOUT,
                                            patch.output().getBytes(StandardCharsets.UTF_8),
                                            null);
                            if (applied.exitCode() != 0)
                                throw error(
                                        "DIRTY_PATCH_CONFLICT",
                                        "当前脏文件无法应用到所选分支；已保留隔离工作区供检查",
                                        HttpStatus.CONFLICT);
                        }
                        for (String file : untracked(source))
                            copyIfPresent(sourceBaseline, target, file);
                    }
                } else {
                    Files.createDirectories(target);
                    for (String file : sourceManifest.keySet())
                        copyIfPresent(sourceBaseline, target, file);
                }
                Map<String, String> baseline =
                        snapshot(target, area.resolve("baseline"), mode.equals("worktree"));
                store.save("source-manifests", id, sourceManifest);
                store.save("baseline-manifests", id, baseline);
                String container =
                        environment.equals("docker") ? createContainer(id, target, image) : null;
                WorkspaceInfo workspace =
                        new WorkspaceInfo(
                                id,
                                projectId,
                                target.toString(),
                                mode,
                                environment,
                                container,
                                image,
                                revision(sourceManifest),
                                Instant.now().toString(),
                                "ready");
                store.save("workspaces", id, workspace);
                LOG.info(
                        "Workspace created workspace={} project={} mode={} environment={} baselineFiles={}",
                        id,
                        projectId,
                        mode,
                        environment,
                        baseline.size());
                return workspace;
            } catch (IOException | RuntimeException exception) {
                LOG.error(
                        "Workspace creation failed workspace={} project={} environment={} errorType={}",
                        id,
                        projectId,
                        environment,
                        exception.getClass().getSimpleName());
                store.save(
                        "workspaces",
                        id,
                        new WorkspaceInfo(
                                id,
                                projectId,
                                target.toString(),
                                mode,
                                environment,
                                null,
                                image,
                                "",
                                Instant.now().toString(),
                                "failed"));
                throw exception;
            }
        }
    }

    public ExecutionEnvironment execution(String id) throws IOException {
        WorkspaceInfo workspace = requireWorkspace(id);
        if (workspace.environment().equals("docker")) {
            ProcessCommands.Result state =
                    ProcessCommands.run(
                            store.root(),
                            List.of(
                                    "docker",
                                    "inspect",
                                    "--format",
                                    "{{.State.Running}}",
                                    workspace.containerId()),
                            COMMAND_TIMEOUT);
            if (state.exitCode() != 0 || !state.output().trim().equals("true"))
                throw error(
                        "DOCKER_UNAVAILABLE",
                        "工作区容器未运行，操作已停止；不会改为本机执行",
                        HttpStatus.SERVICE_UNAVAILABLE);
            return new ExecutionEnvironment(
                    "docker", Path.of(workspace.path()), workspace.containerId(), "/workspace");
        }
        return new ExecutionEnvironment("host", Path.of(workspace.path()), null, workspace.path());
    }

    public TreeView tree(String id, String relative) throws IOException {
        Path root = workspacePath(id);
        Path directory = resolve(root, relative, false);
        if (!Files.isDirectory(directory))
            throw error("DIRECTORY_NOT_FOUND", "目录不存在", HttpStatus.NOT_FOUND);
        List<Entry> entries = new ArrayList<>();
        try (var paths = Files.list(directory)) {
            for (Path path :
                    paths.filter(item -> !item.getFileName().toString().equals(".git"))
                            .sorted(Comparator.comparing(item -> item.getFileName().toString()))
                            .limit(2000)
                            .toList()) {
                if (Files.isSymbolicLink(path)) continue;
                boolean folder = Files.isDirectory(path);
                entries.add(
                        new Entry(
                                unix(root.relativize(path)),
                                path.getFileName().toString(),
                                folder,
                                folder ? 0 : Files.size(path),
                                null));
            }
        }
        return new TreeView(relative == null ? "" : relative, List.copyOf(entries));
    }

    public FileView read(String id, String relative) throws IOException {
        Path file = resolve(workspacePath(id), relative, false);
        if (!Files.isRegularFile(file))
            throw error("FILE_NOT_FOUND", "文件不存在", HttpStatus.NOT_FOUND);
        if (Files.size(file) > MAX_TEXT_BYTES)
            throw error("FILE_TOO_LARGE", "请通过产物下载接口读取大文件", HttpStatus.PAYLOAD_TOO_LARGE);
        byte[] bytes = Files.readAllBytes(file);
        String content = text(bytes);
        if (content == null)
            throw error("BINARY_FILE", "该文件不能作为 UTF-8 文本编辑", HttpStatus.BAD_REQUEST);
        return new FileView(relative, content, hash(bytes), bytes.length);
    }

    public synchronized FileView write(
            String id, String relative, String content, String expectedHash) throws IOException {
        if (relative == null || relative.isBlank())
            throw error("FILE_PATH_REQUIRED", "写入文件必须提供相对文件路径", HttpStatus.BAD_REQUEST);
        Path file = resolve(workspacePath(id), relative, true);
        if (Files.isDirectory(file))
            throw error("FILE_IS_DIRECTORY", "目标是目录，不能作为文件替换", HttpStatus.BAD_REQUEST);
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_TEXT_BYTES)
            throw error("FILE_TOO_LARGE", "文本文件超过限制", HttpStatus.PAYLOAD_TOO_LARGE);
        String current = Files.exists(file) ? hash(Files.readAllBytes(file)) : null;
        if (!java.util.Objects.equals(current, expectedHash))
            throw error("FILE_CHANGED", "文件已变化，请重新读取后编辑", HttpStatus.CONFLICT);
        atomicWrite(file, bytes);
        return new FileView(relative, content, hash(bytes), bytes.length);
    }

    public DiffView diff(String id) throws IOException {
        WorkspaceInfo workspace = requireWorkspace(id);
        Map<String, String> baseline = manifest("baseline-manifests", id);
        Map<String, String> result =
                manifestOf(Path.of(workspace.path()), workspace.mode().equals("worktree"));
        Map<String, String> currentSource =
                workspace.projectId().isBlank()
                        ? baseline
                        : manifestOf(
                                Path.of(project(workspace.projectId()).path()),
                                project(workspace.projectId()).git());
        List<DiffFile> files = new ArrayList<>();
        Set<String> paths = new TreeSet<>(baseline.keySet());
        paths.addAll(result.keySet());
        Path baselineRoot = area(id).resolve("baseline");
        for (String path : paths) {
            if (java.util.Objects.equals(baseline.get(path), result.get(path))) continue;
            byte[] beforeBytes =
                    baseline.containsKey(path)
                            ? Files.readAllBytes(resolve(baselineRoot, path, false))
                            : new byte[0];
            byte[] afterBytes =
                    result.containsKey(path)
                            ? Files.readAllBytes(resolve(Path.of(workspace.path()), path, false))
                            : new byte[0];
            String before = beforeBytes.length <= MAX_TEXT_BYTES ? text(beforeBytes) : null;
            String after = afterBytes.length <= MAX_TEXT_BYTES ? text(afterBytes) : null;
            boolean binary = before == null || after == null;
            String status =
                    !baseline.containsKey(path)
                            ? "added"
                            : !result.containsKey(path) ? "deleted" : "modified";
            files.add(
                    new DiffFile(
                            path,
                            status,
                            binary,
                            baseline.get(path),
                            result.get(path),
                            before,
                            after,
                            binary ? "" : patch(path, before, after)));
        }
        return new DiffView(
                id,
                workspace.sourceRevision(),
                revision(currentSource),
                revision(result),
                List.copyOf(files));
    }

    public synchronized ApplyResult apply(
            String id, String expectedSourceRevision, String resultRevision, String strategy)
            throws IOException {
        WorkspaceInfo workspace = requireWorkspace(id);
        if (workspace.projectId().isBlank())
            throw error(
                    "SOURCE_PROJECT_REQUIRED", "独立会话没有源项目，请下载产物或在项目中开始编码任务", HttpStatus.CONFLICT);
        ProjectInfo project = project(workspace.projectId());
        if (!Set.of("cas", "three-way").contains(strategy))
            throw error("APPLY_STRATEGY_INVALID", "请选择 cas 或 three-way", HttpStatus.BAD_REQUEST);
        synchronized (projectLocks.computeIfAbsent(project.id(), ignored -> new Object())) {
            DiffView diff = diff(id);
            if (!diff.resultRevision().equals(resultRevision))
                throw error("RESULT_CHANGED", "Agent 结果在审阅后发生变化，请刷新差异再交付", HttpStatus.CONFLICT);
            if (!diff.currentSourceRevision().equals(expectedSourceRevision))
                throw error("SOURCE_CHANGED", "原项目在审阅后发生变化，请刷新差异", HttpStatus.CONFLICT);
            Map<String, String> sourceBaseline = manifest("source-manifests", id);
            Path source = Path.of(project.path());
            List<Conflict> conflicts = new ArrayList<>();
            Map<String, byte[]> proposed = new LinkedHashMap<>();
            Map<String, String> expected = new LinkedHashMap<>();
            for (DiffFile change : diff.files()) {
                Path destination = resolve(source, change.path(), true);
                byte[] current = Files.exists(destination) ? Files.readAllBytes(destination) : null;
                byte[] incoming =
                        change.status().equals("deleted")
                                ? null
                                : Files.readAllBytes(
                                        resolve(Path.of(workspace.path()), change.path(), false));
                if (!java.util.Objects.equals(
                        incoming == null ? null : hash(incoming), change.afterHash()))
                    throw error("RESULT_CHANGED", "工作区在准备交付时发生变化，请刷新差异", HttpStatus.CONFLICT);
                String currentHash = current == null ? null : hash(current);
                expected.put(change.path(), currentHash);
                if (java.util.Objects.equals(currentHash, sourceBaseline.get(change.path()))) {
                    proposed.put(change.path(), incoming);
                } else if (strategy.equals("three-way")
                        && current != null
                        && incoming != null
                        && sourceBaseline.containsKey(change.path())
                        && text(current) != null
                        && text(incoming) != null) {
                    byte[] base =
                            Files.readAllBytes(
                                    resolve(
                                            area(id).resolve("source-baseline"),
                                            change.path(),
                                            false));
                    byte[] merged = merge(id, change.path(), current, base, incoming, conflicts);
                    if (merged != null) proposed.put(change.path(), merged);
                } else {
                    conflicts.add(new Conflict(change.path(), "原项目内容已偏离输入基线，未覆盖", null));
                }
            }
            if (!conflicts.isEmpty())
                return new ApplyResult(
                        "conflict",
                        List.of(),
                        List.copyOf(conflicts),
                        diff.currentSourceRevision());
            if (!revision(
                            manifestOf(
                                    Path.of(workspace.path()), workspace.mode().equals("worktree")))
                    .equals(resultRevision))
                throw error("RESULT_CHANGED", "工作区在准备交付时发生变化，请刷新差异", HttpStatus.CONFLICT);
            // 所有冲突先检查；备份保留审阅和恢复证据，外部编辑造成的冲突不会被盲目覆盖。
            Path backup = area(id).resolve("deliveries").resolve(UUID.randomUUID().toString());
            List<String> applied = new ArrayList<>();
            for (var item : proposed.entrySet()) {
                Path target = resolve(source, item.getKey(), true);
                String actual = Files.exists(target) ? hash(Files.readAllBytes(target)) : null;
                if (!java.util.Objects.equals(actual, expected.get(item.getKey()))) {
                    return new ApplyResult(
                            "partial",
                            List.copyOf(applied),
                            List.of(new Conflict(item.getKey(), "写入时检测到外部编辑，已停止后续回写；已有备份", null)),
                            revision(manifestOf(source, project.git())));
                }
                if (Files.exists(target)) {
                    Path saved = resolve(backup, item.getKey(), true);
                    Files.createDirectories(saved.getParent());
                    Files.copy(target, saved, StandardCopyOption.REPLACE_EXISTING);
                }
                if (item.getValue() == null) Files.deleteIfExists(target);
                else atomicWrite(target, item.getValue());
                applied.add(item.getKey());
            }
            ApplyResult receipt =
                    new ApplyResult(
                            "applied",
                            List.copyOf(applied),
                            List.of(),
                            revision(manifestOf(source, project.git())));
            store.save("delivery-receipts", UUID.randomUUID().toString(), receipt);
            LOG.info(
                    "Workspace applied workspace={} project={} strategy={} files={} status={}",
                    id,
                    project.id(),
                    strategy,
                    applied.size(),
                    receipt.status());
            return receipt;
        }
    }

    private byte[] merge(
            String id,
            String relative,
            byte[] current,
            byte[] base,
            byte[] incoming,
            List<Conflict> conflicts)
            throws IOException {
        Path temp = Files.createTempDirectory(area(id), "merge-");
        try {
            Files.write(temp.resolve("current"), current);
            Files.write(temp.resolve("base"), base);
            Files.write(temp.resolve("incoming"), incoming);
            ProcessCommands.Result merged =
                    ProcessCommands.run(
                            temp,
                            List.of("git", "merge-file", "-p", "current", "base", "incoming"),
                            COMMAND_TIMEOUT);
            if (merged.exitCode() == 0 && !merged.truncated())
                return merged.output().getBytes(StandardCharsets.UTF_8);
            conflicts.add(
                    new Conflict(
                            relative,
                            "三方合并存在冲突，原文件未写入",
                            merged.exitCode() == 1 ? merged.output() : null));
            return null;
        } finally {
            for (String name : List.of("current", "base", "incoming"))
                Files.deleteIfExists(temp.resolve(name));
            Files.deleteIfExists(temp);
        }
    }

    private Path area(String id) {
        return store.root().resolve("workspace-data").resolve(id);
    }

    /** 删除会话隔离工作区：先 best-effort 移除 Git worktree 注册，再递归删除目录与元数据。 */
    public synchronized void deleteWorkspace(String id) throws IOException {
        WorkspaceInfo workspace = store.read("workspaces", id, WorkspaceInfo.class);
        if (workspace == null) return;
        if (workspace.mode().equals("worktree") && !workspace.projectId().isBlank()) {
            ProjectInfo project = store.read("projects", workspace.projectId(), ProjectInfo.class);
            if (project != null) {
                try {
                    ProcessCommands.run(
                            Path.of(project.path()),
                            List.of("git", "worktree", "remove", "--force", workspace.path()),
                            COMMAND_TIMEOUT);
                } catch (RuntimeException ignored) {
                    // 目录随后仍会删除；残留的 worktree 注册由 git worktree prune 兜底。
                }
            }
        }
        deleteRecursively(area(id));
        store.delete("workspaces", id);
        store.delete("baseline-manifests", id);
        store.delete("source-manifests", id);
        LOG.info("Workspace removed workspace={}", id);
    }

    private static void deleteRecursively(Path root) throws IOException {
        if (!Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> manifest(String bucket, String id) throws IOException {
        return store.read(bucket, id, Map.class);
    }

    private static String mode(String value) {
        String mode = value == null || value.isBlank() ? "worktree" : value;
        if (!Set.of("worktree", "isolated-copy").contains(mode))
            throw error(
                    "WORKSPACE_MODE_INVALID",
                    "请选择 worktree 或 isolated-copy",
                    HttpStatus.BAD_REQUEST);
        return mode;
    }

    private static Map<String, String> snapshot(Path source, Path target, boolean git)
            throws IOException {
        Map<String, String> manifest = manifestOf(source, git);
        Files.createDirectories(target);
        for (String file : manifest.keySet()) {
            copyIfPresent(source, target, file);
            Path saved = resolve(target, file, false);
            if (!Files.isRegularFile(saved)
                    || !hash(Files.readAllBytes(saved)).equals(manifest.get(file)))
                throw error(
                        "SOURCE_CHANGED_DURING_SNAPSHOT",
                        "项目在复制输入时发生变化，请停止外部编辑后重试",
                        HttpStatus.CONFLICT);
        }
        if (!manifest.equals(manifestOf(source, git)))
            throw error(
                    "SOURCE_CHANGED_DURING_SNAPSHOT", "项目在复制输入时发生变化，请重新创建工作区", HttpStatus.CONFLICT);
        return manifest;
    }

    private static Map<String, String> manifestOf(Path root, boolean git) throws IOException {
        List<String> files;
        if (git) {
            String result =
                    git(root, List.of("ls-files", "-co", "--exclude-standard", "-z")).output();
            files =
                    List.of(result.split("\u0000")).stream()
                            .filter(value -> !value.isBlank())
                            .distinct()
                            .sorted()
                            .toList();
        } else {
            try (var walk = Files.walk(root)) {
                files =
                        walk.filter(path -> Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS))
                                .filter(
                                        path ->
                                                java.util.stream.StreamSupport.stream(
                                                                root.relativize(path).spliterator(),
                                                                false)
                                                        .noneMatch(
                                                                segment ->
                                                                        COPY_EXCLUDES.contains(
                                                                                segment
                                                                                        .toString())))
                                .map(path -> unix(root.relativize(path)))
                                .sorted()
                                .toList();
            }
        }
        Map<String, String> manifest = new TreeMap<>();
        long total = 0;
        for (String relative : files) {
            Path file = resolve(root, relative, false);
            if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) continue;
            total += Files.size(file);
            if (total > MAX_BASELINE_BYTES || manifest.size() >= 20000)
                throw error(
                        "PROJECT_TOO_LARGE",
                        "项目输入超过 256MB 或 20000 文件，请缩小注册范围",
                        HttpStatus.PAYLOAD_TOO_LARGE);
            manifest.put(relative, hash(Files.readAllBytes(file)));
        }
        return Map.copyOf(manifest);
    }

    private static List<String> untracked(Path root) {
        String output =
                git(root, List.of("ls-files", "--others", "--exclude-standard", "-z")).output();
        return List.of(output.split("\u0000")).stream().filter(value -> !value.isBlank()).toList();
    }

    private static void replaceCode(Path root, Path baseline, Map<String, String> sourceManifest)
            throws IOException {
        Map<String, String> existing = manifestOf(root, true);
        for (String relative : existing.keySet())
            if (!sourceManifest.containsKey(relative)) Files.delete(resolve(root, relative, false));
        for (String relative : sourceManifest.keySet()) copyIfPresent(baseline, root, relative);
    }

    private static void copyIfPresent(Path source, Path target, String relative)
            throws IOException {
        Path origin = resolve(source, relative, false);
        if (!Files.isRegularFile(origin, LinkOption.NOFOLLOW_LINKS)) return;
        Path destination = resolve(target, relative, true);
        Files.createDirectories(destination.getParent());
        Files.copy(
                origin,
                destination,
                StandardCopyOption.REPLACE_EXISTING,
                StandardCopyOption.COPY_ATTRIBUTES);
    }

    public static Path resolve(Path root, String relative, boolean create) throws IOException {
        Path normalizedRoot = root.toAbsolutePath().normalize();
        String name = relative == null ? "" : relative;
        Path fragment;
        try {
            fragment = Path.of(name);
        } catch (RuntimeException exception) {
            throw error("PATH_INVALID", "无效路径", HttpStatus.BAD_REQUEST);
        }
        if (fragment.isAbsolute())
            throw error("PATH_OUTSIDE_WORKSPACE", "仅允许工作区相对路径", HttpStatus.BAD_REQUEST);
        Path resolved = normalizedRoot.resolve(fragment).normalize();
        if (!resolved.startsWith(normalizedRoot))
            throw error("PATH_OUTSIDE_WORKSPACE", "路径超出工作区", HttpStatus.BAD_REQUEST);
        for (Path segment : normalizedRoot.relativize(resolved)) {
            if (segment.toString().equalsIgnoreCase(".git"))
                throw error("GIT_METADATA_PROTECTED", "Git 元数据不能由文件工具修改", HttpStatus.FORBIDDEN);
        }
        Path checked = normalizedRoot;
        Path realRoot = Files.exists(normalizedRoot) ? normalizedRoot.toRealPath() : normalizedRoot;
        for (Path segment : normalizedRoot.relativize(resolved)) {
            checked = checked.resolve(segment);
            if (Files.isSymbolicLink(checked))
                throw error("SYMLINK_FORBIDDEN", "不能通过符号链接访问工作区外文件", HttpStatus.FORBIDDEN);
            if (Files.exists(checked) && !checked.toRealPath().startsWith(realRoot))
                throw error("PATH_OUTSIDE_WORKSPACE", "不能通过目录链接访问工作区外文件", HttpStatus.FORBIDDEN);
        }
        if (!create
                && Files.exists(resolved)
                && !resolved.toRealPath().startsWith(normalizedRoot.toRealPath()))
            throw error("PATH_OUTSIDE_WORKSPACE", "路径超出工作区", HttpStatus.FORBIDDEN);
        return resolved;
    }

    public static String hash(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static String revision(Map<String, String> manifest) {
        StringBuilder value = new StringBuilder();
        new TreeMap<>(manifest)
                .forEach(
                        (path, digest) ->
                                value.append(path).append('\0').append(digest).append('\n'));
        return hash(value.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static String text(byte[] bytes) {
        for (byte item : bytes) if (item == 0) return null;
        try {
            return StandardCharsets.UTF_8
                    .newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes))
                    .toString();
        } catch (CharacterCodingException exception) {
            return null;
        }
    }

    private static String patch(String path, String before, String after) {
        List<String> oldLines = before.lines().toList();
        List<String> newLines = after.lines().toList();
        StringBuilder output =
                new StringBuilder(
                        "--- a/"
                                + path
                                + "\n+++ b/"
                                + path
                                + "\n@@ -"
                                + (oldLines.isEmpty() ? 0 : 1)
                                + ","
                                + oldLines.size()
                                + " +"
                                + (newLines.isEmpty() ? 0 : 1)
                                + ","
                                + newLines.size()
                                + " @@\n");
        for (int index = 0; index < oldLines.size(); index++) {
            output.append('-').append(oldLines.get(index)).append('\n');
            if (index == oldLines.size() - 1 && !before.endsWith("\n"))
                output.append("\\ No newline at end of file\n");
        }
        for (int index = 0; index < newLines.size(); index++) {
            output.append('+').append(newLines.get(index)).append('\n');
            if (index == newLines.size() - 1 && !after.endsWith("\n"))
                output.append("\\ No newline at end of file\n");
        }
        return output.toString();
    }

    private static void atomicWrite(Path file, byte[] bytes) throws IOException {
        Files.createDirectories(file.getParent());
        Path temporary = Files.createTempFile(file.getParent(), ".codex-write-", ".tmp");
        try {
            Files.write(temporary, bytes);
            Files.move(
                    temporary,
                    file,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private static boolean isGit(Path root) {
        try {
            var result =
                    ProcessCommands.run(
                            root, List.of("git", "rev-parse", "--show-toplevel"), COMMAND_TIMEOUT);
            return result.exitCode() == 0
                    && Path.of(result.output().trim()).toRealPath().equals(root.toRealPath());
        } catch (BusinessException | IOException exception) {
            return false;
        }
    }

    private static ProcessCommands.Result git(Path root, List<String> arguments) {
        List<String> command = new ArrayList<>();
        command.add("git");
        command.addAll(arguments);
        ProcessCommands.Result result = ProcessCommands.run(root, command, COMMAND_TIMEOUT);
        if (result.exitCode() != 0 || result.truncated())
            throw error("GIT_OPERATION_FAILED", "Git 操作失败；未修改原项目代码", HttpStatus.CONFLICT);
        return result;
    }

    private void checkDocker(String image) throws IOException {
        Files.createDirectories(store.root());
        if (image == null || !image.matches("[a-zA-Z0-9][a-zA-Z0-9._/@:-]{0,200}"))
            throw error("DOCKER_IMAGE_REQUIRED", "Docker 工作区必须选择已安装的明确镜像", HttpStatus.BAD_REQUEST);
        ProcessCommands.Result inspect =
                ProcessCommands.run(
                        store.root(),
                        List.of("docker", "image", "inspect", image),
                        COMMAND_TIMEOUT);
        if (inspect.exitCode() != 0)
            throw error(
                    "DOCKER_IMAGE_UNAVAILABLE",
                    "镜像或 Docker 引擎不可用；不会下载镜像或切换到本机",
                    HttpStatus.SERVICE_UNAVAILABLE);
    }

    private String createContainer(String id, Path target, String image) {
        ProcessCommands.Result result =
                ProcessCommands.run(target, dockerCommand(id, target, image), COMMAND_TIMEOUT);
        if (result.exitCode() != 0)
            throw error(
                    "DOCKER_START_FAILED",
                    "容器无法启动；工作区代码保留，未切换执行位置",
                    HttpStatus.SERVICE_UNAVAILABLE);
        return result.output().trim();
    }

    /** Windows worktree 的 .git 指针不能直接在容器解析，显式挂载原生 Git 元数据。 */
    static List<String> dockerCommand(String id, Path target, String image) {
        var command =
                new ArrayList<>(
                        List.of(
                                "docker",
                                "run",
                                "--detach",
                                "--name",
                                "xuya-codex-" + id,
                                "--label",
                                "com.xuya.codex.workspace=" + id,
                                "--network",
                                "none",
                                "--cap-drop",
                                "ALL",
                                "--security-opt",
                                "no-new-privileges",
                                "--mount",
                                "type=bind,source=" + target + ",target=/workspace",
                                "--workdir",
                                "/workspace"));
        if (isGit(target)) {
            Path common =
                    Path.of(
                                    git(
                                                    target,
                                                    List.of(
                                                            "rev-parse",
                                                            "--path-format=absolute",
                                                            "--git-common-dir"))
                                            .output()
                                            .trim())
                            .toAbsolutePath()
                            .normalize();
            Path metadata =
                    Path.of(git(target, List.of("rev-parse", "--absolute-git-dir")).output().trim())
                            .toAbsolutePath()
                            .normalize();
            if (!metadata.startsWith(common)
                    || common.toString().contains(",")
                    || target.toString().contains(","))
                throw error("DOCKER_GIT_PATH_INVALID", "Git 元数据路径不支持容器挂载", HttpStatus.BAD_REQUEST);
            String relative = unix(common.relativize(metadata));
            command.addAll(
                    List.of(
                            "--mount",
                            "type=bind,source=" + common + ",target=/codex-git",
                            "--env",
                            "GIT_DIR=/codex-git" + (relative.isEmpty() ? "" : "/" + relative),
                            "--env",
                            "GIT_COMMON_DIR=/codex-git",
                            "--env",
                            "GIT_WORK_TREE=/workspace",
                            "--env",
                            "GIT_CONFIG_COUNT=1",
                            "--env",
                            "GIT_CONFIG_KEY_0=safe.directory",
                            "--env",
                            "GIT_CONFIG_VALUE_0=/workspace"));
        }
        command.addAll(List.of(image, "/bin/sh", "-c", "while sleep 3600; do :; done"));
        return List.copyOf(command);
    }

    private static String unix(Path path) {
        return path.toString().replace('\\', '/');
    }

    private static BusinessException error(String code, String message, HttpStatus status) {
        return new BusinessException(code, message, status);
    }
}
