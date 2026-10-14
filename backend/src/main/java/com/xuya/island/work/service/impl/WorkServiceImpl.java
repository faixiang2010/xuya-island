package com.xuya.island.work.service.impl;

import com.xuya.island.common.BusinessException;
import com.xuya.island.lesson.service.LessonService;
import com.xuya.island.work.dto.SaveWorkRequest;
import com.xuya.island.work.entity.WorkDO;
import com.xuya.island.work.repository.WorkRepository;
import com.xuya.island.work.service.WorkService;
import com.xuya.island.work.vo.WorkVO;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 作品保存事务：当前版本与历史快照一起提交；过期 revision 不得覆盖。
 *
 * @author Codex代码助手
 */
@Service
public class WorkServiceImpl implements WorkService {

    private static final int MAX_CODE_BYTES = 64 * 1024;

    private final WorkRepository repository;
    private final LessonService lessonService;
    private final TransactionTemplate transactions;

    public WorkServiceImpl(
            WorkRepository repository,
            LessonService lessonService,
            TransactionTemplate transactions) {
        this.repository = repository;
        this.lessonService = lessonService;
        this.transactions = transactions;
    }

    @Override
    public List<WorkVO> list() {
        return repository.list().stream().map(WorkVO::from).toList();
    }

    @Override
    public WorkVO get(String id) {
        return WorkVO.from(find(id));
    }

    @Override
    public WorkVO create(SaveWorkRequest request) {
        validate(request);
        if (request.revision() != 0) {
            throw new BusinessException("INVALID_REVISION", "新作品的版本号应为 0", HttpStatus.BAD_REQUEST);
        }
        String now = Instant.now().toString();
        WorkDO work =
                new WorkDO(
                        UUID.randomUUID().toString(),
                        request.lessonId(),
                        request.title().trim(),
                        request.code(),
                        1,
                        now,
                        now);
        return transactions.execute(
                status -> {
                    repository.insert(work);
                    repository.insertVersion(work);
                    return WorkVO.from(work);
                });
    }

    @Override
    public WorkVO update(String id, SaveWorkRequest request) {
        validate(request);
        WorkDO previous = find(id);
        if (!previous.lessonId().equals(request.lessonId())) {
            throw new BusinessException("LESSON_MISMATCH", "不能改变作品所属课程", HttpStatus.BAD_REQUEST);
        }
        // 先读取不可变归属，再进入事务直接执行 CAS，避免 SQLite 读事务升级写锁的竞争。
        WorkDO next =
                new WorkDO(
                        id,
                        previous.lessonId(),
                        request.title().trim(),
                        request.code(),
                        request.revision() + 1,
                        previous.gmtCreate(),
                        Instant.now().toString());
        return transactions.execute(
                status -> {
                    if (repository.update(next, request.revision()) != 1) {
                        throw new BusinessException(
                                "WORK_CONFLICT", "另一个窗口已保存新版本，你的草稿已保留，请另存作品", HttpStatus.CONFLICT);
                    }
                    repository.insertVersion(next);
                    return WorkVO.from(next);
                });
    }

    private WorkDO find(String id) {
        return repository
                .find(id)
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        "WORK_NOT_FOUND", "作品没有找到", HttpStatus.NOT_FOUND));
    }

    private void validate(SaveWorkRequest request) {
        lessonService.get(request.lessonId());
        if (request.code().getBytes(StandardCharsets.UTF_8).length > MAX_CODE_BYTES) {
            throw new BusinessException(
                    "CODE_TOO_LARGE", "代码请控制在 64 KiB 以内", HttpStatus.BAD_REQUEST);
        }
    }
}
