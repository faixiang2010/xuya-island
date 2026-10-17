package com.xuya.island.agentapi.service;

import com.xuya.island.agentapi.dto.AgentApi;
import com.xuya.island.agentapi.repository.ConversationRepository;
import com.xuya.island.codex.agent.AgentRuntimeAdapter;
import com.xuya.island.codex.artifact.ArtifactService;
import com.xuya.island.codex.workspace.WorkspaceService;
import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** REST和AG-UI共用命令服务；观察连接不拥有后台执行生命周期。 */
@Service
public class ConversationService {
    private static final org.slf4j.Logger LOG =
            org.slf4j.LoggerFactory.getLogger(ConversationService.class);

    /** 需要结合待处理交互才能完成投影的原生事件类型。 */
    private static final List<String> PENDING_EVENT_TYPES =
            List.of("interaction/requested", "turn/suspended");

    private final ConversationRepository repository;
    private final WorkspaceService workspaces;
    private final AgentRuntimeAdapter runtime;
    private final TaskMetadataService metadata;
    private final ConversationProjector projector;
    private final TransactionTemplate transactions;
    private final ArtifactService artifacts;
    private final Map<String, Object> locks = new ConcurrentHashMap<>();

    public ConversationService(
            ConversationRepository repository,
            WorkspaceService workspaces,
            AgentRuntimeAdapter runtime,
            TaskMetadataService metadata,
            ConversationProjector projector,
            TransactionTemplate transactions,
            ArtifactService artifacts) {
        this.repository = repository;
        this.workspaces = workspaces;
        this.runtime = runtime;
        this.metadata = metadata;
        this.projector = projector;
        this.transactions = transactions;
        this.artifacts = artifacts;
    }

    public Object lock(String id) {
        return locks.computeIfAbsent(id, ignored -> new Object());
    }

    public AgentApi.Conversation get(String id) {
        return repository.conversation(id).orElseThrow(ApiFailure::missing);
    }

    public List<AgentApi.Conversation> list(String projectId) {
        return repository.conversations(projectId);
    }

    public AgentApi.Conversation create(AgentApi.CreateConversation request) {
        return create(request, UUID.randomUUID().toString());
    }

    /** 两种协议共用可选项目规则；独立目录只在创建会话时分配一次。 */
    private AgentApi.Conversation create(AgentApi.CreateConversation request, String id) {
        String now = ConversationRepository.now();
        String model = value(request.modelId(), "default");
        String effort = value(request.reasoningEffort(), "default");
        String permission = value(request.permissionMode(), "auto");
        long tokens = request.maxTokens() == null ? 100000 : request.maxTokens();
        long ms = request.maxActiveMs() == null ? 1800000 : request.maxActiveMs();
        validateSettings(permission, tokens, ms);
        String projectId = value(request.projectId(), "");
        String workspaceId = value(request.workspaceId(), "");
        if (projectId.isBlank() != workspaceId.isBlank())
            throw ApiFailure.invalid("项目聊天须同时指定项目和工作区；独立聊天可同时省略");
        try {
            if (projectId.isBlank()) workspaceId = workspaces.createScratch().id();
            else if (!workspaces.requireWorkspace(workspaceId).projectId().equals(projectId))
                throw ApiFailure.invalid("工作区不属于指定项目");
        } catch (IOException exception) {
            throw ApiFailure.invalid("会话工作区不可用");
        }
        var conversation =
                new AgentApi.Conversation(
                        id,
                        projectId,
                        workspaceId,
                        value(request.title(), "新聊天"),
                        model,
                        effort,
                        permission,
                        Boolean.TRUE.equals(request.planMode()),
                        tokens,
                        ms,
                        false,
                        false,
                        now,
                        now);
        transactions.executeWithoutResult(status -> repository.insert(conversation));
        LOG.info(
                "Conversation created session={} project={} workspace={} permission={} planMode={}",
                conversation.id(),
                conversation.projectId(),
                conversation.workspaceId(),
                conversation.permissionMode(),
                conversation.planMode());
        return conversation;
    }

    public record AguiStart(String conversationId, String runId, String executionId, long cursor) {}

