package com.xuya.island.studio.service;

import com.xuya.island.account.AccountScope;
import com.xuya.island.common.BusinessException;
import com.xuya.island.execution.NativePythonService;
import com.xuya.island.studio.dto.StudioRequests;
import com.xuya.island.studio.repository.StudioRepository;
import com.xuya.island.studio.vo.StudioViews;
import com.xuya.island.work.service.WorkService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** 项目版本与候选采用：所有写入保留历史，CAS 失败不覆盖孩子已有创作。 */
@Service
public class ProjectService {
    private final StudioRepository repository;
    private final TransactionTemplate transactions;
    private final WorkService works;
    private final NativePythonService python;

    public ProjectService(
            StudioRepository repository, TransactionTemplate transactions, WorkService works) {
        this(repository, transactions, works, null);
    }

    @Autowired
    public ProjectService(
            StudioRepository repository,
            TransactionTemplate transactions,
            WorkService works,
            NativePythonService python) {
        this.repository = repository;
        this.transactions = transactions;
        this.works = works;
        this.python = python;
    }

    public List<StudioViews.Project> list() {
        return repository.projects();
    }

    public StudioViews.Project get(String id) {
        return repository.project(id).orElseThrow(() -> missing("PROJECT_NOT_FOUND", "没有找到这个项目"));
    }

    public StudioViews.Project create(StudioRequests.CreateProject request) {
        return create(request, null);
    }

    private StudioViews.Project create(StudioRequests.CreateProject request, String sourceWork) {
        var files = StudioValidation.files(request.files());
        var preferences = StudioValidation.preferences(request.preferences());
        String now = Instant.now().toString();
        var project =
                new StudioViews.Project(
                        UUID.randomUUID().toString(),
                        request.title().trim(),
                        request.scene() == null ? "free" : request.scene(),
                        request.lessonId(),
                        sourceWork,
                        1,
                        files,
                        preferences,
                        now,
                        now);
        return transactions.execute(
                status -> {
                    repository.insertProject(project);
                    repository.insertVersion(project);
                    return project;
                });
    }

    public StudioViews.Project copyWork(String id, StudioRequests.CopyWork request) {
        var work = works.get(id);
        return create(
                new StudioRequests.CreateProject(
                        request.title() == null || request.title().isBlank()
                                ? work.title()
                                : request.title(),
                        "free",
                        null,
                        List.of(new StudioViews.ProjectFile("main.py", work.code())),
                        null),
                id);
    }

    public StudioViews.Project save(String id, StudioRequests.SaveProject request) {
        var previous = get(id);
        var files = StudioValidation.files(request.files());
        var preferences = StudioValidation.preferences(request.preferences());
        var next =
                new StudioViews.Project(
                        id,
                        request.title().trim(),
                        previous.scene(),
                        previous.lessonId(),
                        previous.sourceWorkId(),
                        request.revision() + 1,
                        files,
                        preferences,
                        previous.createdAt(),
                        Instant.now().toString());
        return transactions.execute(
                status -> {
                    if (repository.saveProject(next, request.revision()) != 1)
                        conflict("PROJECT_CONFLICT", "项目已经更新，草稿仍保留，请比较版本");
                    repository.insertVersion(next);
                    return next;
                });
    }

    public List<StudioViews.ProjectVersion> versions(String id) {
        get(id);
        return repository.versions(id);
    }

    public StudioViews.Project restore(String id, StudioRequests.Restore request) {
        var version =
                versions(id).stream()
                        .filter(v -> v.revision() == request.revision())
                        .findFirst()
                        .orElseThrow(() -> missing("VERSION_NOT_FOUND", "这个项目版本不存在"));
        return save(
                id,
                new StudioRequests.SaveProject(
                        version.title(),
                        request.expectedRevision(),
                        version.files(),
                        version.preferences()));
    }

    public StudioViews.Candidate candidate(String id) {
        return repository
                .candidate(id)
                .orElseThrow(() -> missing("CANDIDATE_NOT_FOUND", "没有找到这份候选作品"));
    }

