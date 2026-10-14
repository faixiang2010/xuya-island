package com.xuya.island.studio.repository;

import com.xuya.island.account.AccountScope;
import com.xuya.island.studio.vo.StudioViews;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/** SQLite 项目、候选、执行账本与 SDK 身份映射；不复制原生聊天日志。 */
@Repository
public class StudioRepository {
    private final JdbcClient jdbc;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public StudioRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public String json(Object value) {
        return mapper.writeValueAsString(value);
    }

    public <T> T read(String value, Class<T> type) {
        return mapper.readValue(value, type);
    }

    private List<StudioViews.ProjectFile> files(String value) {
        return List.of(read(value, StudioViews.ProjectFile[].class));
    }

    public List<StudioViews.Project> projects() {
        return jdbc.sql(
                        "SELECT * FROM studio_projects WHERE owner_id=:owner ORDER BY updated_at DESC")
                .param("owner", AccountScope.id())
                .query((rs, row) -> project(rs))
                .list();
    }

    public Optional<StudioViews.Project> project(String id) {
        return jdbc.sql("SELECT * FROM studio_projects WHERE id=:id AND owner_id=:owner")
                .param("owner", AccountScope.id())
                .param("id", id)
                .query((rs, row) -> project(rs))
                .optional();
    }

    private StudioViews.Project project(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new StudioViews.Project(
                rs.getString("id"),
                rs.getString("title"),
                rs.getString("scene"),
                rs.getString("lesson_id"),
                rs.getString("source_work_id"),
                rs.getInt("revision"),
                files(rs.getString("files")),
                read(rs.getString("preferences"), StudioViews.Preferences.class),
                rs.getString("created_at"),
                rs.getString("updated_at"));
    }

    public void insertProject(StudioViews.Project p) {
        jdbc.sql(
                        """
                INSERT INTO studio_projects(id,title,scene,lesson_id,source_work_id,revision,files,preferences,created_at,updated_at,owner_id)
                VALUES(:id,:title,:scene,:lesson,:source,:revision,:files,:preferences,:created,:updated,:owner)
                """)
                .param("id", p.id())
                .param("owner", AccountScope.id())
                .param("title", p.title())
                .param("scene", p.scene())
                .param("lesson", p.lessonId())
                .param("source", p.sourceWorkId())
                .param("revision", p.revision())
                .param("files", json(p.files()))
                .param("preferences", json(p.preferences()))
                .param("created", p.createdAt())
                .param("updated", p.updatedAt())
                .update();
    }

    public int saveProject(StudioViews.Project p, int revision) {
        return jdbc.sql(
                        """
                UPDATE studio_projects SET title=:title,revision=:next,files=:files,preferences=:preferences,
                updated_at=:updated WHERE id=:id AND revision=:revision AND owner_id=:owner
                """)
                .param("title", p.title())
                .param("next", p.revision())
                .param("files", json(p.files()))
                .param("preferences", json(p.preferences()))
                .param("updated", p.updatedAt())
                .param("id", p.id())
                .param("revision", revision)
                .param("owner", AccountScope.id())
                .update();
    }

    public void insertVersion(StudioViews.Project p) {
        jdbc.sql(
                        """
                INSERT INTO studio_versions(project_id,revision,title,files,preferences,created_at)
                VALUES(:id,:revision,:title,:files,:preferences,:created)
                """)
                .param("id", p.id())
                .param("revision", p.revision())
                .param("title", p.title())
                .param("files", json(p.files()))
                .param("preferences", json(p.preferences()))
                .param("created", p.updatedAt())
                .update();
    }

    public List<StudioViews.ProjectVersion> versions(String id) {
        return jdbc.sql("SELECT * FROM studio_versions WHERE project_id=:id ORDER BY revision DESC")
                .param("id", id)
                .query(
                        (rs, row) ->
                                new StudioViews.ProjectVersion(
                                        rs.getInt("revision"),
                                        rs.getString("title"),
                                        files(rs.getString("files")),
                                        read(
                                                rs.getString("preferences"),
                                                StudioViews.Preferences.class),
                                        rs.getString("created_at")))
                .list();
    }

