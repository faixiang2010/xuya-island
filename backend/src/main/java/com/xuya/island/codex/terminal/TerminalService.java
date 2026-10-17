package com.xuya.island.codex.terminal;

import com.pty4j.PtyProcess;
import com.pty4j.PtyProcessBuilder;
import com.pty4j.WinSize;
import com.xuya.island.account.AccountScope;
import com.xuya.island.codex.config.CodexProperties;
import com.xuya.island.codex.workspace.PlatformStore;
import com.xuya.island.codex.workspace.ProcessCommands;
import com.xuya.island.codex.workspace.WorkspaceService;
import com.xuya.island.common.BusinessException;
import com.xuya.island.common.NativeCharsets;
import com.xuya.island.execution.world.ExecutionProvider;
import com.xuya.island.execution.world.ExecutionProviderResolver;
import com.xuya.island.execution.world.LaunchPlan;
import com.xuya.island.execution.world.TerminalPlan;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PushbackInputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

/** 本机真实 PTY 与同一 Docker 容器交互终端；断线不销毁，票据短效且只使用一次。 */
@Service
public class TerminalService {
    private static final org.slf4j.Logger LOG =
            org.slf4j.LoggerFactory.getLogger(TerminalService.class);

    /** PTY 输出编码嗅探的首块字节数；一次阻塞读取的实际长度可能更小。 */
    private static final int SNIFF_BYTES = 8192;

    private final WorkspaceService workspaces;
    private final CodexProperties properties;
    private final PlatformStore store;
    private final ExecutionProviderResolver providers;
    private boolean closed;
    private final Map<String, Terminal> terminals = new ConcurrentHashMap<>();
    private final Map<String, TicketBinding> tickets = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor(
                    task -> {
                        Thread thread = new Thread(task, "codex-terminal-idle");
                        thread.setDaemon(true);
                        return thread;
                    });
    private final SecureRandom random = new SecureRandom();

    @Schema(name = "CodexTerminalInfo")
    public record TerminalInfo(
            String id,
            String workspaceId,
            String environment,
            String shell,
            String directory,
            String createdAt,
            long lastActivity,
            boolean running) {}

    @Schema(name = "CodexTerminalTicket")
    public record Ticket(String ticket, long expiresAt, String webSocketPath) {}

    @Schema(name = "CodexTerminalFrame")
    public record Frame(String type, String text, long seq, Integer exitCode) {}

    @Schema(name = "CodexTerminalOutput", description = "共享 PTY 原始输出，游标为 UTF-16 字符偏移，ANSI 控制符保留")
    public record Output(
            String terminalId,
            String text,
            long fromCursor,
            long cursor,
            long latestCursor,
            boolean historyLost,
            boolean hasMore,
            boolean running) {}

    private record TicketBinding(String terminalId, long expiresAt) {}

    public TerminalService(
            WorkspaceService workspaces,
            CodexProperties properties,
            PlatformStore store,
            ExecutionProviderResolver providers) {
        this.workspaces = workspaces;
        this.properties = properties;
        this.store = store;
        this.providers = providers;
        scheduler.scheduleWithFixedDelay(this::expire, 1, 1, TimeUnit.MINUTES);
    }

    public synchronized TerminalInfo create(
            String workspaceId, String requestedShell, int columns, int rows) throws IOException {
        return create(workspaceId, requestedShell, columns, rows, null);
    }

