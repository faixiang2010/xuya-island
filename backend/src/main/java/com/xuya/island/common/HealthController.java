package com.xuya.island.common;

import com.xuya.island.config.RunnerResourceServer;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 前端和桌面启动时使用的就绪信息，不返回密钥或本机目录。
 *
 * @author Codex代码助手
 */
@RestController
public class HealthController {

    private final RunnerResourceServer runner;
    private final com.xuya.island.config.XuyaProperties properties;

    public HealthController(
            RunnerResourceServer runner, com.xuya.island.config.XuyaProperties properties) {
        this.runner = runner;
        this.properties = properties;
    }

    @GetMapping("/api/health")
    public HealthVO health() {
        return new HealthVO(
                "xuya-island",
                "0.1.0",
                "ready",
                runner.getOrigin(),
                properties.model().configured());
    }

    public record HealthVO(
            String application,
            String version,
            String status,
            String runnerOrigin,
            boolean modelConfigured) {}
}
