package com.xuya.island.execution;

import com.xuya.island.account.AccountScope;
import com.xuya.island.account.AccountService;
import com.xuya.island.config.XuyaProperties;
import com.xuya.island.studio.service.StudioValidation;
import com.xuya.island.studio.vo.StudioViews;
import jakarta.annotation.PreDestroy;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/** 每账户独立原生运行。HTTP仅传请求和结果，用户代码由选定主机Python执行。 */
@Service
public class NativePythonService {
    public record Start(
            String clientId,
            String code,
            List<StudioViews.ProjectFile> files,
            String inputMode,
            List<String> presetInput) {}

    public record Input(int inputId, String value, boolean eof) {}

    private final PythonEnvironmentService environments;
    private final AccountService accounts;
    private final JdbcClient jdbc;
    private final Path root;
    private final com.xuya.island.execution.world.PythonLauncher pythonLauncher;
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final Map<String, Run> live = new ConcurrentHashMap<>();
    private final java.util.concurrent.ExecutorService readers = Executors.newCachedThreadPool();
    private final ScheduledExecutorService monitor = Executors.newSingleThreadScheduledExecutor();

    private static final class Run {
        private final String id;
        private final String owner;
        private final int authVersion;
        private final Path directory;
        private final long start = System.currentTimeMillis();
        private long waitingAt;
        private long waited;
        private long finishedAt;
        private int inputId;
        private String state = "running";
        private String status = "";
        private final StringBuilder output = new StringBuilder();
        private final StringBuilder error = new StringBuilder();
        private boolean truncated;
        private String notice = "";
        private final List<Map<String, Object>> drawings = new ArrayList<>();
        private final List<Map<String, Object>> stage = new ArrayList<>();
        private final List<String> inputs = new ArrayList<>();
        private List<Map<String, String>> files = List.of();
        private List<StudioViews.ProjectFile> sourceFiles = List.of();
        private Process process;
        private AutoCloseable boundary;
        private BufferedWriter writer;

        Run(String id, String owner, int authVersion, Path directory) {
            this.id = id;
            this.owner = owner;
            this.authVersion = authVersion;
            this.directory = directory;
        }
    }

    public NativePythonService(
            PythonEnvironmentService environments,
            AccountService accounts,
            JdbcClient jdbc,
            XuyaProperties properties,
            com.xuya.island.execution.world.PythonLauncher pythonLauncher) {
        this.environments = environments;
        this.accounts = accounts;
        this.jdbc = jdbc;
        this.pythonLauncher = pythonLauncher;
        root = properties.dataDir().toAbsolutePath().normalize().resolve("executions");
        jdbc.sql("UPDATE python_runs SET status='unknown' WHERE status IN ('running','waiting')")
                .update();
        jdbc.sql("SELECT id,owner_id FROM python_runs WHERE status IN ('unknown','completed')")
                .query()
                .listOfRows()
                .forEach(
                        row -> {
                            String owner = row.get("owner_id").toString(),
                                    id = row.get("id").toString();
                            if (owner.matches("[a-zA-Z0-9-]{1,100}")
                                    && id.matches("[a-zA-Z0-9-]{1,100}"))
                                cleanup(root.resolve(owner).resolve(id));
                        });
        monitor.scheduleWithFixedDelay(this::tick, 200, 200, TimeUnit.MILLISECONDS);
    }

