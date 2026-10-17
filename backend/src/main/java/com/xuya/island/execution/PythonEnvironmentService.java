package com.xuya.island.execution;

import com.xuya.island.account.AccountService;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/** 默认使用随安装包内置的精简Python；家庭管理员可切换到主机已安装的解释器。 */
@Service
public class PythonEnvironmentService {
    private static final Logger LOG = LoggerFactory.getLogger(PythonEnvironmentService.class);

    /** 家庭管理员选择"恢复使用内置"时提交的哨兵值。 */
    public static final String BUNDLED = "bundled";

    /** Electron 启动后端时注入的内置解释器路径。 */
    private static final String BUNDLED_ENV = "XUYA_BUNDLED_PYTHON";

    private final AccountService accounts;
    private final JsonMapper mapper = JsonMapper.builder().build();
    private volatile Map<String, Object> bundledCache;
    private boolean autoScanned;

    public PythonEnvironmentService(AccountService accounts) {
        this.accounts = accounts;
    }

    public Map<String, Object> state() {
        ensureDefault();
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
        ensureDefault();
        String value = accounts.setting("python_executable", "");
        if (!value.isBlank()) return checked(value);
        return bundledExecutable()
                .orElseThrow(
                        () -> AccountService.conflict("还没有可用的Python。请家庭管理员打开「家庭管理 → 运行与共享」选择一个"));
    }

    /**
     * 首次运行时自动选用一个可用解释器：安装版优先内置 Python，源码开发使用这台电脑已安装的 Python，
     * 避免家人第一次打开课堂就被“尚未配置”挡住。管理员之后仍可随时切换。
     */
    @EventListener(ApplicationReadyEvent.class)
    public void ensureDefault() {
        try {
            chooseDefault();
        } catch (RuntimeException exception) {
            // 自动选择只是便利功能，失败不能阻断启动；管理员仍可手动选择。
            LOG.warn("启动时自动选择Python失败：{}", exception.getMessage());
        }
    }

    private synchronized void chooseDefault() {
        if (autoScanned) return;
        autoScanned = true;
        if (!accounts.setting("python_executable", "").isBlank()) return;
        if (bundledExecutable().isPresent()) return;
        for (String candidate : pathCandidates().stream().limit(8).toList()) {
            try {
                Map<String, Object> info = probe(candidate);
                String version = String.valueOf(info.getOrDefault("version", ""));
                if (!version.startsWith("3.")) continue;
                accounts.setSetting("python_executable", checked(candidate).toString());
                LOG.info("自动选用主机Python {}（{}）", candidate, version);
                return;
            } catch (RuntimeException ignored) {
                // 不是可用的解释器，继续尝试下一个候选。
            }
        }
        LOG.warn("没有找到可用的Python，请在家庭管理中手动选择");
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
        var result = new ArrayList<Map<String, Object>>();
        var seen = new LinkedHashSet<String>();
        bundledExecutable()
                .ifPresent(
                        path -> {
                            try {
                                Map<String, Object> item =
                                        new LinkedHashMap<>(probe(path.toString()));
                                item.put("source", BUNDLED);
                                seen.add(String.valueOf(item.get("executable")));
                                result.add(item);
                            } catch (RuntimeException ignored) {
                                /* 内置解释器探测失败时不列入候选项。 */
                            }
                        });
        for (String candidate : pathCandidates().stream().limit(16).toList()) {
            try {
                Map<String, Object> item = probe(candidate);
                if (!seen.add(String.valueOf(item.get("executable")))) continue;
                result.add(item);
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

    /** PATH 与常见安装目录里的解释器候选；探测后才会真正采用。 */
    private List<String> pathCandidates() {
        var candidates = new LinkedHashSet<String>();
        String configured = accounts.setting("python_executable", "");
        if (!configured.isBlank()) candidates.add(configured);
        for (String directory :
                System.getenv().getOrDefault("PATH", "").split(File.pathSeparator)) {
            if (directory.isBlank()) continue;
            for (String name : List.of("python.exe", "python3.exe", "python", "python3")) {
                try {
                    Path candidate = Path.of(directory).resolve(name);
                    if (Files.isRegularFile(candidate)) candidates.add(candidate.toString());
                } catch (RuntimeException ignored) {
                    // PATH 里可能有 Windows 扩展路径或非法字符，跳过这一项即可。
                }
            }
        }
        String localAppData = System.getenv("LOCALAPPDATA");
        if (localAppData != null && !localAppData.isBlank()) {
            try {
                addInstalled(candidates, Path.of(localAppData, "Programs", "Python"));
            } catch (RuntimeException ignored) {
                // 环境变量里出现非法路径时跳过。
            }
        }
        addInstalled(candidates, Path.of("C:\\"));
        for (String key : List.of("ProgramFiles", "ProgramFiles(x86)")) {
            String directory = System.getenv(key);
            if (directory == null || directory.isBlank()) continue;
            try {
                addInstalled(candidates, Path.of(directory));
            } catch (RuntimeException ignored) {
                // 环境变量里出现非法路径时跳过。
            }
        }
        return List.copyOf(candidates);
    }

    private void addInstalled(Set<String> candidates, Path root) {
        if (root == null || !Files.isDirectory(root)) return;
        try (var entries = Files.list(root)) {
            entries.filter(Files::isDirectory)
                    .map(path -> path.resolve("python.exe"))
                    .filter(Files::isRegularFile)
                    .sorted(Comparator.reverseOrder())
                    .forEach(path -> candidates.add(path.toString()));
        } catch (IOException ignored) {
            // 目录没有权限或不可读时跳过，不影响 PATH 里的候选。
        }
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
        if (!path.isAbsolute() || !Files.isRegularFile(path))
            throw AccountService.invalid("请使用真实Python解释器的完整路径");
        return path;
    }
}
