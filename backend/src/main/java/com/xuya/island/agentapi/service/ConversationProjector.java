package com.xuya.island.agentapi.service;

import com.xuya.island.agentapi.dto.AgentApi;
import com.xuya.island.agentapi.repository.ConversationRepository;
import com.xuya.island.codex.agent.AgentRuntimeAdapter;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/** 原生持久事实到AG-UI的确定性投影；不是将SessionEvent误当AgentEvent。 */
@Service
public class ConversationProjector {
    private final ConversationRepository repository;

    public ConversationProjector(ConversationRepository repository) {
        this.repository = repository;
    }

    public void project(
            String id,
            AgentRuntimeAdapter.NativeEvent source,
            List<AgentRuntimeAdapter.NativeInteraction> pending) {
        var row =
                repository.runs(id).stream()
                        .filter(
                                run ->
                                        source.turnId() != null
                                                && source.turnId().equals(run.nativeTurnId()))
                        .findFirst()
                        .orElse(null);
        String execution = row == null ? id : row.id();
        String run = repository.protocolRun(id, execution);
        Map<String, Object> data = source.data();
        List<Map<String, Object>> events = new ArrayList<>();
        String type = source.type();
        // 子任务事件只能进入独立命名空间，不能结束父运行或拼入父消息。
        boolean child =
                type.startsWith("subagent/")
                        || String.valueOf(data.getOrDefault("source", "")).startsWith("subagent:");
        if (child) {
            String childId =
                    string(
                            data.get("taskId"),
                            string(
                                    data.get("childSessionId"),
                                    string(
                                            data.get("source"),
                                            string(data.get("childRunId"), "subagent"))));
            var value = new LinkedHashMap<String, Object>();
            value.put("source", childId);
            value.put("type", type);
            value.put(
                    "status",
                    string(
                            data.get("status"),
                            type.endsWith("completed") ? "completed" : "running"));
            value.put(
                    "agentId",
                    string(data.get("childAgentId"), string(data.get("agent"), "reviewer")));
            String name = "subagent.lifecycle";
            if (type.equals("model/chunk")) {
                name = "subagent.text";
                value.put("delta", text(object(data.get("chunk"))));
            }
            if (type.equals("tool/requested")) {
                name = "subagent.tool_call";
                value.put("call", object(data.get("call")));
            }
            if (type.equals("tool/result")) {
                name = "subagent.tool_result";
                value.put("result", text(object(data.get("message"))));
            }
            events.add(custom(id, run, name, value));
            persist(id, source, run, events);
            return;
        }
        if (type.equals("turn/start") || type.equals("turn/resumed"))
            events.add(event("RUN_STARTED", id, run));
        if (type.equals("message/user")) {
            Map<String, Object> message = object(data.get("message"));
            String messageId = string(message.get("id"), "user-" + source.seq());
            events.add(
                    custom(
                            id,
                            run,
                            "codex.user_message",
                            Map.of(
                                    "message",
                                    Map.of(
                                            "id",
                                            messageId,
                                            "role",
                                            "user",
                                            "content",
                                            text(message)))));
        }
        if (type.equals("model/chunk")) {
            String messageId = string(data.get("modelCallId"), "model-" + source.turnId());
            String delta = text(object(data.get("chunk")));
            if (!delta.isEmpty()) {
                if (!hasMessageEvent(id, messageId, "TEXT_MESSAGE_START"))
                    events.add(textEvent("TEXT_MESSAGE_START", id, run, messageId, null));
                events.add(textEvent("TEXT_MESSAGE_CONTENT", id, run, messageId, delta));
            }
        }
        if (type.equals("message/assistant")) {
            Map<String, Object> message = object(data.get("message"));
            String messageId =
                    string(
                            data.get("modelCallId"),
                            string(message.get("id"), "assistant-" + source.seq()));
            String content = text(message);
            if (!content.isEmpty() && !hasMessageEvent(id, messageId, "TEXT_MESSAGE_START")) {
                events.add(textEvent("TEXT_MESSAGE_START", id, run, messageId, null));
                events.add(textEvent("TEXT_MESSAGE_CONTENT", id, run, messageId, content));
            }
            if (!content.isEmpty() || hasMessageEvent(id, messageId, "TEXT_MESSAGE_START"))
                events.add(textEvent("TEXT_MESSAGE_END", id, run, messageId, null));
        }
        if (type.equals("tool/requested")) {
            Map<String, Object> call = object(data.get("call"));
            String toolId =
                    string(call.get("id"), string(data.get("toolCallId"), "tool-" + source.seq()));
            Map<String, Object> start = event("TOOL_CALL_START", id, run);
            start.put("toolCallId", toolId);
            start.put(
                    "toolCallName", string(call.get("name"), string(data.get("toolName"), "tool")));
            events.add(start);
            Map<String, Object> args = event("TOOL_CALL_ARGS", id, run);
            args.put("toolCallId", toolId);
            args.put("delta", repository.json(call.getOrDefault("input", Map.of())));
            events.add(args);
            Map<String, Object> end = event("TOOL_CALL_END", id, run);
            end.put("toolCallId", toolId);
            events.add(end);
        }
        if (type.equals("tool/result")) {
            List<Map<String, Object>> results = new ArrayList<>();
            Map<String, Object> message = object(data.get("message"));
            if (message.get("content") instanceof List<?> blocks) {
                for (Object block : blocks) {
                    Map<String, Object> item = object(block);
                    if ("tool_result".equals(item.get("type"))) results.add(item);
                }
            }
            if (results.isEmpty()) results.add(object(data.get("result")));
            Map<String, Object> call = object(data.get("call"));
            for (int index = 0; index < results.size(); index++) {
                Map<String, Object> result = results.get(index);
                String toolId =
                        string(
                                result.get("id"),
                                string(
                                        data.get("toolCallId"),
                                        string(call.get("id"), "tool-" + source.seq())));
                Map<String, Object> output = event("TOOL_CALL_RESULT", id, run);
                output.put("messageId", "result-" + source.seq() + "-" + index);
                output.put("toolCallId", toolId);
                output.put("role", "tool");
                output.put("content", text(result));
                events.add(output);
            }
        }
        if (type.equals("interaction/requested")) {
            String requestId = string(data.get("requestId"), "interaction-" + source.seq());
            var interaction =
                    pending.stream()
                            .filter(value -> value.requestId().equals(requestId))
                            .findFirst()
                            .orElse(null);
            if (interaction != null)
                events.add(
                        custom(
                                id,
                                run,
                                "codex.interaction",
                                Map.of("interaction", interaction(interaction))));
        }
        if (type.equals("codex/usage")) {
            events.add(
                    custom(
                            id,
                            run,
                            "token_usage",
                            Map.of(
                                    "delta",
                                    data,
                                    "cumulative",
                                    Map.of(
                                            "totalTokens",
                                            usage(id).tokens()
                                                    + number(data.get("totalTokens"))))));
        }
        if (type.equals("run/start") && source.executionRunId() != null)
            events.add(
                    custom(
                            id,
                            run,
                            "codex.run_clock",
                            Map.of(
                                    "nativeExecutionId",
                                    source.executionRunId(),
                                    "startedAt",
                                    source.timestamp())));
        if (type.equals("codex/budget") && !hasBudget(id, source.executionRunId())) {
            var budget = new LinkedHashMap<String, Object>(data);
            budget.put(
                    "nativeExecutionId",
                    source.executionRunId() == null ? "" : source.executionRunId());
            events.add(custom(id, run, "codex.budget", budget));
        }
        // 兼容旧日志及错误/中断分段；审批等待位于两个run之间，不计入执行时间。
        if (type.equals("run/end")
                && source.executionRunId() != null
                && !hasBudget(id, source.executionRunId())) {
            var clock =
                    repository
                            .jdbc()
                            .sql(
                                    "SELECT event FROM codex_events WHERE conversation_id=:id AND json_extract(event,'$.name')='codex.run_clock' "
                                            + "AND json_extract(event,'$.value.nativeExecutionId')=:run ORDER BY cursor DESC LIMIT 1")
                            .param("id", id)
                            .param("run", source.executionRunId())
                            .query(String.class)
                            .optional();
            if (clock.isPresent()) {
                String started =
                        String.valueOf(
                                object(repository.map(clock.get()).get("value")).get("startedAt"));
                long elapsed =
                        Math.max(
                                0,
                                Instant.parse(source.timestamp()).toEpochMilli()
                                        - Instant.parse(started).toEpochMilli());
                events.add(
                        custom(
                                id,
                                run,
                                "codex.budget",
                                Map.of(
                                        "elapsedMs",
                                        elapsed,
                                        "nativeExecutionId",
                                        source.executionRunId(),
                                        "source",
                                        "native-run-clock")));
            }
        }
        if (type.equals("turn/completed")) events.add(event("RUN_FINISHED", id, run));
        if (type.equals("turn/suspended")) {
            Map<String, Object> finish = event("RUN_FINISHED", id, run);
            if (!pending.isEmpty()) {
                List<Map<String, Object>> interrupts =
                        pending.stream()
                                .map(
                                        value -> {
                                            var interrupt = new LinkedHashMap<String, Object>();
                                            interrupt.put("id", value.requestId());
                                            interrupt.put("reason", "tool_call");
                                            interrupt.put(
                                                    "toolCallId",
                                                    value.toolCallId() == null
                                                            ? value.requestId()
                                                            : value.toolCallId());
                                            interrupt.put("message", value.message());
                                            interrupt.put("responseSchema", value.responseSchema());
                                            interrupt.put(
                                                    "metadata",
                                                    Map.of(
                                                            "agentscope.interruptKind",
                                                            value.kind()));
                                            return (Map<String, Object>) interrupt;
                                        })
                                .toList();
                finish.put("outcome", Map.of("type", "interrupt", "interrupts", interrupts));
            }
            events.add(finish);
        }
        if (List.of("turn/failed", "turn/cancelled", "turn/interrupted").contains(type)) {
            Map<String, Object> error = event("RUN_ERROR", id, run);
            error.put(
                    "message",
                    type.equals("turn/failed") ? "本次执行未完成，请查看任务状态和已保留的成果" : "本次执行已停止，成果仍保留");
            error.put(
                    "code", type.equals("turn/failed") ? "EXECUTION_FAILED" : "EXECUTION_STOPPED");
            events.add(error);
        }
        if (type.startsWith("turn/"))
            events.add(
                    custom(
                            id,
                            run,
                            "codex.status",
                            Map.of(
                                    "executionId",
                                    execution,
                                    "status",
                                    type.substring(5),
                                    "nativeRunId",
                                    source.executionRunId() == null
                                            ? ""
                                            : source.executionRunId())));
        persist(id, source, run, events);
    }