    public synchronized Map<String, Object> start(Start request) {
        if (live.size() >= 64)
            live.values().stream()
                    .filter(run -> run.state.equals("completed"))
                    .sorted(Comparator.comparingLong(run -> run.start))
                    .limit(live.size() - 60)
                    .forEach(run -> live.remove(run.id));
        String owner = AccountScope.id();
        if (request == null
                || request.clientId() == null
                || !request.clientId().matches("[a-zA-Z0-9-]{1,100}"))
            throw AccountService.invalid("运行请求标识无效");
        List<StudioViews.ProjectFile> files =
                request.files() == null || request.files().isEmpty()
                        ? List.of(new StudioViews.ProjectFile("main.py", request.code()))
                        : request.files();
        files = StudioValidation.files(files);
        if (!List.of("live", "preset").contains(request.inputMode()))
            throw AccountService.invalid("输入模式无效");
        List<String> preset = request.presetInput() == null ? List.of() : request.presetInput();
        if (preset.size() > 50
                || preset.stream().anyMatch(value -> value == null || value.length() > 4096))
            throw AccountService.invalid("固定输入超过限制");
        String hash =
                digest(
                        com.xuya.island.common.CanonicalJson.bytes(
                                Map.of(
                                        "files",
                                        files,
                                        "mode",
                                        request.inputMode(),
                                        "inputs",
                                        preset)));
        var prior =
                jdbc.sql(
                                "SELECT id,payload_hash FROM python_runs WHERE owner_id=:owner AND client_id=:client")
                        .param("owner", owner)
                        .param("client", request.clientId())
                        .query(
                                (rs, row) ->
                                        Map.of(
                                                "id",
                                                rs.getString("id"),
                                                "hash",
                                                rs.getString("payload_hash")))
                        .optional();
        if (prior.isPresent()) {
            if (!hash.equals(prior.get().get("hash")))
                throw AccountService.conflict("同一运行请求不能改成另一份代码");
            return snapshot(prior.get().get("id"));
        }
        long active = live.values().stream().filter(run -> !run.state.equals("completed")).count();
        if (active >= 4
                || live.values().stream()
                        .anyMatch(run -> run.owner.equals(owner) && !run.state.equals("completed")))
            throw AccountService.conflict("已有代码正在运行，请先完成输入或停止后再试");
        Path executable = environments.executable();
        String id = UUID.randomUUID().toString();
        Run run = new Run(id, owner, accounts.authVersion(owner), root.resolve(owner).resolve(id));
        run.sourceFiles = files;
        try {
            Files.createDirectories(run.directory);
            for (var file : files) {
                Path path = run.directory.resolve(file.path());
                Files.createDirectories(path.getParent());
                Files.writeString(path, file.content(), StandardCharsets.UTF_8);
            }
            Path helperDirectory = root.resolve("runtime");
            Files.createDirectories(helperDirectory);
            Path helper = helperDirectory.resolve("runner.py");
            try (var resource = new ClassPathResource("python/runner.py").getInputStream()) {
                Files.write(helper, resource.readAllBytes());
            }
            var launched = pythonLauncher.launch(executable, helper, run.directory);
            run.process = launched.process();
            run.boundary = launched.boundary();
            run.writer =
                    new BufferedWriter(
                            new OutputStreamWriter(
                                    run.process.getOutputStream(), StandardCharsets.UTF_8));
            live.put(id, run);
            jdbc.sql(
                            "INSERT INTO python_runs VALUES(:id,:owner,:client,:hash,:python,'running',:snapshot,:now,:now)")
                    .param("id", id)
                    .param("owner", owner)
                    .param("client", request.clientId())
                    .param("hash", hash)
                    .param("python", executable.toString())
                    .param("snapshot", mapper.writeValueAsString(view(run)))
                    .param("now", Instant.now().toString())
                    .update();
            run.writer.write(
                    mapper.writeValueAsString(
                            Map.of(
                                    "directory",
                                    run.directory.toString(),
                                    "inputMode",
                                    request.inputMode(),
                                    "presetInput",
                                    preset)));
            run.writer.newLine();
            run.writer.flush();
            readers.submit(() -> consume(run, false));
            readers.submit(() -> consume(run, true));
            return view(run);
        } catch (java.io.IOException | RuntimeException exception) {
            kill(run);
            cleanup(run.directory);
            live.remove(id);
            throw AccountService.conflict("Python没有成功启动，请管理员检查所选环境和主机运行权限");
        }
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> snapshot(String id) {
        Run run = live.get(id);
        if (run != null && run.owner.equals(AccountScope.id())) return view(run);
        return jdbc.sql("SELECT status,snapshot FROM python_runs WHERE id=:id AND owner_id=:owner")
                .param("id", id)
                .param("owner", AccountScope.id())
                .query(
                        (rs, row) -> {
                            Map<String, Object> value =
                                    new LinkedHashMap<>(
                                            mapper.readValue(rs.getString("snapshot"), Map.class));
                            if (rs.getString("status").equals("unknown")) {
                                value.put("state", "unknown");
                                value.put("notice", "主机曾中断，效果未知；不会自动重新运行，请先检查作品和文件");
                            }
                            return value;
                        })
                .optional()
                .orElseThrow(() -> AccountService.missing("没有找到你的这次运行"));
    }

    public Map<String, Object> input(String id, Input input) {
        Run run = owned(id);
        synchronized (run) {
            if (!run.state.equals("waiting") || input.inputId() != run.inputId)
                throw AccountService.conflict("这次输入已经变化，请刷新运行状态");
            if (input.value() == null || input.value().length() > 4096)
                throw AccountService.invalid("输入最多4096字符");
            try {
                run.writer.write(
                        mapper.writeValueAsString(
                                Map.of("value", input.value(), "eof", input.eof())));
                run.writer.newLine();
                run.writer.flush();
                run.waited += System.currentTimeMillis() - run.waitingAt;
                run.waitingAt = 0;
                run.state = "running";
            } catch (java.io.IOException exception) {
                finish(run, "error", "输入连接已结束");
            }
            return view(run);
        }
    }

    public Map<String, Object> stop(String id) {
        Run run = owned(id);
        finish(run, "stopped", "你停止了这次运行");
        return view(run);
    }

    public void stopOwner(String owner) {
        live.values().stream()
                .filter(run -> run.owner.equals(owner))
                .forEach(run -> finish(run, "stopped", "账户已退出或权限已变化"));
    }

    private Run owned(String id) {
        Run run = live.get(id);
        if (run == null || !run.owner.equals(AccountScope.id()))
            throw AccountService.missing("没有找到你的活动运行");
        return run;
    }

    private void consume(Run run, boolean stderr) {
        try (var reader =
                new InputStreamReader(
                        stderr ? run.process.getErrorStream() : run.process.getInputStream(),
                        StandardCharsets.UTF_8)) {
            StringBuilder line = new StringBuilder();
            int character;
            while ((character = reader.read()) != -1) {
                if (character == '\n') {
                    accept(run, line.toString(), stderr);
                    line.setLength(0);
                } else if (line.length() < 32768) line.append((char) character);
                else {
                    finish(run, "error", "输出协议超过限制");
                    return;
                }
            }
            if (!line.isEmpty()) accept(run, line.toString(), stderr);
            if (!stderr) {
                run.process.waitFor();
                finish(
                        run,
                        run.process.exitValue() == 0 ? "success" : "error",
                        run.process.exitValue() == 0 ? "" : "Python进程退出；可能是内存限制或环境错误");
            }
        } catch (java.io.IOException exception) {
            finish(run, "error", "Python运行连接已结束");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            finish(run, "stopped", "运行已中断");
        }
    }

    @SuppressWarnings("unchecked")
    private void accept(Run run, String line, boolean stderr) {
        synchronized (run) {
            if (run.state.equals("completed")) return;
            if (stderr) {
                append(run, run.error, line + "\n");
                return;
            }
            try {
                Map<String, Object> event = mapper.readValue(line, Map.class);
                switch (String.valueOf(event.get("type"))) {
                    case "output" -> append(run, run.output, String.valueOf(event.get("text")));
                    case "error" -> append(run, run.error, String.valueOf(event.get("text")));
                    case "drawing" -> {
                        if (run.drawings.size() < 5000)
                            run.drawings.add((Map<String, Object>) event.get("event"));
                        else finish(run, "error", "画笔动作超过限制");
                    }
                    case "stage" -> {
                        if (run.stage.size() < 5000
                                && StageProjection.safe((Map<String, Object>) event.get("event")))
                            run.stage.add((Map<String, Object>) event.get("event"));
                        else finish(run, "error", "舞台动作超过限制");
                    }
                    case "input-needed" -> {
                        run.state = "waiting";
                        run.inputId = ((Number) event.get("inputId")).intValue();
                        run.waitingAt = System.currentTimeMillis();
                    }
                    case "input-used" -> {
                        if (run.inputs.size() < 50)
                            run.inputs.add(String.valueOf(event.get("value")));
                    }
                    case "finished" -> run.status = String.valueOf(event.get("status"));
                    default -> {}
                }
            } catch (RuntimeException exception) {
                append(run, run.output, line + "\n");
            }
        }
    }

    private void append(Run run, StringBuilder target, String text) {
        int remaining = 20000 - target.length();
        if (remaining > 0) target.append(text, 0, Math.min(remaining, text.length()));
        if (text.length() > remaining) run.truncated = true;
    }

    private synchronized void tick() {
        long now = System.currentTimeMillis();
        for (Run run : live.values()) {
            synchronized (run) {
                if (run.state.equals("completed")) {
                    if (now - run.start > 600000) live.remove(run.id);
                    continue;
                }
                long waiting = run.waitingAt == 0 ? 0 : now - run.waitingAt;
                if (now - run.start > 900000
                        || waiting > 300000
                        || now - run.start - run.waited - waiting > 10000)
                    finish(run, "timeout", "运行或输入等待超过时间限制");
                else if (accounts.authVersion(run.owner) != run.authVersion
                        || !accounts.user(run.owner).enabled()
                        || !(accounts.permissions(run.owner).contains("*")
                                || accounts.permissions(run.owner).contains("execution:run")))
                    finish(run, "stopped", "账户权限已变化");
            }
        }
    }

    private void finish(Run run, String status, String reason) {
        synchronized (run) {
            if (run.state.equals("completed")) return;
            run.state = "completed";
            run.finishedAt = System.currentTimeMillis();
            if (run.waitingAt != 0) {
                run.waited += run.finishedAt - run.waitingAt;
                run.waitingAt = 0;
            }
            run.status = run.status.isBlank() ? status : run.status;
            if (!status.equals("success") && !status.equals("error")) run.status = status;
            if (!reason.isBlank() && run.error.isEmpty()) append(run, run.error, reason);
            kill(run);
            run.files = collect(run);
            cleanup(run.directory);
            jdbc.sql(
                            "UPDATE python_runs SET status='completed',snapshot=:value,updated_at=:now WHERE id=:id")
                    .param("value", mapper.writeValueAsString(view(run)))
                    .param("now", Instant.now().toString())
                    .param("id", run.id)
                    .update();
        }
    }

    private Map<String, Object> view(Run run) {
        synchronized (run) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("runId", run.id);
            result.put("status", run.status.isBlank() ? "success" : run.status);
            result.put("output", run.output.toString());
            result.put("error", run.error.toString());
            long waiting = run.waitingAt == 0 ? 0 : System.currentTimeMillis() - run.waitingAt;
            result.put(
                    "durationMs",
                    Math.max(
                            0,
                            Math.min(
                                    600000,
                                    (run.finishedAt == 0
                                                    ? System.currentTimeMillis()
                                                    : run.finishedAt)
                                            - run.start
                                            - run.waited
                                            - waiting)));
            result.put("drawings", List.copyOf(run.drawings));
            result.put("stageEvents", List.copyOf(run.stage));
            result.put("stageState", StageProjection.replay(run.stage));
            result.put("inputs", List.copyOf(run.inputs));
            result.put("files", run.files);
            result.put("outputTruncated", run.truncated);
            return Map.of(
                    "id",
                    run.id,
                    "state",
                    run.state,
                    "inputId",
                    run.inputId,
                    "result",
                    result,
                    "sourceFiles",
                    run.sourceFiles,
                    "notice",
                    run.truncated ? "输出达到长度上限，已保留前面的内容。" : run.notice);
        }
    }

