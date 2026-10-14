package com.xuya.island.agentapi.controller;

import com.xuya.island.agentapi.dto.AgentApi;
import com.xuya.island.agentapi.service.ConversationService;
import com.xuya.island.agentapi.service.TaskMetadataService;
import com.xuya.island.codex.agent.AgentRuntimeAdapter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 目标、计划、自动化、协作和记忆的产品资源接口。 */
@RestController
@RequestMapping("/api/v1/codex")
public class TaskMetadataController {
    @Schema(name = "CodexCancelSubagent")
    public record CancelSubagent(@NotBlank @Size(max = 160) String clientRequestId) {}

    private final TaskMetadataService metadata;
    private final ConversationService conversations;
    private final AgentRuntimeAdapter runtime;

    public TaskMetadataController(
            TaskMetadataService metadata,
            ConversationService conversations,
            AgentRuntimeAdapter runtime) {
        this.metadata = metadata;
        this.conversations = conversations;
        this.runtime = runtime;
    }

    @GetMapping("/goals")
    public Mono<List<AgentApi.Goal>> goals(@RequestParam String conversationId) {
        return Mono.fromCallable(() -> metadata.goals(conversationId))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/goals")
    public Mono<AgentApi.Goal> createGoal(@RequestBody Map<String, Object> request) {
        return Mono.fromCallable(() -> metadata.createGoal(request))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PutMapping("/goals/{id}")
    public Mono<AgentApi.Goal> updateGoal(
            @PathVariable String id, @RequestBody Map<String, Object> request) {
        return Mono.fromCallable(() -> metadata.updateGoal(id, request))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/conversations/{id}/plan")
    public Mono<Map<String, Object>> plan(@PathVariable String id) {
        return Mono.fromCallable(
                        () -> {
                            var map = new java.util.LinkedHashMap<String, Object>();
                            map.put("plan", metadata.plan(id));
                            return (Map<String, Object>) map;
                        })
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PutMapping("/conversations/{id}/plan")
    public Mono<AgentApi.Plan> plan(
            @PathVariable String id, @RequestBody Map<String, Object> request) {
        return Mono.fromCallable(() -> metadata.putPlan(id, request))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/automations")
    public Mono<List<AgentApi.Automation>> automations() {
        return Mono.fromCallable(metadata::automations).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/automations")
    public Mono<AgentApi.Automation> createAutomation(@RequestBody Map<String, Object> request) {
        return Mono.fromCallable(() -> metadata.saveAutomation(null, request))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PutMapping("/automations/{id}")
    public Mono<AgentApi.Automation> updateAutomation(
            @PathVariable String id, @RequestBody Map<String, Object> request) {
        return Mono.fromCallable(() -> metadata.saveAutomation(id, request))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @DeleteMapping("/automations/{id}")
    public Mono<Map<String, Object>> deleteAutomation(@PathVariable String id) {
        return Mono.fromCallable(
                        () -> {
                            metadata.deleteAutomation(id);
                            return Map.<String, Object>of("deleted", true);
                        })
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/conversations/{id}/agents")
    public Mono<List<Map<String, Object>>> agents(@PathVariable String id) {
        return Mono.fromCallable(() -> conversations.agents(id))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/conversations/{id}/agents/{taskId}")
    public Mono<Map<String, Object>> agent(@PathVariable String id, @PathVariable String taskId) {
        return Mono.fromCallable(() -> conversations.agent(id, taskId))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/conversations/{id}/agents/{taskId}/cancel")
    public Mono<Map<String, Object>> cancelAgent(
            @PathVariable String id,
            @PathVariable String taskId,
            @Valid @RequestBody CancelSubagent request) {
        return Mono.fromCallable(
                        () -> conversations.cancelAgent(id, taskId, request.clientRequestId()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/conversations/{id}/memory")
    public Mono<List<Map<String, Object>>> memory(@PathVariable String id) {
        return Mono.fromCallable(() -> runtime.memory(conversations.spec(id)))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PutMapping("/conversations/{id}/memory")
    public Mono<Map<String, Object>> memory(
            @PathVariable String id, @RequestBody Map<String, String> request) {
        return Mono.fromCallable(
                        () ->
                                runtime.writeMemory(
                                        conversations.spec(id),
                                        request.getOrDefault("path", "MEMORY.md"),
                                        request.getOrDefault("content", "")))
                .subscribeOn(Schedulers.boundedElastic());
    }
}
