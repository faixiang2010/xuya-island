package com.xuya.island.leaderboard;

import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** 小游戏成绩只保存每位家人每关的最佳记录，榜单查询附带昵称。 */
@Repository
public class GameScoreRepository {
    public record ScoreRow(
            String learnerId, String nickname, int score, long durationMs, String achievedAt) {}

    public record MyScore(
            String gameId,
            String levelId,
            int levelVersion,
            int score,
            long durationMs,
            String achievedAt) {}

    private final JdbcClient jdbc;

    public GameScoreRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void saveBest(
            String learnerId,
            String gameId,
            String levelId,
            int version,
            int score,
            long durationMs,
            String achievedAt) {
        jdbc.sql(
                        """
                        INSERT INTO game_scores
                            (learner_id, game_id, level_id, level_version, score, duration_ms, achieved_at)
                        VALUES (:owner, :game, :level, :version, :score, :duration, :achieved)
                        ON CONFLICT(learner_id, game_id, level_id, level_version) DO UPDATE SET
                            score=excluded.score,
                            duration_ms=excluded.duration_ms,
                            achieved_at=excluded.achieved_at
                        WHERE excluded.score > game_scores.score
                           OR (excluded.score = game_scores.score
                               AND excluded.duration_ms < game_scores.duration_ms)
                        """)
                .param("owner", learnerId)
                .param("game", gameId)
                .param("level", levelId)
                .param("version", version)
                .param("score", score)
                .param("duration", durationMs)
                .param("achieved", achievedAt)
                .update();
    }

    public Optional<ScoreRow> best(String learnerId, String gameId, String levelId, int version) {
        return jdbc.sql(
                        """
                        SELECT s.learner_id, COALESCE(NULLIF(u.nickname,''), '家人') AS nickname,
                               s.score, s.duration_ms, s.achieved_at
                        FROM game_scores s
                        LEFT JOIN sys_users u ON u.id=s.learner_id
                        WHERE s.learner_id=:owner AND s.game_id=:game
                          AND s.level_id=:level AND s.level_version=:version
                          AND s.score > 0
                        """)
                .param("owner", learnerId)
                .param("game", gameId)
                .param("level", levelId)
                .param("version", version)
                .query(
                        (result, row) ->
                                new ScoreRow(
                                        result.getString("learner_id"),
                                        result.getString("nickname"),
                                        result.getInt("score"),
                                        result.getLong("duration_ms"),
                                        result.getString("achieved_at")))
                .optional();
    }

    public List<ScoreRow> top(String gameId, String levelId, int version, int limit) {
        return jdbc.sql(
                        """
                        SELECT s.learner_id, COALESCE(NULLIF(u.nickname,''), '家人') AS nickname,
                               s.score, s.duration_ms, s.achieved_at
                        FROM game_scores s
                        LEFT JOIN sys_users u ON u.id=s.learner_id
                        WHERE s.game_id=:game AND s.level_id=:level AND s.level_version=:version
                          AND s.score > 0
                        ORDER BY s.score DESC, s.duration_ms ASC, s.achieved_at ASC, s.learner_id ASC
                        LIMIT :limit
                        """)
                .param("game", gameId)
                .param("level", levelId)
                .param("version", version)
                .param("limit", limit)
                .query(
                        (result, row) ->
                                new ScoreRow(
                                        result.getString("learner_id"),
                                        result.getString("nickname"),
                                        result.getInt("score"),
                                        result.getLong("duration_ms"),
                                        result.getString("achieved_at")))
                .list();
    }

    public int rank(
            String gameId,
            String levelId,
            int version,
            int score,
            long durationMs,
            String achievedAt) {
        return jdbc.sql(
                                """
                        SELECT COUNT(*) FROM game_scores
                        WHERE game_id=:game AND level_id=:level AND level_version=:version
                          AND score > 0
                          AND (score > :score
                               OR (score = :score AND duration_ms < :duration)
                               OR (score = :score AND duration_ms = :duration
                                   AND achieved_at < :achieved))
                        """)
                        .param("game", gameId)
                        .param("level", levelId)
                        .param("version", version)
                        .param("score", score)
                        .param("duration", durationMs)
                        .param("achieved", achievedAt)
                        .query(Integer.class)
                        .single()
                + 1;
    }

    public int count(String gameId, String levelId, int version) {
        return jdbc.sql(
                        """
                        SELECT COUNT(*) FROM game_scores
                        WHERE game_id=:game AND level_id=:level AND level_version=:version
                          AND score > 0
                        """)
                .param("game", gameId)
                .param("level", levelId)
                .param("version", version)
                .query(Integer.class)
                .single();
    }

    /** 旧版本只在浏览器里留下的通关记录：用 0 分占位，不进排行榜，只用于恢复通关状态。 */
    public void saveCompletion(
            String learnerId, String gameId, String levelId, int version, String achievedAt) {
        jdbc.sql(
                        """
                        INSERT INTO game_scores
                            (learner_id, game_id, level_id, level_version, score, duration_ms, achieved_at)
                        VALUES (:owner, :game, :level, :version, 0, 1, :achieved)
                        ON CONFLICT(learner_id, game_id, level_id, level_version) DO NOTHING
                        """)
                .param("owner", learnerId)
                .param("game", gameId)
                .param("level", levelId)
                .param("version", version)
                .param("achieved", achievedAt)
                .update();
    }

    /** 当前账户的全部最佳成绩，用于登录后恢复各游戏的已通关状态。 */
    public List<MyScore> mine(String learnerId) {
        return jdbc.sql(
                        """
                        SELECT game_id, level_id, level_version, score, duration_ms, achieved_at
                        FROM game_scores
                        WHERE learner_id=:owner
                        ORDER BY achieved_at DESC, game_id, level_id
                        """)
                .param("owner", learnerId)
                .query(
                        (result, row) ->
                                new MyScore(
                                        result.getString("game_id"),
                                        result.getString("level_id"),
                                        result.getInt("level_version"),
                                        result.getInt("score"),
                                        result.getLong("duration_ms"),
                                        result.getString("achieved_at")))
                .list();
    }
}