    public void insertSession(StudioViews.StudySession s) {
        jdbc.sql(
                        "INSERT INTO studio_sessions(id,project_id,scene,mode,lesson_id,created_at) VALUES(:id,:project,:scene,:mode,:lesson,:created)")
                .param("id", s.id())
                .param("project", s.projectId())
                .param("scene", s.scene())
                .param("mode", s.mode())
                .param("lesson", s.lessonId())
                .param("created", s.createdAt())
                .update();
    }

    public Optional<StudioViews.StudySession> session(String id) {
        return jdbc.sql(
                        "SELECT * FROM studio_sessions WHERE id=:id AND project_id IN (SELECT id FROM studio_projects WHERE owner_id=:owner)")
                .param("owner", AccountScope.id())
                .param("id", id)
                .query((rs, row) -> session(rs))
                .optional();
    }

    private StudioViews.StudySession session(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new StudioViews.StudySession(
                rs.getString("id"),
                rs.getString("project_id"),
                rs.getString("scene"),
                rs.getString("mode"),
                rs.getString("lesson_id"),
                rs.getString("created_at"));
    }

    public List<StudioViews.StudySession> sessions(String projectId) {
        return jdbc.sql(
                        "SELECT * FROM studio_sessions WHERE project_id=:id ORDER BY created_at DESC")
                .param("id", projectId)
                .query((rs, row) -> session(rs))
                .list();
    }

    public Optional<String> requestPayload(String sessionId, String clientId) {
        return jdbc.sql(
                        "SELECT payload FROM studio_requests WHERE session_id=:session AND client_request_id=:client")
                .param("session", sessionId)
                .param("client", clientId)
                .query(String.class)
                .optional();
    }

    public void insertRequest(
            String sessionId, String clientId, String turnId, String payload, String intent) {
        jdbc.sql(
                        "INSERT INTO studio_requests(session_id,client_request_id,turn_id,payload,intent) VALUES(:s,:c,:t,:p,:i)")
                .param("s", sessionId)
                .param("c", clientId)
                .param("t", turnId)
                .param("p", payload)
                .param("i", intent)
                .update();
    }

    public String intent(String sessionId, String turnId) {
        return jdbc.sql("SELECT intent FROM studio_requests WHERE session_id=:s AND turn_id=:t")
                .param("s", sessionId)
                .param("t", turnId)
                .query(String.class)
                .optional()
                .orElse("think");
    }

    public void insertCandidate(String sessionId, StudioViews.Candidate c) {
        insertCandidate(sessionId, null, c);
    }

    public void insertCandidate(String sessionId, String turnId, StudioViews.Candidate c) {
        jdbc.sql(
                        """
                INSERT INTO studio_candidates(id,session_id,project_id,base_revision,files,explanation,status,created_at,turn_id)
                VALUES(:id,:session,:project,:base,:files,:explanation,'pending',:created,:turn)
                """)
                .param("id", c.id())
                .param("session", sessionId)
                .param("project", c.projectId())
                .param("base", c.baseRevision())
                .param("files", json(c.files()))
                .param("explanation", c.explanation())
                .param("created", c.createdAt())
                .param("turn", turnId)
                .update();
    }

    public boolean failedRunForTurn(String session, String turn) {
        return jdbc.sql(
                                """
                SELECT COUNT(*) FROM studio_executions e JOIN studio_candidates c ON c.id=e.candidate_id
                WHERE e.session_id=:s AND c.turn_id=:t AND e.status='completed'
                AND json_extract(e.result,'$.status') != 'success'
                """)
                        .param("s", session)
                        .param("t", turn)
                        .query(Integer.class)
                        .single()
                > 0;
    }

    public String capability(String session) {
        return jdbc.sql("SELECT model_capability FROM studio_sessions WHERE id=:s")
                .param("s", session)
                .query(String.class)
                .single();
    }

    public void capability(String session, String capability) {
        jdbc.sql("UPDATE studio_sessions SET model_capability=:c WHERE id=:s")
                .param("c", capability)
                .param("s", session)
                .update();
    }

