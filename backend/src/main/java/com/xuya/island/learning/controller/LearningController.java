package com.xuya.island.learning.controller;

import com.xuya.island.learning.dto.ExerciseAttemptRequest;
import com.xuya.island.learning.dto.ProgressRequest;
import com.xuya.island.learning.service.LearningService;
import com.xuya.island.learning.vo.ProgressVO;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 校验请求并将 SQLite 操作调度到弹性线程池。 */
@RestController
public class LearningController {

    private final LearningService service;

    public LearningController(LearningService service) {
        this.service = service;
    }

    @GetMapping("/api/progress")
    public Mono<List<ProgressVO>> list() {
        return Mono.fromCallable(service::list).subscribeOn(Schedulers.boundedElastic());
    }

    @PutMapping("/api/progress/{lessonId}")
    public Mono<ProgressVO> save(
            @PathVariable String lessonId, @Valid @RequestBody ProgressRequest request) {
        return Mono.fromCallable(() -> service.save(lessonId, request))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/api/exercise-attempts")
    public Mono<Map<String, String>> record(@Valid @RequestBody ExerciseAttemptRequest request) {
        return Mono.fromCallable(() -> Map.of("id", service.record(request)))
                .subscribeOn(Schedulers.boundedElastic());
    }
}
