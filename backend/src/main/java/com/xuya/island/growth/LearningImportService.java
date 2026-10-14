package com.xuya.island.growth;

import com.xuya.island.account.AccountScope;
import com.xuya.island.account.AccountService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/** 显式导入首个学习者的浏览器历史快照，保留来源；绝不补造积分和评估证据。 */
@Service
public class LearningImportService {
    public record Snapshot(
            String id, Map<String, Object> typing, List<Map<String, Object>> drafts) {}

    private final JdbcClient jdbc;
    private final AccountService accounts;
    private final TeachingActivityCatalog catalog;
    private final TransactionTemplate transaction;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public LearningImportService(
            JdbcClient jdbc,
            AccountService accounts,
            TeachingActivityCatalog catalog,
            TransactionTemplate transaction) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.catalog = catalog;
        this.transaction = transaction;
    }

    public Map<String, Object> state() {
        String owner = AccountScope.id();
        var rows =
                jdbc.sql(
                                "SELECT id,payload,received_at FROM learning_imports WHERE learner_id=:owner ORDER BY received_at DESC LIMIT 1")
                        .param("owner", owner)
                        .query()
                        .listOfRows();
        return Map.of(
                "allowed",
                owner.equals(accounts.setting("legacy_learning_owner", "")),
                "latest",
                rows.isEmpty()
                        ? Map.of()
                        : Map.of(
                                "id",
                                rows.get(0).get("id"),
                                "receivedAt",
                                rows.get(0).get("received_at"),
                                "snapshot",
                                mapper.readValue(rows.get(0).get("payload").toString(), Map.class)),
                "notice",
                "只恢复已保留的继续位置和旧草稿，不补积分、准确率或时长；原浏览器记录继续保留。");
    }

    public Map<String, Object> save(Snapshot request) {
        String owner = AccountScope.id();
        if (!owner.equals(accounts.setting("legacy_learning_owner", "")))
            throw AccountService.invalid("浏览器旧记录只归属首个家庭学习账户");
        if (request == null
                || request.id() == null
                || !request.id().matches("[a-zA-Z0-9-]{1,100}")
                || request.typing() == null
                || request.drafts() == null
                || request.drafts().size() > 60
                || mapper.writeValueAsBytes(request).length > 1048576)
            throw AccountService.invalid("导入快照的格式或大小无效");
        var typing =
                Map.of(
                        "version",
                        2,
                        "records",
                        validateTyping(request.typing().get("records"), true),
                        "drafts",
                        validateTyping(request.typing().get("drafts"), false));
        var drafts = new ArrayList<Map<String, Object>>();
        for (var value : request.drafts()) {
            String lesson = GrowthService.text(value, "lessonId", 64),
                    title = GrowthService.text(value, "title", 100);
            Object code = value.get("code");
            if (!(code instanceof String text)
                    || text.length() > 65536
                    || !lesson.matches("[a-zA-Z0-9-]{1,64}"))
                throw AccountService.invalid("旧草稿格式无效");
            if (catalog.list().stream()
                    .noneMatch(
                            activity ->
                                    activity.module().equals("classroom")
                                            && activity.id().equals(lesson)))
                throw AccountService.invalid("旧草稿对应的课程没有发布");
            // 未保存的旧浏览器草稿作为新草稿恢复，不继承无法复核的版本写入权。
            drafts.add(
                    Map.of(
                            "lessonId",
                            lesson,
                            "title",
                            title,
                            "code",
                            text,
                            "revision",
                            0,
                            "dirty",
                            true));
        }
        String payload =
                com.xuya.island.common.CanonicalJson.string(
                        Map.of("typing", typing, "drafts", drafts));
        String hash;
        try {
            hash =
                    HexFormat.of()
                            .formatHex(
                                    java.security.MessageDigest.getInstance("SHA-256")
                                            .digest(
                                                    payload.getBytes(
                                                            java.nio.charset.StandardCharsets
                                                                    .UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
        return transaction.execute(
                status -> {
                    var sameId =
                            jdbc.sql(
                                            "SELECT learner_id,payload_hash FROM learning_imports WHERE id=:id")
                                    .param("id", request.id())
                                    .query()
                                    .listOfRows();
                    if (!sameId.isEmpty()
                            && (!sameId.get(0).get("learner_id").equals(owner)
                                    || !sameId.get(0).get("payload_hash").equals(hash)))
                        throw AccountService.conflict("同一导入不能改成另一份记录");
                    jdbc.sql(
                                    "INSERT INTO learning_imports VALUES(:id,:owner,'browser-legacy','v1-v2',:hash,:payload,:now) ON CONFLICT DO NOTHING")
                            .param("id", request.id())
                            .param("owner", owner)
                            .param("hash", hash)
                            .param("payload", payload)
                            .param("now", Instant.now().toString())
                            .update();
                    accounts.audit("learning:legacy-import", owner, true);
                    return state();
                });
    }

    private List<Map<String, Object>> validateTyping(Object input, boolean completed) {
        if (!(input instanceof List<?> values) || values.size() > 50)
            throw AccountService.invalid("旧游戏记录格式无效");
        var result = new ArrayList<Map<String, Object>>();
        for (Object value : values) {
            if (!(value instanceof Map<?, ?>)) throw AccountService.invalid("旧游戏记录格式无效");
            Map<String, Object> row = mapper.convertValue(value, Map.class);
            String game = GrowthService.text(row, "gameId", 20),
                    level = GrowthService.text(row, "levelId", 40);
            int version = GrowthService.number(row, "levelVersion"),
                    attempts = GrowthService.number(row, "attempts");
            var activity = catalog.require("typing", game + ":" + level, String.valueOf(version));
            if (attempts < 0 || attempts > 1000000) throw AccountService.invalid("旧游戏计数无效");
            if (completed) {
                String when = GrowthService.text(row, "completedAt", 40);
                try {
                    Instant.parse(when);
                } catch (RuntimeException exception) {
                    throw AccountService.invalid("旧完成日期无效");
                }
                if (attempts < activity.targets().size()) throw AccountService.invalid("旧游戏尚未完整完成");
                result.add(
                        Map.of(
                                "gameId",
                                game,
                                "levelId",
                                level,
                                "levelVersion",
                                version,
                                "attempts",
                                attempts,
                                "completedAt",
                                when));
            } else {
                int next = GrowthService.number(row, "nextIndex");
                if (next < 1 || next >= activity.targets().size() || attempts < next)
                    throw AccountService.invalid("旧继续位置无效");
                result.add(
                        Map.of(
                                "gameId",
                                game,
                                "levelId",
                                level,
                                "levelVersion",
                                version,
                                "attempts",
                                attempts,
                                "nextIndex",
                                next));
            }
        }
        return List.copyOf(result);
    }
}
