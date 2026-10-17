package com.xuya.island.codex.workspace;

import com.xuya.island.account.AccountScope;
import com.xuya.island.codex.config.CodexProperties;
import io.agentscope.core.util.JsonUtils;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/** 专业工作台平台元数据，按用途持久化；原子替换避免半写入记录。 */
@Component
public class PlatformStore {
    private final Path root;
    private final com.xuya.island.account.AccountService accounts;

    public PlatformStore(CodexProperties properties) {
        this(properties, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public PlatformStore(
            CodexProperties properties, com.xuya.island.account.AccountService accounts) {
        root = properties.dataDir().toAbsolutePath().normalize().resolve("platform");
        this.accounts = accounts;
    }

    public Path root() {
        String owner = AccountScope.id();
        if (owner.isBlank()) return root;
        if (accounts != null && owner.equals(accounts.setting("legacy_codex_owner", "")))
            return root;
        if (!owner.matches("[a-zA-Z0-9_-]{1,100}")) throw new IllegalArgumentException("无效账户标识");
        return root.resolve("accounts").resolve(owner);
    }

    public synchronized void save(String bucket, String id, Object value) throws IOException {
        Path directory = root().resolve(bucket);
        Files.createDirectories(directory);
        Path target = directory.resolve(id + ".json");
        Path temporary = Files.createTempFile(directory, "record-", ".tmp");
        try {
            Files.writeString(temporary, JsonUtils.getJsonCodec().toJson(value));
            Files.move(
                    temporary,
                    target,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    public synchronized <T> T read(String bucket, String id, Class<T> type) throws IOException {
        if (!id.matches("[a-zA-Z0-9_-]{1,100}")) throw new IllegalArgumentException("无效资源标识");
        Path file = root().resolve(bucket).resolve(id + ".json");
        return Files.isRegularFile(file)
                ? JsonUtils.getJsonCodec().fromJson(Files.readString(file), type)
                : null;
    }

    public synchronized <T> List<T> list(String bucket, Class<T> type) throws IOException {
        Path directory = root().resolve(bucket);
        if (!Files.isDirectory(directory)) return List.of();
        List<T> values = new ArrayList<>();
        try (var files = Files.list(directory)) {
            for (Path file :
                    files.filter(path -> path.getFileName().toString().endsWith(".json"))
                            .sorted()
                            .toList()) {
                values.add(JsonUtils.getJsonCodec().fromJson(Files.readString(file), type));
            }
        }
        return List.copyOf(values);
    }

    /** 删除一条平台元数据记录；不存在时静默跳过。 */
    public synchronized void delete(String bucket, String id) throws IOException {
        if (!id.matches("[a-zA-Z0-9_-]{1,100}")) throw new IllegalArgumentException("无效资源标识");
        Files.deleteIfExists(root().resolve(bucket).resolve(id + ".json"));
    }
}
