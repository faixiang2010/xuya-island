package com.xuya.island.work.controller;

import com.xuya.island.work.dto.SaveWorkRequest;
import com.xuya.island.work.service.WorkService;
import com.xuya.island.work.vo.WorkVO;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * 薄控制层：参数校验、调度业务用例、返回视图。
 *
 * @author Codex代码助手
 */
@RestController
@RequestMapping("/api/works")
public class WorkController {

    private final WorkService service;

    public WorkController(WorkService service) {
        this.service = service;
    }

    @GetMapping
    public Mono<List<WorkVO>> list() {
        return Mono.fromCallable(service::list).subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/{id}")
    public Mono<WorkVO> get(@PathVariable String id) {
        return Mono.fromCallable(() -> service.get(id)).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<WorkVO> create(@Valid @RequestBody SaveWorkRequest request) {
        return Mono.fromCallable(() -> service.create(request))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PutMapping("/{id}")
    public Mono<WorkVO> update(
            @PathVariable String id, @Valid @RequestBody SaveWorkRequest request) {
        return Mono.fromCallable(() -> service.update(id, request))
                .subscribeOn(Schedulers.boundedElastic());
    }
}
