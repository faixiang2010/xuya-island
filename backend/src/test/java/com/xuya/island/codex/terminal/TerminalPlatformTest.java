package com.xuya.island.codex.terminal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.codex.config.CodexProperties;
import com.xuya.island.codex.workspace.PlatformStore;
import com.xuya.island.codex.workspace.WorkspaceService;
import com.xuya.island.common.BusinessException;
import com.xuya.island.execution.world.DockerExecutionProvider;
import com.xuya.island.execution.world.ExecutionProviderResolver;
import com.xuya.island.execution.world.HostExecutionProvider;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Comparator;
import java.util.Locale;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** 真 ConPTY/PTY 验证输出、缩放、断线重订阅、一次票据及单命令超时。 */
class TerminalPlatformTest {
    private Path root;
    private TerminalService terminals;
    private String workspaceId;
    private WorkspaceService workspaces;
    private final boolean windows =
            System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win");

    @BeforeEach
    void setup() throws IOException {
        Path parent = Path.of("target/codex-platform-tests").toAbsolutePath().normalize();
        Files.createDirectories(parent);
        root = Files.createTempDirectory(parent, "terminal-");
        Path source = root.resolve("source");
        Files.createDirectories(source);
        Files.writeString(source.resolve("input.txt"), "fixture");
        var properties = new CodexProperties(root.resolve("data"), 0, 0, 0, 0, 0, null, null);
        var store = new PlatformStore(properties);
        workspaces = new WorkspaceService(store);
        var project = workspaces.register("PTY夹具", source.toString(), "isolated-copy");
        workspaceId = workspaces.create(project.id(), null, null, "host", null).id();
        terminals =
                new TerminalService(
                        workspaces,
                        properties,
                        store,
                        new ExecutionProviderResolver(
                                java.util.List.of(
                                        new HostExecutionProvider(),
                                        new DockerExecutionProvider())));
    }

    @AfterEach
    void cleanup() throws Exception {
        if (terminals != null) terminals.shutdown();
        // ConPTY reader may flush after process shutdown; only our own temporary test root is
        // cleaned.
        for (int attempt = 0; attempt < 5; attempt++) {
            try (var walk = Files.walk(root)) {
                for (Path path : walk.sorted(Comparator.reverseOrder()).toList())
                    Files.deleteIfExists(path);
                return;
            } catch (IOException exception) {
                if (attempt == 4) throw exception;
                Thread.sleep(100);
            }
        }
    }

    @Test
    void realInteractiveTerminalAndOneUseTicket() throws IOException {
        var terminal = terminals.create(workspaceId, windows ? "cmd" : "sh", 80, 24);
        assertTrue(terminal.running());
        var ticket = terminals.ticket(terminal.id());
        assertEquals(terminal.id(), terminals.consumeTicket(ticket.ticket()));
        assertThrows(BusinessException.class, () -> terminals.consumeTicket(ticket.ticket()));
        terminals.resize(terminal.id(), 100, 30);
        terminals.input(
                terminal.id(),
                windows ? "echo PTY_^R^E^A^L\r" : "printf 'PTY_'; printf 'REAL\\n'\n");
        var output =
                terminals
                        .events(terminal.id())
                        .filter(frame -> frame.text().contains("PTY_REAL"))
                        .next()
                        .block(Duration.ofSeconds(15));
        assertNotNull(output);
        var captured = terminals.readOutput(workspaceId, terminal.id(), null, 32768);
        assertTrue(captured.text().contains("PTY_REAL"));
        var otherWorkspace = workspaces.createScratch();
        assertThrows(
                BusinessException.class,
                () -> terminals.readOutput(otherWorkspace.id(), terminal.id(), null, 8192));
        assertThrows(
                BusinessException.class,
                () -> terminals.readOutput(workspaceId, terminal.id(), -1L, 8192));
        assertThrows(
                BusinessException.class,
                () -> terminals.readOutput(workspaceId, terminal.id(), null, 100000));
        var continued = terminals.readOutput(workspaceId, terminal.id(), captured.cursor(), 8192);
        assertFalse(continued.text().contains("PTY_REAL"), "增量读取不能重复已经读取的命令结果");
        assertTrue(terminals.list(workspaceId).get(0).running());
        // Disconnecting a subscriber leaves the process live and permits a fresh short-lived
        // ticket.
        assertEquals(
                terminal.id(), terminals.consumeTicket(terminals.ticket(terminal.id()).ticket()));
        terminals.close(terminal.id());
    }

    @Test
    void commandsUseRealWorkspaceAndAreBounded() throws IOException {
        var result =
                terminals.execute(
                        workspaceId,
                        windows
                                ? "[Console]::Write((Get-Content input.txt -Raw))"
                                : "cat input.txt",
                        "",
                        5);
        assertEquals(0, result.exitCode());
        assertTrue(result.output().contains("fixture"));
        assertFalse(result.timedOut());
        var timeout =
                terminals.execute(
                        workspaceId, windows ? "Start-Sleep -Seconds 5" : "sleep 5", "", 1);
        assertTrue(timeout.timedOut());
    }
}
