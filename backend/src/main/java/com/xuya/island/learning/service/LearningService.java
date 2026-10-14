package com.xuya.island.learning.service;

import com.xuya.island.common.BusinessException;
import com.xuya.island.learning.dto.ExerciseAttemptRequest;
import com.xuya.island.learning.dto.ProgressRequest;
import com.xuya.island.learning.repository.LearningRepository;
import com.xuya.island.learning.vo.ProgressVO;
import com.xuya.island.lesson.service.LessonService;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/** 课程版本与练习归属校验，不把浏览器运行报告当作掌握程度。 */
@Service
public class LearningService {

    private final LearningRepository repository;
    private final LessonService lessons;
    private final TransactionTemplate transaction;
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final com.xuya.island.execution.NativePythonService python;

    public LearningService(
            LearningRepository repository, LessonService lessons, TransactionTemplate transaction) {
        this(repository, lessons, transaction, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public LearningService(
            LearningRepository repository,
            LessonService lessons,
            TransactionTemplate transaction,
            com.xuya.island.execution.NativePythonService python) {
        this.repository = repository;
        this.lessons = lessons;
        this.transaction = transaction;
        this.python = python;
    }

    public List<ProgressVO> list() {
        return repository.list();
    }

    public ProgressVO save(String id, ProgressRequest request) {
        lessons.versioned(id, request.lessonVersion());
        return transaction.execute(
                status -> {
                    var previous =
                            repository.list().stream()
                                    .filter(
                                            value ->
                                                    value.lessonId().equals(id)
                                                            && value.lessonVersion()
                                                                    .equals(
                                                                            request
                                                                                    .lessonVersion()))
                                    .findFirst();
                    ProgressVO progress =
                            new ProgressVO(
                                    id,
                                    request.lessonVersion(),
                                    request.status(),
                                    request.hintLevel(),
                                    request.referenceViewed(),
                                    request.reflection(),
                                    request.parentObservation(),
                                    Instant.now().toString());
                    repository.save(progress);
                    ProgressVO saved =
                            repository.list().stream()
                                    .filter(
                                            item ->
                                                    item.lessonId().equals(id)
                                                            && item.lessonVersion()
                                                                    .equals(
                                                                            request
                                                                                    .lessonVersion()))
                                    .findFirst()
                                    .orElseThrow();
                    String nextPayload = progressPayload(saved);
                    if (previous.isEmpty() || !progressPayload(previous.get()).equals(nextPayload))
                        repository.recordProgress(saved, nextPayload);
                    return saved;
                });
    }

    private String progressPayload(ProgressVO value) {
        return mapper.writeValueAsString(
                java.util.Map.of(
                        "status",
                        value.status(),
                        "hintLevel",
                        value.hintLevel(),
                        "referenceViewed",
                        value.referenceViewed(),
                        "reflection",
                        value.reflection(),
                        "parentObservation",
                        value.parentObservation()));
    }

    public String record(ExerciseAttemptRequest request) {
        var lesson = lessons.versioned(request.lessonId(), request.lessonVersion());
        var exercise =
                lesson.exercises().stream()
                        .filter(item -> item.id().equals(request.exerciseId()))
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        new BusinessException(
                                                "EXERCISE_NOT_FOUND",
                                                "没有找到这项练习",
                                                HttpStatus.BAD_REQUEST));
        boolean allPassed =
                request.cases().stream().allMatch(ExerciseAttemptRequest.CaseResult::passed);
        if (request.code().getBytes(StandardCharsets.UTF_8).length > 65536
                || request.cases().size() != exercise.tests().size()
                || allPassed != "passed".equals(request.status())) {
            throw new BusinessException(
                    "INVALID_EXERCISE_REPORT", "练习报告不完整，请重新检查", HttpStatus.BAD_REQUEST);
        }
        for (int index = 0; index < exercise.tests().size(); index++) {
            var expected = exercise.tests().get(index);
            var actual = request.cases().get(index);
            if (!expected.name().equals(actual.name())
                    || !expected.input().equals(actual.input())) {
                throw new BusinessException(
                        "INVALID_EXERCISE_REPORT", "练习用例与课程不对应", HttpStatus.BAD_REQUEST);
            }
            if (python != null && !com.xuya.island.account.AccountScope.id().isEmpty()) {
                if (actual.runId() == null || actual.runId().isBlank())
                    throw com.xuya.island.account.AccountService.invalid("请引用这次主机Python检查结果");
                var result = python.verifiedMainResult(actual.runId(), request.code());
                int cursor = 0;
                boolean ordered = true;
                for (String part : expected.outputContains()) {
                    int found = result.output().indexOf(part, cursor);
                    if (found < 0) {
                        ordered = false;
                        break;
                    }
                    cursor = found + part.length();
                }
                boolean passed =
                        result.status().equals("success")
                                && ordered
                                && result.drawings().size() >= expected.minDrawings()
                                && expected.expectedFiles().stream()
                                        .allMatch(
                                                name ->
                                                        result.files().stream()
                                                                .anyMatch(
                                                                        file ->
                                                                                name.equals(
                                                                                        file.get(
                                                                                                "name"))));
                if (!result.inputs().equals(expected.input())
                        || !result.output().equals(actual.output())
                        || !result.error().equals(actual.error())
                        || passed != actual.passed())
                    throw com.xuya.island.account.AccountService.invalid("练习报告与主机实际运行不一致，请重新检查");
            }
        }
        String payload = mapper.writeValueAsString(request);
        if (repository.insert(request, payload) == 0
                && !repository.findAttempt(request.id().toString()).orElse("").equals(payload)) {
            throw new BusinessException(
                    "EXERCISE_CONFLICT", "同一次练习不能修改已记录的结果", HttpStatus.CONFLICT);
        }
        return request.id().toString();
    }
}
