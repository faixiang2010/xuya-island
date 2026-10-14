package com.xuya.island.execution;

import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 环境配置仅供管理员，所有运行资源由统一账户过滤器和服务归属校验。 */
@RestController
public class PythonController {
    private final PythonEnvironmentService environments;
    private final NativePythonService python;

    public PythonController(PythonEnvironmentService environments, NativePythonService python) {
        this.environments = environments;
        this.python = python;
    }

    @GetMapping("/api/v1/execution/environment")
    public Mono<Map<String, Object>> environment() {
        return blocking(environments::state);
    }

    @GetMapping("/api/v1/system/python")
    public Mono<List<Map<String, Object>>> discover() {
        return blocking(environments::discover);
    }

    @PostMapping("/api/v1/system/python/probe")
    public Mono<Map<String, Object>> probe(@RequestBody Map<String, String> body) {
        return blocking(() -> environments.probe(body.get("executable")));
    }

    @PutMapping("/api/v1/system/python")
    public Mono<Map<String, Object>> select(@RequestBody Map<String, String> body) {
        return blocking(() -> environments.select(body.get("executable")));
    }

    @PostMapping("/api/v1/execution/runs")
    public Mono<Map<String, Object>> start(@RequestBody NativePythonService.Start body) {
        return blocking(() -> python.start(body));
    }

    @GetMapping("/api/v1/execution/runs/{id}")
    public Mono<Map<String, Object>> status(@PathVariable String id) {
        return blocking(() -> python.snapshot(id));
    }

    @PostMapping("/api/v1/execution/runs/{id}/input")
    public Mono<Map<String, Object>> input(
            @PathVariable String id, @RequestBody NativePythonService.Input body) {
        return blocking(() -> python.input(id, body));
    }

    @PostMapping("/api/v1/execution/runs/{id}/stop")
    public Mono<Map<String, Object>> stop(@PathVariable String id) {
        return blocking(() -> python.stop(id));
    }

    private <T> Mono<T> blocking(Supplier<T> action) {
        return Mono.fromCallable(action::get).subscribeOn(Schedulers.boundedElastic());
    }
}
