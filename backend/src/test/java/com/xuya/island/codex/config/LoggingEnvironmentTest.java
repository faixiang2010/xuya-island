package com.xuya.island.codex.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;

class LoggingEnvironmentTest {
    @TempDir Path directory;

    @Test
    void blankCodexPathUsesSeparateModuleDirectoryWithoutDuplicateLogSuffix() {
        var environment =
                new MockEnvironment()
                        .withProperty(
                                "logging.file.name", directory.resolve("backend.log").toString())
                        .withProperty("xuya.codex.log-file", "");
        new LoggingEnvironment().postProcessEnvironment(environment, null);
        assertEquals(
                directory.resolve("codex/codex.log").toString(),
                environment.getProperty("xuya.codex.log-file"));
        assertEquals("false", environment.getProperty("xuya.logging.fallback", "false"));
    }

    @Test
    void unwritableFileTargetFallsBackBeforeLoggingInitializationWithoutThrowing()
            throws Exception {
        Path blocker = directory.resolve("regular-file");
        Files.writeString(blocker, "not a directory");
        var environment =
                new MockEnvironment()
                        .withProperty(
                                "logging.file.name", blocker.resolve("backend.log").toString())
                        .withProperty(
                                "xuya.codex.log-file", blocker.resolve("codex.log").toString());
        assertDoesNotThrow(
                () -> new LoggingEnvironment().postProcessEnvironment(environment, null));
        assertEquals("true", environment.getProperty("xuya.logging.fallback"));
        assertFalse(environment.getProperty("logging.file.name").startsWith(blocker.toString()));
        assertTrue(Files.isRegularFile(blocker));
        assertEquals("not a directory", Files.readString(blocker));
    }

    @Test
    void writableProbeLeavesNoIntermediateFiles() throws Exception {
        assertTrue(LoggingEnvironment.writable(directory.resolve("backend.log").toString()));
        try (var files = Files.list(directory)) {
            assertEquals(0, files.count());
        }
    }
}
