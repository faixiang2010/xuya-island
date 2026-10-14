package com.xuya.island.execution.world;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.codex.workspace.ProcessCommands;
import com.xuya.island.codex.workspace.WorkspaceService;
import com.xuya.island.common.BusinessException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;

/** 执行世界的命令/终端规划、超时语义与解析；不启动真实进程。 */
class ExecutionWorldTest {
    private final boolean windows =
            System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win");
    private final HostExecutionProvider host = new HostExecutionProvider();
    private final DockerExecutionProvider docker = new DockerExecutionProvider();

    private static WorkspaceService.ExecutionEnvironment hostEnvironment() {
        Path path = Path.of("target/execution-world-tests");
        return new WorkspaceService.ExecutionEnvironment("host", path, null, path.toString());
    }

    private static WorkspaceService.ExecutionEnvironment dockerEnvironment() {
        Path path = Path.of("target/execution-world-tests");
        return new WorkspaceService.ExecutionEnvironment(
                "docker", path, "container-1", "/workspace");
    }

    @Test
    void hostCommandUsesNativeShellAndTimeout() {
        WorkspaceService.ExecutionEnvironment environment = hostEnvironment();
        LaunchPlan plan = host.command(environment, environment.hostPath(), "echo hi", 60);
        assertEquals(Duration.ofSeconds(60), plan.timeout());
        if (windows) {
            assertEquals("powershell.exe", plan.command().get(0));
            assertEquals("echo hi", plan.command().get(plan.command().size() - 1));
        } else {
            assertEquals(List.of("/bin/sh", "-lc", "echo hi"), plan.command());
        }
    }

    @Test
    void hostTerminalResolvesDefaultAndRejectsUnknownShell() {
        TerminalPlan plan = host.terminal(hostEnvironment(), "");
        assertEquals(windows ? "powershell" : "bash", plan.shell());
        assertEquals(windows, plan.windowsConPty());
        assertThrows(BusinessException.class, () -> host.terminal(hostEnvironment(), "nope"));
    }

    @Test
    void dockerTerminalRunsInsideContainerWithoutConPty() {
        TerminalPlan plan = docker.terminal(dockerEnvironment(), "");
        assertEquals("/bin/sh", plan.shell());
        assertFalse(plan.windowsConPty());
        assertEquals(
                List.of(
                        "docker",
                        "exec",
                        "-it",
                        "--workdir",
                        "/workspace",
                        "container-1",
                        "/bin/sh"),
                plan.command());
        assertThrows(BusinessException.class, () -> docker.terminal(dockerEnvironment(), "cmd"));
    }

    @Test
    void dockerTimeoutExitCodesBecomeTimedOut() {
        ProcessCommands.Result killed = new ProcessCommands.Result(124, "partial", false, false);
        assertTrue(docker.normalizeTimeout(killed).timedOut());
        ProcessCommands.Result fine = new ProcessCommands.Result(0, "ok", false, false);
        assertFalse(docker.normalizeTimeout(fine).timedOut());
        assertFalse(host.normalizeTimeout(killed).timedOut(), "本机结果不按容器退出码改写");
    }

    @Test
    void resolverSelectsProviderByKindAndRejectsUnknown() {
        ExecutionProviderResolver resolver = new ExecutionProviderResolver(List.of(host, docker));
        assertEquals("host", resolver.resolve("host").kind());
        assertEquals("host", resolver.resolve(null).kind());
        assertEquals("docker", resolver.resolve("docker").kind());
        assertThrows(BusinessException.class, () -> resolver.resolve("remote"));
    }
}
