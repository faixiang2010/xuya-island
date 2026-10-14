package com.xuya.island.growth;

import com.xuya.island.account.AccountScope;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/** 从已接收的输入事实重建续学位置；跨浏览器不复制错误率、时长或积分。 */
@Service
public class TypingProgressService {
    private final TeachingActivityCatalog catalog;
    private final GrowthRepository repository;
    private final GrowthService growth;
    private final LearningImportService imports;

    public TypingProgressService(
            TeachingActivityCatalog catalog,
            GrowthRepository repository,
            GrowthService growth,
            LearningImportService imports) {
        this.catalog = catalog;
        this.repository = repository;
        this.growth = growth;
        this.imports = imports;
    }

    public Map<String, Object> progress() {
        var records = new ArrayList<Map<String, Object>>();
        var drafts = new ArrayList<Map<String, Object>>();
        var sessions =
                repository
                        .jdbc()
                        .sql(
                                "SELECT * FROM learning_sessions WHERE learner_id=:owner AND module='typing' AND mode='practice' ORDER BY started_at DESC,id DESC")
                        .param("owner", AccountScope.id())
                        .query()
                        .listOfRows();
        for (var activity : catalog.list()) {
            if (!activity.module().equals("typing")) continue;
            var related =
                    sessions.stream()
                            .filter(
                                    value ->
                                            value.get("activity_id").equals(activity.id())
                                                    && value.get("content_version")
                                                            .equals(activity.version()))
                            .toList();
            var covered = new HashSet<Integer>();
            Map<String, Object> candidate = null;
            for (var session : related) {
                var specification = growth.map(session.get("specification"));
                if (!specification.containsKey("request") || !specification.containsKey("targets"))
                    continue;
                var request = growth.map(specification.get("request"));
                int start = GrowthService.number(request, "start");
                var targets = (List<?>) specification.get("targets");
                var correct = new HashSet<Integer>();
                for (var event : repository.events(session.get("id").toString())) {
                    if (!event.get("type").equals("card")) continue;
                    var payload = growth.map(event.get("payload"));
                    int index = GrowthService.number(payload, "index");
                    if (index >= 0
                            && index < targets.size()
                            && targets.get(index).equals(payload.get("answer"))) correct.add(index);
                }
                correct.forEach(index -> covered.add(start + index));
                if (candidate == null && !session.get("status").equals("ended")) {
                    int next = 0;
                    while (correct.contains(next)) next++;
                    candidate = new LinkedHashMap<>();
                    candidate.put("nextIndex", start + next);
                    candidate.put("sessionId", session.get("id"));
                    candidate.put("start", start);
                    candidate.put("end", start + targets.size());
                    candidate.put("completed", session.get("status").equals("completed"));
                }
            }
            String[] parts = activity.id().split(":", 2);
            var base = new LinkedHashMap<String, Object>();
            base.put("gameId", parts[0]);
            base.put("levelId", parts[1]);
            base.put("levelVersion", Integer.parseInt(activity.version()));
            if (covered.size() == activity.targets().size() && !related.isEmpty()) {
                base.put("attempts", covered.size());
                base.put("completedAt", related.get(0).get("updated_at"));
                records.add(base);
            } else if (candidate != null
                    && GrowthService.number(candidate, "nextIndex") > 0
                    && GrowthService.number(candidate, "nextIndex") < activity.targets().size()) {
                base.put("nextIndex", candidate.get("nextIndex"));
                base.put(
                        "attempts",
                        Math.max(covered.size(), GrowthService.number(candidate, "nextIndex")));
                if (!Boolean.TRUE.equals(candidate.get("completed")))
                    base.put(
                            "growth",
                            Map.of(
                                    "sessionId",
                                    candidate.get("sessionId"),
                                    "start",
                                    candidate.get("start"),
                                    "end",
                                    candidate.get("end")));
                drafts.add(base);
            }
        }
        var latest = growth.map(imports.state().get("latest"));
        if (latest.containsKey("snapshot")) {
            var legacyTyping = growth.map(growth.map(latest.get("snapshot")).get("typing"));
            for (Object value : (List<?>) legacyTyping.get("records")) {
                var record = growth.map(value);
                if (records.stream()
                        .noneMatch(
                                current ->
                                        current.get("gameId").equals(record.get("gameId"))
                                                && current.get("levelId")
                                                        .equals(record.get("levelId"))))
                    records.add(record);
            }
            for (Object value : (List<?>) legacyTyping.get("drafts")) {
                var draft = growth.map(value);
                if (records.stream()
                                .noneMatch(
                                        current ->
                                                current.get("gameId").equals(draft.get("gameId"))
                                                        && current.get("levelId")
                                                                .equals(draft.get("levelId")))
                        && drafts.stream()
                                .noneMatch(
                                        current ->
                                                current.get("gameId").equals(draft.get("gameId"))
                                                        && current.get("levelId")
                                                                .equals(draft.get("levelId"))))
                    drafts.add(draft);
            }
        }
        return Map.of(
                "version",
                2,
                "records",
                records,
                "drafts",
                drafts,
                "source",
                "server-facts",
                "notice",
                "续学位置来自实际接收的卡片事实，不补造旧准确率或时长。");
    }
}