    private void persist(
            String id,
            AgentRuntimeAdapter.NativeEvent source,
            String run,
            List<Map<String, Object>> events) {
        int ordinal = 0;
        long timestamp;
        try {
            timestamp = Instant.parse(source.timestamp()).toEpochMilli();
        } catch (RuntimeException exception) {
            timestamp = System.currentTimeMillis();
        }
        for (var value : events) {
            value.put("timestamp", timestamp);
            repository.event(
                    id, "native:" + source.seq() + ":" + ordinal++, run, repository.json(value));
        }
    }

    public void projectChild(String id, String taskId, AgentRuntimeAdapter.NativeEvent source) {
        var value = new LinkedHashMap<String, Object>();
        value.put("source", taskId);
        value.put("nativeSeq", source.seq());
        value.put("type", source.type());
        value.put("occurredAt", source.timestamp());
        String name;
        if (source.type().equals("model/chunk")) {
            name = "subagent.text";
            value.put("delta", text(object(source.data().get("chunk"))));
        } else if (source.type().equals("message/assistant")) {
            name = "subagent.message";
            value.put("content", text(object(source.data().get("message"))));
        } else if (source.type().equals("tool/requested")) {
            name = "subagent.tool_call";
            value.put("call", object(source.data().get("call")));
        } else if (source.type().equals("tool/result")) {
            name = "subagent.tool_result";
            value.put("result", text(object(source.data().get("message"))));
        } else if (source.type().equals("codex/usage")) {
            name = "subagent.usage";
            value.put("usage", source.data());
        } else if (source.type().startsWith("run/")
                || source.type().startsWith("subagent/")
                || source.type().equals("session/error")) {
            name = "subagent.lifecycle";
            value.put("status", source.type().endsWith("end") ? "completed" : "running");
        } else return;
        value.put("version", 1);
        var event = custom(id, id, name, value);
        event.put("timestamp", Instant.parse(source.timestamp()).toEpochMilli());
        repository.event(id, "child:" + taskId + ":" + source.seq(), id, repository.json(event));
    }

