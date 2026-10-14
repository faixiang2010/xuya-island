package com.xuya.island.common;

import com.xuya.island.config.XuyaProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 存活与就绪检查；模型配置不是基础课堂就绪的前提。 */
@RestController
public class ReadinessController {

    private final JdbcClient client;
    private final XuyaProperties properties;

    public ReadinessController(JdbcClient client, XuyaProperties properties) {
        this.client = client;
        this.properties = properties;
    }

    @GetMapping("/api/health/live")
    public Map<String, String> live() {
        return Map.of("status", "alive");
    }

    @GetMapping("/api/health/ready")
    public Mono<ResponseEntity<Map<String, String>>> ready() {
        return Mono.fromCallable(
                        () -> {
                            Path probe = null;
                            try {
                                client.sql("SELECT 1").query(Integer.class).single();
                                Path workspace = properties.dataDir().resolve("agent-workspace");
                                Files.createDirectories(workspace);
                                probe = Files.createTempFile(workspace, "ready-", ".tmp");
                                Files.writeString(probe, "ready");
                                return ResponseEntity.ok(Map.of("status", "ready"));
                            } catch (Exception exception) {
                                return ResponseEntity.status(503)
                                        .body(Map.of("status", "not-ready"));
                            } finally {
                                if (probe != null) {
                                    try {
                                        Files.deleteIfExists(probe);
                                    } catch (IOException exception) {
                                        throw new IllegalStateException("无法清理就绪探针", exception);
                                    }
                                }
                            }
                        })
                .subscribeOn(Schedulers.boundedElastic());
    }
}
