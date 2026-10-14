package com.xuya.island.codex.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/** 正式内置技能首次使用时安装，已有用户技能或禁用状态不覆盖。 */
@Component
public class CodexSkills {
    private final CodexProperties properties;
    private boolean installed;

    public CodexSkills(CodexProperties properties) {
        this.properties = properties;
    }

    public synchronized void ensureInstalled() {
        if (installed) return;
        for (String name :
                List.of("coding", "review", "planning", "documents", "github", "design", "pdf")) {
            Path active = properties.skillsDir().resolve(name);
            Path disabled = properties.dataDir().resolve("skills-disabled").resolve(name);
            if (Files.exists(active) || Files.exists(disabled)) continue;
            try {
                Files.createDirectories(active);
                try (var input =
                        new ClassPathResource("codex-skills/" + name + "/SKILL.md")
                                .getInputStream()) {
                    Files.copy(input, active.resolve("SKILL.md"));
                }
            } catch (IOException exception) {
                throw new IllegalStateException("CODEX_SKILL_INSTALL_FAILED", exception);
            }
        }
        installed = true;
    }
}
