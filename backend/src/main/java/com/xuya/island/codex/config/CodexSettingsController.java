package com.xuya.island.codex.config;

import com.xuya.island.codex.agent.CodexAgentFactory;
import com.xuya.island.codex.decision.DecisionService;
import com.xuya.island.common.BusinessException;
import com.xuya.island.observability.LogDropCounter;
import com.xuya.island.observability.StudioObservability;
import io.agentscope.core.skill.repository.FileSystemSkillRepository;
import io.swagger.v3.oas.annotations.Operation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

@RestController
public class CodexSettingsController {
    private final CodexAgentFactory factory;
    private final ModelSettingsService models;
    private final CodexProperties properties;
    private final DecisionService decisions;
    private final StudioObservability studio;
    private final CodexSkills installedSkills;
    private final OptionalServiceSettings optionalServices;

    public CodexSettingsController(
            CodexAgentFactory factory,
            ModelSettingsService models,
            CodexProperties properties,
            DecisionService decisions,
            StudioObservability studio,
            CodexSkills installedSkills,
            OptionalServiceSettings optionalServices) {
        this.factory = factory;
        this.models = models;
        this.properties = properties;
        this.decisions = decisions;
        this.studio = studio;
        this.installedSkills = installedSkills;
        this.optionalServices = optionalServices;
    }

    @GetMapping("/api/v1/agents")
    @Operation(summary = "可用编码智能体")
    public List<Map<String, Object>> agents() {
        return List.of(
                Map.of(
                        "id",
                        "codex",
                        "name",
                        "Codex代码助手",
                        "type",
                        "coding",
                        "harness",
                        "AgentScope 2.1.0-BETA1"));
    }

    @GetMapping({"/api/v1/agents/capabilities", "/api/v1/capabilities"})
    @Operation(summary = "服务端实际模型与执行能力")
    public Map<String, Object> capabilities() {
        var result =
                new java.util.LinkedHashMap<String, Object>(
                        Map.of(
                                "models",
                                factory.models(),
                                "permissionModes",
                                List.of("ask", "auto", "full"),
                                "supportsImages",
                                models.current().supportsImages(),
                                "attachments",
                                Map.of(
                                        "maxBytes",
                                        properties.maxUploadBytes(),
                                        "image",
                                        models.current().supportsImages(),
                                        "text",
                                        true),
                                "planMode",
                                true,
                                "nativeSessionLog",
                                true,
                                "subagents",
                                List.of("reviewer"),
                                "skills",
                                true,
                                "voice",
                                Map.of("transcription", "browser", "realtime", false)));
        result.put("agentId", "codex");
        result.put("configured", models.current().configured());
        result.put(
                "defaults",
                Map.of(
                        "modelId",
                        "default",
                        "reasoningEffort",
                        "default",
                        "permissionMode",
                        "auto",
                        "planMode",
                        false,
                        "maxTokens",
                        100000,
                        "maxActiveMs",
                        1800000));
        result.put(
                "features",
                Map.of(
                        "plan",
                        true,
                        "goals",
                        true,
                        "subagents",
                        true,
                        "memory",
                        true,
                        "skills",
                        true,
                        "terminal",
                        true,
                        "worktrees",
                        true,
                        "projectless",
                        true,
                        "projectRequired",
                        false,
                        "studio",
                        studio.diagnostics().get("enabled")));
        result.put("protocols", List.of("agentapi-v1", "ag-ui", "sse"));
        return result;
    }

    @GetMapping("/api/v1/codex/settings")
    @Operation(summary = "工作台配置（密钥不返回）")
    public Map<String, Object> settings() {
        return Map.of(
                "models",
                factory.models(),
                "model",
                models.view(),
                "jev",
                decisions.diagnostics(),
                "studio",
                studio.diagnostics(),
                "swaggerUrl",
                "/swagger-ui.html");
    }

    @PutMapping("/api/v1/codex/settings/model")
    @Operation(summary = "保存本机模型配置")
    public Mono<Map<String, Object>> model(@RequestBody Map<String, Object> body) {
        return blocking(() -> models.update(body));
    }

    @PutMapping({"/api/v1/codex/settings/jev", "/api/v1/codex/settings/studio"})
    @Operation(summary = "保存可选服务开关")
    public Mono<Map<String, Object>> optional(
            @RequestBody Map<String, Object> body,
            org.springframework.web.server.ServerWebExchange exchange) {
        return blocking(
                () -> {
                    if (!(body.get("enabled") instanceof Boolean enabled))
                        throw new BusinessException(
                                "OPTIONAL_SERVICE_SETTINGS_INVALID",
                                "enabled 必须为布尔值",
                                HttpStatus.BAD_REQUEST);
                    String service =
                            exchange.getRequest().getPath().value().endsWith("/jev")
                                    ? "jev"
                                    : "studio";
                    var result = optionalServices.update(service, enabled);
                    if (service.equals("studio")) studio.settingsChanged();
                    return result;
                });
    }