    private boolean hasMessageEvent(String id, String messageId, String type) {
        return repository
                        .jdbc()
                        .sql(
                                "SELECT COUNT(*) FROM codex_events WHERE conversation_id=:id AND json_extract(event,'$.type')=:type AND json_extract(event,'$.messageId')=:m")
                        .param("id", id)
                        .param("type", type)
                        .param("m", messageId)
                        .query(Long.class)
                        .single()
                > 0;
    }

    private boolean hasBudget(String id, String execution) {
        if (execution == null) return false;
        return repository
                        .jdbc()
                        .sql(
                                "SELECT COUNT(*) FROM codex_events WHERE conversation_id=:id AND json_extract(event,'$.name')='codex.budget' "
                                        + "AND json_extract(event,'$.value.nativeExecutionId')=:run")
                        .param("id", id)
                        .param("run", execution)
                        .query(Long.class)
                        .single()
                > 0;
    }

    private Map<String, Object> interaction(AgentRuntimeAdapter.NativeInteraction value) {
        var map = new LinkedHashMap<String, Object>();
        map.put("id", value.requestId());
        map.put("kind", value.kind());
        map.put("toolCallId", value.toolCallId());
        map.put("toolName", value.toolName());
        map.put("arguments", value.arguments());
        map.put("responseSchema", value.responseSchema());
        map.put("message", value.message());
        return map;
    }

