package com.xuya.island.attempt;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.xuya.island.attempt.dto.RecordAttemptRequest;
import com.xuya.island.attempt.repository.AttemptRepository;
import com.xuya.island.attempt.service.AttemptService;
import com.xuya.island.common.BusinessException;
import com.xuya.island.config.DatabaseConfiguration;
import com.xuya.island.lesson.service.LessonService;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * 同一执行的重传去重，内容不同的重传不得污染已有运行证据。
 *
 * @author Codex代码助手
 */
class AttemptServiceIntegrationTest {

    @TempDir private Path directory;

    @Test
    void repeatedSnapshotIsIdempotentButChangedCodeIsRejected() {
        var client =
                JdbcClient.create(DatabaseConfiguration.openDatabase(directory.resolve("xuya.db")));
        var service = new AttemptService(new AttemptRepository(client), new LessonService());
        UUID runId = UUID.randomUUID();
        var request =
                new RecordAttemptRequest(
                        runId, "story-cover", "print('月光')", "月光\n", "", "success", 10);
        assertEquals(runId.toString(), service.record(request));
        assertEquals(runId.toString(), service.record(request));
        assertEquals(1, client.sql("SELECT COUNT(*) FROM attempts").query(Integer.class).single());
        var failure =
                assertThrows(
                        BusinessException.class,
                        () ->
                                service.record(
                                        new RecordAttemptRequest(
                                                runId,
                                                "story-cover",
                                                "print('不同代码')",
                                                "月光\n",
                                                "",
                                                "success",
                                                10)));
        assertEquals("ATTEMPT_CONFLICT", failure.getCode());
        assertEquals(
                "print('月光')",
                client.sql("SELECT code FROM attempts").query(String.class).single());
    }
}