    public AguiStart agui(Map<String, Object> input) {
        String id = required(input, "threadId");
        String runId = required(input, "runId");
        if (id.length() > 160 || !id.matches("[A-Za-z0-9_-]+") || runId.length() > 160)
            throw ApiFailure.invalid("会话或运行标识格式不合法");
        synchronized (lock(id)) {
            if (repository.conversation(id).isEmpty()) {
                Map<String, Object> props = object(input.get("forwardedProps"));
                Object workspaceValue = props.get("workspaceId");
                if (workspaceValue != null && !(workspaceValue instanceof String))
                    throw ApiFailure.invalid("workspaceId须为字符串");
                String workspaceId = value((String) workspaceValue, "");
                try {
                    String projectId =
                            workspaceId.isBlank()
                                    ? ""
                                    : workspaces.requireWorkspace(workspaceId).projectId();
                    create(
                            new AgentApi.CreateConversation(
                                    projectId,
                                    workspaceId,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null),
                            id);
                } catch (IOException exception) {
                    throw ApiFailure.invalid("AG-UI工作区不可用");
                }
            }
            String hash = digest(repository.json(canonical(input)));
            var previous = repository.aguiRequest(id, runId);
            if (previous.isPresent()) {
                if (!previous.get().get("hash").equals(hash))
                    throw ApiFailure.conflict("同一AG-UI runId不能提交不同内容");
                deliverAguiResponses(id, runId, input);
                reconcile(id);
                return new AguiStart(
                        id,
                        runId,
                        String.valueOf(previous.get().get("executionId")),
                        ((Number) previous.get().get("cursor")).longValue());
            }
            reconcile(id);
            long cursor = repository.cursor(id);
            List<?> resume = input.get("resume") instanceof List<?> values ? values : List.of();
            String execution;
            if (!resume.isEmpty()) {
                var open = runtime.pending(spec(id));
                if (open.size() != resume.size()) throw ApiFailure.conflict("恢复请求需要回应全部待处理交互");
                var seen = new java.util.HashSet<String>();
                for (Object item : resume) {
                    var response = object(item);
                    String interactionId = required(response, "interruptId");
                    if (!seen.add(interactionId)
                            || open.stream()
                                    .noneMatch(value -> value.requestId().equals(interactionId)))
                        throw ApiFailure.conflict("恢复标识不属于当前待处理交互");
                    if (!List.of("resolved", "cancelled").contains(response.get("status")))
                        throw ApiFailure.invalid("不支持这个交互恢复状态");
                }
                var row =
                        repository.runs(id).stream()
                                .filter(value -> value.status().equals("suspended"))
                                .reduce((left, right) -> right)
                                .orElseThrow(() -> ApiFailure.conflict("没有等待回应的执行"));
                execution = row.id();
                repository.aguiRequest(id, runId, hash, execution, cursor);
                deliverAguiResponses(id, runId, input);
            } else {
                List<?> messages =
                        input.get("messages") instanceof List<?> values ? values : List.of();
                List<String> texts = new java.util.ArrayList<>();
                List<Map<String, Object>> unseen = new java.util.ArrayList<>();
                var stored = projector.messages(id);
                for (Object item : messages) {
                    var message = object(item);
                    String messageId = required(message, "id");
                    String role = required(message, "role");
                    String text = aguiText(message.get("content"));
                    if (!role.equals("user")) {
                        if (stored.stream()
                                .noneMatch(
                                        value ->
                                                value.id().equals(messageId)
                                                        && value.role().equals(role)
                                                        && value.content().equals(text))) {
                            throw ApiFailure.invalid("助手与工具历史由服务端管理，不能由客户端注入");
                        }
                        continue;
                    }
                    String messageHash = digest(repository.json(canonical(message)));
                    var known = repository.inputHash(id, messageId);
                    if (known.isPresent() && !known.get().equals(messageHash))
                        throw ApiFailure.conflict("同一消息标识的内容不能改变");
                    if (known.isEmpty()) {
                        if (text.isBlank()) throw ApiFailure.invalid("用户消息需要文本或通过附件接口提供文件");
                        texts.add(text);
                        unseen.add(Map.of("id", messageId, "hash", messageHash));
                    }
                }
                if (texts.isEmpty()) throw ApiFailure.invalid("AG-UI请求没有新的用户消息或待恢复交互");
                String client = "agui:" + runId;
                var receipt =
                        submit(
                                id,
                                new AgentApi.SubmitRun(
                                        client, String.join("\n\n", texts), List.of()));
                execution = receipt.executionId();
                repository.aguiRequest(id, runId, hash, execution, cursor);
                for (var message : unseen)
                    repository.input(
                            id,
                            String.valueOf(message.get("id")),
                            String.valueOf(message.get("hash")));
            }
            return new AguiStart(id, runId, execution, cursor);
        }
    }