    public StudioViews.RunResult verifiedResult(String id, List<StudioViews.ProjectFile> files) {
        Map<String, Object> value = snapshot(id);
        if (!"completed".equals(value.get("state")))
            throw AccountService.conflict("运行尚未完成，不能保存为已验证结果");
        var actual =
                mapper.convertValue(
                        value.get("sourceFiles"),
                        new tools.jackson.core.type.TypeReference<
                                List<StudioViews.ProjectFile>>() {});
        if (!actual.equals(files)) throw AccountService.conflict("运行的文件和记录代码不一致，请重新运行后保存");
        return canonicalResult(value);
    }

    public StudioViews.RunResult verifiedMainResult(String id, String code) {
        Map<String, Object> value = snapshot(id);
        if (!"completed".equals(value.get("state"))) throw AccountService.conflict("运行尚未完成");
        var files =
                mapper.convertValue(
                        value.get("sourceFiles"),
                        new tools.jackson.core.type.TypeReference<
                                List<StudioViews.ProjectFile>>() {});
        if (files.stream()
                .noneMatch(file -> file.path().equals("main.py") && file.content().equals(code)))
            throw AccountService.conflict("记录的代码与实际执行代码不一致");
        return canonicalResult(value);
    }

    @SuppressWarnings("unchecked")
    private StudioViews.RunResult canonicalResult(Map<String, Object> value) {
        Map<String, Object> result =
                new LinkedHashMap<>(mapper.convertValue(value.get("result"), Map.class));
        result.remove("outputTruncated");
        return mapper.convertValue(result, StudioViews.RunResult.class);
    }

