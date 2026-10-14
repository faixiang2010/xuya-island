package com.xuya.island.growth;

import com.xuya.island.account.AccountScope;
import com.xuya.island.account.AccountService;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** 无模型可重建的个人分析。每个结论携带事件/证据引用，不猜测能力或孩子情绪。 */
@Service
public class LearningReportService {
    private static final String REPORT_RULE = "family-report-v2";
    private final GrowthRepository repository;
    private final GrowthService growth;
    private final AccountService accounts;

    public LearningReportService(
            GrowthRepository repository, GrowthService growth, AccountService accounts) {
        this.repository = repository;
        this.growth = growth;
        this.accounts = accounts;
    }

    public Map<String, Object> dashboard(String owner, boolean management) {
        if (!management && !owner.equals(AccountScope.id()))
            throw AccountService.missing("没有找到你的成长手册");
        accounts.user(owner);
        return Map.of(
                "learner",
                Map.of("id", owner, "nickname", accounts.user(owner).nickname()),
                "sessions",
                repository.sessions(owner),
                "evidence",
                repository.evidence(owner),
                "skills",
                skills(owner),
                "reviews",
                reviews(owner),
                "balance",
                repository.balance(owner),
                "ledger",
                repository.ledger(owner),
                "redemptions",
                repository.redemptions(owner),
                "report",
                report(
                        owner,
                        LocalDate.parse(
                                        Instant.parse(growth.now())
                                                .atZone(ZoneId.of("Asia/Shanghai"))
                                                .toLocalDate()
                                                .toString())
                                .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))),
                "savedRuns",
                savedRuns(owner));
    }

    public List<Map<String, Object>> reviews(String owner) {
        return repository
                .jdbc()
                .sql(
                        "SELECT * FROM learning_reviews WHERE learner_id=:owner ORDER BY next_at LIMIT 30")
                .param("owner", owner)
                .query()
                .listOfRows();
    }

    private List<Map<String, Object>> savedRuns(String owner) {
        return repository
                .jdbc()
                .sql(
                        "SELECT id,lesson_id,status,source,gmt_create FROM attempts WHERE owner_id=:owner ORDER BY gmt_create DESC LIMIT 50")
                .param("owner", owner)
                .query()
                .listOfRows();
    }

    public List<Map<String, Object>> history(String owner) {
        return repository.sessions(owner);
    }

    public List<Map<String, Object>> reports(String owner) {
        return repository
                .jdbc()
                .sql(
                        "SELECT id,period,cutoff,rule_version,report,created_at FROM learning_reports WHERE learner_id=:owner ORDER BY period DESC,created_at DESC LIMIT 52")
                .param("owner", owner)
                .query()
                .listOfRows();
    }

    public List<Map<String, Object>> skills(String owner) {
        return skillsAt(owner, Instant.parse(growth.now()).plusMillis(1));
    }

    private List<Map<String, Object>> skillsAt(String owner, Instant cutoff) {
        Map<String, List<Map<String, Object>>> groups = new LinkedHashMap<>();
        String minimum = cutoff.minusSeconds(28L * 86400).toString();
        for (var evidence : repository.evidenceBetween(owner, minimum, cutoff.toString()))
            groups.computeIfAbsent(
                            evidence.get("knowledge_id").toString(), ignored -> new ArrayList<>())
                    .add(evidence);
        var skills = new ArrayList<Map<String, Object>>();
        for (var group : groups.entrySet()) {
            var recent = group.getValue();
            var fingerprints = new HashSet<String>();
            var days = new HashSet<String>();
            var references = new ArrayList<String>();
            boolean review = false, accurate = true;
            int independent = 0;
            for (var evidence : recent) {
                Map<String, Object> summary = growth.map(evidence.get("summary"));
                references.add(evidence.get("id").toString());
                if (GrowthService.number(evidence, "independent") == 1
                        && fingerprints.add(summary.get("taskFingerprint").toString())) {
                    independent++;
                    days.add(
                            Instant.parse(evidence.get("received_at").toString())
                                    .atZone(ZoneId.of("Asia/Shanghai"))
                                    .toLocalDate()
                                    .toString());
                    review |= summary.get("taskFingerprint").toString().endsWith(":review");
                    accurate &= GrowthService.number(summary, "accuracy") >= 80;
                }
            }
            String state = "正在练习";
            if (recent.size() >= 2
                    && recent.subList(0, 2).stream()
                            .allMatch(
                                    value ->
                                            GrowthService.number(
                                                            growth.map(value.get("summary")),
                                                            "accuracy")
                                                    < 80)) state = "需要巩固";
            boolean typing =
                    !group.getKey().startsWith("python:") && !group.getKey().startsWith("story:");
            if (typing && independent >= 3 && days.size() >= 2 && review && accurate)
                state = "表现稳定";
            skills.add(
                    Map.of(
                            "knowledgeId",
                            group.getKey(),
                            "state",
                            state,
                            "evidenceCount",
                            recent.size(),
                            "independentCount",
                            independent,
                            "days",
                            days.size(),
                            "hasReviewVariant",
                            review,
                            "references",
                            references,
                            "notice",
                            recent.isEmpty()
                                    ? "近28天还没有新线索，找一天再试试"
                                    : "编程解释和创造需要家庭成员一起观察；不会只凭一次运行判断掌握。"));
        }
        return skills;
    }

    public synchronized Map<String, Object> report(String owner, LocalDate monday) {
        if (monday.getDayOfWeek() != DayOfWeek.MONDAY)
            throw AccountService.invalid("周报周期从家庭时区的星期一开始");
        ZoneId zone = ZoneId.of("Asia/Shanghai");
        String start = monday.atStartOfDay(zone).toInstant().toString(),
                end = monday.plusDays(7).atStartOfDay(zone).toInstant().toString();
        long cutoff =
                repository
                        .jdbc()
                        .sql(
                                "SELECT (SELECT COUNT(*) FROM learning_events e JOIN learning_sessions s ON s.id=e.session_id WHERE s.learner_id=:owner)+(SELECT COUNT(*) FROM reward_ledger WHERE learner_id=:owner)+(SELECT COALESCE(SUM(revision),0) FROM reward_redemptions WHERE learner_id=:owner)+(SELECT COUNT(*) FROM learning_sessions WHERE learner_id=:owner)")
                        .param("owner", owner)
                        .query(Long.class)
                        .single();
        String period = monday.toString();
        var existing =
                repository
                        .jdbc()
                        .sql(
                                "SELECT report FROM learning_reports WHERE learner_id=:owner AND period=:period AND cutoff=:cutoff AND rule_version=:rule")
                        .param("owner", owner)
                        .param("period", period)
                        .param("cutoff", cutoff)
                        .param("rule", REPORT_RULE)
                        .query(String.class)
                        .optional();
        if (existing.isPresent()) return growth.map(existing.get());
        var evidence = repository.evidenceBetween(owner, start, end);
        var sessions = repository.sessionsBetween(owner, start, end);
        int completed =
                (int) evidence.stream().map(value -> value.get("session_id")).distinct().count();
        var sources = new HashSet<String>();
        long activeMs = 0;
        for (var item : evidence) {
            var summary = growth.map(item.get("summary"));
            sources.addAll(
                    ((List<?>) summary.get("helpSources")).stream().map(Object::toString).toList());
            activeMs += ((Number) summary.get("activeMs")).longValue();
        }
        Instant periodEnd = Instant.parse(end), now = Instant.parse(growth.now()).plusMillis(1);
        var observations = skillsAt(owner, periodEnd.isBefore(now) ? periodEnd : now);
        var strong =
                observations.stream().filter(value -> value.get("state").equals("表现稳定")).toList();
        var consolidate =
                observations.stream()
                        .filter(value -> value.get("state").equals("需要巩固"))
                        .limit(2)
                        .toList();
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("period", period);
        report.put("ruleVersion", REPORT_RULE);
        report.put("dataCutoff", cutoff);
        report.put("learningCount", sessions.size());
        report.put("completed", completed);
        report.put("unfinished", sessions.size() - completed);
        report.put("activeMs", activeMs);
        report.put("helpSources", List.copyOf(sources));
        report.put("strong", strong);
        report.put("consolidate", consolidate);
        report.put("balance", repository.balanceBefore(owner, end));
        report.put(
                "references",
                evidence.stream()
                        .map(
                                value ->
                                        Map.of(
                                                "evidenceId",
                                                value.get("id"),
                                                "sessionId",
                                                value.get("session_id"),
                                                "receivedAt",
                                                value.get("received_at")))
                        .toList());
        report.put(
                "conclusion",
                evidence.isEmpty()
                        ? "本周还没有完成活动的明细，尚不能判断学习趋势。已经保存的作品和代码运行仍可查看。"
                        : "本周留下了" + completed + "次完成记录。强项与需要巩固的线索都来自具体活动；没有足够独立样本时保持待观察。");
        report.put("timingNotice", "有效练习时长来自有界活动事件，是估计值，不代表注意力或学习能力。");
        repository
                .jdbc()
                .sql(
                        "INSERT OR IGNORE INTO learning_reports VALUES(:id,:owner,:period,:cutoff,:rule,:report,:now)")
                .param("id", UUID.randomUUID().toString())
                .param("owner", owner)
                .param("period", period)
                .param("cutoff", cutoff)
                .param("rule", REPORT_RULE)
                .param(
                        "report",
                        tools.jackson.databind.json.JsonMapper.builder()
                                .build()
                                .writeValueAsString(report))
                .param("now", growth.now())
                .update();
        return report;
    }
}
