package com.xuya.island.work.repository;

import com.xuya.island.work.entity.WorkDO;
import java.util.List;
import java.util.Optional;

/**
 * 作品存储边界。事务由 Service 统一控制。
 *
 * @author Codex代码助手
 */
public interface WorkRepository {

    List<WorkDO> list();

    Optional<WorkDO> find(String id);

    void insert(WorkDO work);

    int update(WorkDO work, int expectedRevision);

    void insertVersion(WorkDO work);
}