    public List<Map<String, Object>> history(String id) {
        List<Map<String, Object>> values = new ArrayList<>();
        long cursor = 0;
        while (true) {
            var page = repository.events(id, cursor, 1000);
            for (var event : page) values.add(repository.map(event.json()));
            if (page.size() < 1000) break;
            cursor = page.get(page.size() - 1).cursor();
        }
        return values;
    }

    public List<AgentApi.Message> messages(String id) {
        var messages = new LinkedHashMap<String, AgentApi.Message>();
        for (var event : history(id)) {
            String type = string(event.get("type"), "");
            if (type.equals("CUSTOM") && "codex.user_message".equals(event.get("name"))) {
                var message = object(object(event.get("value")).get("message"));
                String messageId = String.valueOf(message.get("id"));
                messages.put(
                        messageId,
                        new AgentApi.Message(
                                messageId, "user", string(message.get("content"), ""), List.of()));
            }
            if (type.equals("TEXT_MESSAGE_START")) {
                String messageId = String.valueOf(event.get("messageId"));
                messages.putIfAbsent(
                        messageId, new AgentApi.Message(messageId, "assistant", "", List.of()));
            }
            if (type.equals("TEXT_MESSAGE_CONTENT")) {
                String messageId = String.valueOf(event.get("messageId"));
                var previous =
                        messages.getOrDefault(
                                messageId,
                                new AgentApi.Message(messageId, "assistant", "", List.of()));
                messages.put(
                        messageId,
                        new AgentApi.Message(
                                messageId,
                                "assistant",
                                previous.content() + string(event.get("delta"), ""),
                                previous.attachments()));
            }
        }
        List<AgentApi.Message> list = new ArrayList<>(messages.values());
        return list.size() <= 200 ? list : list.subList(list.size() - 200, list.size());
    }

    public AgentApi.Usage usage(String id) {
        return usageBefore(id, null);
    }

