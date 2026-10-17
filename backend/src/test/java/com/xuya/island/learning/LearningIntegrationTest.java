package com.xuya.island.learning;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.common.BusinessException;
import com.xuya.island.config.DatabaseConfiguration;
import com.xuya.island.learning.dto.ExerciseAttemptRequest;
import com.xuya.island.learning.dto.ProgressRequest;
import com.xuya.island.learning.repository.LearningRepository;
import com.xuya.island.learning.service.LearningService;
import com.xuya.island.lesson.service.LessonService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.support.TransactionTemplate;
import org.sqlite.SQLiteDataSource;

/** 真实 SQLite 的增量升级、不可变练习和学习自评。 */
class LearningIntegrationTest {

    @TempDir private Path directory;

    @Test
    void upgradesV4ConversationWithoutChangingItsWorkspaceOrHistory() throws Exception {
        Path file = directory.resolve("db/codex.db");
        Files.createDirectories(file.getParent());
        SQLiteDataSource source = new SQLiteDataSource();
        source.setUrl("jdbc:sqlite:" + file);
        for (String name :
                java.util.List.of(
                        "V1__initial.sql", "V2__learning.sql", "V3__studio.sql", "V4__codex.sql"))
            new ResourceDatabasePopulator(new ClassPathResource("db/migration/" + name))
                    .execute(source);
        var old = JdbcClient.create(source);
        old.sql("CREATE TABLE schema_version (version INTEGER PRIMARY KEY)").update();
        old.sql("INSERT INTO schema_version VALUES (4)").update();
        old.sql(
                        "INSERT INTO codex_conversations(id,project_id,workspace_id,title,settings,archived,created_at,updated_at) VALUES('chat','','scratch','原会话','{}',1,'now','now')")
                .update();
        old.sql(
                        "INSERT INTO codex_runs(id,conversation_id,client_request_id,payload,status,created_at) VALUES('run','chat','request','{}','completed','now')")
                .update();
        var updated = JdbcClient.create(DatabaseConfiguration.openDatabase(file));
        assertEquals(
                0,
                updated.sql("SELECT pinned FROM codex_conversations WHERE id='chat'")
                        .query(Integer.class)
                        .single());
        assertEquals(
                "scratch",
                updated.sql("SELECT workspace_id FROM codex_conversations WHERE id='chat'")
                        .query(String.class)
                        .single());
        assertEquals(
                "completed",
                updated.sql("SELECT status FROM codex_runs WHERE id='run'")
                        .query(String.class)
                        .single());
        assertEquals(
                1,
                updated.sql("SELECT archived FROM codex_conversations WHERE id='chat'")
                        .query(Integer.class)
                        .single());
        try (var backups = Files.list(directory.resolve("backups"))) {
            assertEquals(1, backups.count());
        }
        DatabaseConfiguration.openDatabase(file);
        try (var backups = Files.list(directory.resolve("backups"))) {
            assertEquals(1, backups.count());
        }
    }

