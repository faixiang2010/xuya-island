package com.xuya.island.config;

import java.nio.file.Path;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 本机运行配置；模型密钥由服务端环境变量或外部本机配置提供。
 *
 * @author Codex代码助手
 */
@ConfigurationProperties(prefix = "xuya")
public record XuyaProperties(
        Path dataDir, int runnerPort, List<String> allowedOrigins, ModelProperties model) {

    public record ModelProperties(String provider, String baseUrl, String name, String apiKey) {
        public boolean configured() {
            return apiKey != null && !apiKey.isBlank();
        }

        @Override
        public String toString() {
            return "ModelProperties[provider=" + provider + ", name=" + name + ", apiKey=REDACTED]";
        }
    }
}
