package com.xuya.island.work;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.xuya.island.common.BusinessException;
import com.xuya.island.config.DatabaseConfiguration;
import com.xuya.island.lesson.service.LessonService;
import com.xuya.island.work.dto.SaveWorkRequest;
import com.xuya.island.work.repository.JdbcWorkRepository;
import com.xuya.island.work.service.WorkService;
import com.xuya.island.work.service.impl.WorkServiceImpl;
import java.nio.file.Path;
import java.util.concurrent.Executors;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 使用真实临时 SQLite，验证作品事务、中文持久化和旧版本保护。
 *
 * @author Codex代码助手
 */
class WorkServiceIntegrationTest {

    @TempDir private Path directory;

    private WorkService service;
    private DataSource dataSource;

    @BeforeEach
    void setUp() {
        dataSource = DatabaseConfiguration.openDatabase(directory.resolve("xuya.db"));
        service = createService(dataSource);
    }

    @Test
    void savedChineseCodeSurvivesReopeningDatabase() {
        var created =
                service.create(new SaveWorkRequest("story-cover", "月光森林", "print('你好，岛屿')", 0));
        var reopened =
                createService(DatabaseConfiguration.openDatabase(directory.resolve("xuya.db")));

        assertEquals("print('你好，岛屿')", reopened.get(created.id()).code());
        assertEquals("月光森林", reopened.get(created.id()).title());
        assertEquals(1, reopened.get(created.id()).revision());
    }

    @Test
    void staleRevisionDoesNotOverwriteCodeOrAppendVersion() {
        var created = service.create(new SaveWorkRequest("story-cover", "封面", "print('一')", 0));
        var updated =
                service.update(
                        created.id(), new SaveWorkRequest("story-cover", "封面", "print('二')", 1));

        BusinessException conflict =
                assertThrows(
                        BusinessException.class,
                        () ->
                                service.update(
                                        created.id(),
                                        new SaveWorkRequest(
                                                "story-cover", "封面", "print('旧窗口')", 1)));

        assertEquals("WORK_CONFLICT", conflict.getCode());
        assertEquals("print('二')", service.get(created.id()).code());
        assertEquals(2, updated.revision());
        assertEquals(
                2,
                JdbcClient.create(dataSource)
                        .sql("SELECT COUNT(*) FROM work_versions")
                        .query(Integer.class)
                        .single());
    }

    @Test
    void deleteRemovesWorkAndItsHistory() {
        var created = service.create(new SaveWorkRequest("story-cover", "封面", "print('一')", 0));
        service.update(created.id(), new SaveWorkRequest("story-cover", "封面", "print('二')", 1));

        var deleted = service.delete(created.id());

        assertEquals(created.id(), deleted.id());
        assertEquals(0, service.list().size());
        assertEquals(
                0,
                JdbcClient.create(dataSource)
                        .sql("SELECT COUNT(*) FROM work_versions")
                        .query(Integer.class)
                        .single());
        BusinessException missing =
                assertThrows(BusinessException.class, () -> service.get(created.id()));
        assertEquals("WORK_NOT_FOUND", missing.getCode());
    }

    @Test
    void deleteRejectsUnknownWork() {
        BusinessException missing =
                assertThrows(BusinessException.class, () -> service.delete("not-exist"));
        assertEquals("WORK_NOT_FOUND", missing.getCode());
    }

    @Test
    void unknownLessonIsRejectedBeforeWriting() {
        assertThrows(
                BusinessException.class,
                () -> service.create(new SaveWorkRequest("missing", "封面", "print('hello')", 0)));
        assertEquals(0, service.list().size());
    }

    @Test
    void failedVersionInsertRollsBackTheWholeSave() {
        JdbcClient.create(dataSource)
                .sql(
                        """
                CREATE TRIGGER reject_version BEFORE INSERT ON work_versions
                BEGIN SELECT RAISE(ABORT, 'test failure'); END
                """)
                .update();
        assertThrows(
                DataAccessException.class,
                () ->
                        service.create(
                                new SaveWorkRequest("story-cover", "封面", "print('hello')", 0)));
        assertEquals(0, service.list().size());
    }

    @Test
    void simultaneousSavesHaveOneWinnerAndOneConflict() throws Exception {
        var created = service.create(new SaveWorkRequest("story-cover", "封面", "print('一')", 0));
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> trySave(created.id(), "print('窗口一')"));
            var second = executor.submit(() -> trySave(created.id(), "print('窗口二')"));
            assertEquals(1, first.get() + second.get());
            assertEquals(2, service.get(created.id()).revision());
        } finally {
            executor.shutdownNow();
        }
    }

    private int trySave(String id, String code) {
        try {
            service.update(id, new SaveWorkRequest("story-cover", "封面", code, 1));
            return 1;
        } catch (BusinessException exception) {
            assertEquals("WORK_CONFLICT", exception.getCode());
            return 0;
        }
    }

    private WorkService createService(DataSource source) {
        return new WorkServiceImpl(
                new JdbcWorkRepository(JdbcClient.create(source)),
                new LessonService(),
                new TransactionTemplate(new DataSourceTransactionManager(source)));
    }
}
