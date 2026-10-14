package com.xuya.island.agentapi.service;

import com.xuya.island.agentapi.dto.AgentApi;
import com.xuya.island.agentapi.repository.ConversationRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** 目标、计划与调度配置的持久业务规则，不依赖具体Agent运行器。 */
@Service
public class TaskMetadataService {
    private final ConversationRepository repository;

    public TaskMetadataService(ConversationRepository repository) {
        this.repository = repository;
    }

    private void require(String id) {
        repository.conversation(id).orElseThrow(ApiFailure::missing);
    }

    public List<AgentApi.Goal> goals(String id) {
        require(id);
        return repository
                .jdbc()
                .sql("SELECT * FROM codex_goals WHERE conversation_id=:id ORDER BY created_at DESC")
                .param("id", id)
                .query(
                        (rs, row) ->
                                new AgentApi.Goal(
                                        rs.getString("id"),
                                        id,
                                        rs.getString("title"),
                                        rs.getString("status"),
                                        rs.getLong("max_tokens"),
                                        rs.getLong("max_active_ms"),
                                        rs.getString("created_at"),
                                        rs.getString("updated_at")))
                .list();
    }

    public AgentApi.Goal createGoal(Map<String, Object> request) {
        String conversation = required(request, "conversationId");
        require(conversation);
        synchronized (this) {
            if (goals(conversation).stream().anyMatch(goal -> goal.status().equals("active")))
                throw ApiFailure.conflict("已有进行中的目标，请先处理它");
            String id = UUID.randomUUID().toString();
            String now = ConversationRepository.now();
            long tokens = limit(request.get("maxTokens"), 100000, 10000000);
            long ms = limit(request.get("maxActiveMs"), 1800000, 86400000);
            String title = required(request, "title");
            repository
                    .jdbc()
                    .sql("INSERT INTO codex_goals VALUES(:id,:c,:t,'active',:tokens,:ms,:now,:now)")
                    .param("id", id)
                    .param("c", conversation)
                    .param("t", title)
                    .param("tokens", tokens)
                    .param("ms", ms)
                    .param("now", now)
                    .update();
            AgentApi.Goal goal =
                    goals(conversation).stream()
                            .filter(value -> value.id().equals(id))
                            .findFirst()
                            .orElseThrow();
            custom(conversation, "goal:" + id + ":created", "codex.goal", Map.of("goal", goal));
            return goal;
        }
    }

    public AgentApi.Goal updateGoal(String id, Map<String, Object> request) {
        var row =
                repository
                        .jdbc()
                        .sql("SELECT conversation_id FROM codex_goals WHERE id=:id")
                        .param("id", id)
                        .query(String.class)
                        .optional()
                        .orElseThrow(ApiFailure::missing);
        AgentApi.Goal current =
                goals(row).stream().filter(goal -> goal.id().equals(id)).findFirst().orElseThrow();
        String status = String.valueOf(request.getOrDefault("status", current.status()));
        if (!List.of(
                        "active",
                        "paused",
                        "needs_review",
                        "complete",
                        "cancelled",
                        "budget_exhausted")
                .contains(status)) throw ApiFailure.invalid("目标状态不合法");
        if (status.equals("active")
                && goals(row).stream()
                        .anyMatch(goal -> !goal.id().equals(id) && goal.status().equals("active")))
            throw ApiFailure.conflict("本会话已经有进行中的目标");
        String title = request.containsKey("title") ? required(request, "title") : current.title();
        long tokens = limit(request.get("maxTokens"), current.maxTokens(), 10000000);
        long ms = limit(request.get("maxActiveMs"), current.maxActiveMs(), 86400000);
        repository
                .jdbc()
                .sql(
                        "UPDATE codex_goals SET title=:t,status=:s,max_tokens=:tokens,max_active_ms=:ms,updated_at=:now WHERE id=:id")
                .param("id", id)
                .param("t", title)
                .param("s", status)
                .param("tokens", tokens)
                .param("ms", ms)
                .param("now", ConversationRepository.now())
                .update();
        AgentApi.Goal goal =
                goals(row).stream()
                        .filter(value -> value.id().equals(id))
                        .findFirst()
                        .orElseThrow();
        custom(row, "goal:" + id + ":" + UUID.randomUUID(), "codex.goal", Map.of("goal", goal));
        return goal;
    }