    /** directory 允许用户在任意本机目录启动终端；留空时仍固定在工作区，保持默认隔离。 */
    public synchronized TerminalInfo create(
            String workspaceId,
            String requestedShell,
            int columns,
            int rows,
            String requestedDirectory)
            throws IOException {
        if (closed)
            throw new BusinessException(
                    "TERMINAL_SERVICE_CLOSED", "终端服务已关闭", HttpStatus.SERVICE_UNAVAILABLE);
        if (terminals.values().stream().filter(value -> value.process.isAlive()).count()
                >= properties.terminalMaxSessions()) {
            throw new BusinessException(
                    "TERMINAL_LIMIT", "终端数量已达到上限，请关闭空闲终端", HttpStatus.TOO_MANY_REQUESTS);
        }
        WorkspaceService.ExecutionEnvironment environment = workspaces.execution(workspaceId);
        TerminalPlan plan =
                providers.resolve(environment.kind()).terminal(environment, requestedShell);
        String shell = plan.shell();
        Path directory = workingDirectory(environment, requestedDirectory);
        String id = UUID.randomUUID().toString();
        Path logs = store.root().resolve("terminal-logs");
        Files.createDirectories(logs);
        PtyProcess process;
        try {
            process =
                    new PtyProcessBuilder(plan.command().toArray(String[]::new))
                            .setDirectory(directory.toString())
                            .setEnvironment(safeEnvironment())
                            .setInitialColumns(clamp(columns, 80, 20, 400))
                            .setInitialRows(clamp(rows, 24, 5, 200))
                            .setUseWinConPty(plan.windowsConPty())
                            .setRedirectErrorStream(true)
                            .start();
        } catch (IOException | RuntimeException | UnsatisfiedLinkError exception) {
            LOG.warn(
                    "Terminal start failed workspace={} environment={} errorType={}",
                    workspaceId,
                    environment.kind(),
                    exception.getClass().getSimpleName());
            throw new BusinessException(
                    "PTY_UNAVAILABLE",
                    "PTY 或所选 Shell 不可用，终端未启动；请检查本机依赖",
                    HttpStatus.SERVICE_UNAVAILABLE);
        }
        Terminal terminal =
                new Terminal(
                        id,
                        workspaceId,
                        environment.kind(),
                        shell,
                        directory.toString(),
                        process,
                        logs.resolve(id + ".log"));
        terminals.put(id, terminal);
        Thread reader = new Thread(() -> pump(terminal), "codex-pty-" + id);
        terminal.reader = reader;
        reader.setDaemon(true);
        reader.start();
        store.save("terminals", id, terminal.info());
        LOG.info(
                "Terminal created terminal={} workspace={} environment={} shell={}",
                id,
                workspaceId,
                environment.kind(),
                shell);
        return terminal.info();
    }

    public List<TerminalInfo> list(String workspaceId) throws IOException {
        workspaces.requireWorkspace(workspaceId);
        return terminals.values().stream()
                .filter(value -> value.workspaceId.equals(workspaceId))
                .map(Terminal::info)
                .toList();
    }

    /** 服务端绑定工作区，Agent 不能通过猜测终端 ID 读取其他聊天的输出。 */
    public Output readOutput(String workspaceId, String id, Long after, int maxChars)
            throws IOException {
        workspaces.requireWorkspace(workspaceId);
        Terminal terminal = require(id);
        if (!terminal.workspaceId.equals(workspaceId))
            throw new BusinessException("TERMINAL_NOT_FOUND", "当前工作区没有这个终端", HttpStatus.NOT_FOUND);
        if (after != null && after < 0 || maxChars < 2 || maxChars > 32768)
            throw new BusinessException(
                    "TERMINAL_OUTPUT_INVALID", "游标须非负，输出上限须为2至32768个字符", HttpStatus.BAD_REQUEST);
        Output result = terminal.transcript.read(id, after, maxChars, terminal.process.isAlive());
        LOG.debug(
                "Terminal output read terminal={} workspace={} cursor={} chars={} historyLost={}",
                id,
                workspaceId,
                result.cursor(),
                result.text().length(),
                result.historyLost());
        return result;
    }

    public Ticket ticket(String id) {
        require(id);
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String ticket = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        long expires = System.currentTimeMillis() + 60_000;
        tickets.put(
                WorkspaceService.hash(ticket.getBytes(StandardCharsets.UTF_8)),
                new TicketBinding(id, expires));
        return new Ticket(ticket, expires, "/api/v1/codex/terminal/socket?ticket=" + ticket);
    }

    public String consumeTicket(String value) {
        if (value == null || value.length() > 100) throw invalidTicket();
        TicketBinding binding =
                tickets.remove(WorkspaceService.hash(value.getBytes(StandardCharsets.UTF_8)));
        if (binding == null || binding.expiresAt() <= System.currentTimeMillis())
            throw invalidTicket();
        require(binding.terminalId());
        return binding.terminalId();
    }

    public Flux<Frame> events(String id) {
        return require(id).output.asFlux();
    }

    public void input(String id, String text) throws IOException {
        Terminal terminal = require(id);
        if (!terminal.process.isAlive())
            throw new BusinessException("TERMINAL_CLOSED", "终端已结束", HttpStatus.CONFLICT);
        if (text == null || text.length() > 65536)
            throw new BusinessException(
                    "TERMINAL_INPUT_INVALID", "终端输入超过限制", HttpStatus.BAD_REQUEST);
        synchronized (terminal) {
            terminal.process.getOutputStream().write(text.getBytes(terminal.charset));
            terminal.process.getOutputStream().flush();
            terminal.lastActivity = System.currentTimeMillis();
        }
    }

    public void resize(String id, int columns, int rows) {
        Terminal terminal = require(id);
        terminal.process.setWinSize(
                new WinSize(clamp(columns, 80, 20, 400), clamp(rows, 24, 5, 200)));
        terminal.lastActivity = System.currentTimeMillis();
    }

    public void close(String id) {
        LOG.info("Terminal close requested terminal={}", id);
        ProcessCommands.kill(require(id).process);
    }

