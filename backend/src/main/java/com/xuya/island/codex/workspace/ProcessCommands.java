package com.xuya.island.codex.workspace;

import com.xuya.island.common.BusinessException;
import com.xuya.island.common.NativeCharsets;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.springframework.http.HttpStatus;

/** 参数数组启动真实程序，输出和执行时长有界；不拼接跨 Shell 文件操作。 */
public final class ProcessCommands {
    private static final int OUTPUT_LIMIT = 2 * 1024 * 1024;

    private ProcessCommands() {}

    @Schema(name = "CodexProcessResult")
    public record Result(int exitCode, String output, boolean timedOut, boolean truncated) {}

    public static Result run(Path directory, List<String> command, Duration timeout) {
        return run(directory, command, timeout, null, null);
    }

    public static Result run(
            Path directory,
            List<String> command,
            Duration timeout,
            byte[] input,
            Map<String, String> environment) {
        Process process;
        try {
            ProcessBuilder builder =
                    new ProcessBuilder(command)
                            .directory(directory.toFile())
                            .redirectErrorStream(true);
            if (environment != null) {
                builder.environment().clear();
                builder.environment().putAll(environment);
            }
            process = builder.start();
        } catch (IOException exception) {
            throw new BusinessException(
                    "EXECUTABLE_UNAVAILABLE",
                    "执行程序不可用：" + command.get(0),
                    HttpStatus.SERVICE_UNAVAILABLE);
        }
        CompletableFuture<Capture> capture =
                CompletableFuture.supplyAsync(() -> capture(process.getInputStream()));
        try {
            try (var stdin = process.getOutputStream()) {
                if (input != null) stdin.write(input);
            }
            boolean completed = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (!completed) kill(process);
            Capture result = capture.get(10, TimeUnit.SECONDS);
            return new Result(
                    completed ? process.exitValue() : -1,
                    result.text(),
                    !completed,
                    result.truncated());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            kill(process);
            throw new BusinessException("EXECUTION_INTERRUPTED", "执行已中断", HttpStatus.CONFLICT);
        } catch (Exception exception) {
            kill(process);
            throw new BusinessException(
                    "EXECUTION_IO_ERROR", "无法读取执行结果", HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    public static void kill(Process process) {
        try {
            process.descendants().forEach(ProcessHandle::destroyForcibly);
        } catch (UnsupportedOperationException exception) {
            // 部分 Windows PTY 不暴露 ProcessHandle，PTY 本身仍由其实现关闭。
        }
        process.destroyForcibly();
    }

    private record Capture(String text, boolean truncated) {}

    private static Capture capture(InputStream input) {
        try (input;
                ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            boolean truncated = false;
            while ((count = input.read(buffer)) != -1) {
                int retained = Math.min(count, OUTPUT_LIMIT - bytes.size());
                if (retained > 0) bytes.write(buffer, 0, retained);
                if (retained < count) truncated = true;
            }
            return new Capture(decode(bytes.toByteArray()), truncated);
        } catch (IOException exception) {
            return new Capture("执行输出流已关闭", false);
        }
    }

    /** 子进程输出解码：UTF-8 优先，中文 Windows 控制台 GBK 输出由原生编码兜底。 */
    static String decode(byte[] bytes) {
        return NativeCharsets.decodeUtf8OrNative(bytes);
    }
}
