package com.xuya.island.codex.chrome;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

@RestController
@RequestMapping("/api/v1/codex/chrome")
public class ChromeController {
    private final ChromeService chrome;

    public ChromeController(ChromeService chrome) {
        this.chrome = chrome;
    }

    @GetMapping("/status")
    public Mono<ChromeService.Status> status() {
        return Mono.fromCallable(chrome::status).subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/tabs")
    public Mono<Map<String, Object>> tabs() {
        return Mono.fromCallable(chrome::tabs).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/actions")
    public Mono<ChromeService.ActionResult> action(@RequestBody ChromeService.Action request) {
        return Mono.fromCallable(() -> chrome.action(request))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/bridge/exchange")
    public Mono<Map<String, Object>> exchange(
            @RequestHeader(name = "X-Codex-Chrome-Bridge", required = false) String key,
            @RequestBody ChromeService.Exchange request) {
        return Mono.fromCallable(() -> chrome.exchange(key, request))
                .subscribeOn(Schedulers.boundedElastic());
    }
}
