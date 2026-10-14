package com.xuya.island.execution.world;

import com.xuya.island.codex.workspace.ProcessCommands;
import com.xuya.island.codex.workspace.WorkspaceService;
import com.xuya.island.common.BusinessException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Docker 执行世界：命令与终端都在工作区容器内运行；容器未运行或缺少 timeout 时明确失败。 */
@Component
public class DockerExecutionProvider implements ExecutionProvider {

    @Override
    public String kind() {
        return "docker";
    }

    @Override
    public LaunchPlan command(
            WorkspaceService.ExecutionEnvironment environment,
            Path directory,
            String command,
            int timeoutSeconds) {
        String containerDirectory = containerDirectory(environment, directory);
        // timeout 在容器内限制真实命令；缺少该依赖则明确失败，不以宿主超时伪装停止容器进程。
        ProcessCommands.Result available =
                ProcessCommands.run(
                        environment.hostPath(),
                        List.of(
                                "docker",
                                "exec",
                                environment.containerId(),
                                "/bin/sh",
                                "-c",
                                "command -v timeout"),
                        Duration.ofSeconds(5));
        if (available.exitCode() != 0)
            throw new BusinessException(
                    "DOCKER_TIMEOUT_UNAVAILABLE",
                    "所选镜像缺少 timeout，不能执行有界命令；请选用包含该工具的镜像",
                    HttpStatus.SERVICE_UNAVAILABLE);
        return new LaunchPlan(
                List.of(
                        "docker",
                        "exec",
                        "--workdir",
                        containerDirectory,
                        environment.containerId(),
                        "timeout",
                        "-k",
                        "2s",
                        timeoutSeconds + "s",
                        "/bin/sh",
                        "-lc",
                        command),
                Duration.ofSeconds(timeoutSeconds + 5L));
    }

    @Override
    public TerminalPlan terminal(
            WorkspaceService.ExecutionEnvironment environment, String requestedShell) {
        String shell =
                requestedShell == null || requestedShell.isBlank() ? "/bin/sh" : requestedShell;
        if (!Set.of("/bin/sh", "/bin/bash", "sh", "bash").contains(shell))
            throw HostExecutionProvider.badShell();
        return new TerminalPlan(
                List.of(
                        "docker",
                        "exec",
                        "-it",
                        "--workdir",
                        environment.directory(),
                        environment.containerId(),
                        shell),
                shell,
                false);
    }

    @Override
    public ProcessCommands.Result normalizeTimeout(ProcessCommands.Result result) {
        if (result.exitCode() == 124 || result.exitCode() == 137)
            return new ProcessCommands.Result(
                    result.exitCode(), result.output(), true, result.truncated());
        return result;
    }

    private static String containerDirectory(
            WorkspaceService.ExecutionEnvironment environment, Path directory) {
        Path relative = environment.hostPath().relativize(directory);
        return relative.toString().isEmpty()
                ? "/workspace"
                : "/workspace/" + relative.toString().replace('\\', '/');
    }
}