    private StudioViews.Candidate candidate(java.sql.ResultSet rs) throws java.sql.SQLException {
        int applied = rs.getInt("applied_revision");
        Integer appliedRevision = rs.wasNull() ? null : applied;
        return new StudioViews.Candidate(
                rs.getString("id"),
                rs.getString("project_id"),
                rs.getInt("base_revision"),
                files(rs.getString("files")),
                rs.getString("explanation"),
                rs.getString("status"),
                appliedRevision,
                rs.getString("created_at"));
    }

    public Optional<StudioViews.Candidate> candidate(String id) {
        return jdbc.sql(
                        "SELECT * FROM studio_candidates WHERE id=:id AND project_id IN (SELECT id FROM studio_projects WHERE owner_id=:owner)")
                .param("owner", AccountScope.id())
                .param("id", id)
                .query((rs, row) -> candidate(rs))
                .optional();
    }

    public List<StudioViews.Candidate> candidates(String sessionId) {
        return jdbc.sql(
                        "SELECT * FROM studio_candidates WHERE session_id=:id ORDER BY created_at DESC")
                .param("id", sessionId)
                .query((rs, row) -> candidate(rs))
                .list();
    }

    public boolean ownsCandidate(String sessionId, String candidateId) {
        return jdbc.sql(
                                "SELECT COUNT(*) FROM studio_candidates WHERE session_id=:s AND id=:c AND project_id IN (SELECT id FROM studio_projects WHERE owner_id=:owner)")
                        .param("owner", AccountScope.id())
                        .param("s", sessionId)
                        .param("c", candidateId)
                        .query(Integer.class)
                        .single()
                == 1;
    }

    public int candidateState(String id, String from, String to, Integer revision) {
        return jdbc.sql(
                        "UPDATE studio_candidates SET status=:to,applied_revision=:revision WHERE id=:id AND status=:from")
                .param("to", to)
                .param("revision", revision)
                .param("id", id)
                .param("from", from)
                .update();
    }

    public record Execution(
            String id,
            String sessionId,
            String requestId,
            String candidateId,
            String clientExecutionId,
            String status,
            String result,
            long leaseUntil) {}

    private Execution execution(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Execution(
                rs.getString("id"),
                rs.getString("session_id"),
                rs.getString("request_id"),
                rs.getString("candidate_id"),
                rs.getString("client_execution_id"),
                rs.getString("status"),
                rs.getString("result"),
                rs.getLong("lease_until"));
    }

    public Optional<Execution> execution(String id) {
        return jdbc.sql(
                        "SELECT * FROM studio_executions WHERE id=:id AND session_id IN (SELECT s.id FROM studio_sessions s JOIN studio_projects p ON p.id=s.project_id WHERE p.owner_id=:owner)")
                .param("owner", AccountScope.id())
                .param("id", id)
                .query((rs, row) -> execution(rs))
                .optional();
    }

    public Optional<Execution> executionByClient(String session, String client) {
        return jdbc.sql(
                        "SELECT * FROM studio_executions WHERE session_id=:s AND client_execution_id=:c")
                .param("s", session)
                .param("c", client)
                .query((rs, row) -> execution(rs))
                .optional();
    }

    public Optional<Execution> latestExecution(String session, String request) {
        return jdbc.sql(
                        "SELECT * FROM studio_executions WHERE session_id=:s AND request_id=:r ORDER BY created_at DESC LIMIT 1")
                .param("s", session)
                .param("r", request)
                .query((rs, row) -> execution(rs))
                .optional();
    }

    public void expireExecutions(String session) {
        jdbc.sql(
                        "UPDATE studio_executions SET status='unknown' WHERE session_id=:s AND status='running' AND lease_until<:now")
                .param("s", session)
                .param("now", System.currentTimeMillis())
                .update();
    }

    public void insertExecution(Execution e) {
        jdbc.sql(
                        """
                INSERT INTO studio_executions(id,session_id,request_id,candidate_id,client_execution_id,status,lease_until,created_at)
                VALUES(:id,:s,:r,:c,:client,'running',:lease,:created)
                """)
                .param("id", e.id())
                .param("s", e.sessionId())
                .param("r", e.requestId())
                .param("c", e.candidateId())
                .param("client", e.clientExecutionId())
                .param("lease", e.leaseUntil())
                .param("created", java.time.Instant.now().toString())
                .update();
    }

