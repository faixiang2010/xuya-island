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
import java.util.Locale;
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

/**
 * 安装包优先使用随包内置的精简Python；源码开发自动探测本机解释器；打包或便携运行不自动扫描，
 * 由家庭管理员手动选择，避免把打包机器上的环境带进其他电脑。
 */
@Service
public class PythonEnvironmentService {
    private static final Logger LOG = LoggerFactory.getLogger(PythonEnvironmentService.class);

    /** 家庭管理员选择"恢复使用内置"时提交的哨兵值。 */
    public static final String BUNDLED = "bundled";

    /** Electron 启动后端时注入的内置解释器路径。 */
    private static final String BUNDLED_ENV = "XUYA_BUNDLED_PYTHON";

    /** 仅源码启动脚本注入；未注入时保持手动配置，打包运行不会自动探测主机环境。 */
    private static final String AUTO_DETECT_ENV = "XUYA_AUTO_PYTHON";

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
        // 保存过的路径可能已被卸载或移动，失效时按未配置处理，避免界面误报“已选择”。
        boolean custom = usable(selected);
        boolean available = custom || Boolean.TRUE.equals(bundled.get("available"));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("configured", available);
        result.put(
                "executable",
                custom ? selected : (available ? String.valueOf(bundled.get("executable")) : ""));
        result.put("source", custom ? "custom" : (available ? BUNDLED : "none"));
        result.put("bundled", bundled);
        result.put("mode", "family-trusted");
        result.put("notice", "代码由主机的Python运行，具有启动软件的Windows账户的文件和网络权限。");
        return result;
    }

    public Path executable() {
        ensureDefault();
        String value = accounts.setting("python_executable", "");
        if (usable(value)) return checked(value);
        return bundledExecutable()
                .orElseThrow(
                        () -> AccountService.conflict("还没有可用的Python。请家庭管理员打开「家庭管理 → 运行与共享」选择一个"));
    }

    /**
     * 源码开发首次运行时自动选用一个可用解释器，避免家人第一次打开课堂就被“尚未配置”挡住。
     * 安装包有内置 Python 时不需要扫描；打包或便携运行没有该标记，保持管理员手动选择。
     */
    @EventListener(ApplicationReadyEvent.class)
    public void ensureDefault() {
        if (!autoDetect()) return;
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
        // 手动选择或上次自动发现的结果仍可用时保持不变；失效的路径不阻止重新发现。
        if (usable(accounts.setting("python_executable", ""))) return;
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
        rescanDefault();
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
            if (!seen.add(candidate)) continue;
            try {
                Map<String, Object> item = new LinkedHashMap<>(probe(candidate));
                // 展示与保存都使用候选路径，避免应用商店别名探测出的真实路径无法再次启动。
                item.put("executable", candidate);
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

    /**
     * 管理员点击“重新发现环境”时重新执行一次自动选择；打包运行时只刷新候选列表，
     * 不会替管理员自动选定主机解释器。
     */
    private synchronized void rescanDefault() {
        autoScanned = false;
        if (autoDetect()) chooseDefault();
    }

    /** PATH 与常见安装目录里的解释器候选；探测后才会真正采用。 */
    private List<String> pathCandidates() {
        var candidates = new LinkedHashSet<String>();
        String configured = accounts.setting("python_executable", "");
        if (!configured.isBlank()) candidates.add(configured);
        for (String directory : env("PATH").split(File.pathSeparator)) {
            if (directory.isBlank()) continue;
            for (String name : interpreterNames()) {
                try {
                    Path candidate = Path.of(directory).resolve(name);
                    if (Files.isRegularFile(candidate) || storeAlias(candidate))
                        candidates.add(candidate.toString());
                } catch (RuntimeException ignored) {
                    // PATH 里可能有 Windows 扩展路径或非法字符，跳过这一项即可。
                }
            }
        }
        if (windows()) {
            String localAppData = env("LOCALAPPDATA");
            if (localAppData != null && !localAppData.isBlank()) {
                try {
                    addInstalled(
                            candidates, Path.of(localAppData, "Programs", "Python"), "python.exe");
                } catch (RuntimeException ignored) {
                    // 环境变量里出现非法路径时跳过。
                }
            }
            addInstalled(candidates, Path.of("C:\\"), "python.exe");
            for (String key : List.of("ProgramFiles", "ProgramFiles(x86)")) {
                String directory = env(key);
                if (directory == null || directory.isBlank()) continue;
                try {
                    addInstalled(candidates, Path.of(directory), "python.exe");
                } catch (RuntimeException ignored) {
                    // 环境变量里出现非法路径时跳过。
                }
            }
        } else {
            // macOS 的 python.org 安装包与 Homebrew 常见位置；PATH 已覆盖的会去重。
            for (String directory : List.of("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin")) {
                for (String name : interpreterNames()) {
                    Path candidate = Path.of(directory, name);
                    if (Files.isRegularFile(candidate)) candidates.add(candidate.toString());
                }
            }
            addInstalled(
                    candidates,
                    Path.of("/Library/Frameworks/Python.framework/Versions"),
                    "bin/python3");
        }
        return List.copyOf(candidates);
    }

    private static List<String> interpreterNames() {
        return windows()
                ? List.of("python.exe", "python3.exe", "python", "python3")
                : List.of("python3", "python");
    }

    private static boolean windows() {
        return System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win");
    }

    /** 只有源码启动脚本显式注入标记时才自动探测本机环境。 */
    private static boolean autoDetect() {
        return "1".equals(env(AUTO_DETECT_ENV).trim());
    }

    /**
     * Windows 环境变量名大小写并不固定（常见 PATH 写成 Path），直接按大写读取会得到空值。
     */
    private static String env(String name) {
        String value = System.getenv(name);
        if (value != null) return value;
        for (Map.Entry<String, String> entry : System.getenv().entrySet())
            if (entry.getKey().equalsIgnoreCase(name)) return entry.getValue();
        return "";
    }

    /**
     * Windows 应用商店的 Python 在 PATH 中是 0 字节的应用执行别名，NIO 会认为它不是普通文件，
     * 但该别名可以正常启动并转发到已安装的解释器，因此不能仅凭文件属性排除。
     */
    private static boolean storeAlias(Path path) {
        if (!windows()) return false;
        String value = path.toString().replace('\\', '/').toLowerCase(Locale.ROOT);
        if (!value.contains("/microsoft/windowsapps/")) return false;
        Path name = path.getFileName();
        return name != null
                && name.toString()
                        .toLowerCase(Locale.ROOT)
                        .matches("python(3(\\.\\d+)?)?(\\.exe)?");
    }

    private void addInstalled(Set<String> candidates, Path root, String relative) {
        if (root == null || !Files.isDirectory(root)) return;
        try (var entries = Files.list(root)) {
            entries.filter(Files::isDirectory)
                    .map(path -> path.resolve(relative))
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
        Path path = checked(value);
        Map<String, Object> result = probe(path.toString());
        accounts.setSetting("python_executable", path.toString());
        accounts.audit("python:select", path.toString(), true);
        return result;
    }

    /** 环境变量注入的默认解释器（安装包内置或运行包 .env 指定）；不可用时返回空。 */
    private Optional<Path> bundledExecutable() {
        String value = env(BUNDLED_ENV);
        if (!usable(value)) return Optional.empty();
        return parse(value);
    }

    /** 已保存或配置的路径是否仍可启动；应用商店别名交给后续 probe 实际验证。 */
    private static boolean usable(String value) {
        return parse(value).filter(PythonEnvironmentService::usablePath).isPresent();
    }

    private static Optional<Path> parse(String value) {
        if (value == null || value.isBlank()) return Optional.empty();
        try {
            return Optional.of(Path.of(value).normalize());
        } catch (RuntimeException exception) {
            return Optional.empty();
        }
    }

    private static boolean usablePath(Path path) {
        return path.isAbsolute() && (Files.isRegularFile(path) || storeAlias(path));
    }

    private Path checked(String value) {
        if (value == null || value.isBlank()) throw AccountService.invalid("请选择完整的Python可执行文件路径");
        Path path = parse(value).orElseThrow(() -> AccountService.invalid("Python路径无效"));
        if (!usablePath(path)) throw AccountService.invalid("请使用真实Python解释器的完整路径");
        return path;
    }
}
