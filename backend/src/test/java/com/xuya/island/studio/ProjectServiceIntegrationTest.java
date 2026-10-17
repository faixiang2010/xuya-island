package com.xuya.island.studio;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.xuya.island.common.BusinessException;
import com.xuya.island.config.DatabaseConfiguration;
import com.xuya.island.studio.dto.StudioRequests;
import com.xuya.island.studio.repository.StudioRepository;
import com.xuya.island.studio.service.ProjectService;
import com.xuya.island.studio.service.StudioValidation;
import com.xuya.island.studio.vo.StudioViews;
import com.xuya.island.work.service.WorkService;
import java.nio.file.Path;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 真实临时 SQLite 验证候选 CAS、拒绝、恢复、中文文件和偏好持久化。 */
class ProjectServiceIntegrationTest {
    @TempDir private Path directory;
    private ProjectService projects;
    private StudioRepository repository;
    private DataSource dataSource;

    @BeforeEach
    void setUp() {
        var source = DatabaseConfiguration.openDatabase(directory.resolve("xuya.db"));
        dataSource = source;
        repository = new StudioRepository(JdbcClient.create(source));
        projects =
                new ProjectService(
                        repository,
                        new TransactionTemplate(new DataSourceTransactionManager(source)),
                        mock(WorkService.class));
    }

    private List<StudioViews.ProjectFile> files(String code) {
        return List.of(
                new StudioViews.ProjectFile("main.py", code),
                new StudioViews.ProjectFile("素材/对白.txt", "你好，奶茶"));
    }

    private StudioViews.Project create() {
        return projects.create(
                new StudioRequests.CreateProject(
                        "倒霉奶茶店",
                        "milk-tea",
                        null,
                        files("print('一')"),
                        new StudioViews.Preferences(List.of("绘画", "怪兽"), "荒诞冷笑话")));
    }

    private String session(String projectId) {
        var session =
                new StudioViews.StudySession(
                        "test-session", projectId, "milk-tea", "studio", null, "2026-10-10");
        repository.insertSession(session);
        return session.id();
    }

    @Test
    void filesPreferencesAndVersionsSurviveReopen() {
        var p = create();
        projects.save(
                p.id(),
                new StudioRequests.SaveProject(p.title(), 1, files("print('二')"), p.preferences()));
        var reopened =
                new StudioRepository(
                        JdbcClient.create(
                                DatabaseConfiguration.openDatabase(directory.resolve("xuya.db"))));
        assertEquals("你好，奶茶", reopened.project(p.id()).orElseThrow().files().get(1).content());
        assertEquals("荒诞冷笑话", reopened.project(p.id()).orElseThrow().preferences().humor());
        assertEquals(2, reopened.versions(p.id()).size());
    }

    @Test
    void applyRejectUndoDoNotSilentlyOverwriteChildsChanges() {
        var p = create();
        String session = session(p.id());
        var first = projects.propose(session, p.id(), 1, files("print('候选')"), "改对白");
        projects.reject(first.id());
        assertEquals(1, projects.get(p.id()).revision());
        assertThrows(BusinessException.class, () -> projects.apply(first.id(), 1));
        var second = projects.propose(session, p.id(), 1, files("print('候选二')"), "改对白");
        var applied = projects.apply(second.id(), 1);
        assertEquals(2, applied.revision());
        var undone = projects.undo(second.id(), 2);
        assertEquals("print('一')", undone.files().get(0).content());
        assertEquals(3, undone.revision());
        assertEquals(3, projects.versions(p.id()).size());
    }

    @Test
    void staleCandidateAndUndoReturnConflictAndPreserveNewVersion() {
        var p = create();
        var c = projects.propose(session(p.id()), p.id(), 1, files("print('AI')"), "候选");
        projects.save(
                p.id(),
                new StudioRequests.SaveProject(
                        p.title(), 1, files("print('孩子的新修改')"), p.preferences()));
        assertThrows(BusinessException.class, () -> projects.apply(c.id(), 2));
        assertEquals("print('孩子的新修改')", projects.get(p.id()).files().get(0).content());
        assertEquals("pending", projects.candidate(c.id()).status());
    }

    @Test
    void deleteRemovesProjectAndEveryRelatedRecord() {
        var p = create();
        String session = session(p.id());
        var candidate = projects.propose(session, p.id(), 1, files("print('候选')"), "改对白");
        repository.insertRequest(session, "client-1", "turn-1", "{}", "edit");
        repository.activeTime(session, "turn-1", 1200);
        repository.insertExecution(
                new StudioRepository.Execution(
                        "execution-1",
                        session,
                        "request-1",
                        candidate.id(),
                        "client-execution-1",
                        "running",
                        null,
                        System.currentTimeMillis() + 60000));

        var deleted = projects.delete(p.id());

        assertEquals(p.id(), deleted.id());
        assertEquals(0, projects.list().size());
        for (String table :
                List.of(
                        "studio_versions",
                        "studio_sessions",
                        "studio_requests",
                        "studio_candidates",
                        "studio_executions",
                        "studio_budgets",
                        "studio_runs")) {
            assertEquals(
                    0,
                    JdbcClient.create(dataSource)
                            .sql("SELECT COUNT(*) FROM " + table)
                            .query(Integer.class)
                            .single(),
                    table);
        }
        BusinessException missing =
                assertThrows(BusinessException.class, () -> projects.get(p.id()));
        assertEquals("PROJECT_NOT_FOUND", missing.getCode());
    }

    @Test
    void deleteRejectsUnknownProject() {
        BusinessException missing =
                assertThrows(BusinessException.class, () -> projects.delete("not-exist"));
        assertEquals("PROJECT_NOT_FOUND", missing.getCode());
    }

    @Test
    void filenamesRejectHostPathsTraversalDuplicatesAndOversize() {
        for (String bad :
                List.of(
                        "../key.txt",
                        "D:/data.txt",
                        "/etc/passwd",
                        "x\\y.txt",
                        "a/./b.txt",
                        "a/b/c/d/e.py")) {
            assertTrue(!StudioValidation.safePath(bad), bad);
        }
        assertThrows(
                BusinessException.class,
                () ->
                        StudioValidation.files(
                                List.of(
                                        new StudioViews.ProjectFile(
                                                "main.py", "x".repeat(65537)))));
        assertThrows(
                BusinessException.class,
                () ->
                        StudioValidation.files(
                                List.of(
                                        new StudioViews.ProjectFile("main.py", "a"),
                                        new StudioViews.ProjectFile("main.py", "b"))));
    }
}
