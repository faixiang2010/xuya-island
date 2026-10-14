package com.xuya.island.attempt.controller;

import com.xuya.island.attempt.dto.RecordAttemptRequest;
import com.xuya.island.attempt.service.AttemptService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * 不可变运行快照接口。
 *
 * @author Codex代码助手
 */
@RestController
@RequestMapping("/api/attempts")
public class AttemptController {

    private final AttemptService service;

    public AttemptController(AttemptService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<AttemptVO> record(@Valid @RequestBody RecordAttemptRequest request) {
        return Mono.fromCallable(() -> new AttemptVO(service.record(request)))
                .subscribeOn(Schedulers.boundedElastic());
    }

    public record AttemptVO(String id) {}
}
