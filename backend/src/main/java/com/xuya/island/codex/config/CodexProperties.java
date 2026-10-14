package com.xuya.island.codex.config;

import java.nio.file.Path;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 成人工作台配置，外部服务可用性不影响核心业务启动。 */
@ConfigurationProperties(prefix = "xuya.codex")
public record CodexProperties(
        Path dataDir,
        int maxIterations,
        int terminalIdleMinutes,
        int terminalMaxSessions,
        long maxUploadBytes,
        int previewBasePort,
        Jev jev,
        Studio studio) {
    public CodexProperties {
        dataDir = dataDir == null ? Path.of("data/codex") : dataDir;
        maxIterations = maxIterations > 0 ? maxIterations : 40;
        terminalIdleMinutes = terminalIdleMinutes > 0 ? terminalIdleMinutes : 30;
        terminalMaxSessions = terminalMaxSessions > 0 ? terminalMaxSessions : 8;
        maxUploadBytes = maxUploadBytes > 0 ? maxUploadBytes : 25L * 1024 * 1024;
        previewBasePort = previewBasePort > 0 ? previewBasePort : 43200;
        jev =
                jev == null
                        // 地址留空：真实 JEV 地址属于本机私有配置，只从 application-local.yml 注入，
                        // 不写进公开源码。
                        ? new Jev(false, "", "laya:typed-decisions", "")
                        : jev;
        studio =
                studio == null
                        ? new Studio(false, "http://localhost:3000", "xuya-island-codex", "codex")
                        : studio;
    }

    public Path workspaceRoot() {
        return dataDir.resolve("workspaces");
    }

    public Path artifactsDir() {
        return dataDir.resolve("artifacts");
    }

    public Path skillsDir() {
        return dataDir.resolve("skills");
    }

    public record Jev(boolean enabled, String baseUrl, String model, String apiKey) {
        @Override
        public String toString() {
            return "Jev[enabled=" + enabled + ", apiKey=REDACTED]";
        }
    }

    public record Studio(boolean enabled, String url, String project, String runName) {}
}