    @GetMapping("/api/v1/codex/diagnostics")
    @Operation(summary = "可选服务状态与有界日志诊断")
    public Map<String, Object> diagnostics() {
        return Map.of(
                "jev",
                decisions.diagnostics(),
                "studio",
                studio.diagnostics(),
                "decisionHistory",
                decisions.history(),
                "logs",
                Map.of(
                        "framework",
                        "Log4j2",
                        "async",
                        true,
                        "queueCapacity",
                        4096,
                        "dropped",
                        LogDropCounter.dropped(),
                        "path",
                        "logs/codex/codex.log",
                        "retentionDays",
                        14));
    }

    @GetMapping("/api/v1/codex/skills")
    @Operation(summary = "已安装 Harness 技能")
    public Mono<List<Map<String, Object>>> skills() {
        return blocking(
                () -> {
                    installedSkills.ensureInstalled();
                    List<Map<String, Object>> items = new ArrayList<>();
                    readSkills(properties.skillsDir(), true, items);
                    readSkills(properties.dataDir().resolve("skills-disabled"), false, items);
                    return items;
                });
    }

    private void readSkills(Path root, boolean enabled, List<Map<String, Object>> items)
            throws Exception {
        if (!Files.isDirectory(root)) return;
        try (var children = Files.list(root)) {
            for (Path child : children.filter(Files::isDirectory).toList()) {
                Path skill = child.resolve("SKILL.md");
                if (Files.isSymbolicLink(child)
                        || Files.isSymbolicLink(skill)
                        || !Files.isRegularFile(skill)
                        || Files.size(skill) > 65536) continue;
                items.add(
                        Map.of(
                                "id",
                                child.getFileName().toString(),
                                "name",
                                child.getFileName().toString(),
                                "enabled",
                                enabled,
                                "content",
                                Files.readString(skill),
                                "source",
                                "local",
                                "updatedAt",
                                Files.getLastModifiedTime(skill).toInstant().toString()));
            }
        }
    }

    @PutMapping("/api/v1/codex/skills/{name}")
    @Operation(summary = "保存或启停本机技能")
    public Mono<Map<String, Object>> skill(
            @PathVariable String name, @RequestBody Map<String, Object> body) {
        return blocking(
                () -> {
                    if (!name.matches("[a-zA-Z0-9_-]{1,80}"))
                        throw new BusinessException(
                                "SKILL_NAME_INVALID", "技能名称无效", HttpStatus.BAD_REQUEST);
                    boolean enabled = !Boolean.FALSE.equals(body.get("enabled"));
                    Path target =
                            (enabled
                                            ? properties.skillsDir()
                                            : properties.dataDir().resolve("skills-disabled"))
                                    .resolve(name);
                    Path previous =
                            (enabled
                                            ? properties.dataDir().resolve("skills-disabled")
                                            : properties.skillsDir())
                                    .resolve(name);
                    Files.createDirectories(target.getParent());
                    if (Files.exists(previous) && !Files.exists(target))
                        Files.move(previous, target, StandardCopyOption.ATOMIC_MOVE);
                    Files.createDirectories(target);
                    if (Files.isSymbolicLink(target)
                            || Files.isSymbolicLink(target.resolve("SKILL.md")))
                        throw new BusinessException(
                                "SKILL_PATH_INVALID", "技能路径无效", HttpStatus.BAD_REQUEST);
                    if (body.get("content") instanceof String content) {
                        if (content.length() > 65536 || !content.startsWith("---"))
                            throw new BusinessException(
                                    "SKILL_FORMAT_INVALID",
                                    "技能需带 YAML 元数据且不超过64KB",
                                    HttpStatus.BAD_REQUEST);
                        Files.writeString(target.resolve("SKILL.md"), content);
                    }
                    var repository = new FileSystemSkillRepository(target.getParent(), false);
                    if (!repository.skillExists(name))
                        throw new BusinessException(
                                "SKILL_FORMAT_INVALID",
                                "技能元数据中 name 必须与目录名称一致",
                                HttpStatus.BAD_REQUEST);
                    return Map.of("id", name, "enabled", enabled, "saved", true);
                });
    }

    private <T> Mono<T> blocking(Callable<T> work) {
        return Mono.fromCallable(work).subscribeOn(Schedulers.boundedElastic());
    }
}
