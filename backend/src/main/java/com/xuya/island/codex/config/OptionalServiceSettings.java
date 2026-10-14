package com.xuya.island.codex.config;

import io.agentscope.core.util.JsonUtils;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Service;

/** 可选服务开关独立持久化；不保存或返回模型密钥。 */
@Service
public final class OptionalServiceSettings {
    private final Path file;
    private volatile boolean jev;
    private volatile boolean studio;
    private final AtomicLong revision = new AtomicLong();

    public OptionalServiceSettings(CodexProperties properties) {
        file =
                properties
                        .dataDir()
                        .resolve("settings/optional-services.json")
                        .toAbsolutePath()
                        .normalize();
        jev = properties.jev().enabled();
        studio = properties.studio().enabled();
        if (Files.isRegularFile(file)) {
            try {
                var values = JsonUtils.getJsonCodec().fromJson(Files.readString(file), Map.class);
                if (values.get("jev") instanceof Boolean enabled) jev = enabled;
                if (values.get("studio") instanceof Boolean enabled) studio = enabled;
            } catch (IOException | RuntimeException exception) {
                /* 损坏文件采用已配置默认值 */
            }
        }
    }

    public boolean jevEnabled() {
        return jev;
    }

    public boolean studioEnabled() {
        return studio;
    }

    public long revision() {
        return revision.get();
    }

    public synchronized Map<String, Object> update(String service, boolean enabled)
            throws IOException {
        boolean nextJev = service.equals("jev") ? enabled : jev;
        boolean nextStudio = service.equals("studio") ? enabled : studio;
        Files.createDirectories(file.getParent());
        Path pending = file.resolveSibling("optional-services.json.pending");
        try {
            Files.writeString(
                    pending,
                    JsonUtils.getJsonCodec().toJson(Map.of("jev", nextJev, "studio", nextStudio)));
            Files.move(
                    pending,
                    file,
                    StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(pending);
        }
        jev = nextJev;
        studio = nextStudio;
        revision.incrementAndGet();
        return Map.of(
                "service", service, "enabled", enabled, "saved", true, "appliesTo", "next-turn");
    }
}
