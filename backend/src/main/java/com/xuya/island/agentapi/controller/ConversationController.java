package com.xuya.island.agentapi.controller;

import com.xuya.island.agentapi.dto.AgentApi;
import com.xuya.island.agentapi.repository.ConversationRepository;
import com.xuya.island.agentapi.service.ApiFailure;
import com.xuya.island.agentapi.service.ConversationService;
import io.agentscope.core.agui.encoder.AguiEventEncoder;
import io.agentscope.core.agui.event.AguiEvent;
import io.agentscope.core.util.JsonUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 通用会话Controller；阻塞存储与SDK访问全部隔离于弹性线程池。 */
@RestController
@RequestMapping("/api/v1/conversations")
@Tag(name = "通用会话", description = "可供React、桌面及其他AG-UI客户端共用")
public class ConversationController {
    private final ConversationService service;
    private final ConversationRepository repository;
    private final AguiEventEncoder encoder = new AguiEventEncoder();

    public ConversationController(ConversationService service, ConversationRepository repository) {
        this.service = service;
        this.repository = repository;
    }

    @GetMapping
    @Operation(summary = "查询会话列表")
    public Mono<List<AgentApi.Conversation>> list(
            @RequestParam(required = false) String projectId) {
        return Mono.fromCallable(() -> service.list(projectId))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "创建独立工作区会话")
    public Mono<AgentApi.Conversation> create(
            @Valid @RequestBody AgentApi.CreateConversation request) {
        return Mono.fromCallable(() -> service.create(request))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/{id}")
    public Mono<AgentApi.Conversation> get(@PathVariable String id) {
        return Mono.fromCallable(() -> service.get(id)).subscribeOn(Schedulers.boundedElastic());
    }

    @PatchMapping("/{id}")
    @Operation(
            summary = "修改聊天偏好或运行设置",
            description = "置顶/改名不触发任务；归档有活动执行的聊天返回409，恢复保留原ID和工作目录。",
            requestBody =
                    @io.swagger.v3.oas.annotations.parameters.RequestBody(
                            content =
                                    @io.swagger.v3.oas.annotations.media.Content(
                                            schema =
                                                    @io.swagger.v3.oas.annotations.media.Schema(
                                                            implementation =
                                                                    AgentApi.ConversationPatch
                                                                            .class))))
    public Mono<AgentApi.Conversation> configure(
            @PathVariable String id, @RequestBody Map<String, Object> changes) {
        return Mono.fromCallable(() -> service.configure(id, changes))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/{id}/runs")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary = "幂等提交后台任务", description = "同一clientRequestId重试观察原任务，不重复执行；不同内容返回409")
    public Mono<AgentApi.RunReceipt> submit(
            @PathVariable String id, @Valid @RequestBody AgentApi.SubmitRun request) {
        return Mono.fromCallable(() -> service.submit(id, request))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/{id}/snapshot")
    @Operation(summary = "获取固定游标的会话快照")
    public Mono<AgentApi.ConversationSnapshot> snapshot(@PathVariable String id) {
        return Mono.fromCallable(() -> service.snapshot(id))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping(value = "/{id}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(
            summary = "订阅AG-UI投影事件",
            description = "Last-Event-ID或after指定最后观察的游标。断开只结束观察，不取消后台任务")
    public Flux<ServerSentEvent<String>> events(
            @PathVariable String id,
            @RequestParam(defaultValue = "0") long after,
            @RequestParam(required = false) Long cursor,
            @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId) {
        long initial = cursor == null ? after : cursor;
        if (lastEventId != null) {
            try {
                initial = Long.parseLong(lastEventId);
            } catch (NumberFormatException exception) {
                throw ApiFailure.invalid("Last-Event-ID必须是事件游标");
            }
        }
        AtomicLong position = new AtomicLong(initial);
        return Mono.fromCallable(() -> service.events(id, position.get()))
                .subscribeOn(Schedulers.boundedElastic())
                .doOnNext(
                        page -> {
                            if (!page.isEmpty()) position.set(page.get(page.size() - 1).cursor());
                        })
                .flatMapMany(
                        first ->
                                Flux.concat(
                                                Flux.fromIterable(first),
                                                Flux.interval(Duration.ofMillis(250))
                                                        .onBackpressureDrop()
                                                        .concatMap(
                                                                tick ->
                                                                        Mono.fromCallable(
                                                                                        () ->
                                                                                                service
                                                                                                        .events(
                                                                                                                id,
                                                                                                                position
                                                                                                                        .get()))
                                                                                .subscribeOn(
                                                                                        Schedulers
                                                                                                .boundedElastic()),
                                                                1)
                                                        .doOnNext(
                                                                page -> {
                                                                    if (!page.isEmpty())
                                                                        position.set(
                                                                                page.get(
                                                                                                page
                                                                                                                .size()
                                                                                                        - 1)
                                                                                        .cursor());
                                                                })
                                                        .flatMapIterable(page -> page))
                                        .map(this::encode));
    }

    public ServerSentEvent<String> encode(AgentApi.Event value) {
        AguiEvent event =
                JsonUtils.getJsonCodec()
                        .convertValue(repository.map(value.json()), AguiEvent.class);
        return ServerSentEvent.<String>builder()
                .id(Long.toString(value.cursor()))
                .data(encoder.encodeToJson(event))
                .build();
    }

    @PostMapping("/{id}/interactions/{interactionId}/responses")
    @Operation(summary = "幂等回答提问或工具审批")
    public Mono<Map<String, Object>> respond(
            @PathVariable String id,
            @PathVariable String interactionId,
            @Valid @RequestBody AgentApi.Respond request) {
        return Mono.fromCallable(() -> service.respond(id, interactionId, request))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/{id}/actions")
    @Operation(summary = "补充要求、中断、取消、继续或配置会话")
    public Mono<Map<String, Object>> action(
            @PathVariable String id, @Valid @RequestBody AgentApi.Action request) {
        return Mono.fromCallable(() -> service.action(id, request))
                .subscribeOn(Schedulers.boundedElastic());
    }
}
