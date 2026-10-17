package com.xuya.island.work.repository;

import com.xuya.island.account.AccountScope;
import com.xuya.island.work.entity.WorkDO;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * SQLite 实现，所有业务输入使用命名参数绑定。
 *
 * @author Codex代码助手
 */
@Repository
public class JdbcWorkRepository implements WorkRepository {

    private static final RowMapper<WorkDO> WORK_MAPPER =
            (result, row) ->
                    new WorkDO(
                            result.getString("id"),
                            result.getString("lesson_id"),
                            result.getString("title"),
                            result.getString("code"),
                            result.getInt("revision"),
                            result.getString("gmt_create"),
                            result.getString("gmt_modified"));

    private final JdbcClient client;

    public JdbcWorkRepository(JdbcClient client) {
        this.client = client;
    }

    @Override
    public List<WorkDO> list() {
        return client.sql("SELECT * FROM works WHERE owner_id=:owner ORDER BY gmt_modified DESC")
                .param("owner", AccountScope.id())
                .query(WORK_MAPPER)
                .list();
    }

    @Override
    public Optional<WorkDO> find(String id) {
        return client.sql("SELECT * FROM works WHERE id = :id AND owner_id=:owner")
                .param("owner", AccountScope.id())
                .param("id", id)
                .query(WORK_MAPPER)
                .optional();
    }

    @Override
    public void insert(WorkDO work) {
        client.sql(
                        """
                INSERT INTO works (id, lesson_id, title, code, revision, gmt_create, gmt_modified, owner_id)
                VALUES (:id, :lessonId, :title, :code, :revision, :created, :modified, :owner)
                """)
                .param("id", work.id())
                .param("owner", AccountScope.id())
                .param("lessonId", work.lessonId())
                .param("title", work.title())
                .param("code", work.code())
                .param("revision", work.revision())
                .param("created", work.gmtCreate())
                .param("modified", work.gmtModified())
                .update();
    }

    @Override
    public int update(WorkDO work, int expectedRevision) {
        return client.sql(
                        """
                UPDATE works SET title = :title, code = :code, revision = :revision, gmt_modified = :modified
                WHERE id = :id AND revision = :expected AND owner_id=:owner
                """)
                .param("title", work.title())
                .param("code", work.code())
                .param("revision", work.revision())
                .param("modified", work.gmtModified())
                .param("id", work.id())
                .param("expected", expectedRevision)
                .param("owner", AccountScope.id())
                .update();
    }

    @Override
    public void insertVersion(WorkDO work) {
        client.sql(
                        """
                INSERT INTO work_versions (id, work_id, revision, title, code, gmt_create)
                VALUES (:id, :workId, :revision, :title, :code, :created)
                """)
                .param("id", UUID.randomUUID().toString())
                .param("workId", work.id())
                .param("revision", work.revision())
                .param("title", work.title())
                .param("code", work.code())
                .param("created", work.gmtModified())
                .update();
    }

    @Override
    public int delete(String id) {
        // 外键已开启：先删历史版本，再删属于当前账户的作品主记录。
        client.sql("DELETE FROM work_versions WHERE work_id = :id").param("id", id).update();
        return client.sql("DELETE FROM works WHERE id = :id AND owner_id = :owner")
                .param("id", id)
                .param("owner", AccountScope.id())
                .update();
    }
}
