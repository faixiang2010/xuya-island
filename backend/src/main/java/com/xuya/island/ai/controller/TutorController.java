package com.xuya.island.ai.controller;

import com.xuya.island.ai.dto.AskTutorRequest;
import com.xuya.island.ai.service.TutorService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * 教学 API；SDK 装配与关闭操作放在 boundedElastic 中。
 *
 * @author Codex代码助手
 */
@RestController
@RequestMapping("/api/tutor")
public class TutorController {

    private final TutorService service;

    public TutorController(TutorService service) {
        this.service = service;
    }

    @GetMapping("/status")
    public TutorService.TutorStatus status() {
        return service.status();
    }

    @PostMapping("/ask")
    public Mono<TutorService.TutorReply> ask(@Valid @RequestBody AskTutorRequest request) {
        return Mono.fromCallable(() -> service.ask(request))
                .subscribeOn(Schedulers.boundedElastic());
    }
}