    public StudioViews.Candidate propose(
            String sessionId,
            String projectId,
            int baseRevision,
            List<StudioViews.ProjectFile> files,
            String explanation) {
        return propose(sessionId, projectId, baseRevision, files, explanation, null);
    }

    public StudioViews.Candidate propose(
            String sessionId,
            String projectId,
            int baseRevision,
            List<StudioViews.ProjectFile> files,
            String explanation,
            String turnId) {
        var project = get(projectId);
        if (project.revision() != baseRevision) conflict("CANDIDATE_STALE", "项目已改变，请以新版本重新共创");
        if (explanation == null || explanation.length() > 1000)
            StudioValidation.invalid("修改说明最多 1000 字");
        var candidate =
                new StudioViews.Candidate(
                        UUID.randomUUID().toString(),
                        projectId,
                        baseRevision,
                        StudioValidation.files(files),
                        explanation,
                        "pending",
                        null,
                        Instant.now().toString());
        repository.insertCandidate(sessionId, turnId, candidate);
        return candidate;
    }

    public StudioViews.Project apply(String id, int expectedRevision) {
        var c = candidate(id);
        var p = get(c.projectId());
        if (!"pending".equals(c.status())
                || expectedRevision != c.baseRevision()
                || p.revision() != c.baseRevision()) {
            conflict("CANDIDATE_STALE", "这份候选的基准已改变，先保留草稿，再重新共创");
        }
        return transactions.execute(
                status -> {
                    var saved =
                            save(
                                    p.id(),
                                    new StudioRequests.SaveProject(
                                            p.title(),
                                            expectedRevision,
                                            c.files(),
                                            p.preferences()));
                    if (repository.candidateState(id, "pending", "applied", saved.revision()) != 1)
                        conflict("CANDIDATE_CONFLICT", "候选已经处理");
                    return saved;
                });
    }

    public StudioViews.Candidate reject(String id) {
        var c = candidate(id);
        if ("rejected".equals(c.status())) return c;
        if (repository.candidateState(id, "pending", "rejected", null) != 1)
            conflict("CANDIDATE_CONFLICT", "已采用的版本请使用恢复操作");
        return candidate(id);
    }

    public StudioViews.Project undo(String id, int expectedRevision) {
        var c = candidate(id);
        if (!"applied".equals(c.status())
                || c.appliedRevision() == null
                || c.appliedRevision() != expectedRevision) {
            conflict("CANDIDATE_STALE", "项目已有后续修改，请从历史中选择恢复，避免覆盖新作品");
        }
        return transactions.execute(
                status -> {
                    var restored =
                            restore(
                                    c.projectId(),
                                    new StudioRequests.Restore(c.baseRevision(), expectedRevision));
                    if (repository.candidateState(id, "applied", "rejected", c.appliedRevision())
                            != 1) conflict("CANDIDATE_CONFLICT", "候选已经处理");
                    return restored;
                });
    }

    public StudioViews.ProjectRun recordRun(String id, StudioRequests.ManualRun request) {
        var p = get(id);
        var files = StudioValidation.files(request.files());
        StudioValidation.run(request.result());
        var verified = verifyRun(request.result(), files);
        var run =
                new StudioViews.ProjectRun(
                        UUID.randomUUID().toString(),
                        id,
                        p.revision(),
                        files,
                        verified,
                        Instant.now().toString());
        repository.insertRun(run);
        return run;
    }

    public StudioViews.RunResult verifyRun(
            StudioViews.RunResult result, List<StudioViews.ProjectFile> files) {
        if (AccountScope.id().isBlank()) return result;
        if (python == null) throw new IllegalStateException("原生运行验证未装配");
        return python.verifiedResult(result.runId(), files);
    }

    public static BusinessException missing(String code, String message) {
        return new BusinessException(code, message, HttpStatus.NOT_FOUND);
    }

    public static void conflict(String code, String message) {
        throw new BusinessException(code, message, HttpStatus.CONFLICT);
    }
}
