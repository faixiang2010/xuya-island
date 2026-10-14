package com.xuya.island.attempt.repository;

import com.xuya.island.account.AccountScope;
import com.xuya.island.attempt.entity.AttemptDO;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * 运行记录仅新增，代码与输出保存在同一条快照中，不读取之后的编辑器内容。
 *
 * @author Codex代码助手
 */
@Repository
public class AttemptRepository {

    private final JdbcClient client;

    public AttemptRepository(JdbcClient client) {
        this.client = client;
    }

    public int insertIfAbsent(AttemptDO attempt) {
        return client.sql(
                        """
                INSERT INTO attempts (id, lesson_id, code, output, error, status, duration_ms, gmt_create,
                lesson_version, exercise_id, input, owner_id, source)
                VALUES (:id, :lessonId, :code, :output, :error, :status, :duration, :created, :version, :exercise, :input, :owner, :source)
                ON CONFLICT (id) DO NOTHING
                """)
                .param("id", attempt.id())
                .param("owner", AccountScope.id())
                .param("source", AccountScope.id().isBlank() ? "browser-pyodide" : "host-python")
                .param("lessonId", attempt.lessonId())
                .param("code", attempt.code())
                .param("output", attempt.output())
                .param("error", attempt.error())
                .param("status", attempt.status())
                .param("duration", attempt.durationMs())
                .param("created", attempt.gmtCreate())
                .param("version", attempt.lessonVersion())
                .param("exercise", attempt.exerciseId())
                .param("input", attempt.input())
                .update();
    }

    public Optional<AttemptDO> find(String id) {
        return client.sql("SELECT * FROM attempts WHERE id = :id AND owner_id=:owner")
                .param("owner", AccountScope.id())
                .param("id", id)
                .query(
                        (result, row) ->
                                new AttemptDO(
                                        result.getString("id"),
                                        result.getString("lesson_id"),
                                        result.getString("code"),
                                        result.getString("output"),
                                        result.getString("error"),
                                        result.getString("status"),
                                        result.getLong("duration_ms"),
                                        result.getString("gmt_create"),
                                        result.getString("lesson_version"),
                                        result.getString("exercise_id"),
                                        result.getString("input")))
                .optional();
    }
}