    public List<AgentApi.Goal> activeGoals() {
        return repository.conversations(null).stream()
                .filter(conversation -> !conversation.archived())
                .flatMap(conversation -> goals(conversation.id()).stream())
                .filter(goal -> goal.status().equals("active"))
                .toList();
    }

    public void transitionActiveGoal(AgentApi.Goal expected, String status) {
        if (!List.of("paused", "budget_exhausted").contains(status))
            throw ApiFailure.invalid("不支持这个调度状态");
        if (!repository.transitionActiveGoal(expected.id(), expected.updatedAt(), status)) return;
        var updated =
                goals(expected.conversationId()).stream()
                        .filter(goal -> goal.id().equals(expected.id()))
                        .findFirst()
                        .orElseThrow();
        custom(
                expected.conversationId(),
                "goal:" + expected.id() + ":" + UUID.randomUUID(),
                "codex.goal",
                Map.of("goal", updated));
    }

    public Map<String, Object> proposeGoalResult(
            String conversation, String summary, List<String> evidence) {
        if (summary == null
                || summary.isBlank()
                || summary.length() > 10000
                || evidence == null
                || evidence.isEmpty()
                || evidence.size() > 30) throw ApiFailure.invalid("交付目标需要具体说明和可复核的验证证据");
        var goal =
                goals(conversation).stream()
                        .filter(value -> value.status().equals("active"))
                        .findFirst()
                        .orElseThrow(() -> ApiFailure.conflict("当前没有进行中的目标"));
        var plan = plan(conversation);
        if (plan != null
                && plan.steps().stream()
                        .anyMatch(
                                step ->
                                        !List.of("completed", "cancelled")
                                                .contains(step.get("status"))))
            throw ApiFailure.conflict("仍有未处理计划步骤，请先完成或解释取消");
        var result =
                Map.<String, Object>of(
                        "goalId",
                        goal.id(),
                        "summary",
                        summary,
                        "evidence",
                        evidence,
                        "verification",
                        "待用户复核，模型声明不等于验证成功");
        custom(
                conversation,
                "goal-result:" + goal.id() + ":" + UUID.randomUUID(),
                "codex.goal_result",
                result);
        updateGoal(goal.id(), Map.of("status", "needs_review"));
        return result;
    }

