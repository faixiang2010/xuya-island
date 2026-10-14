package com.xuya.island.agentapi.controller;

import com.xuya.island.agentapi.dto.AgentApi;
import com.xuya.island.agentapi.repository.ConversationRepository;
import com.xuya.island.agentapi.service.ApiFailure;
import com.xuya.island.agentapi.service.ConversationService;
import io.agentscope.core.agui.encoder.AguiEventEncoder;
import io.agentscope.core.agui.event.AguiEvent;
import io.agentscope.core.agui.model.RunAgentInput;
import io.agentscope.core.agui.runtime.AguiRequestBodyParser;
import io.agentscope.core.util.JsonUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 开放AG-UI协议入口，和REST共享后台命令服务；SDKcodec隔离Boot4的Jackson3。 */
@RestController
public class AguiController {
    private final ConversationService service;
    private final ConversationRepository repository;
    private final AguiRequestBodyParser parser = new AguiRequestBodyParser();
    private final AguiEventEncoder encoder = new AguiEventEncoder();

    public AguiController(ConversationService service, ConversationRepository repository) {
        this.service = service;
        this.repository = repository;
    }

    @PostMapping(
            value = "/api/v1/ag-ui/agents/{agentId}/run",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE,
            consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "以标准AG-UI请求运行或恢复Agent",
            description = "新thread可通过forwardedProps.workspaceId选择已注册工作区；断线仅结束观察",
            requestBody =
                    @io.swagger.v3.oas.annotations.parameters.RequestBody(
                            content =
                                    @Content(
                                            schema =
                                                    @Schema(implementation = RunAgentInput.class))))
    public Flux<ServerSentEvent<String>> run(
            @PathVariable String agentId, @RequestBody String body) {
        if (!agentId.equals("codex")) throw ApiFailure.missing();
        return Mono.fromCallable(
                        () -> {
                            RunAgentInput input;
                            try {
                                input = parser.parse(body);
                            } catch (RuntimeException exception) {
                                throw ApiFailure.invalid("AG-UI请求格式不合法");
                            }
                            return service.agui(
                                    repository.map(JsonUtils.getJsonCodec().toJson(input)));
                        })
                .subscribeOn(Schedulers.boundedElastic())
                .flatMapMany(
                        start -> {
                            AtomicLong cursor = new AtomicLong(start.cursor());
                            return Flux.interval(Duration.ZERO, Duration.ofMillis(200))
                                    .onBackpressureDrop()
                                    .concatMap(
                                            tick ->
                                                    Mono.fromCallable(
                                                                    () ->
                                                                            service.events(
                                                                                    start
                                                                                            .conversationId(),
                                                                                    cursor.get()))
                                                            .subscribeOn(
                                                                    Schedulers.boundedElastic()),
                                            1)
                                    .doOnNext(
                                            events -> {
                                                if (!events.isEmpty())
                                                    cursor.set(
                                                            events.get(events.size() - 1).cursor());
                                            })
                                    .flatMapIterable(events -> events)
                                    .filter(
                                            event ->
                                                    start.runId().equals(event.runId())
                                                            || start.executionId()
                                                                    .equals(event.runId())
                                                            || start.conversationId()
                                                                            .equals(event.runId())
                                                                    && "CUSTOM"
                                                                            .equals(
                                                                                    repository
                                                                                            .map(
                                                                                                    event
                                                                                                            .json())
                                                                                            .get(
                                                                                                    "type")))
                                    .map(event -> encode(event, start.runId()))
                                    .takeUntil(event -> terminal(event.data()))
                                    .onErrorResume(
                                            error ->
                                                    Flux.just(
                                                            ServerSentEvent.<String>builder()
                                                                    .data(
                                                                            encoder.encodeToJson(
                                                                                    JsonUtils
                                                                                            .getJsonCodec()
                                                                                            .convertValue(
                                                                                                    Map
                                                                                                            .of(
                                                                                                                    "type",
                                                                                                                    "RUN_ERROR",
                                                                                                                    "threadId",
                                                                                                                    start
                                                                                                                            .conversationId(),
                                                                                                                    "runId",
                                                                                                                    start
                                                                                                                            .runId(),
                                                                                                                    "message",
                                                                                                                    "观察连接中断，请按游标重新连接；后台任务状态保留",
                                                                                                                    "code",
                                                                                                                    "STREAM_ERROR"),
                                                                                                    AguiEvent
                                                                                                            .class)))
                                                                    .build()));
                        });
    }

    private ServerSentEvent<String> encode(AgentApi.Event source, String runId) {
        var map = new LinkedHashMap<String, Object>(repository.map(source.json()));
        map.put("runId", runId);
        AguiEvent event = JsonUtils.getJsonCodec().convertValue(map, AguiEvent.class);
        return ServerSentEvent.<String>builder()
                .id(Long.toString(source.cursor()))
                .data(encoder.encodeToJson(event))
                .build();
    }

    private boolean terminal(String json) {
        Object type = repository.map(json).get("type");
        return "RUN_FINISHED".equals(type) || "RUN_ERROR".equals(type);
    }
}
