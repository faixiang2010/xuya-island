package com.xuya.island.growth;

import com.xuya.island.account.AccountScope;
import com.xuya.island.account.AccountService;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** 成长域只使用参数化SQL；普通查询始终附带可信账户归属。 */
@Repository
public class GrowthRepository {
    private final JdbcClient jdbc;

    public GrowthRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public JdbcClient jdbc() {
        return jdbc;
    }

    public Map<String, Object> session(String id) {
        return jdbc
                .sql("SELECT * FROM learning_sessions WHERE id=:id AND learner_id=:owner")
                .param("id", id)
                .param("owner", AccountScope.id())
                .query()
                .listOfRows()
                .stream()
                .findFirst()
                .orElseThrow(() -> AccountService.missing("没有找到你的学习活动"));
    }

    public List<Map<String, Object>> events(String id) {
        session(id);
        return jdbc.sql("SELECT * FROM learning_events WHERE session_id=:id ORDER BY sequence")
                .param("id", id)
                .query()
                .listOfRows();
    }

    public List<Map<String, Object>> sessions(String owner) {
        return jdbc.sql(
                        "SELECT * FROM learning_sessions WHERE learner_id=:owner ORDER BY started_at DESC LIMIT 200")
                .param("owner", owner)
                .query()
                .listOfRows();
    }

    public Optional<Map<String, Object>> event(String id) {
        return jdbc
                .sql(
                        "SELECT e.* FROM learning_events e JOIN learning_sessions s ON s.id=e.session_id WHERE e.event_id=:id AND s.learner_id=:owner")
                .param("id", id)
                .param("owner", AccountScope.id())
                .query()
                .listOfRows()
                .stream()
                .findFirst();
    }

    public List<Map<String, Object>> ledger(String owner) {
        return jdbc.sql(
                        "SELECT * FROM reward_ledger WHERE learner_id=:owner ORDER BY id DESC LIMIT 300")
                .param("owner", owner)
                .query()
                .listOfRows();
    }

    public List<Map<String, Object>> evidence(String owner) {
        return jdbc.sql(
                        "SELECT * FROM skill_evidence WHERE learner_id=:owner ORDER BY received_at DESC LIMIT 500")
                .param("owner", owner)
                .query()
                .listOfRows();
    }

    public List<Map<String, Object>> evidenceBetween(String owner, String start, String end) {
        return jdbc.sql(
                        "SELECT * FROM skill_evidence WHERE learner_id=:owner AND julianday(received_at)>=julianday(:start) AND julianday(received_at)<julianday(:end) ORDER BY received_at DESC,id")
                .param("owner", owner)
                .param("start", start)
                .param("end", end)
                .query()
                .listOfRows();
    }

    public List<Map<String, Object>> sessionsBetween(String owner, String start, String end) {
        return jdbc.sql(
                        "SELECT s.* FROM learning_sessions s WHERE s.learner_id=:owner AND ((julianday(s.started_at)>=julianday(:start) AND julianday(s.started_at)<julianday(:end)) OR EXISTS(SELECT 1 FROM learning_events e WHERE e.session_id=s.id AND julianday(e.received_at)>=julianday(:start) AND julianday(e.received_at)<julianday(:end)) OR EXISTS(SELECT 1 FROM skill_evidence v WHERE v.session_id=s.id AND julianday(v.received_at)>=julianday(:start) AND julianday(v.received_at)<julianday(:end))) ORDER BY s.started_at DESC,s.id")
                .param("owner", owner)
                .param("start", start)
                .param("end", end)
                .query()
                .listOfRows();
    }

    public Map<String, Object> balanceBefore(String owner, String end) {
        return jdbc.sql(
                        "SELECT COALESCE(SUM(delta),0) AS balance,COALESCE(SUM(frozen_delta),0) AS frozen FROM reward_ledger WHERE learner_id=:owner AND julianday(created_at)<julianday(:end)")
                .param("owner", owner)
                .param("end", end)
                .query()
                .singleRow();
    }

    public Map<String, Object> balance(String owner) {
        jdbc.sql("INSERT INTO reward_balances(learner_id) VALUES(:owner) ON CONFLICT DO NOTHING")
                .param("owner", owner)
                .update();
        return jdbc.sql("SELECT * FROM reward_balances WHERE learner_id=:owner")
                .param("owner", owner)
                .query()
                .singleRow();
    }

    public List<Map<String, Object>> rewards(boolean management) {
        return jdbc.sql(
                        management
                                ? "SELECT * FROM family_rewards ORDER BY updated_at DESC"
                                : "SELECT * FROM family_rewards WHERE enabled=1 ORDER BY updated_at DESC")
                .query()
                .listOfRows();
    }

    public Map<String, Object> reward(String id) {
        return jdbc
                .sql("SELECT * FROM family_rewards WHERE id=:id")
                .param("id", id)
                .query()
                .listOfRows()
                .stream()
                .findFirst()
                .orElseThrow(() -> AccountService.missing("这个礼物暂时没有找到"));
    }

    public List<Map<String, Object>> redemptions(String owner) {
        return jdbc.sql(
                        "SELECT * FROM reward_redemptions WHERE learner_id=:owner ORDER BY created_at DESC LIMIT 200")
                .param("owner", owner)
                .query()
                .listOfRows();
    }
}