    public AgentApi.Plan plan(String conversation) {
        require(conversation);
        return repository
                .jdbc()
                .sql("SELECT * FROM codex_plans WHERE conversation_id=:id")
                .param("id", conversation)
                .query(
                        (rs, row) ->
                                new AgentApi.Plan(
                                        conversation,
                                        rs.getString("title"),
                                        steps(rs.getString("steps")),
                                        rs.getInt("revision"),
                                        rs.getString("updated_at")))
                .optional()
                .orElse(null);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> steps(String json) {
        return repository.read(json, List.class);
    }

    public AgentApi.Plan putPlan(String conversation, Map<String, Object> request) {
        require(conversation);
        String title = required(request, "title");
        if (!(request.get("steps") instanceof List<?> list) || list.size() > 100)
            throw ApiFailure.invalid("计划步骤须为数组且最多100项");
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> step)
                    || !(step.get("title") instanceof String text)
                    || text.isBlank()) throw ApiFailure.invalid("每个计划步骤需要标题");
            Object status = step.get("status");
            if (status != null
                    && !List.of("pending", "in_progress", "completed", "cancelled")
                            .contains(status)) throw ApiFailure.invalid("计划步骤状态不合法");
        }
        repository
                .jdbc()
                .sql(
                        """
                INSERT INTO codex_plans(conversation_id,title,steps,updated_at) VALUES(:id,:t,:s,:now)
                ON CONFLICT(conversation_id) DO UPDATE SET title=:t,steps=:s,revision=codex_plans.revision+1,updated_at=:now
                """)
                .param("id", conversation)
                .param("t", title)
                .param("s", repository.json(list))
                .param("now", ConversationRepository.now())
                .update();
        AgentApi.Plan plan = plan(conversation);
        custom(conversation, "plan:" + plan.revision(), "codex.plan", Map.of("plan", plan));
        return plan;
    }

    public List<AgentApi.Automation> automations() {
        return repository
                .jdbc()
                .sql(
                        "SELECT * FROM codex_automations WHERE conversation_id IN (SELECT id FROM codex_conversations WHERE owner_id=:owner) ORDER BY created_at DESC")
                .param("owner", com.xuya.island.account.AccountScope.id())
                .query(
                        (rs, row) ->
                                new AgentApi.Automation(
                                        rs.getString("id"),
                                        rs.getString("conversation_id"),
                                        rs.getString("name"),
                                        rs.getString("prompt"),
                                        rs.getInt("interval_minutes"),
                                        rs.getBoolean("enabled"),
                                        rs.getLong("next_run_at"),
                                        rs.getString("last_status"),
                                        rs.getString("created_at"),
                                        rs.getString("updated_at")))
                .list();
    }

    public AgentApi.Automation saveAutomation(String id, Map<String, Object> request) {
        AgentApi.Automation current =
                id == null
                        ? null
                        : automations().stream()
                                .filter(a -> a.id().equals(id))
                                .findFirst()
                                .orElseThrow(ApiFailure::missing);
        String conversation =
                request.containsKey("conversationId")
                        ? required(request, "conversationId")
                        : current == null ? "" : current.conversationId();
        require(conversation);
        String name =
                request.containsKey("name")
                        ? required(request, "name")
                        : current == null ? "" : current.name();
        String prompt =
                request.containsKey("prompt")
                        ? required(request, "prompt")
                        : current == null ? "" : current.prompt();
        if (name.isBlank() || prompt.isBlank()) throw ApiFailure.invalid("自动化需要名称与任务内容");
        int interval =
                (int)
                        limit(
                                request.get("intervalMinutes"),
                                current == null ? 60 : current.intervalMinutes(),
                                525600);
        boolean enabled =
                request.containsKey("enabled")
                        ? Boolean.TRUE.equals(request.get("enabled"))
                        : current == null || current.enabled();
        String key = id == null ? UUID.randomUUID().toString() : id;
        long next = System.currentTimeMillis() + interval * 60000L;
        String now = ConversationRepository.now();
        repository
                .jdbc()
                .sql(
                        """
                INSERT INTO codex_automations(id,conversation_id,name,prompt,interval_minutes,enabled,next_run_at,created_at,updated_at)
                VALUES(:id,:c,:n,:p,:i,:e,:next,:now,:now)
                ON CONFLICT(id) DO UPDATE SET conversation_id=:c,name=:n,prompt=:p,interval_minutes=:i,enabled=:e,next_run_at=:next,updated_at=:now
                """)
                .param("id", key)
                .param("c", conversation)
                .param("n", name)
                .param("p", prompt)
                .param("i", interval)
                .param("e", enabled)
                .param("next", next)
                .param("now", now)
                .update();
        return automations().stream().filter(a -> a.id().equals(key)).findFirst().orElseThrow();
    }

    public void deleteAutomation(String id) {
        if (repository
                        .jdbc()
                        .sql("DELETE FROM codex_automations WHERE id=:id")
                        .param("id", id)
                        .update()
                == 0) throw ApiFailure.missing();
    }

    public void automationStatus(String id, long next, String status) {
        repository
                .jdbc()
                .sql(
                        "UPDATE codex_automations SET next_run_at=:n,last_status=:s,updated_at=:now WHERE id=:id")
                .param("id", id)
                .param("n", next)
                .param("s", status)
                .param("now", ConversationRepository.now())
                .update();
    }

    public void custom(
            String conversation, String source, String name, Map<String, Object> values) {
        var payload = new java.util.LinkedHashMap<String, Object>(values);
        payload.put("version", 1);
        var event =
                Map.of(
                        "type",
                        "CUSTOM",
                        "threadId",
                        conversation,
                        "runId",
                        conversation,
                        "name",
                        name,
                        "value",
                        payload,
                        "timestamp",
                        Instant.now().toEpochMilli());
        repository.event(conversation, source, conversation, repository.json(event));
    }

    private static String required(Map<String, Object> request, String field) {
        if (!(request.get(field) instanceof String text)
                || text.isBlank()
                || text.length() > 200000) throw ApiFailure.invalid("缺少合法的" + field);
        return text;
    }

    private static long limit(Object value, long fallback, long max) {
        if (value == null) return fallback;
        if (!(value instanceof Number number) || number.longValue() < 1 || number.longValue() > max)
            throw ApiFailure.invalid("预算或周期超出允许范围");
        return number.longValue();
    }
}