    public int completeExecution(String id, String result) {
        return jdbc.sql(
                        "UPDATE studio_executions SET status='completed',result=:result WHERE id=:id AND status='running'")
                .param("result", result)
                .param("id", id)
                .update();
    }

    public int heartbeat(String id, long until) {
        return jdbc.sql(
                        "UPDATE studio_executions SET lease_until=:until WHERE id=:id AND status='running' AND lease_until>=:now")
                .param("until", until)
                .param("id", id)
                .param("now", System.currentTimeMillis())
                .update();
    }

    public void abandon(String id) {
        jdbc.sql("UPDATE studio_executions SET status='unknown' WHERE id=:id AND status='running'")
                .param("id", id)
                .update();
    }

    public List<Execution> completedExecutions(String session) {
        return jdbc.sql(
                        "SELECT * FROM studio_executions WHERE session_id=:s AND status='completed'")
                .param("s", session)
                .query((rs, row) -> execution(rs))
                .list();
    }

    public void insertRun(StudioViews.ProjectRun run) {
        jdbc.sql(
                        "INSERT INTO studio_runs(id,project_id,project_revision,files,result,created_at) VALUES(:id,:p,:r,:f,:result,:created)")
                .param("id", run.id())
                .param("p", run.projectId())
                .param("r", run.projectRevision())
                .param("f", json(run.files()))
                .param("result", json(run.result()))
                .param("created", run.createdAt())
                .update();
    }

    public Optional<StudioViews.ProjectRun> lastRun(String projectId) {
        return jdbc.sql(
                        "SELECT * FROM studio_runs WHERE project_id=:id ORDER BY created_at DESC LIMIT 1")
                .param("id", projectId)
                .query(
                        (rs, row) ->
                                new StudioViews.ProjectRun(
                                        rs.getString("id"),
                                        rs.getString("project_id"),
                                        rs.getInt("project_revision"),
                                        files(rs.getString("files")),
                                        read(rs.getString("result"), StudioViews.RunResult.class),
                                        rs.getString("created_at")))
                .optional();
    }

    public StudioViews.Budget budget(String sessionId, String turnId) {
        return jdbc.sql("SELECT * FROM studio_budgets WHERE session_id=:s AND turn_id=:t")
                .param("s", sessionId)
                .param("t", turnId)
                .query(
                        (rs, row) ->
                                new StudioViews.Budget(
                                        rs.getInt("model_calls"),
                                        rs.getLong("active_ms"),
                                        rs.getInt("repair_attempts"),
                                        5,
                                        90000,
                                        2))
                .optional()
                .orElse(new StudioViews.Budget(0, 0, 0, 5, 90000, 2));
    }

    private void ensureBudget(String session, String turn) {
        jdbc.sql("INSERT OR IGNORE INTO studio_budgets(session_id,turn_id) VALUES(:s,:t)")
                .param("s", session)
                .param("t", turn)
                .update();
    }

    public boolean reserveModel(String session, String turn) {
        ensureBudget(session, turn);
        return jdbc.sql(
                                "UPDATE studio_budgets SET model_calls=model_calls+1 WHERE session_id=:s AND turn_id=:t AND model_calls<5 AND active_ms<90000")
                        .param("s", session)
                        .param("t", turn)
                        .update()
                == 1;
    }

    public boolean reserveRepair(String session, String turn) {
        ensureBudget(session, turn);
        return jdbc.sql(
                                "UPDATE studio_budgets SET repair_attempts=repair_attempts+1 WHERE session_id=:s AND turn_id=:t AND repair_attempts<2")
                        .param("s", session)
                        .param("t", turn)
                        .update()
                == 1;
    }

    public void activeTime(String session, String turn, long millis) {
        ensureBudget(session, turn);
        jdbc.sql(
                        "UPDATE studio_budgets SET active_ms=active_ms+:ms WHERE session_id=:s AND turn_id=:t")
                .param("ms", millis)
                .param("s", session)
                .param("t", turn)
                .update();
    }

    public String turnIntent(String session, String turn) {
        return intent(session, turn);
    }
}