    @Test
    void upgradesV1WithConsistentBackupAndPreservesWorksAndAttempts() throws Exception {
        Path file = directory.resolve("db/xuya.db");
        Files.createDirectories(file.getParent());
        SQLiteDataSource legacy = new SQLiteDataSource();
        legacy.setUrl("jdbc:sqlite:" + file);
        var old = JdbcClient.create(legacy);
        old.sql("PRAGMA journal_mode=WAL").query(String.class).single();
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1__initial.sql"))
                .execute(legacy);
        old.sql("CREATE TABLE schema_version (version INTEGER PRIMARY KEY)").update();
        old.sql("INSERT INTO schema_version VALUES (1)").update();
        old.sql(
                        "INSERT INTO works VALUES ('old', 'story-cover', '原作品', 'print(7319)', 1, 'now', 'now')")
                .update();
        old.sql(
                        "INSERT INTO work_versions VALUES ('version', 'old', 1, '原作品', 'print(7319)', 'now')")
                .update();
        old.sql(
                        "INSERT INTO attempts VALUES ('run', 'story-cover', 'print(7319)', '7319', '', 'success', 1, 'browser-pyodide', 'now')")
                .update();
        var updated = JdbcClient.create(DatabaseConfiguration.openDatabase(file));
        // 升级后应停在本次构建内置的最高迁移版本，脚本清单由文件名自动发现，这里不写死数字。
        assertEquals(
                DatabaseConfiguration.latestMigrationVersion(),
                updated.sql("SELECT MAX(version) FROM schema_version")
                        .query(Integer.class)
                        .single());
        assertEquals(
                "print(7319)", updated.sql("SELECT code FROM works").query(String.class).single());
        assertEquals(
                1, updated.sql("SELECT COUNT(*) FROM work_versions").query(Integer.class).single());
        assertEquals("[]", updated.sql("SELECT input FROM attempts").query(String.class).single());
        Path backup;
        try (var paths = Files.list(directory.resolve("backups"))) {
            backup = paths.findFirst().orElseThrow();
        }
        SQLiteDataSource copy = new SQLiteDataSource();
        copy.setUrl("jdbc:sqlite:" + backup);
        var saved = JdbcClient.create(copy);
        assertEquals(
                1,
                saved.sql("SELECT MAX(version) FROM schema_version").query(Integer.class).single());
        assertEquals("原作品", saved.sql("SELECT title FROM works").query(String.class).single());
        DatabaseConfiguration.openDatabase(file);
        try (var paths = Files.list(directory.resolve("backups"))) {
            assertEquals(1, paths.count(), "再次启动不能重复升级或备份");
        }
    }

    @Test
    void exerciseRetryIsIdempotentAndDoesNotMarkLessonMastered() {
        var source = DatabaseConfiguration.openDatabase(directory.resolve("db/xuya.db"));
        var client = JdbcClient.create(source);
        var service = service(source);
        var lesson = new LessonService().get("author-interview");
        var cases =
                lesson.exercises().get(0).tests().stream()
                        .map(
                                item ->
                                        new ExerciseAttemptRequest.CaseResult(
                                                item.name(), item.input(), "输出", "", true))
                        .toList();
        UUID id = UUID.randomUUID();
        var request =
                new ExerciseAttemptRequest(
                        id,
                        lesson.id(),
                        lesson.version(),
                        "practice",
                        lesson.exercises().get(0).referenceCode(),
                        "passed",
                        0,
                        false,
                        cases);
        assertEquals(id.toString(), service.record(request));
        assertEquals(id.toString(), service.record(request));
        assertEquals(
                1,
                client.sql("SELECT COUNT(*) FROM exercise_attempts").query(Integer.class).single());
        assertTrue(service.list().isEmpty(), "浏览器报告通过不应该自动标记为完成");
        var changed =
                new ExerciseAttemptRequest(
                        id,
                        lesson.id(),
                        lesson.version(),
                        "practice",
                        "print(1)",
                        "passed",
                        0,
                        false,
                        cases);
        assertEquals(
                "EXERCISE_CONFLICT",
                assertThrows(BusinessException.class, () -> service.record(changed)).getCode());
    }

    @Test
    void keepsHelpHistoryAndRejectsUnknownLessonVersion() {
        var source = DatabaseConfiguration.openDatabase(directory.resolve("db/xuya.db"));
        var service = service(source);
        String version = new LessonService().curriculum().version();
        service.save(
                "story-cover", new ProgressRequest(version, "in-progress", 3, true, "发现了顺序", ""));
        var saved =
                service.save(
                        "story-cover",
                        new ProgressRequest(version, "needs-review", 0, false, "想再练一次", "能解释输出"));
        assertEquals(3, saved.hintLevel());
        assertTrue(saved.referenceViewed());
        assertEquals("needs-review", saved.status());
        assertEquals("想再练一次", service.list().get(0).reflection());
        assertThrows(
                BusinessException.class,
                () ->
                        service.save(
                                "story-cover",
                                new ProgressRequest("old-version", "completed", 0, false, "", "")));
        assertFalse(service.list().get(0).status().equals("completed"));
    }

    private LearningService service(DataSource source) {
        return new LearningService(
                new LearningRepository(JdbcClient.create(source)),
                new LessonService(),
                new TransactionTemplate(new DataSourceTransactionManager(source)));
    }
}
