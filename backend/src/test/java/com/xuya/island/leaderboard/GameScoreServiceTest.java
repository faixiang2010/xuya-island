package com.xuya.island.leaderboard;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.account.AccountRequests;
import com.xuya.island.account.AccountScope;
import com.xuya.island.account.AccountService;
import com.xuya.island.common.BusinessException;
import com.xuya.island.config.DatabaseConfiguration;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 真实 SQLite 临时库，不访问网络。 */
class GameScoreServiceTest {
    @TempDir Path data;
    private GameScoreService scores;
    private String first;
    private String second;

    @BeforeEach
    void setup() {
        var source = DatabaseConfiguration.openDatabase(data.resolve("db/xuya.db"));
        var jdbc = JdbcClient.create(source);
        var accounts =
                new AccountService(
                        jdbc, new TransactionTemplate(new DataSourceTransactionManager(source)));
        first = accounts.setup(new AccountRequests.Setup("admin", "管理员", "admin-password"));
        second =
                accounts.createUser(
                        new AccountRequests.SaveUser(
                                "learner", "孩子", "learner-password", true, List.of("learner")),
                        false);
        scores = new GameScoreService(new GameScoreRepository(jdbc));
    }

    @AfterEach
    void close() {
        AccountScope.clear();
    }

    @Test
    void onlyKeepsBetterScoreAndBreaksTiesByDuration() {
        AccountScope.set(first);
        scores.submit(new GameScoreService.Submit("tetris", "calm", 1, 5000L, 100));
        scores.submit(new GameScoreService.Submit("tetris", "calm", 1, 6000L, 80));
        var mine = mine(scores.leaderboard("tetris", "calm", 1, 20));
        assertEquals(100, ((Number) mine.get("score")).intValue());
        assertEquals(5000L, ((Number) mine.get("durationMs")).longValue());

        scores.submit(new GameScoreService.Submit("tetris", "calm", 1, 4000L, 100));
        mine = mine(scores.leaderboard("tetris", "calm", 1, 20));
        assertEquals(4000L, ((Number) mine.get("durationMs")).longValue());
        var mineRows = scores.mine();
        assertEquals(1, mineRows.size());
        assertEquals("tetris", mineRows.get(0).get("gameId"));
        assertEquals(100, ((Number) mineRows.get(0).get("score")).intValue());

        AccountScope.set(second);
        scores.submit(new GameScoreService.Submit("tetris", "calm", 1, 9000L, 120));
        var board = scores.leaderboard("tetris", "calm", 1, 20);
        var entries = entries(board);
        assertEquals(2, entries.size());
        assertEquals(120, ((Number) entries.get(0).get("score")).intValue());
        assertTrue(Boolean.TRUE.equals(entries.get(0).get("self")));
        assertFalse(Boolean.TRUE.equals(entries.get(1).get("self")));
        assertEquals(2, ((Number) board.get("total")).intValue());

        AccountScope.set(first);
        board = scores.leaderboard("tetris", "calm", 1, 20);
        entries = entries(board);
        assertEquals(2, ((Number) mine(board).get("rank")).intValue());
        assertFalse(Boolean.TRUE.equals(entries.get(0).get("self")));
    }

    @Test
    void legacyCompletionRestoresProgressWithoutEnteringRanking() {
        AccountScope.set(first);
        scores.completeLegacy(List.of(new GameScoreService.Legacy("wind", "breeze", 1)));
        var board = scores.leaderboard("wind", "breeze", 1, 20);
        assertEquals(0, ((Number) board.get("total")).intValue());
        assertTrue(entries(board).isEmpty());
        assertEquals(1, scores.mine().size());
        assertEquals(0, ((Number) scores.mine().get(0).get("score")).intValue());

        scores.submit(new GameScoreService.Submit("wind", "breeze", 1, 5000L, 600));
        board = scores.leaderboard("wind", "breeze", 1, 20);
        assertEquals(1, ((Number) board.get("total")).intValue());
        assertEquals(600, ((Number) entries(board).get(0).get("score")).intValue());
        assertEquals(600, ((Number) scores.mine().get(0).get("score")).intValue());
    }

    @Test
    void rejectsGamesAndLevelsOutsideTheLeaderboard() {
        AccountScope.set(first);
        assertThrows(
                BusinessException.class,
                () -> scores.submit(new GameScoreService.Submit("unknown", "calm", 1, 1000L, 10)));
        assertThrows(
                BusinessException.class,
                () ->
                        scores.submit(
                                new GameScoreService.Submit("tetris", "Bad Level", 1, 1000L, 10)));
        assertThrows(
                BusinessException.class,
                () -> scores.submit(new GameScoreService.Submit("tetris", "calm", 1, 1000L, 0)));
        assertThrows(BusinessException.class, () -> scores.leaderboard("unknown", "calm", 1, 20));
        assertThrows(
                BusinessException.class, () -> scores.leaderboard("tetris", "Bad Level", 1, 20));
    }

    @Test
    void ranksPracticeLevelsByAccuracyThenDuration() {
        AccountScope.set(first);
        scores.submit(new GameScoreService.Submit("keyboard", "letters", 1, 60_000L, 92));
        AccountScope.set(second);
        scores.submit(new GameScoreService.Submit("keyboard", "letters", 1, 50_000L, 97));
        var entries = entries(scores.leaderboard("keyboard", "letters", 1, 20));
        assertEquals(2, entries.size());
        assertEquals(97, ((Number) entries.get(0).get("score")).intValue());
        assertEquals(50_000L, ((Number) entries.get(0).get("durationMs")).longValue());
        assertEquals(92, ((Number) entries.get(1).get("score")).intValue());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> mine(Map<String, Object> board) {
        return (Map<String, Object>) board.get("mine");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> entries(Map<String, Object> board) {
        return (List<Map<String, Object>>) board.get("entries");
    }
}
