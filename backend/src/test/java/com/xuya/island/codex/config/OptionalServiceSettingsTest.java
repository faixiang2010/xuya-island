package com.xuya.island.codex.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.codex.decision.DecisionService;
import com.xuya.island.observability.StudioObservability;
import io.agentscope.core.agent.RuntimeContext;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class OptionalServiceSettingsTest {
    @TempDir Path directory;

    @Test
    void switchesPersistIndependentlyAndDisabledServicesMakeNoConnection() throws Exception {
        var properties =
                new CodexProperties(
                        directory,
                        0,
                        0,
                        0,
                        0,
                        0,
                        new CodexProperties.Jev(
                                true, "http://unreachable.invalid", "fixture", "private-jev-key"),
                        new CodexProperties.Studio(
                                true, "http://unreachable.invalid", "fixture", "fixture"));
        var settings = new OptionalServiceSettings(properties);
        assertTrue(settings.jevEnabled());
        assertTrue(settings.studioEnabled());
        settings.update("jev", false);
        settings.update("studio", false);
        var restored = new OptionalServiceSettings(properties);
        assertFalse(restored.jevEnabled());
        assertFalse(restored.studioEnabled());
        assertFalse(
                Files.readString(directory.resolve("settings/optional-services.json"))
                        .contains("private-jev-key"));
        try (var decisions = new DecisionService(properties, restored);
                var studio = new StudioObservability(properties, restored)) {
            assertEquals(
                    "disabled",
                    decisions
                            .yesNo(
                                    RuntimeContext.empty(),
                                    "memory-gate",
                                    "state",
                                    "retain",
                                    true,
                                    false)
                            .block()
                            .reason());
            studio.onRealRequest("fixture");
            assertEquals("disabled", studio.diagnostics().get("state"));
            assertEquals(0, studio.diagnostics().get("queueSize"));
            restored.update("studio", true);
            studio.settingsChanged();
            assertEquals(true, studio.diagnostics().get("enabled"));
        }
    }
}