    private List<Map<String, String>> collect(Run run) {
        Path directory = run.directory;
        var result = new ArrayList<Map<String, String>>();
        int total = 0;
        try {
            Path allowed = root.toRealPath().resolve(root.relativize(directory));
            if (!directory.toRealPath().equals(allowed)) {
                run.notice = "任务目录已变化，未回收其中的文件。";
                return List.of();
            }
        } catch (java.io.IOException exception) {
            run.notice = "任务目录暂时不可读，已保留运行输出。";
            return List.of();
        }
        try (var paths = Files.walk(directory, 4)) {
            for (Path file :
                    paths.filter(path -> Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS))
                            .limit(65)
                            .sorted()
                            .toList()) {
                String name = directory.relativize(file).toString().replace('\\', '/');
                long length = Files.size(file);
                if (!StudioValidation.safePath(name)
                        || !file.toRealPath().startsWith(directory.toRealPath())
                        || length > 65536
                        || total + length > 524288
                        || result.size() >= 32) {
                    run.notice = "部分文件未回收：仅收集任务目录内四层以内的UTF-8文本，每个64 KiB、最多32个、合计512 KiB。";
                    continue;
                }
                try {
                    String content = Files.readString(file, StandardCharsets.UTF_8);
                    result.add(Map.of("name", name, "content", content));
                    total += length;
                } catch (java.nio.charset.MalformedInputException ignored) {
                    run.notice = "已保留文本文件；二进制文件不在课堂文本回收范围。";
                }
            }
        } catch (java.io.IOException ignored) {
            run.notice = "部分文件暂时不可读，已保留能回收的文本和运行输出。";
        }
        return List.copyOf(result);
    }

    private void kill(Run run) {
        // Windows的Job终止是异步的；先记录子进程，再等待退出，避免完成回执后仍占用解释器。
        List<ProcessHandle> descendants =
                run.process == null ? List.of() : run.process.descendants().limit(256).toList();
        if (run.boundary != null) {
            try {
                run.boundary.close();
            } catch (Exception ignored) {
                /* 内存与回收边界已随进程销毁；句柄释放失败不影响后续强制停止。 */
            }
        }
        if (run.process != null) {
            descendants.forEach(ProcessHandle::destroyForcibly);
            if (run.process.isAlive()) run.process.destroyForcibly();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            awaitTermination(run.process.toHandle(), deadline);
            for (ProcessHandle child : descendants) awaitTermination(child, deadline);
        }
    }

    private void awaitTermination(ProcessHandle process, long deadline) {
        long remaining = deadline - System.nanoTime();
        if (!process.isAlive() || remaining <= 0) return;
        try {
            process.onExit().get(remaining, TimeUnit.NANOSECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        } catch (java.util.concurrent.ExecutionException
                | java.util.concurrent.TimeoutException ignored) {
            /* 已请求强制停止；句柄未及时释放时保留已知目录，由下次启动维护回收。 */
        }
    }

    private void cleanup(Path directory) {
        if (!directory.toAbsolutePath().normalize().startsWith(root) || directory.equals(root))
            throw new IllegalStateException("运行清理路径越界");
        if (!Files.exists(directory)) return;
        try {
            Path allowed = root.toRealPath().resolve(root.relativize(directory));
            if (!directory.toRealPath().equals(allowed)) {
                Files.deleteIfExists(directory);
                return;
            }
            removeOwnedTree(directory, allowed);
        } catch (java.io.IOException ignored) {
            /* Windows文件句柄延迟释放，下次维护可清理已完成运行目录。 */
        }
    }

    private void removeOwnedTree(Path path, Path allowed) throws java.io.IOException {
        if (Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS)
                && path.toRealPath().startsWith(allowed)
                && !Files.isSymbolicLink(path)) {
            try (var entries = Files.newDirectoryStream(path)) {
                for (Path child : entries) removeOwnedTree(child, allowed);
            }
        }
        Files.deleteIfExists(path);
    }

    private String digest(byte[] value) {
        try {
            return java.util.HexFormat.of()
                    .formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    @PreDestroy
    public void close() {
        monitor.shutdownNow();
        live.values().forEach(run -> finish(run, "stopped", "叙芽岛正在退出"));
        readers.shutdownNow();
    }
}
