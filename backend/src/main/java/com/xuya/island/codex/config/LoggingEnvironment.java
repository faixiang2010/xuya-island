package com.xuya.island.codex.config;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.UUID;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/** 在 Log4j 初始化前检测文件输出；不可写的用户配置回退独立日志目录而不阻断启动。 */
public final class LoggingEnvironment implements EnvironmentPostProcessor, Ordered {
    @Override
    public int getOrder() {
        return ConfigDataEnvironmentPostProcessor.ORDER + 1;
    }

    @Override
    public void postProcessEnvironment(
            ConfigurableEnvironment environment, SpringApplication application) {
        var overrides = new LinkedHashMap<String, Object>();
        Path working = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        Path logDirectory =
                working.getFileName().toString().equals("backend")
                        ? working.resolve("logs")
                        : working.resolve("backend/logs");
        String main = environment.getProperty("logging.file.name", "");
        if (main.isBlank()) {
            main = logDirectory.resolve("backend.log").toString();
            overrides.put("logging.file.name", main);
        }
        String codex = environment.getProperty("xuya.codex.log-file", "");
        if (codex.isBlank()) {
            // 即使显式主日志路径格式非法，也留给writable检测并回退，不能阻止业务启动。
            try {
                codex =
                        Path.of(main)
                                .toAbsolutePath()
                                .getParent()
                                .resolve("codex/codex.log")
                                .toString();
            } catch (java.nio.file.InvalidPathException exception) {
                codex = logDirectory.resolve("codex/codex.log").toString();
            }
            overrides.put("xuya.codex.log-file", codex);
        }
        Path fallback =
                Path.of(
                        System.getProperty("java.io.tmpdir"),
                        "xuya-island",
                        "logs",
                        UUID.randomUUID().toString());
        if (!writable(main))
            overrides.put("logging.file.name", fallback.resolve("backend.log").toString());
        if (!writable(codex))
            overrides.put("xuya.codex.log-file", fallback.resolve("codex.log").toString());
        if (!overrides.isEmpty()) {
            if (overrides.containsValue(fallback.resolve("backend.log").toString())
                    || overrides.containsValue(fallback.resolve("codex.log").toString()))
                overrides.put("xuya.logging.fallback", true);
            environment
                    .getPropertySources()
                    .addFirst(new MapPropertySource("codex-log-fallback", overrides));
        }
    }

    static boolean writable(String filename) {
        Path probe = null;
        try {
            Path path = Path.of(filename).toAbsolutePath().normalize();
            if (Files.exists(path) && (!Files.isRegularFile(path) || !Files.isWritable(path)))
                return false;
            Files.createDirectories(path.getParent());
            probe = Files.createTempFile(path.getParent(), ".xuya-log-probe-", ".tmp");
            return true;
        } catch (Exception exception) {
            return false;
        } finally {
            if (probe != null)
                try {
                    Files.deleteIfExists(probe);
                } catch (java.io.IOException exception) {
                    /* 仅保留无法删除的自有探针 */
                }
        }
    }
}
