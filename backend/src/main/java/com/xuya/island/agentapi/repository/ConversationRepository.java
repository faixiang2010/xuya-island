package com.xuya.island.agentapi.repository;

import com.xuya.island.account.AccountScope;
import com.xuya.island.agentapi.dto.AgentApi;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/** 参数化 SQLite 业务账本与可重建协议投影。 */
@Repository
public class ConversationRepository {
    private final JdbcClient jdbc;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public ConversationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public String json(Object value) {
        return mapper.writeValueAsString(value);
    }

    public <T> T read(String value, Class<T> type) {
        return mapper.readValue(value, type);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> map(String json) {
        return read(json, Map.class);
    }

    public static String now() {
        return Instant.now().toString();
    }

    private AgentApi.Conversation conversation(ResultSet rs) throws SQLException {
        AgentApi.Settings s = read(rs.getString("settings"), AgentApi.Settings.class);
        return new AgentApi.Conversation(
                rs.getString("id"),
                rs.getString("project_id"),
                rs.getString("workspace_id"),
                rs.getString("title"),
                s.modelId(),
                s.reasoningEffort(),
                s.permissionMode(),
                s.planMode(),
                s.maxTokens(),
                s.maxActiveMs(),
                rs.getBoolean("archived"),
                rs.getBoolean("pinned"),
                rs.getString("created_at"),
                rs.getString("updated_at"));
    }

    public Optional<AgentApi.Conversation> conversation(String id) {
        return jdbc.sql("SELECT * FROM codex_conversations WHERE id=:id AND owner_id=:owner")
                .param("owner", AccountScope.id())
                .param("id", id)
                .query((rs, row) -> conversation(rs))
                .optional();
    }

    public List<AgentApi.Conversation> conversations(String projectId) {
        return jdbc.sql(
                        "SELECT * FROM codex_conversations WHERE owner_id=:owner AND (:project='' OR project_id=:project) ORDER BY updated_at DESC")
                .param("owner", AccountScope.id())
                .param("project", projectId == null ? "" : projectId)
                .query((rs, row) -> conversation(rs))
                .list();
    }

    public void insert(AgentApi.Conversation c) {
        jdbc.sql(
                        "INSERT INTO codex_conversations(id,project_id,workspace_id,title,settings,created_at,updated_at,owner_id) VALUES(:id,:p,:w,:t,:s,:now,:now,:owner)")
                .param("owner", AccountScope.id())
                .param("id", c.id())
                .param("p", c.projectId())
                .param("w", c.workspaceId())
                .param("t", c.title())
                .param("s", json(settings(c)))
                .param("now", c.createdAt())
                .update();
        jdbc.sql("INSERT INTO codex_projection(conversation_id) VALUES(:id)")
                .param("id", c.id())
                .update();
    }

    public static AgentApi.Settings settings(AgentApi.Conversation c) {
        return new AgentApi.Settings(
                c.modelId(),
                c.reasoningEffort(),
                c.permissionMode(),
                c.planMode(),
                c.maxTokens(),
                c.maxActiveMs());
    }

    public void configure(
            String id, String title, AgentApi.Settings settings, boolean archived, boolean pinned) {
        jdbc.sql(
                        "UPDATE codex_conversations SET title=:t,settings=:s,archived=:a,pinned=:pin,updated_at=:now WHERE id=:id")
                .param("id", id)
                .param("t", title)
                .param("s", json(settings))
                .param("a", archived)
                .param("pin", pinned)
                .param("now", now())
                .update();
    }

    /** 删除会话及其全部派生记录；表名为白名单，先删子表再删主表。 */
    public void delete(String id) {
        for (String table :
                List.of(
                        "codex_runs",
                        "codex_events",
                        "codex_responses",
                        "codex_agui_requests",
                        "codex_input_messages",
                        "codex_goals",
                        "codex_plans",
                        "codex_automations",
                        "codex_actions",
                        "codex_projection")) {
            jdbc.sql("DELETE FROM " + table + " WHERE conversation_id=:id")
                    .param("id", id)
                    .update();
        }
        jdbc.sql("DELETE FROM codex_conversations WHERE id=:id AND owner_id=:owner")
                .param("id", id)
                .param("owner", AccountScope.id())
                .update();
    }

    public record RunRow(
            String id,
            String conversationId,
            String clientRequestId,
            String payload,
            String nativeTurnId,
            String nativeExecutionId,
            String status,
            String createdAt) {}

    private RunRow run(ResultSet rs) throws SQLException {
        return new RunRow(
                rs.getString("id"),
                rs.getString("conversation_id"),
                rs.getString("client_request_id"),
                rs.getString("payload"),
                rs.getString("native_turn_id"),
                rs.getString("native_execution_id"),
                rs.getString("status"),
                rs.getString("created_at"));
    }

    public List<RunRow> runs(String id) {
        return jdbc.sql("SELECT * FROM codex_runs WHERE conversation_id=:id ORDER BY created_at")
                .param("id", id)
                .query((rs, row) -> run(rs))
                .list();
    }

    public Optional<RunRow> runByRequest(String id, String client) {
        return jdbc.sql(
                        "SELECT * FROM codex_runs WHERE conversation_id=:id AND client_request_id=:c")
                .param("id", id)
                .param("c", client)
                .query((rs, row) -> run(rs))
                .optional();
    }

    public void insertRun(String id, String conversation, String client, String payload) {
        jdbc.sql(
                        "INSERT INTO codex_runs(id,conversation_id,client_request_id,payload,status,created_at) VALUES(:id,:s,:c,:p,'queued',:now)")
                .param("id", id)
                .param("s", conversation)
                .param("c", client)
                .param("p", payload)
                .param("now", now())
                .update();
        jdbc.sql("UPDATE codex_conversations SET updated_at=:now WHERE id=:id")
                .param("id", conversation)
                .param("now", now())
                .update();
    }

    public void nativeTask(String id, String turn, String execution, String status) {
        jdbc.sql(
                        "UPDATE codex_runs SET native_turn_id=:t,native_execution_id=:e,status=:s WHERE id=:id")
                .param("id", id)
                .param("t", turn)
                .param("e", execution)
                .param("s", status)
                .update();
    }

    public void status(String id, String status) {
        jdbc.sql("UPDATE codex_runs SET status=:s WHERE id=:id")
                .param("id", id)
                .param("s", status)
                .update();
    }

    /** 调度器只转换仍在进行中的目标，不能覆盖用户操作或工具刚提交的成果。 */
    public boolean transitionActiveGoal(String id, String expectedUpdatedAt, String status) {
        return jdbc.sql(
                                "UPDATE codex_goals SET status=:status,updated_at=:now WHERE id=:id AND status='active' AND updated_at=:expected")
                        .param("status", status)
                        .param("now", now())
                        .param("id", id)
                        .param("expected", expectedUpdatedAt)
                        .update()
                == 1;
    }

    public long projected(String id) {
        return jdbc.sql("SELECT native_seq FROM codex_projection WHERE conversation_id=:id")
                .param("id", id)
                .query(Long.class)
                .single();
    }

    public void projected(String id, long seq) {
        jdbc.sql("UPDATE codex_projection SET native_seq=:seq WHERE conversation_id=:id")
                .param("id", id)
                .param("seq", seq)
                .update();
    }

    public boolean event(String id, String source, String runId, String json) {
        return jdbc.sql(
                                "INSERT OR IGNORE INTO codex_events(conversation_id,source_key,run_id,event,created_at) VALUES(:id,:key,:run,:event,:now)")
                        .param("id", id)
                        .param("key", source)
                        .param("run", runId)
                        .param("event", json)
                        .param("now", now())
                        .update()
                == 1;
    }

    public long cursor(String id) {
        return jdbc.sql(
                        "SELECT COALESCE(MAX(cursor),0) FROM codex_events WHERE conversation_id=:id")
                .param("id", id)
                .query(Long.class)
                .single();
    }

    public List<AgentApi.Event> events(String id, long after, int limit) {
        return jdbc.sql(
                        "SELECT cursor,run_id,event FROM codex_events WHERE conversation_id=:id AND cursor>:after ORDER BY cursor LIMIT :limit")
                .param("id", id)
                .param("after", after)
                .param("limit", limit)
                .query(
                        (rs, row) ->
                                new AgentApi.Event(
                                        rs.getLong("cursor"),
                                        rs.getString("run_id"),
                                        rs.getString("event")))
                .list();
    }

    public record SavedResponse(
            String interactionId, String clientRequestId, String payload, boolean delivered) {}

    public Optional<SavedResponse> response(String id, String interaction) {
        return jdbc.sql(
                        "SELECT * FROM codex_responses WHERE conversation_id=:id AND interaction_id=:r")
                .param("id", id)
                .param("r", interaction)
                .query(
                        (rs, row) ->
                                new SavedResponse(
                                        rs.getString("interaction_id"),
                                        rs.getString("client_request_id"),
                                        rs.getString("payload"),
                                        rs.getBoolean("delivered")))
                .optional();
    }

    public List<SavedResponse> undelivered(String id) {
        return jdbc.sql("SELECT * FROM codex_responses WHERE conversation_id=:id AND delivered=0")
                .param("id", id)
                .query(
                        (rs, row) ->
                                new SavedResponse(
                                        rs.getString("interaction_id"),
                                        rs.getString("client_request_id"),
                                        rs.getString("payload"),
                                        false))
                .list();
    }

    public void saveResponse(String id, String interaction, String client, String payload) {
        jdbc.sql("INSERT INTO codex_responses VALUES(:id,:r,:c,:p,0)")
                .param("id", id)
                .param("r", interaction)
                .param("c", client)
                .param("p", payload)
                .update();
    }

    public void delivered(String id, String interaction) {
        jdbc.sql(
                        "UPDATE codex_responses SET delivered=1 WHERE conversation_id=:id AND interaction_id=:r")
                .param("id", id)
                .param("r", interaction)
                .update();
    }

    public Optional<Map<String, Object>> aguiRequest(String id, String runId) {
        return jdbc.sql("SELECT * FROM codex_agui_requests WHERE conversation_id=:id AND run_id=:r")
                .param("id", id)
                .param("r", runId)
                .query(
                        (rs, row) ->
                                Map.<String, Object>of(
                                        "hash",
                                        rs.getString("payload_hash"),
                                        "executionId",
                                        rs.getString("execution_id") == null
                                                ? ""
                                                : rs.getString("execution_id"),
                                        "cursor",
                                        rs.getLong("start_cursor")))
                .optional();
    }

    public void aguiRequest(String id, String runId, String hash, String executionId, long cursor) {
        jdbc.sql("INSERT INTO codex_agui_requests VALUES(:id,:r,:h,:e,:c)")
                .param("id", id)
                .param("r", runId)
                .param("h", hash)
                .param("e", executionId)
                .param("c", cursor)
                .update();
    }

    public String protocolRun(String id, String executionId) {
        return jdbc.sql(
                        "SELECT run_id FROM codex_agui_requests WHERE conversation_id=:id AND execution_id=:e ORDER BY rowid DESC LIMIT 1")
                .param("id", id)
                .param("e", executionId)
                .query(String.class)
                .optional()
                .orElse(executionId);
    }

    public Optional<String> inputHash(String id, String messageId) {
        return jdbc.sql(
                        "SELECT payload_hash FROM codex_input_messages WHERE conversation_id=:id AND message_id=:m")
                .param("id", id)
                .param("m", messageId)
                .query(String.class)
                .optional();
    }

    public void input(String id, String messageId, String hash) {
        jdbc.sql("INSERT OR IGNORE INTO codex_input_messages VALUES(:id,:m,:h)")
                .param("id", id)
                .param("m", messageId)
                .param("h", hash)
                .update();
    }

    public Optional<Map<String, Object>> savedAction(String id, String client) {
        return jdbc.sql(
                        "SELECT payload,result FROM codex_actions WHERE conversation_id=:id AND client_request_id=:c")
                .param("id", id)
                .param("c", client)
                .query(
                        (rs, row) ->
                                Map.<String, Object>of(
                                        "payload",
                                        rs.getString("payload"),
                                        "result",
                                        map(rs.getString("result"))))
                .optional();
    }

    public void action(String id, String client, String payload, Map<String, Object> result) {
        jdbc.sql("INSERT INTO codex_actions VALUES(:id,:c,:p,:r)")
                .param("id", id)
                .param("c", client)
                .param("p", payload)
                .param("r", json(result))
                .update();
    }

    public void actionResult(String id, String client, Map<String, Object> result) {
        jdbc.sql(
                        "UPDATE codex_actions SET result=:r WHERE conversation_id=:id AND client_request_id=:c")
                .param("id", id)
                .param("c", client)
                .param("r", json(result))
                .update();
    }

    public JdbcClient jdbc() {
        return jdbc;
    }
}
