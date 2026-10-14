package com.xuya.island.learning.repository;

import com.xuya.island.account.AccountScope;
import com.xuya.island.learning.dto.ExerciseAttemptRequest;
import com.xuya.island.learning.vo.ProgressVO;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** SQLite 学习记录持久化，仅参数化 SQL。 */
@Repository
public class LearningRepository {

    private final JdbcClient client;

    public LearningRepository(JdbcClient client) {
        this.client = client;
    }

    public List<ProgressVO> list() {
        return client.sql(
                        "SELECT * FROM lesson_progress WHERE owner_id=:owner ORDER BY gmt_modified DESC")
                .param("owner", AccountScope.id())
                .query(
                        (row, index) ->
                                new ProgressVO(
                                        row.getString("lesson_id"),
                                        row.getString("lesson_version"),
                                        row.getString("status"),
                                        row.getInt("hint_level"),
                                        row.getBoolean("reference_viewed"),
                                        row.getString("reflection"),
                                        row.getString("parent_observation"),
                                        row.getString("gmt_modified")))
                .list();
    }

    public void save(ProgressVO progress) {
        client.sql(
                        """
                INSERT INTO lesson_progress VALUES (:owner, :lesson, :version, :status, :hint, :viewed, :reflection, :parent, :time)
                ON CONFLICT (owner_id, lesson_id, lesson_version) DO UPDATE SET
                status = excluded.status, hint_level = MAX(lesson_progress.hint_level, excluded.hint_level),
                reference_viewed = MAX(lesson_progress.reference_viewed, excluded.reference_viewed),
                reflection = excluded.reflection, parent_observation = excluded.parent_observation,
                gmt_modified = excluded.gmt_modified
                """)
                .param("lesson", progress.lessonId())
                .param("owner", AccountScope.id())
                .param("version", progress.lessonVersion())
                .param("status", progress.status())
                .param("hint", progress.hintLevel())
                .param("viewed", progress.referenceViewed() ? 1 : 0)
                .param("reflection", progress.reflection())
                .param("parent", progress.parentObservation())
                .param("time", progress.updatedAt())
                .update();
    }

    public void recordProgress(ProgressVO progress, String payload) {
        client.sql(
                        "INSERT INTO learning_progress_events VALUES(:id,:owner,:lesson,:version,'learner-self-report',:payload,:now)")
                .param("id", java.util.UUID.randomUUID().toString())
                .param("owner", AccountScope.id())
                .param("lesson", progress.lessonId())
                .param("version", progress.lessonVersion())
                .param("payload", payload)
                .param("now", progress.updatedAt())
                .update();
    }

    public int insert(ExerciseAttemptRequest request, String payload) {
        return client.sql(
                        """
                INSERT INTO exercise_attempts (id,lesson_id,lesson_version,exercise_id,payload,gmt_create,owner_id)
                VALUES (:id, :lesson, :version, :exercise, :payload, :time, :owner)
                ON CONFLICT (id) DO NOTHING
                """)
                .param("id", request.id().toString())
                .param("owner", AccountScope.id())
                .param("lesson", request.lessonId())
                .param("version", request.lessonVersion())
                .param("exercise", request.exerciseId())
                .param("payload", payload)
                .param("time", Instant.now().toString())
                .update();
    }

    public Optional<String> findAttempt(String id) {
        return client.sql(
                        "SELECT payload FROM exercise_attempts WHERE id = :id AND owner_id=:owner")
                .param("owner", AccountScope.id())
                .param("id", id)
                .query(String.class)
                .optional();
    }
}
