package com.xuya.island.attempt.service;

import com.xuya.island.account.AccountScope;
import com.xuya.island.attempt.dto.RecordAttemptRequest;
import com.xuya.island.attempt.entity.AttemptDO;
import com.xuya.island.attempt.repository.AttemptRepository;
import com.xuya.island.common.BusinessException;
import com.xuya.island.execution.NativePythonService;
import com.xuya.island.lesson.service.LessonService;
import com.xuya.island.studio.vo.StudioViews;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * 校验课程和字节限制后记录运行。Python 执行本身发生在浏览器隔离域。
 *
 * @author Codex代码助手
 */
@Service
public class AttemptService {

    private static final int MAX_CODE_BYTES = 64 * 1024;

    private final AttemptRepository repository;
    private final LessonService lessons;
    private final NativePythonService python;

    public AttemptService(AttemptRepository repository, LessonService lessons) {
        this(repository, lessons, null);
    }

    @Autowired
    public AttemptService(
            AttemptRepository repository, LessonService lessons, NativePythonService python) {
        this.repository = repository;
        this.lessons = lessons;
        this.python = python;
    }

    public String record(RecordAttemptRequest request) {
        lessons.versioned(request.lessonId(), request.lessonVersion());
        if (request.code().getBytes(StandardCharsets.UTF_8).length > MAX_CODE_BYTES) {
            throw new BusinessException(
                    "CODE_TOO_LARGE", "代码请控制在 64 KiB 以内", HttpStatus.BAD_REQUEST);
        }
        StudioViews.RunResult verified =
                AccountScope.id().isBlank()
                        ? null
                        : python.verifiedMainResult(request.runId().toString(), request.code());
        AttemptDO attempt =
                new AttemptDO(
                        request.runId().toString(),
                        request.lessonId(),
                        request.code(),
                        verified == null ? request.output() : verified.output(),
                        verified == null ? request.error() : verified.error(),
                        verified == null ? request.status() : verified.status(),
                        verified == null ? request.durationMs() : verified.durationMs(),
                        Instant.now().toString(),
                        request.lessonVersion(),
                        request.exerciseId(),
                        JsonMapper.builder()
                                .build()
                                .writeValueAsString(
                                        verified == null
                                                ? (request.input() == null
                                                        ? List.of()
                                                        : request.input())
                                                : verified.inputs()));
        if (repository.insertIfAbsent(attempt) == 0
                && !repository.find(attempt.id()).orElseThrow().sameExecution(attempt)) {
            throw new BusinessException(
                    "ATTEMPT_CONFLICT", "同一次运行不能更改已经记录的代码或结果", HttpStatus.CONFLICT);
        }
        return attempt.id();
    }
}
