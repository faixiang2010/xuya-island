package com.xuya.island.execution.world;

import com.xuya.island.codex.workspace.WorkspaceService;
import com.xuya.island.common.BusinessException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** 本机执行世界：命令与终端直接在主机运行。安装包内的默认执行位置。 */
@Component
public class HostExecutionProvider implements ExecutionProvider {

    @Override
    public String kind() {
        return "host";
    }

    @Override
    public LaunchPlan command(
            WorkspaceService.ExecutionEnvironment environment,
            Path directory,
            String command,
            int timeoutSeconds) {
        List<String> arguments;
        if (windows()) {
            arguments =
                    List.of(
                            "powershell.exe",
                            "-NoLogo",
                            "-NoProfile",
                            "-NonInteractive",
                            "-Command",
                            command);
        } else {
            arguments = List.of("/bin/sh", "-lc", command);
        }
        return new LaunchPlan(arguments, Duration.ofSeconds(timeoutSeconds));
    }

    @Override
    public TerminalPlan terminal(
            WorkspaceService.ExecutionEnvironment environment, String requestedShell) {
        boolean windows = windows();
        String shell =
                requestedShell == null || requestedShell.isBlank()
                        ? windows ? "powershell" : "bash"
                        : requestedShell;
        List<String> command;
        if (windows) {
            command =
                    switch (shell) {
                        case "powershell" ->
                                List.of("powershell.exe", "-NoLogo", "-NoProfile", "-NoExit");
                        case "pwsh" -> List.of("pwsh.exe", "-NoLogo", "-NoProfile", "-NoExit");
                        case "cmd" -> List.of("cmd.exe", "/d");
                        default -> throw badShell();
                    };
        } else {
            if (!Set.of("bash", "sh", "zsh").contains(shell)) throw badShell();
            command = List.of(shell, "-i");
        }
        return new TerminalPlan(command, shell, windows);
    }

    private static boolean windows() {
        return System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win");
    }

    static BusinessException badShell() {
        return new BusinessException("SHELL_NOT_ALLOWED", "请选择受支持的 Shell", HttpStatus.BAD_REQUEST);
    }
}