    public AgentApi.Usage usageBefore(String id, String before) {
        long tokens = 0;
        long active = 0;
        long cutoff = before == null ? Long.MAX_VALUE : Instant.parse(before).toEpochMilli();
        for (var event : history(id)) {
            if (!"CUSTOM".equals(event.get("type"))) continue;
            if (event.get("timestamp") instanceof Number timestamp
                    && timestamp.longValue() >= cutoff) continue;
            Map<String, Object> value = object(event.get("value"));
            if ("token_usage".equals(event.get("name")))
                tokens += number(object(value.get("delta")).get("totalTokens"));
            if ("codex.budget".equals(event.get("name"))) active += number(value.get("elapsedMs"));
        }
        return new AgentApi.Usage(tokens, active);
    }

    public List<Map<String, Object>> agents(String id) {
        Map<String, Map<String, Object>> agents = new LinkedHashMap<>();
        for (var event : history(id)) {
            if ("CUSTOM".equals(event.get("type"))
                    && String.valueOf(event.get("name")).startsWith("subagent.")) {
                var value = object(event.get("value"));
                if ("subagent.task".equals(event.get("name"))) {
                    var task = object(value.get("task"));
                    if (task.get("id") instanceof String taskId) agents.put(taskId, task);
                    continue;
                }
                String source = string(value.get("source"), "subagent");
                agents.put(
                        source,
                        Map.of(
                                "id",
                                source,
                                "name",
                                source,
                                "status",
                                string(value.get("status"), "running"),
                                "conversationId",
                                id));
            }
            if ("TOOL_CALL_START".equals(event.get("type"))
                    && (String.valueOf(event.get("toolCallName")).contains("subagent")
                            || List.of("task", "spawn_agent", "agent_spawn", "agent_send")
                                    .contains(event.get("toolCallName")))) {
                String source = String.valueOf(event.get("toolCallId"));
                agents.putIfAbsent(
                        source,
                        Map.of(
                                "id",
                                source,
                                "name",
                                String.valueOf(event.get("toolCallName")),
                                "status",
                                "running",
                                "conversationId",
                                id));
            }
            if ("TOOL_CALL_RESULT".equals(event.get("type"))
                    && agents.containsKey(String.valueOf(event.get("toolCallId")))) {
                String source = String.valueOf(event.get("toolCallId"));
                agents.put(
                        source,
                        Map.of(
                                "id",
                                source,
                                "name",
                                agents.get(source).get("name"),
                                "status",
                                "completed",
                                "conversationId",
                                id,
                                "result",
                                string(event.get("content"), "")));
            }
        }
        return new ArrayList<>(agents.values());
    }

    private static Map<String, Object> event(String type, String thread, String run) {
        var value = new LinkedHashMap<String, Object>();
        value.put("type", type);
        value.put("threadId", thread);
        value.put("runId", run);
        return value;
    }

    private static Map<String, Object> custom(
            String thread, String run, String name, Map<String, Object> data) {
        var value = event("CUSTOM", thread, run);
        var payload = new LinkedHashMap<String, Object>(data);
        payload.putIfAbsent("version", 1);
        value.put("name", name);
        value.put("value", payload);
        return value;
    }

    private static Map<String, Object> textEvent(
            String type, String thread, String run, String message, String delta) {
        var value = event(type, thread, run);
        value.put("messageId", message);
        if (type.equals("TEXT_MESSAGE_START")) value.put("role", "assistant");
        if (delta != null) value.put("delta", delta);
        return value;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> object(Object value) {
        return value instanceof Map<?, ?> ? (Map<String, Object>) value : Map.of();
    }

    private static String string(Object value, String fallback) {
        return value instanceof String text ? text : fallback;
    }

    private static long number(Object value) {
        return value instanceof Number number ? Math.max(0, number.longValue()) : 0;
    }

    private static String text(Map<String, Object> message) {
        Object content =
                message.containsKey("content") ? message.get("content") : message.get("output");
        if (content instanceof String value) return value;
        if (content instanceof List<?> blocks) {
            var value = new StringBuilder();
            for (var block : blocks) {
                if (block instanceof Map<?, ?> item) {
                    if ("text".equals(item.get("type")) && item.get("text") instanceof String text)
                        value.append(text);
                    else if ("tool_result".equals(item.get("type")))
                        value.append(text(object(item)));
                }
            }
            return value.toString();
        }
        return "";
    }
}
