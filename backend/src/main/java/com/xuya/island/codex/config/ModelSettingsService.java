package com.xuya.island.codex.config;

import com.xuya.island.common.BusinessException;
import com.xuya.island.config.XuyaProperties;
import io.agentscope.core.util.JsonUtils;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** 密钥只保存在已忽略的本机数据目录，任何返回值均通过脱敏视图。 */
@Service
public class ModelSettingsService {
    public record ModelSettings(
            String provider,
            String baseUrl,
            String name,
            String apiKey,
            boolean supportsImages,
            List<String> reasoningEfforts) {
        public ModelSettings {
            provider = provider == null ? "OpenAI-compatible" : provider;
            baseUrl = baseUrl == null ? "http://127.0.0.1:11434/v1" : baseUrl;
            name = name == null ? "unconfigured" : name;
            apiKey = apiKey == null ? "" : apiKey;
            reasoningEfforts =
                    reasoningEfforts == null || reasoningEfforts.isEmpty()
                            ? List.of("default")
                            : List.copyOf(reasoningEfforts);
        }

        public boolean configured() {
            return apiKey != null && !apiKey.isBlank();
        }

        @Override
        public String toString() {
            return "ModelSettings[name=" + name + ", apiKey=REDACTED]";
        }
    }

    private final Path file;
    private final AtomicLong revision = new AtomicLong();
    private volatile ModelSettings current;

    public ModelSettingsService(CodexProperties properties, XuyaProperties xuya) {
        file = properties.dataDir().resolve("settings/model.json").toAbsolutePath().normalize();
        var model = xuya.model();
        current =
                new ModelSettings(
                        model.provider(),
                        model.baseUrl(),
                        model.name(),
                        model.apiKey(),
                        false,
                        List.of("default"));
        if (Files.isRegularFile(file)) {
            try {
                current =
                        JsonUtils.getJsonCodec()
                                .fromJson(Files.readString(file), ModelSettings.class);
            } catch (IOException | RuntimeException exception) {
                current =
                        new ModelSettings(
                                model.provider(),
                                model.baseUrl(),
                                model.name(),
                                "",
                                false,
                                List.of("default"));
            }
        }
    }

    public ModelSettings current() {
        return current;
    }

    public long revision() {
        return revision.get();
    }

    public Map<String, Object> view() {
        var model = current;
        return Map.of(
                "id",
                model.name(),
                "name",
                model.name(),
                "provider",
                model.provider(),
                "baseUrl",
                model.baseUrl(),
                "configured",
                model.configured(),
                "supportsImages",
                model.supportsImages(),
                "reasoningEfforts",
                model.reasoningEfforts() == null ? List.of("default") : model.reasoningEfforts());
    }

    public synchronized Map<String, Object> update(Map<String, Object> input) throws IOException {
        String name = String.valueOf(input.getOrDefault("name", current.name())).trim();
        String provider = String.valueOf(input.getOrDefault("provider", current.provider())).trim();
        String baseUrl = String.valueOf(input.getOrDefault("baseUrl", current.baseUrl())).trim();
        URI uri;
        try {
            uri = URI.create(baseUrl);
        } catch (IllegalArgumentException exception) {
            throw invalid();
        }
        if (!List.of("http", "https").contains(uri.getScheme())
                || uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getQuery() != null
                || uri.getFragment() != null
                || !name.matches("[a-zA-Z0-9._:/-]{1,128}")
                || provider.length() > 80) throw invalid();
        String apiKey =
                input.containsKey("apiKey")
                        ? String.valueOf(input.get("apiKey"))
                        : current.apiKey();
        if (apiKey.length() > 4096 || apiKey.contains("\n") || apiKey.contains("\r"))
            throw invalid();
        List<String> efforts =
                input.get("reasoningEfforts") instanceof List<?> values
                        ? values.stream().map(String::valueOf).toList()
                        : current.reasoningEfforts();
        if (efforts == null || efforts.isEmpty()) efforts = List.of("default");
        if (efforts.stream()
                .anyMatch(
                        effort ->
                                !List.of(
                                                "default", "none", "minimal", "low", "medium",
                                                "high", "xhigh")
                                        .contains(effort))) throw invalid();
        var next =
                new ModelSettings(
                        provider,
                        baseUrl,
                        name,
                        apiKey,
                        Boolean.TRUE.equals(
                                input.getOrDefault("supportsImages", current.supportsImages())),
                        efforts);
        Files.createDirectories(file.getParent());
        Path pending = file.resolveSibling("model.json.pending");
        try {
            Files.writeString(pending, JsonUtils.getJsonCodec().toJson(next));
            Files.move(
                    pending,
                    file,
                    StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(pending);
        }
        current = next;
        revision.incrementAndGet();
        return view();
    }

    private BusinessException invalid() {
        return new BusinessException(
                "MODEL_SETTINGS_INVALID", "模型名称、地址或能力配置无效", HttpStatus.BAD_REQUEST);
    }
}