    /** Agent 单次命令入口，由工具的 SDK PermissionEngine 审批后调用。 */
    public ProcessCommands.Result execute(
            String workspaceId, String command, String relativeDirectory, int timeoutSeconds)
            throws IOException {
        if (command == null || command.isBlank() || command.length() > 32768)
            throw new BusinessException("COMMAND_INVALID", "命令不能为空或超过限制", HttpStatus.BAD_REQUEST);
        WorkspaceService.ExecutionEnvironment environment = workspaces.execution(workspaceId);
        Path directory = WorkspaceService.resolve(environment.hostPath(), relativeDirectory, false);
        if (!Files.isDirectory(directory))
            throw new BusinessException("DIRECTORY_NOT_FOUND", "执行目录不存在", HttpStatus.NOT_FOUND);
        int timeout = clamp(timeoutSeconds, 60, 1, 300);
        ExecutionProvider provider = providers.resolve(environment.kind());
        LaunchPlan plan = provider.command(environment, directory, command, timeout);
        long started = System.nanoTime();
        LOG.info(
                "Command started workspace={} environment={} timeoutSeconds={}",
                workspaceId,
                environment.kind(),
                timeout);
        ProcessCommands.Result result =
                ProcessCommands.run(
                        directory, plan.command(), plan.timeout(), null, safeEnvironment());
        result = provider.normalizeTimeout(result);
        Path logs = store.root().resolve("command-results");
        Files.createDirectories(logs);
        store.save(
                "command-results",
                UUID.randomUUID().toString(),
                Map.of(
                        "workspaceId",
                        workspaceId,
                        "directory",
                        directory.toString(),
                        "completedAt",
                        Instant.now().toString(),
                        "result",
                        result));
        LOG.info(
                "Command ended workspace={} environment={} exitCode={} timedOut={} truncated={} durationMs={}",
                workspaceId,
                environment.kind(),
                result.exitCode(),
                result.timedOut(),
                result.truncated(),
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
        return result;
    }

    /**
     * 读取 PTY 输出。ConPTY 继承控制台代码页（中文 Windows 为 GBK），首块字节先嗅探
     * 确定会话编码（UTF-8 或控制台原生编码），之后整流按同一编码解码。
     */
    private void pump(Terminal terminal) {
        try (var raw = terminal.process.getInputStream();
                var input = new PushbackInputStream(raw, SNIFF_BYTES)) {
            byte[] head = new byte[SNIFF_BYTES];
            int headCount = input.read(head);
            if (headCount > 0) {
                terminal.charset = NativeCharsets.sniffStreamCharset(head, headCount);
                input.unread(head, 0, headCount);
            }
            try (var reader = new InputStreamReader(input, terminal.charset)) {
                char[] buffer = new char[4096];
                int count;
                while ((count = reader.read(buffer)) != -1) {
                    String text = new String(buffer, 0, count);
                    terminal.transcript.append(text);
                    terminal.lastActivity = System.currentTimeMillis();
                    terminal.output.tryEmitNext(
                            new Frame("output", text, terminal.sequence.incrementAndGet(), null));
                    if (terminal.loggedBytes < 20L * 1024 * 1024) {
                        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
                        Files.write(
                                terminal.log,
                                bytes,
                                StandardOpenOption.CREATE,
                                StandardOpenOption.APPEND);
                        terminal.loggedBytes += bytes.length;
                    }
                }
            }
        } catch (IOException exception) {
            terminal.output.tryEmitNext(
                    new Frame(
                            "output",
                            "\r\n终端连接已关闭\r\n",
                            terminal.sequence.incrementAndGet(),
                            null));
        } finally {
            try {
                int code = terminal.process.waitFor();
                LOG.info(
                        "Terminal exited terminal={} workspace={} exitCode={}",
                        terminal.id,
                        terminal.workspaceId,
                        code);
                terminal.output.tryEmitNext(
                        new Frame("exit", "", terminal.sequence.incrementAndGet(), code));
                try (var identity = AccountScope.bind(terminal.owner)) {
                    store.save("terminals", terminal.id, terminal.info());
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            } catch (IOException exception) {
                terminal.output.tryEmitNext(
                        new Frame("error", "终端记录保存失败", terminal.sequence.incrementAndGet(), null));
            }
            terminal.output.tryEmitComplete();
        }
    }

    private void expire() {
        long now = System.currentTimeMillis();
        tickets.entrySet().removeIf(entry -> entry.getValue().expiresAt() < now);
        for (Terminal terminal : terminals.values())
            if (terminal.process.isAlive()
                    && now - terminal.lastActivity > properties.terminalIdleMinutes() * 60_000L)
                ProcessCommands.kill(terminal.process);
        terminals
                .entrySet()
                .removeIf(
                        entry ->
                                !entry.getValue().process.isAlive()
                                        && now - entry.getValue().lastActivity > 60_000L);
    }

    @PreDestroy
    public synchronized void shutdown() {
        closed = true;
        scheduler.shutdownNow();
        terminals.values().forEach(value -> ProcessCommands.kill(value.process));
        for (Terminal terminal : terminals.values()) {
            try {
                if (terminal.reader != null) terminal.reader.join(5000);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }

    private Terminal require(String id) {
        Terminal terminal = terminals.get(id);
        if (terminal == null || !terminal.owner.equals(AccountScope.id()))
            throw new BusinessException("TERMINAL_NOT_FOUND", "终端不存在或已过期", HttpStatus.NOT_FOUND);
        return terminal;
    }

    private static BusinessException invalidTicket() {
        return new BusinessException(
                "TERMINAL_TICKET_INVALID", "终端票据无效或已消费", HttpStatus.UNAUTHORIZED);
    }

    /** 解析终端启动目录：留空使用工作区；宿主模式允许任意本机目录，Docker 容器固定 /workspace。 */
    private static Path workingDirectory(
            WorkspaceService.ExecutionEnvironment environment, String requested)
            throws IOException {
        Path base = environment.hostPath().toAbsolutePath().normalize();
        if (requested == null || requested.isBlank()) return base;
        if ("docker".equals(environment.kind()))
            throw new BusinessException(
                    "TERMINAL_DIRECTORY_UNSUPPORTED",
                    "Docker 工作区终端固定在 /workspace，不能指定宿主目录",
                    HttpStatus.BAD_REQUEST);
        Path directory;
        try {
            directory = Path.of(requested.trim());
        } catch (RuntimeException exception) {
            throw new BusinessException(
                    "TERMINAL_DIRECTORY_INVALID", "终端工作目录格式无效", HttpStatus.BAD_REQUEST);
        }
        if (!directory.isAbsolute()) directory = base.resolve(directory);
        directory = directory.normalize();
        if (!Files.isDirectory(directory))
            throw new BusinessException(
                    "TERMINAL_DIRECTORY_NOT_FOUND",
                    "终端工作目录不存在：" + directory,
                    HttpStatus.BAD_REQUEST);
        try {
            return directory.toRealPath();
        } catch (IOException exception) {
            throw new BusinessException(
                    "TERMINAL_DIRECTORY_INVALID", "终端工作目录无法访问", HttpStatus.BAD_REQUEST);
        }
    }

    private static int clamp(int value, int fallback, int minimum, int maximum) {
        return Math.max(minimum, Math.min(maximum, value == 0 ? fallback : value));
    }

    private static Map<String, String> safeEnvironment() {
        Map<String, String> environment = new HashMap<>();
        System.getenv()
                .forEach(
                        (key, value) -> {
                            String name = key.toUpperCase(Locale.ROOT);
                            if (!name.contains("TOKEN")
                                    && !name.contains("PASSWORD")
                                    && !name.contains("SECRET")
                                    && !name.contains("API_KEY")
                                    && !name.contains("APIKEY")
                                    && !name.endsWith("_KEY")
                                    && !name.contains("CREDENTIAL")) environment.put(key, value);
                        });
        environment.put("TERM", "xterm-256color");
        return environment;
    }

    private static final class Terminal {
        private final String owner = AccountScope.id();
        private final String id;
        private final String workspaceId;
        private final String environment;
        private final String shell;
        private final String directory;
        private final String createdAt = Instant.now().toString();
        private final PtyProcess process;
        private final Path log;
        private Thread reader;

        /** pump 嗅探确定的会话编码，输入输出同一码页；嗅探完成前按控制台原生编码。 */
        private volatile Charset charset = NativeCharsets.consoleCharset();

        private final Sinks.Many<Frame> output = Sinks.many().replay().limit(512);
        private final AtomicLong sequence = new AtomicLong();
        private final TerminalTranscript transcript = new TerminalTranscript();
        private volatile long lastActivity = System.currentTimeMillis();
        private long loggedBytes;

        private Terminal(
                String id,
                String workspaceId,
                String environment,
                String shell,
                String directory,
                PtyProcess process,
                Path log) {
            this.id = id;
            this.workspaceId = workspaceId;
            this.environment = environment;
            this.shell = shell;
            this.directory = directory;
            this.process = process;
            this.log = log;
        }

        private TerminalInfo info() {
            return new TerminalInfo(
                    id,
                    workspaceId,
                    environment,
                    shell,
                    directory,
                    createdAt,
                    lastActivity,
                    process.isAlive());
        }
    }
}
