package com.xuya.island.studio.controller;

import com.xuya.island.studio.dto.StudioRequests;
import com.xuya.island.studio.repository.StudioRepository;
import com.xuya.island.studio.service.ProjectService;
import com.xuya.island.studio.service.StudySessionService;
import com.xuya.island.studio.vo.StudioViews;
import io.agentscope.harness.agent.session.AgentSession;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 所有数据库和 SDK 存储操作均离开 WebFlux 事件循环；SSE仅观察既有会话。 */
@RestController
public class StudioController {
    private final ProjectService projects;
    private final StudySessionService sessions;
    private final StudioRepository repository;

    public StudioController(
            ProjectService projects, StudySessionService sessions, StudioRepository repository) {
        this.projects = projects;
        this.sessions = sessions;
        this.repository = repository;
    }

    private <T> Mono<T> blocking(Callable<T> action) {
        return Mono.fromCallable(action).subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/api/projects")
    public Mono<List<StudioViews.Project>> projects() {
        return blocking(projects::list);
    }

    @PostMapping("/api/projects")
    public Mono<StudioViews.Project> create(
            @Valid @RequestBody StudioRequests.CreateProject request) {
        return blocking(() -> projects.create(request));
    }

    @GetMapping("/api/projects/{id}")
    public Mono<StudioViews.Project> project(@PathVariable String id) {
        return blocking(() -> projects.get(id));
    }

    @PutMapping("/api/projects/{id}")
    public Mono<StudioViews.Project> save(
            @PathVariable String id, @Valid @RequestBody StudioRequests.SaveProject request) {
        return blocking(() -> projects.save(id, request));
    }

    @PostMapping("/api/projects/from-work/{id}")
    public Mono<StudioViews.Project> copy(
            @PathVariable String id, @RequestBody StudioRequests.CopyWork request) {
        return blocking(() -> projects.copyWork(id, request));
    }

    @DeleteMapping("/api/projects/{id}")
    public Mono<StudioViews.Project> delete(@PathVariable String id) {
        return blocking(() -> projects.delete(id));
    }

    @GetMapping("/api/projects/{id}/versions")
    public Mono<List<StudioViews.ProjectVersion>> versions(@PathVariable String id) {
        return blocking(() -> projects.versions(id));
    }

    @PostMapping("/api/projects/{id}/restore")
    public Mono<StudioViews.Project> restore(
            @PathVariable String id, @Valid @RequestBody StudioRequests.Restore request) {
        return blocking(() -> projects.restore(id, request));
    }

    @PostMapping("/api/projects/{id}/runs")
    public Mono<StudioViews.ProjectRun> run(
            @PathVariable String id, @Valid @RequestBody StudioRequests.ManualRun request) {
        return blocking(() -> projects.recordRun(id, request));
    }

    @PostMapping("/api/candidates/{id}/apply")
    public Mono<StudioViews.Project> apply(
            @PathVariable String id, @Valid @RequestBody StudioRequests.Revision request) {
        return blocking(() -> projects.apply(id, request.revision()));
    }

    @PostMapping("/api/candidates/{id}/reject")
    public Mono<StudioViews.Candidate> reject(@PathVariable String id) {
        return blocking(() -> projects.reject(id));
    }

    @PostMapping("/api/candidates/{id}/undo")
    public Mono<StudioViews.Project> undo(
            @PathVariable String id, @Valid @RequestBody StudioRequests.Revision request) {
        return blocking(() -> projects.undo(id, request.revision()));
    }

    @GetMapping("/api/study-sessions")
    public Mono<List<StudioViews.StudySession>> sessions(@RequestParam String projectId) {
        return blocking(() -> sessions.list(projectId));
    }

    @PostMapping("/api/study-sessions")
    public Mono<StudioViews.StudySession> session(
            @Valid @RequestBody StudioRequests.CreateSession request) {
        return blocking(() -> sessions.create(request));
    }

    @PostMapping("/api/study-sessions/{id}/messages")
    public Mono<AgentSession.Task> message(
            @PathVariable String id, @Valid @RequestBody StudioRequests.Message request) {
        return blocking(() -> sessions.message(id, request));
    }

    @GetMapping("/api/study-sessions/{id}/snapshot")
    public Mono<StudioViews.Snapshot> snapshot(@PathVariable String id) {
        return blocking(() -> sessions.snapshot(id));
    }

    @GetMapping(
            value = "/api/study-sessions/{id}/events",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<StudioViews.Snapshot>> events(
            @PathVariable String id, @RequestParam(defaultValue = "0") long cursor) {
        // 串行轮询：上一次快照完成后再等 1 秒，避免 interval 背压溢出（OverflowException）中断 SSE。
        return Flux.defer(() -> blocking(() -> sessions.snapshot(id)))
                .repeatWhen(completed -> completed.delayElements(Duration.ofSeconds(1)))
                .distinctUntilChanged(repository::json)
                .map(
                        snapshot ->
                                ServerSentEvent.builder(snapshot)
                                        .event("snapshot")
                                        .id(Long.toString(snapshot.cursor()))
                                        .build());
    }

    @PostMapping("/api/study-sessions/{id}/interrupt")
    public Mono<Map<String, Boolean>> interrupt(
            @PathVariable String id, @RequestBody StudioRequests.Interrupt request) {
        return blocking(() -> Map.of("interrupted", sessions.interrupt(id, request.runId())));
    }

    @PostMapping("/api/study-sessions/{id}/resume")
    public Mono<AgentSession.Task> resume(
            @PathVariable String id, @Valid @RequestBody StudioRequests.Resume request) {
        return blocking(() -> sessions.resume(id, request.turnId()));
    }

    @PostMapping("/api/study-sessions/{id}/run-requests/{requestId}/claim")
    public Mono<StudioViews.RunExecution> claim(
            @PathVariable String id,
            @PathVariable String requestId,
            @Valid @RequestBody StudioRequests.Claim request) {
        return blocking(() -> sessions.claim(id, requestId, request.clientExecutionId(), false));
    }

    @PostMapping("/api/study-sessions/{id}/run-requests/{requestId}/retry")
    public Mono<StudioViews.RunExecution> retry(
            @PathVariable String id,
            @PathVariable String requestId,
            @Valid @RequestBody StudioRequests.Claim request) {
        return blocking(() -> sessions.claim(id, requestId, request.clientExecutionId(), true));
    }

    @PostMapping("/api/study-sessions/{id}/run-executions/{executionId}/result")
    public Mono<StudioViews.RunExecution> result(
            @PathVariable String id,
            @PathVariable String executionId,
            @RequestBody StudioViews.RunResult request) {
        return blocking(() -> sessions.result(id, executionId, request));
    }

    @PostMapping("/api/study-sessions/{id}/run-executions/{executionId}/heartbeat")
    public Mono<StudioViews.RunExecution> heartbeat(
            @PathVariable String id, @PathVariable String executionId) {
        return blocking(() -> sessions.heartbeat(id, executionId));
    }

    @PostMapping("/api/study-sessions/{id}/run-executions/{executionId}/abandon")
    public Mono<StudioViews.RunExecution> abandon(
            @PathVariable String id, @PathVariable String executionId) {
        return blocking(() -> sessions.abandon(id, executionId));
    }
}