    private void deliverAguiResponses(String id, String runId, Map<String, Object> input) {
        if (!(input.get("resume") instanceof List<?> resume)) return;
        for (Object item : resume) {
            var response = object(item);
            Map<String, Object> payload = object(response.get("payload"));
            if ("cancelled".equals(response.get("status")))
                payload = Map.of("approved", false, "answer", "用户取消此交互");
            String interaction = required(response, "interruptId");
            respond(id, interaction, new AgentApi.Respond(runId + ":" + interaction, payload));
        }
    }

    private static String aguiText(Object content) {
        if (content instanceof String text) return text;
        if (content instanceof List<?> blocks) {
            var text = new StringBuilder();
            for (Object item : blocks) {
                var block = object(item);
                if (!"text".equals(block.get("type"))) throw ApiFailure.invalid("文件与媒体请先通过附件API提交");
                if (block.get("text") instanceof String value) text.append(value);
            }
            return text.toString();
        }
        return "";
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> object(Object value) {
        return value instanceof Map<?, ?> ? (Map<String, Object>) value : Map.of();
    }

    private static String required(Map<String, Object> value, String field) {
        if (!(value.get(field) instanceof String text) || text.isBlank())
            throw ApiFailure.invalid("缺少" + field);
        return text;
    }

    private static Object canonical(Object value) {
        if (value instanceof Map<?, ?> map) {
            var result = new java.util.TreeMap<String, Object>();
            map.forEach((key, item) -> result.put(String.valueOf(key), canonical(item)));
            return result;
        }
        if (value instanceof List<?> list)
            return list.stream().map(ConversationService::canonical).toList();
        return value;
    }

    private static String digest(String text) {
        try {
            return java.util.HexFormat.of()
                    .formatHex(
                            java.security.MessageDigest.getInstance("SHA-256")
                                    .digest(
                                            text.getBytes(
                                                    java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("缺少幂等摘要算法", exception);
        }
    }

    public AgentRuntimeAdapter.RuntimeSpec spec(String id) {
        AgentApi.Conversation c = get(id);
        try {
            long tokens = c.maxTokens();
            long ms = c.maxActiveMs();
            for (var goal : metadata.goals(id)) {
                if (!goal.status().equals("active")) continue;
                var previousUsage = projector.usageBefore(id, goal.createdAt());
                tokens = Math.min(tokens, previousUsage.tokens() + goal.maxTokens());
                ms = Math.min(ms, previousUsage.activeMs() + goal.maxActiveMs());
            }
            return new AgentRuntimeAdapter.RuntimeSpec(
                    id,
                    c.projectId(),
                    c.workspaceId(),
                    workspaces.workspacePath(c.workspaceId()).toString(),
                    c.modelId(),
                    c.reasoningEffort(),
                    c.permissionMode(),
                    c.planMode(),
                    tokens,
                    ms);
        } catch (IOException exception) {
            throw new ApiFailure(HttpStatus.CONFLICT, "WORKSPACE_UNAVAILABLE", "这个工作区当前不可用");
        }
    }

    /** 请求标识与规范化正文一起持久化；相同请求只关联原任务，不重新执行工具。 */
    public AgentApi.RunReceipt submit(String id, AgentApi.SubmitRun request) {
        synchronized (lock(id)) {
            LOG.info(
                    "Run submit session={} clientRequest={} attachments={}",
                    id,
                    request.clientRequestId(),
                    request.attachments() == null ? 0 : request.attachments().size());
            AgentApi.Conversation c = get(id);
            if (c.archived()) throw ApiFailure.conflict("归档会话不能提交任务");
            String payload = canonicalJson(request);
            var previous = repository.runByRequest(id, request.clientRequestId());
            if (previous.isPresent()) {
                if (!previous.get().payload().equals(payload))
                    throw ApiFailure.conflict("同一请求标识不能提交不同内容");
                if (previous.get().nativeTurnId() == null
                        && previous.get().status().equals("failed"))
                    throw ApiFailure.conflict("这次提交未进入执行，请检查配置并使用新的请求标识");
                recoverSubmission(id, previous.get());
                reconcile(id);
                return receipt(
                        repository.runByRequest(id, request.clientRequestId()).orElseThrow());
            }
            reconcile(id);
            AgentApi.Usage usage = projector.usage(id);
            var limits = spec(id);
            if (usage.tokens() >= limits.maxTokens() || usage.activeMs() >= limits.maxActiveMs())
                throw new ApiFailure(
                        HttpStatus.TOO_MANY_REQUESTS,
                        "BUDGET_EXHAUSTED",
                        "会话预算已用完，请保留成果后调整预算或开始新会话");
            List<Map<String, Object>> attachments =
                    request.attachments() == null ? List.of() : request.attachments();
            if (attachments.size() > 20) throw ApiFailure.invalid("一次最多附加20个文件");
            for (var attachment : attachments) {
                if (!(attachment.get("id") instanceof String aid) || aid.isBlank())
                    throw ApiFailure.invalid("附件需要服务端文件标识");
                try {
                    if (!artifacts.requireArtifact(aid).workspaceId().equals(c.workspaceId()))
                        throw ApiFailure.invalid("附件不属于当前会话工作区");
                } catch (IOException exception) {
                    throw ApiFailure.invalid("附件当前不可用");
                }
            }
            String execution = UUID.randomUUID().toString();
            repository.insertRun(execution, id, request.clientRequestId(), payload);
            try {
                var task =
                        runtime.submit(
                                spec(id), request.clientRequestId(), request.text(), attachments);
                repository.nativeTask(
                        execution, task.turnId(), task.executionRunId(), task.status());
                LOG.info(
                        "Run accepted session={} execution={} turn={} nativeRun={} status={}",
                        id,
                        execution,
                        task.turnId(),
                        task.executionRunId(),
                        task.status());
            } catch (RuntimeException exception) {
                repository.status(execution, "failed");
                LOG.error(
                        "Run submission failed session={} execution={} errorType={}",
                        id,
                        execution,
                        exception.getClass().getSimpleName());
                throw exception;
            }
            if (!attachments.isEmpty())
                metadata.custom(
                        id,
                        "attachments:" + execution,
                        "codex.attachments",
                        Map.of("attachments", attachments));
            reconcile(id);
            return receipt(repository.runByRequest(id, request.clientRequestId()).orElseThrow());
        }
    }

    private AgentApi.RunReceipt receipt(ConversationRepository.RunRow row) {
        return new AgentApi.RunReceipt(
                row.conversationId(),
                row.id(),
                row.clientRequestId(),
                row.status(),
                "/api/v1/conversations/" + row.conversationId() + "/events");
    }

    private String canonicalJson(Object value) {
        return repository.json(canonical(repository.map(repository.json(value))));
    }

    private void recoverSubmission(String id, ConversationRepository.RunRow row) {
        if (row.nativeTurnId() != null || !row.status().equals("queued")) return;
        var request = repository.read(row.payload(), AgentApi.SubmitRun.class);
        var task =
                runtime.submit(
                        spec(id),
                        request.clientRequestId(),
                        request.text(),
                        request.attachments() == null ? List.of() : request.attachments());
        repository.nativeTask(row.id(), task.turnId(), task.executionRunId(), task.status());
    }

    /** 协调业务回执和原生事实；先补齐已接收的故障窗口，再推进确定性事件投影。 */
    public void reconcile(String id) {
        synchronized (lock(id)) {
            var specification = spec(id);
            for (var row : repository.runs(id)) recoverSubmission(id, row);
            for (var response : repository.undelivered(id)) {
                if (!runtime.pending(specification).stream()
                        .anyMatch(value -> value.requestId().equals(response.interactionId()))) {
                    repository.delivered(id, response.interactionId());
                    continue;
                }
                try {
                    runtime.respond(
                            specification,
                            response.interactionId(),
                            repository.map(response.payload()));
                    repository.delivered(id, response.interactionId());
                } catch (IllegalStateException exception) {
                    // 已入队标记送达；会话正忙保留待下次 reconcile，单项不拖垮整批投递。
                    if (isQueued(exception)) repository.delivered(id, response.interactionId());
                    else
                        LOG.warn(
                                "Interaction delivery deferred session={} interaction={} reason={}",
                                id,
                                response.interactionId(),
                                exception.getMessage());
                }
            }
            for (var task : runtime.tasks(specification)) {
                for (var row : repository.runs(id)) {
                    if (task.turnId().equals(row.nativeTurnId()))
                        repository.nativeTask(
                                row.id(), task.turnId(), task.executionRunId(), task.status());
                }
            }
            for (var event : projectableEvents(id, specification)) {
                transactions.executeWithoutResult(
                        status -> {
                            // 只有需要挂起结果的投影才读取最新 pending：原生代理异步挂起时，
                            // 挂起事件与 pending 登记之间存在微小窗口，预读快照会让 turn/suspended
                            // 丢掉 interrupt outcome。其余事件逐条读取会为每条事件重开一次原生日志
                            // 连接，代价极高，会把整个会话卡在锁上。
                            projector.project(id, event, pendingFor(specification, event));
                            repository.projected(id, event.seq());
                        });
            }
            for (var nativeTask : runtime.subagentTasks(specification)) {
                var task = new java.util.LinkedHashMap<String, Object>(nativeTask);
                String taskId = String.valueOf(task.get("taskId"));
                task.put("id", taskId);
                task.put("name", task.get("agentId"));
                task.put("conversationId", id);
                String revision = digest(repository.json(canonical(task)));
                metadata.custom(
                        id,
                        "subagent-task:" + taskId + ":" + revision,
                        "subagent.task",
                        Map.of("task", task));
                long childCursor =
                        repository
                                .jdbc()
                                .sql(
                                        "SELECT COALESCE(MAX(json_extract(event,'$.value.nativeSeq')),0) FROM codex_events "
                                                + "WHERE conversation_id=:id AND json_extract(event,'$.value.source')=:task")
                                .param("id", id)
                                .param("task", taskId)
                                .query(Long.class)
                                .single();
                for (var child : runtime.subagentEvents(specification, taskId, childCursor))
                    projector.projectChild(id, taskId, child);
            }
        }
    }

    /** 读取待投影的原生事件；持久化游标超前已提交前缀时一次性拉回，避免反复失败。 */
    private List<AgentRuntimeAdapter.NativeEvent> projectableEvents(
            String id, AgentRuntimeAdapter.RuntimeSpec specification) {
        long projected = repository.projected(id);
        try {
            return runtime.events(specification, projected);
        } catch (AgentRuntimeAdapter.NativeCursorUnavailableException exception) {
            repository.projected(id, exception.floor());
            LOG.warn(
                    "Native projection cursor reset session={} from={} to={}",
                    id,
                    projected,
                    exception.floor());
            return List.of();
        }
    }

    /** 只有挂起交互相关的投影才需要最新待处理交互，其余投影不必打开原生日志。 */
    private List<AgentRuntimeAdapter.NativeInteraction> pendingFor(
            AgentRuntimeAdapter.RuntimeSpec specification, AgentRuntimeAdapter.NativeEvent event) {
        return PENDING_EVENT_TYPES.contains(event.type())
                ? runtime.pending(specification)
                : List.of();
    }

    public AgentApi.ConversationSnapshot snapshot(String id) {
        synchronized (lock(id)) {
            reconcile(id);
            var interactions =
                    runtime.pending(spec(id)).stream()
                            .map(
                                    value ->
                                            new AgentApi.InteractionRequest(
                                                    value.requestId(),
                                                    value.kind(),
                                                    value.toolCallId(),
                                                    value.toolName(),
                                                    value.arguments(),
                                                    value.responseSchema(),
                                                    value.message()))
                            .toList();
            var runs =
                    repository.runs(id).stream()
                            .map(
                                    row ->
                                            new AgentApi.Run(
                                                    row.id(),
                                                    row.clientRequestId(),
                                                    row.status(),
                                                    row.createdAt()))
                            .toList();
            return new AgentApi.ConversationSnapshot(
                    get(id),
                    repository.cursor(id),
                    projector.messages(id),
                    runs,
                    interactions,
                    projector.usage(id),
                    metadata.goals(id),
                    metadata.plan(id));
        }
    }

    public List<AgentApi.Event> events(String id, long after) {
        if (after < 0) throw ApiFailure.invalid("事件游标不能为负数");
        synchronized (lock(id)) {
            reconcile(id);
            if (after > repository.cursor(id)) throw ApiFailure.conflict("事件游标不属于当前会话，请重新获取快照");
            return repository.events(id, after, 500);
        }
    }

    /** 回应先落盘再投递SDK；重复回应不重复执行，改参审批仍由原生权限引擎校验。 */
    public Map<String, Object> respond(String id, String interaction, AgentApi.Respond request) {
        synchronized (lock(id)) {
            LOG.info(
                    "Interaction response session={} interaction={} clientRequest={}",
                    id,
                    interaction,
                    request.clientRequestId());
            get(id);
            String payload =
                    repository.json(
                            canonical(request.payload() == null ? Map.of() : request.payload()));
            var saved = repository.response(id, interaction);
            if (saved.isPresent()) {
                if (!saved.get().payload().equals(payload))
                    throw ApiFailure.conflict("已回应的交互不能更改答案");
                reconcile(id);
                return Map.of("accepted", true, "interactionId", interaction);
            }
            var pending =
                    runtime.pending(spec(id)).stream()
                            .filter(value -> value.requestId().equals(interaction))
                            .findFirst()
                            .orElseThrow(() -> ApiFailure.conflict("这个交互已处理或不属于当前会话"));
            Map<String, Object> values = request.payload() == null ? Map.of() : request.payload();
            if (pending.kind().equals("question")
                    && (!(values.get("answer") instanceof String answer)
                            || answer.isBlank()
                            || answer.length() > 200000)) throw ApiFailure.invalid("问题回应需要合法的文本答案");
            if (pending.kind().contains("confirm") || pending.kind().contains("approval")) {
                if (!(values.get("approved") instanceof Boolean))
                    throw ApiFailure.invalid("审批结果需要明确的布尔值");
                if (values.containsKey("editedArgs")
                        && !(values.get("editedArgs") instanceof Map<?, ?>))
                    throw ApiFailure.invalid("修改后的工具参数必须为完整对象");
            }
            repository.saveResponse(id, interaction, request.clientRequestId(), payload);
            deliver(id, interaction, values);
            reconcile(id);
            return Map.of("accepted", true, "interactionId", interaction);
        }
    }

    /**
     * 投递已落盘回应。SDK 报告答案已入队视为投递成功；会话正忙（如模型调用中）转 409，
     * 由前端稍后重试，不再按 500 让审批界面卡死。
     */
    private void deliver(String id, String interaction, Map<String, Object> values) {
        try {
            runtime.respond(spec(id), interaction, values);
            repository.delivered(id, interaction);
        } catch (IllegalStateException exception) {
            if (isQueued(exception)) repository.delivered(id, interaction);
            else throw ApiFailure.conflict("会话正在处理上一段内容，请稍后重试");
        }
    }

    /** SDK 会话仅按消息区分状态冲突；答案已在执行队列等同于本次投递成功。 */
    static boolean isQueued(IllegalStateException exception) {
        String message = exception.getMessage();
        return message != null && message.contains("Continuation already queued");
    }

    public AgentApi.Conversation configure(String id, Map<String, Object> changes) {
        synchronized (lock(id)) {
            reconcile(id);
            AgentApi.Conversation current = get(id);
            if (changes.keySet().stream()
                    .anyMatch(
                            key ->
                                    !List.of(
                                                    "title",
                                                    "archived",
                                                    "pinned",
                                                    "modelId",
                                                    "reasoningEffort",
                                                    "permissionMode",
                                                    "planMode",
                                                    "maxTokens",
                                                    "maxActiveMs")
                                            .contains(key)))
                throw ApiFailure.invalid("会话配置包含不支持的字段");
            if (changes.containsKey("title") && !(changes.get("title") instanceof String))
                throw ApiFailure.invalid("会话标题需要文本");
            // 偏好修改不重建 Harness；拒绝类型错误，避免字符串 "false" 被静默转换。
            for (String key : List.of("archived", "pinned", "planMode")) {
                if (changes.containsKey(key) && !(changes.get(key) instanceof Boolean))
                    throw ApiFailure.invalid(key + "需要布尔值");
            }
            boolean onlyTitle =
                    changes.keySet().stream()
                            .allMatch(key -> List.of("title", "archived", "pinned").contains(key));
            if (Boolean.TRUE.equals(changes.get("archived"))
                    && repository.runs(id).stream()
                            .anyMatch(
                                    row ->
                                            List.of("running", "queued", "suspended")
                                                    .contains(row.status())))
                throw ApiFailure.conflict("请先结束或中断当前任务，再归档聊天");
            if (!onlyTitle
                    && repository.runs(id).stream()
                            .anyMatch(
                                    row ->
                                            List.of("running", "queued", "suspended")
                                                    .contains(row.status()))) {
                throw ApiFailure.conflict("请先中断当前任务再修改模型、权限或计划模式");
            }
            String mode =
                    String.valueOf(
                            changes.getOrDefault("permissionMode", current.permissionMode()));
            long tokens = number(changes.getOrDefault("maxTokens", current.maxTokens()));
            long ms = number(changes.getOrDefault("maxActiveMs", current.maxActiveMs()));
            validateSettings(mode, tokens, ms);
            var settings =
                    new AgentApi.Settings(
                            String.valueOf(changes.getOrDefault("modelId", current.modelId())),
                            String.valueOf(
                                    changes.getOrDefault(
                                            "reasoningEffort", current.reasoningEffort())),
                            mode,
                            changes.containsKey("planMode")
                                    ? Boolean.TRUE.equals(changes.get("planMode"))
                                    : current.planMode(),
                            tokens,
                            ms);
            String title = String.valueOf(changes.getOrDefault("title", current.title()));
            if (title.isBlank() || title.length() > 200) throw ApiFailure.invalid("会话标题需要1至200个字符");
            repository.configure(
                    id,
                    title,
                    settings,
                    changes.containsKey("archived")
                            ? Boolean.TRUE.equals(changes.get("archived"))
                            : current.archived(),
                    changes.containsKey("pinned")
                            ? Boolean.TRUE.equals(changes.get("pinned"))
                            : current.pinned());
            LOG.info(
                    "Conversation metadata updated session={} archived={} pinned={}",
                    id,
                    changes.getOrDefault("archived", current.archived()),
                    changes.getOrDefault("pinned", current.pinned()));
            return get(id);
        }
    }

    /** 彻底删除会话：先校验无活动执行，再删除账本与隔离工作区；不可恢复。 */
    public void delete(String id) {
        synchronized (lock(id)) {
            AgentApi.Conversation current = get(id);
            if (repository.runs(id).stream()
                    .anyMatch(
                            row ->
                                    List.of("running", "queued", "suspended")
                                            .contains(row.status())))
                throw ApiFailure.conflict("请先结束或中断当前任务，再删除聊天");
            String workspaceId = current.workspaceId();
            transactions.executeWithoutResult(status -> repository.delete(id));
            if (!workspaceId.isBlank()) {
                try {
                    workspaces.deleteWorkspace(workspaceId);
                } catch (IOException | RuntimeException exception) {
                    LOG.warn(
                            "会话工作目录清理失败 session={} workspace={} errorType={}",
                            id,
                            workspaceId,
                            exception.getClass().getSimpleName());
                }
            }
            LOG.info("Conversation deleted session={} workspace={}", id, workspaceId);
        }
    }

    public Map<String, Object> action(String id, AgentApi.Action request) {
        synchronized (lock(id)) {
            LOG.info(
                    "Conversation action session={} action={} clientRequest={}",
                    id,
                    request.action(),
                    request.clientRequestId());
            String payload = canonicalJson(request);
            var saved = repository.savedAction(id, request.clientRequestId());
            if (saved.isPresent()) {
                if (!payload.equals(saved.get().get("payload")))
                    throw ApiFailure.conflict("同一操作标识不能执行不同操作");
                Map<String, Object> result = object(saved.get().get("result"));
                if (!Boolean.TRUE.equals(result.get("accepted")))
                    throw ApiFailure.conflict("这个操作的执行结果尚未确认，请检查执行记录；不会自动重试");
                return result;
            }
            if (request.action().equals("configure")) {
                configure(id, request.settings() == null ? Map.of() : request.settings());
            } else {
                reconcile(id);
                var row =
                        repository.runs(id).stream()
                                .filter(value -> value.id().equals(request.executionId()))
                                .findFirst()
                                .orElseThrow(() -> ApiFailure.conflict("操作必须指定属于当前会话的执行标识"));
                if (!List.of("steer", "interrupt", "cancel", "resume").contains(request.action()))
                    throw ApiFailure.invalid("不支持这个运行操作");
                if (request.action().equals("resume")
                        && !List.of("interrupted", "failed", "suspended", "budget_exhausted")
                                .contains(row.status())) throw ApiFailure.conflict("当前任务不需要恢复");
                if (!request.action().equals("resume")
                        && !List.of("running", "queued", "suspended").contains(row.status()))
                    throw ApiFailure.conflict("当前执行已结束");
                if (request.action().equals("steer")
                        && (request.text() == null || request.text().isBlank()))
                    throw ApiFailure.invalid("补充要求不能为空");
                String target =
                        request.action().equals("resume")
                                ? row.nativeTurnId()
                                : row.nativeExecutionId();
                if (target == null) throw ApiFailure.conflict("任务尚未取得原生执行标识");
                repository.action(
                        id,
                        request.clientRequestId(),
                        payload,
                        Map.of("accepted", false, "status", "pending", "action", request.action()));
                runtime.action(spec(id), request.action(), target, request.text());
                reconcile(id);
            }
            var result = Map.<String, Object>of("accepted", true, "action", request.action());
            if (request.action().equals("configure"))
                repository.action(id, request.clientRequestId(), payload, result);
            else repository.actionResult(id, request.clientRequestId(), result);
            return result;
        }
    }

    public List<Map<String, Object>> agents(String id) {
        synchronized (lock(id)) {
            get(id);
            reconcile(id);
            List<Map<String, Object>> all = projector.agents(id);
            var tasks = all.stream().filter(task -> task.containsKey("taskId")).toList();
            return tasks.isEmpty() ? all : tasks;
        }
    }

    public Map<String, Object> agent(String id, String taskId) {
        synchronized (lock(id)) {
            var task =
                    agents(id).stream()
                            .filter(value -> taskId.equals(value.get("id")))
                            .findFirst()
                            .orElseThrow(ApiFailure::missing);
            var detail = new java.util.LinkedHashMap<String, Object>(task);
            var activity =
                    projector.history(id).stream()
                            .filter(
                                    event ->
                                            "CUSTOM".equals(event.get("type"))
                                                    && String.valueOf(event.get("name"))
                                                            .startsWith("subagent.")
                                                    && taskId.equals(
                                                            object(event.get("value"))
                                                                    .get("source")))
                            .toList();
            detail.put("events", activity);
            return detail;
        }
    }

    public Map<String, Object> cancelAgent(String id, String taskId, String clientRequestId) {
        synchronized (lock(id)) {
            get(id);
            String payload =
                    repository.json(
                            canonical(Map.of("action", "cancel-subagent", "taskId", taskId)));
            var saved = repository.savedAction(id, clientRequestId);
            if (saved.isPresent()) {
                if (!payload.equals(saved.get().get("payload")))
                    throw ApiFailure.conflict("同一操作标识不能取消不同子任务");
                var result = object(saved.get().get("result"));
                if (!Boolean.TRUE.equals(result.get("accepted")))
                    throw ApiFailure.conflict("取消效果尚未确认，请查看任务状态");
                return result;
            }
            var task = agent(id, taskId);
            boolean running = List.of("running", "pending").contains(task.get("status"));
            repository.action(id, clientRequestId, payload, Map.of("accepted", false));
            boolean cancelled = running && runtime.cancelSubagentTask(spec(id), taskId);
            reconcile(id);
            Map<String, Object> result =
                    Map.of("accepted", true, "cancelled", cancelled, "taskId", taskId);
            repository.actionResult(id, clientRequestId, result);
            return result;
        }
    }

    private static void validateSettings(String permission, long tokens, long ms) {
        if (!List.of("ask", "auto", "full").contains(permission))
            throw ApiFailure.invalid("不支持这个权限模式");
        if (tokens < 1 || tokens > 10000000 || ms < 1000 || ms > Duration.ofDays(1).toMillis())
            throw ApiFailure.invalid("预算超出允许范围");
    }

    private static String value(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static long number(Object value) {
        if (!(value instanceof Number n)) throw ApiFailure.invalid("预算必须为数字");
        return n.longValue();
    }
}
