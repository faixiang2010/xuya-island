package com.xuya.island.execution;

import com.xuya.island.account.AccountService;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/** 默认使用随安装包内置的精简Python；家庭管理员可切换到主机已安装的解释器。 */
@Service
public class PythonEnvironmentService {
    /** 家庭管理员选择"恢复使用内置"时提交的哨兵值。 */
    public static final String BUNDLED = "bundled";

    /** Electron 启动后端时注入的内置解释器路径。 */
    private static final String BUNDLED_ENV = "XUYA_BUNDLED_PYTHON";

    private final AccountService accounts;
    private final JsonMapper mapper = JsonMapper.builder().build();
    private volatile Map<String, Object> bundledCache;

    public PythonEnvironmentService(AccountService accounts) {
        this.accounts = accounts;
    }

    public Map<String, Object> state() {
        String selected = accounts.setting("python_executable", "");
        Map<String, Object> bundled = bundledStatus();
        boolean custom = !selected.isBlank();
        boolean available = custom || Boolean.TRUE.equals(bundled.get("available"));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("configured", available);
        result.put("executable", custom ? selected : String.valueOf(bundled.get("executable")));
        result.put("source", custom ? "custom" : (available ? BUNDLED : "none"));
        result.put("bundled", bundled);
        result.put("mode", "family-trusted");
        result.put("notice", "代码由主机的Python运行，具有启动软件的Windows账户的文件和网络权限。");
        return result;
    }

    public Path executable() {
        String value = accounts.setting("python_executable", "");
        if (!value.isBlank()) return checked(value);
        return bundledExecutable()
                .orElseThrow(
                        () -> AccountService.conflict("请家庭管理员选择这台主机已安装的Python，或使用随软件内置的Python"));
    }

    /** 内置解释器状态：可用性、路径与版本，供管理员界面展示。 */
    public Map<String, Object> bundledStatus() {
        Map<String, Object> cached = bundledCache;
        if (cached != null) return cached;
        Optional<Path> path = bundledExecutable();
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("available", path.isPresent());
        value.put("executable", path.map(Path::toString).orElse(""));
        value.put("version", "");
        if (path.isPresent()) {
            try {
                value.put("version", String.valueOf(probe(path.get().toString()).get("version")));
            } catch (RuntimeException exception) {
                value.put("available", false);
            }
        }
        bundledCache = value;
        return value;
    }

    public List<Map<String, Object>> discover() {
        var candidates = new LinkedHashSet<String>();
        String configured = accounts.setting("python_executable", "");
        if (!configured.isBlank()) candidates.add(configured);
        for (String directory :
                System.getenv().getOrDefault("PATH", "").split(java.io.File.pathSeparator)) {
            if (directory.isBlank()) continue;
            for (String name : List.of("python.exe", "python3.exe", "python", "python3")) {
                Path candidate = Path.of(directory).resolve(name);
                if (Files.isRegularFile(candidate)
                        && !candidate
                                .toString()
                                .toLowerCase(java.util.Locale.ROOT)
                                .contains("windowsapps")) candidates.add(candidate.toString());
            }
        }
        var result = new ArrayList<Map<String, Object>>();
        bundledExecutable()
                .ifPresent(
                        path -> {
                            try {
                                Map<String, Object> item =
                                        new LinkedHashMap<>(probe(path.toString()));
                                item.put("source", BUNDLED);
                                result.add(item);
                            } catch (RuntimeException ignored) {
                                /* 内置解释器探测失败时不列入候选项。 */
                            }
                        });
        for (String candidate : candidates.stream().limit(16).toList()) {
            try {
                result.add(probe(candidate));
            } catch (RuntimeException ignored) {
                result.add(
                        Map.of(
                                "executable",
                                candidate,
                                "available",
                                false,
                                "message",
                                "无法启动，请手动选择有效Python"));
            }
        }
        return List.copyOf(result);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> probe(String value) {
        Path executable = checked(value);
        Process process = null;
        try {
            process =
                    new ProcessBuilder(
                                    executable.toString(),
                                    "-I",
                                    "-c",
                                    "import sys,json; print(json.dumps({'version':sys.version.split()[0],'executable':sys.executable,'prefix':sys.prefix,'basePrefix':sys.base_prefix}))")
                            .redirectErrorStream(true)
                            .start();
            if (!process.waitFor(Duration.ofSeconds(5).toMillis(), TimeUnit.MILLISECONDS))
                throw AccountService.invalid("Python探测超时，请检查环境");
            byte[] bytes = process.getInputStream().readNBytes(8193);
            if (bytes.length > 8192 || process.exitValue() != 0)
                throw AccountService.invalid("该程序不能作为Python解释器使用");
            Map<String, Object> result =
                    new java.util.LinkedHashMap<>(
                            mapper.readValue(
                                    new String(bytes, StandardCharsets.UTF_8).trim(), Map.class));
            result.put("available", true);
            return result;
        } catch (java.io.IOException exception) {
            throw AccountService.invalid("Python无法启动，请检查文件路径和环境");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw AccountService.conflict("Python探测已中断");
        } finally {
            if (process != null && process.isAlive()) process.destroyForcibly();
        }
    }

    public Map<String, Object> select(String value) {
        if (value == null || value.isBlank() || BUNDLED.equals(value.trim())) {
            Path bundled =
                    bundledExecutable()
                            .orElseThrow(
                                    () -> AccountService.conflict("当前安装包没有内置Python，请选择主机已安装的解释器"));
            accounts.setSetting("python_executable", "");
            accounts.audit("python:select-bundled", bundled.toString(), true);
            return probe(bundled.toString());
        }
        Map<String, Object> result = probe(value);
        accounts.setSetting("python_executable", checked(value).toString());
        accounts.audit("python:select", checked(value).toString(), true);
        return result;
    }

    /** 环境变量注入的内置解释器；未配置或不可用时返回空。 */
    private Optional<Path> bundledExecutable() {
        String value = System.getenv(BUNDLED_ENV);
        if (value == null || value.isBlank()) return Optional.empty();
        try {
            Path path = Path.of(value).normalize();
            if (path.isAbsolute() && Files.isRegularFile(path)) return Optional.of(path);
        } catch (RuntimeException ignored) {
            /* 环境变量无效时视为没有内置解释器。 */
        }
        return Optional.empty();
    }

    private Path checked(String value) {
        if (value == null || value.isBlank()) throw AccountService.invalid("请选择完整的Python可执行文件路径");
        Path path;
        try {
            path = Path.of(value).normalize();
        } catch (RuntimeException exception) {
            throw AccountService.invalid("Python路径无效");
        }
        if (!path.isAbsolute()
                || !Files.isRegularFile(path)
                || value.toLowerCase(java.util.Locale.ROOT).contains("windowsapps"))
            throw AccountService.invalid("请使用真实Python解释器的完整路径，不能选择Windows应用商店别名");
        return path;
    }
}
