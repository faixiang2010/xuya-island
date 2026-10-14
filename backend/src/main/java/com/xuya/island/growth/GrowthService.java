package com.xuya.island.growth;

import com.xuya.island.account.AccountScope;
import com.xuya.island.account.AccountService;
import com.xuya.island.execution.NativePythonService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/** 统一事实、有限家庭积分和可追溯分析；模型不能写入分数、审批或学习结论。 */
@Service
public class GrowthService {
    public record Create(
            String id,
            String module,
            String activityId,
            String version,
            String mode,
            int start,
            int count) {}

    public record Event(
            String id, int sequence, String type, String clientAt, Map<String, Object> payload) {}

    public record Complete(int revision, int lastSequence) {}

    private static final String RULE = "family-v1";
    private static final ZoneId FAMILY_ZONE = ZoneId.of("Asia/Shanghai");
    private final TeachingActivityCatalog catalog;
    private final GrowthRepository repository;
    private final TransactionTemplate transaction;
    private final NativePythonService python;
    private final AccountService accounts;
    private final Clock clock;
    private final JsonMapper mapper = JsonMapper.builder().build();

    @Autowired
    public GrowthService(
            TeachingActivityCatalog catalog,
            GrowthRepository repository,
            TransactionTemplate transaction,
            NativePythonService python,
            AccountService accounts) {
        this(catalog, repository, transaction, python, accounts, Clock.system(FAMILY_ZONE));
    }

    public GrowthService(
            TeachingActivityCatalog catalog,
            GrowthRepository repository,
            TransactionTemplate transaction,
            NativePythonService python,
            AccountService accounts,
            Clock clock) {
        this.catalog = catalog;
        this.repository = repository;
        this.transaction = transaction;
        this.python = python;
        this.accounts = accounts;
        this.clock = clock;
    }

    public List<TeachingActivityCatalog.Activity> catalog() {
        return catalog.list();
    }

    public synchronized Map<String, Object> create(Create request) {
        if (request == null || request.id() == null || !request.id().matches("[a-zA-Z0-9-]{1,100}"))
            throw AccountService.invalid("学习活动标识无效");
        var activity = catalog.require(request.module(), request.activityId(), request.version());
        requireModulePermission(request.module());
        String mode = request.mode() == null ? "practice" : request.mode();
        if (!Set.of("practice", "review").contains(mode)) throw AccountService.invalid("学习模式无效");
        Map<String, Object> specification = new LinkedHashMap<>();
        specification.put("request", request);
        specification.put("knowledge", activity.knowledge());
        specification.put("title", activity.title());
        if (activity.module().equals("typing")) {
            if (request.start() < 0
                    || request.count() < 1
                    || request.count() > 6
                    || request.start() + request.count() > activity.targets().size())
                throw AccountService.invalid("短任务需要使用已发布的1至6张卡片");
            var targets =
                    new ArrayList<>(
                            activity.targets()
                                    .subList(request.start(), request.start() + request.count()));
            if (mode.equals("review")) Collections.reverse(targets);
            specification.put("targets", targets);
        } else specification.put("targets", List.of());
        specification.put(
                "checks",
                activity.module().equals("classroom") ? activity.tests() : activity.scenes());
        String owner = AccountScope.id();
        return transaction.execute(
                status -> {
                    lockWrite();
                    var existing =
                            repository
                                    .jdbc()
                                    .sql(
                                            "SELECT id,learner_id,specification FROM learning_sessions WHERE id=:id")
                                    .param("id", request.id())
                                    .query()
                                    .listOfRows()
                                    .stream()
                                    .findFirst();
                    if (existing.isPresent()) {
                        if (!owner.equals(existing.get().get("learner_id")))
                            throw AccountService.conflict("学习活动标识已被使用");
                        if (!com.xuya.island.common.CanonicalJson.string(request)
                                .equals(
                                        com.xuya.island.common.CanonicalJson.string(
                                                map(existing.get().get("specification"))
                                                        .get("request"))))
                            throw AccountService.conflict("同一学习活动不能更改内容");
                        return view(repository.session(request.id()));
                    }
                    if (mode.equals("review")) {
                        var review =
                                repository
                                        .jdbc()
                                        .sql(
                                                "SELECT * FROM learning_reviews WHERE learner_id=:owner AND knowledge_id=:knowledge AND next_at<=:now")
                                        .param("owner", owner)
                                        .param("knowledge", activity.knowledge())
                                        .param("now", now())
                                        .query()
                                        .listOfRows()
                                        .stream()
                                        .findFirst();
                        if (review.isEmpty())
                            throw AccountService.conflict("这条线索尚未到复习时间，可以先选择普通练习");
                    }
                    repository
                            .jdbc()
                            .sql(
                                    "INSERT INTO learning_sessions(id,learner_id,module,activity_id,content_version,mode,specification,started_at,updated_at) VALUES(:id,:owner,:module,:activity,:version,:mode,:spec,:now,:now)")
                            .param("id", request.id())
                            .param("owner", owner)
                            .param("module", request.module())
                            .param("activity", request.activityId())
                            .param("version", request.version())
                            .param("mode", mode)
                            .param("spec", mapper.writeValueAsString(specification))
                            .param("now", now())
                            .update();
                    return view(repository.session(request.id()));
                });
    }

    public Map<String, Object> get(String id) {
        Map<String, Object> result = view(repository.session(id));
        result.put("events", repository.events(id));
        return result;
    }

    public synchronized Map<String, Object> events(String id, List<Event> events) {
        if (events == null || events.isEmpty() || events.size() > 50)
            throw AccountService.invalid("每次同步1至50个学习事件");
        return transaction.execute(
                status -> {
                    lockWrite();
                    var session = repository.session(id);
                    requireModulePermission(session.get("module").toString());
                    int cursor = number(session, "cursor");
                    String activityStatus = session.get("status").toString();
                    List<String> accepted = new ArrayList<>();
                    for (var event : events) {
                        validateEvent(event);
                        String payload =
                                com.xuya.island.common.CanonicalJson.string(event.payload());
                        var previous = repository.event(event.id());
                        if (previous.isPresent()) {
                            if (!id.equals(previous.get().get("session_id"))
                                    || event.sequence() != number(previous.get(), "sequence")
                                    || !event.type().equals(previous.get().get("type"))
                                    || !payload.equals(
                                            com.xuya.island.common.CanonicalJson.string(
                                                    map(previous.get().get("payload"))))
                                    || !event.clientAt().equals(previous.get().get("client_at")))
                                throw AccountService.conflict("同一事件不能上传另一份内容");
                            accepted.add(event.id());
                            continue;
                        }
                        if (session.get("status").equals("completed")
                                || session.get("status").equals("ended"))
                            throw AccountService.conflict("这次活动已经结束，不能继续计分");
                        if (event.sequence() != cursor + 1)
                            throw AccountService.conflict("前面的学习记录尚未同步，请按原顺序重试");
                        validateFact(session, event);
                        repository
                                .jdbc()
                                .sql(
                                        "INSERT INTO learning_events VALUES(:id,:session,:seq,:type,:payload,:client,:now)")
                                .param("id", event.id())
                                .param("session", id)
                                .param("seq", event.sequence())
                                .param("type", event.type())
                                .param("payload", payload)
                                .param("client", event.clientAt())
                                .param("now", now())
                                .update();
                        cursor = event.sequence();
                        if (event.type().equals("pause")) activityStatus = "paused";
                        if (event.type().equals("resume")) activityStatus = "active";
                        accepted.add(event.id());
                    }
                    if (cursor != number(session, "cursor"))
                        repository
                                .jdbc()
                                .sql(
                                        "UPDATE learning_sessions SET cursor=:cursor,status=:status,revision=revision+1,updated_at=:now WHERE id=:id")
                                .param("cursor", cursor)
                                .param("status", activityStatus)
                                .param("now", now())
                                .param("id", id)
                                .update();
                    return Map.of("accepted", accepted, "session", view(repository.session(id)));
                });
    }

    private void validateEvent(Event event) {
        if (event == null
                || event.id() == null
                || !event.id().matches("[a-zA-Z0-9-]{1,100}")
                || event.sequence() < 1
                || event.payload() == null
                || event.payload().size() > 12
                || mapper.writeValueAsBytes(event.payload()).length > 8192
                || !Set.of("card", "code-run", "help", "heartbeat", "pause", "resume", "difficulty")
                        .contains(event.type())) throw AccountService.invalid("学习事件格式或大小无效");
        try {
            Instant.parse(event.clientAt());
        } catch (RuntimeException exception) {
            throw AccountService.invalid("学习事件时间无效");
        }
    }

    private void requireModulePermission(String module) {
        if (AccountScope.id().isEmpty()) return;
        String permission =
                switch (module) {
                    case "typing" -> "games:use";
                    case "classroom" -> "classroom:use";
                    case "adventure" -> "adventure:use";
                    default -> "learning:read";
                };
        var available = accounts.permissions(AccountScope.id());
        if (!(available.contains("*") || available.contains(permission)))
            throw new com.xuya.island.common.BusinessException(
                    "ACTIVITY_PERMISSION_DENIED",
                    "这个账户暂时不能使用这项学习活动",
                    org.springframework.http.HttpStatus.FORBIDDEN);
    }

    private void validateFact(Map<String, Object> session, Event event) {
        Map<String, Object> specification = map(session.get("specification"));
        if (event.type().equals("card")) {
            if (!session.get("module").equals("typing")) throw AccountService.invalid("这次活动不是打字任务");
            List<?> targets = (List<?>) specification.get("targets");
            int index = number(event.payload(), "index");
            String answer = text(event.payload(), "answer", 200);
            if (index < 0
                    || index >= targets.size()
                    || answer.length() < targets.get(index).toString().length())
                throw AccountService.invalid("输入不足或卡片不属于这次短任务");
        }
        if (event.type().equals("code-run")) {
            if (session.get("module").equals("typing"))
                throw AccountService.invalid("打字任务不能用代码运行代替");
            Map<String, Object> run = python.snapshot(text(event.payload(), "runId", 100));
            if (!run.get("state").equals("completed"))
                throw AccountService.conflict("请等待代码运行完成，再同步学习记录");
            int index = number(event.payload(), "index");
            if (index < 0 || index >= ((List<?>) specification.get("checks")).size())
                throw AccountService.invalid("运行用例不属于当前活动");
        }
        if (event.type().equals("help")
                && !Set.of("hint", "reference", "ai", "family")
                        .contains(event.payload().get("source")))
            throw AccountService.invalid("帮助来源无效");
        if (event.type().equals("difficulty")
                && !Set.of("easy", "just-right", "hard").contains(event.payload().get("value")))
            throw AccountService.invalid("主观难度无效");
    }

    public synchronized Map<String, Object> complete(String id, Complete request) {
        return transaction.execute(
                status -> {
                    lockWrite();
                    var session = repository.session(id);
                    requireModulePermission(session.get("module").toString());
                    var specification = map(session.get("specification"));
                    if (session.get("status").equals("completed"))
                        return map(specification.get("completion"));
                    if (number(session, "revision") != request.revision()
                            || number(session, "cursor") != request.lastSequence())
                        throw AccountService.conflict("学习记录还没全部同步，先同步后再完成");
                    Map<String, Object> summary = summary(session);
                    if (!Boolean.TRUE.equals(summary.get("complete")))
                        throw AccountService.conflict("还有卡片或固定用例没有完成，记录已经保留");
                    String owner = AccountScope.id(),
                            day = LocalDate.now(clock.withZone(FAMILY_ZONE)).toString();
                    String business =
                            session.get("module")
                                    + ":"
                                    + session.get("activity_id")
                                    + ":"
                                    + specification.get("targets")
                                    + ":"
                                    + day;
                    List<Map<String, Object>> awards = new ArrayList<>();
                    award(owner, business + ":base", 2, "完成短任务", awards);
                    if (session.get("module").equals("typing"))
                        award(
                                owner,
                                business + ":accuracy",
                                (int)
                                        Math.floor(
                                                4.0
                                                        * number(summary, "firstCorrect")
                                                        / number(summary, "total")),
                                "首次完整输入准确奖励",
                                awards);
                    if (Boolean.TRUE.equals(summary.get("corrected")))
                        award(owner, business + ":correction", 2, "找到错误并修正", awards);
                    if (session.get("mode").equals("review")
                            && Boolean.TRUE.equals(summary.get("independent")))
                        award(
                                owner,
                                "review:" + specification.get("knowledge") + ":" + day,
                                3,
                                "完成到期独立复习变式",
                                awards);
                    String received = now();
                    repository
                            .jdbc()
                            .sql(
                                    "INSERT INTO skill_evidence VALUES(:id,:owner,:session,:knowledge,:summary,:source,:independent,:now)")
                            .param("id", UUID.randomUUID().toString())
                            .param("owner", owner)
                            .param("session", id)
                            .param("knowledge", specification.get("knowledge"))
                            .param("summary", mapper.writeValueAsString(summary))
                            .param(
                                    "source",
                                    session.get("module").equals("typing")
                                            ? "browser-report"
                                            : "native-rule-check")
                            .param("independent", Boolean.TRUE.equals(summary.get("independent")))
                            .param("now", received)
                            .update();
                    if (Boolean.TRUE.equals(summary.get("independent")))
                        scheduleReview(owner, session, specification);
                    Map<String, Object> result =
                            Map.of(
                                    "sessionId",
                                    id,
                                    "summary",
                                    summary,
                                    "awards",
                                    awards,
                                    "awarded",
                                    awards.stream()
                                            .mapToInt(value -> number(value, "points"))
                                            .sum(),
                                    "balance",
                                    repository.balance(owner),
                                    "notice",
                                    "达到每日额度后仍可自由学习；普通错误不扣积分。");
                    specification.put("completion", result);
                    repository
                            .jdbc()
                            .sql(
                                    "UPDATE learning_sessions SET status='completed',revision=revision+1,specification=:spec,updated_at=:now,ended_at=:now WHERE id=:id")
                            .param("spec", mapper.writeValueAsString(specification))
                            .param("now", received)
                            .param("id", id)
                            .update();
                    return result;
                });
    }

    private void scheduleReview(
            String owner, Map<String, Object> session, Map<String, Object> specification) {
        var previous =
                repository
                        .jdbc()
                        .sql(
                                "SELECT stage FROM learning_reviews WHERE learner_id=:owner AND knowledge_id=:knowledge")
                        .param("owner", owner)
                        .param("knowledge", specification.get("knowledge"))
                        .query(Integer.class)
                        .optional();
        int stage =
                session.get("mode").equals("review")
                        ? Math.min(3, previous.orElse(0) + 1)
                        : previous.orElse(0);
        int days = new int[] {1, 3, 7, 14}[stage];
        repository
                .jdbc()
                .sql(
                        "INSERT INTO learning_reviews VALUES(:owner,:knowledge,:activity,:module,:next,:stage) ON CONFLICT(learner_id,knowledge_id) DO UPDATE SET activity_id=excluded.activity_id,module=excluded.module,next_at=excluded.next_at,stage=excluded.stage")
                .param("owner", owner)
                .param("knowledge", specification.get("knowledge"))
                .param("activity", session.get("activity_id"))
                .param("module", session.get("module"))
                .param("next", Instant.now(clock).plusSeconds(days * 86400L).toString())
                .param("stage", stage)
                .update();
    }

    private Map<String, Object> summary(Map<String, Object> session) {
        Map<String, Object> specification = map(session.get("specification"));
        List<?> targets = (List<?>) specification.get("targets"),
                checks = (List<?>) specification.get("checks");
        int total = session.get("module").equals("typing") ? targets.size() : checks.size();
        Map<Integer, Boolean> first = new HashMap<>(), finished = new HashMap<>();
        Set<Integer> failures = new HashSet<>();
        Set<String> help = new HashSet<>();
        long activeMs = 0;
        Instant previousTime = null;
        boolean active = false;
        String latestSource = null;
        for (var event : repository.events(session.get("id").toString())) {
            Map<String, Object> payload = map(event.get("payload"));
            String type = event.get("type").toString();
            if (type.equals("help")) help.add(payload.get("source").toString());
            if (type.equals("card")) {
                int index = number(payload, "index");
                boolean correct = targets.get(index).equals(payload.get("answer"));
                first.putIfAbsent(index, correct);
                if (correct) finished.put(index, true);
                else failures.add(index);
            }
            if (type.equals("code-run")) {
                int index = number(payload, "index");
                Map<String, Object> run = python.snapshot(payload.get("runId").toString());
                String source = mapper.writeValueAsString(run.get("sourceFiles"));
                if (latestSource != null && !latestSource.equals(source)) finished.clear();
                latestSource = source;
                boolean correct = codePasses(session, map(checks.get(index)), run);
                first.putIfAbsent(index, correct);
                if (correct) finished.put(index, true);
                else {
                    finished.remove(index);
                    failures.add(index);
                }
            }
            Instant current = Instant.parse(event.get("client_at").toString());
            if (type.equals("heartbeat")
                    && active
                    && Boolean.TRUE.equals(payload.get("active"))
                    && previousTime != null)
                activeMs +=
                        Math.min(
                                15000,
                                Math.max(0, current.toEpochMilli() - previousTime.toEpochMilli()));
            if (type.equals("resume")) active = true;
            if (type.equals("pause")) active = false;
            if (type.equals("heartbeat")) active = Boolean.TRUE.equals(payload.get("active"));
            previousTime = active ? current : null;
        }
        int firstCorrect = (int) first.values().stream().filter(Boolean.TRUE::equals).count();
        boolean corrected = failures.stream().anyMatch(finished::containsKey);
        String fingerprint =
                session.get("module")
                        + ":"
                        + session.get("activity_id")
                        + ":"
                        + specification.get("targets")
                        + ":"
                        + session.get("mode");
        return Map.of(
                "total",
                total,
                "completed",
                finished.size(),
                "firstCorrect",
                firstCorrect,
                "accuracy",
                total == 0 ? 0 : (int) Math.round(100.0 * firstCorrect / total),
                "corrected",
                corrected,
                "complete",
                finished.size() == total && total > 0,
                "independent",
                help.isEmpty(),
                "helpSources",
                List.copyOf(help),
                "activeMs",
                activeMs,
                "taskFingerprint",
                fingerprint);
    }

    @SuppressWarnings("unchecked")
    private boolean codePasses(
            Map<String, Object> session, Map<String, Object> check, Map<String, Object> snapshot) {
        Map<String, Object> result = map(snapshot.get("result"));
        if (!result.get("status").equals("success")
                || !check.get("input").equals(result.get("inputs"))) return false;
        if (session.get("module").equals("classroom")) {
            String output = result.get("output").toString();
            int cursor = 0;
            for (String text : (List<String>) check.get("outputContains")) {
                int found = output.indexOf(text, cursor);
                if (found < 0) return false;
                cursor = found + text.length();
            }
            if (((List<?>) result.get("drawings")).size() < number(check, "minDrawings"))
                return false;
            Set<String> files = new HashSet<>();
            ((List<Map<String, Object>>) result.get("files"))
                    .forEach(file -> files.add(file.get("name").toString()));
            return files.containsAll((List<String>) check.get("expectedFiles"));
        }
        Map<String, Object> actual = map(result.get("stageState"));
        for (var expected : map(check.get("expectedState")).entrySet())
            if (!mapper.writeValueAsString(expected.getValue())
                    .equals(mapper.writeValueAsString(actual.get(expected.getKey())))) {
                if (!(expected.getValue() instanceof Number a
                        && actual.get(expected.getKey()) instanceof Number b
                        && a.doubleValue() == b.doubleValue())) return false;
            }
        return true;
    }

    void award(
            String owner,
            String key,
            int requested,
            String reason,
            List<Map<String, Object>> results) {
        if (requested <= 0) return;
        var existing =
                repository
                        .jdbc()
                        .sql(
                                "SELECT delta FROM reward_ledger WHERE learner_id=:owner AND award_key=:key")
                        .param("owner", owner)
                        .param("key", key)
                        .query(Integer.class)
                        .optional();
        if (existing.isPresent()) {
            results.add(Map.of("reason", reason, "points", 0, "notice", "同一内容今日已领取"));
            return;
        }
        int cap = Integer.parseInt(accounts.setting("daily_point_cap", "40"));
        String start =
                LocalDate.now(clock.withZone(FAMILY_ZONE))
                        .atStartOfDay(FAMILY_ZONE)
                        .toInstant()
                        .toString();
        int used =
                repository
                        .jdbc()
                        .sql(
                                "SELECT COALESCE(SUM(delta),0) FROM reward_ledger WHERE learner_id=:owner AND delta>0 AND created_at>=:start AND award_key NOT LIKE 'refund:%'")
                        .param("owner", owner)
                        .param("start", start)
                        .query(Integer.class)
                        .single();
        int points = Math.max(0, Math.min(requested, cap - used));
        ledger(owner, key, points, 0, reason);
        results.add(
                Map.of(
                        "reason",
                        reason,
                        "points",
                        points,
                        "notice",
                        points < requested ? "今日奖励已足够，可以休息一下" : "已到账"));
    }

    void ledger(String owner, String key, int delta, int frozen, String reason) {
        repository.balance(owner);
        repository
                .jdbc()
                .sql(
                        "INSERT INTO reward_ledger(learner_id,award_key,delta,frozen_delta,reason,rule_version,created_at) VALUES(:owner,:key,:delta,:frozen,:reason,:rule,:now)")
                .param("owner", owner)
                .param("key", key)
                .param("delta", delta)
                .param("frozen", frozen)
                .param("reason", reason)
                .param("rule", RULE)
                .param("now", now())
                .update();
        repository
                .jdbc()
                .sql(
                        "UPDATE reward_balances SET balance=balance+:delta,frozen=frozen+:frozen,revision=revision+1 WHERE learner_id=:owner")
                .param("delta", delta)
                .param("frozen", frozen)
                .param("owner", owner)
                .update();
    }

    void lockWrite() {
        repository
                .jdbc()
                .sql("UPDATE sys_settings SET value=value WHERE key='growth_rule'")
                .update();
    }

    String now() {
        return Instant.now(clock).toString();
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> map(Object value) {
        return value instanceof String text
                ? mapper.readValue(text, Map.class)
                : mapper.convertValue(value, Map.class);
    }

    static int number(Map<String, Object> value, String key) {
        Object actual = value.get(key);
        if (!(actual instanceof Number number)) throw AccountService.invalid("数值字段无效：" + key);
        return number.intValue();
    }

    static String text(Map<String, Object> value, String key, int limit) {
        Object actual = value.get(key);
        if (!(actual instanceof String text) || text.isBlank() || text.length() > limit)
            throw AccountService.invalid("文本字段无效：" + key);
        return text;
    }

    private Map<String, Object> view(Map<String, Object> value) {
        Map<String, Object> result = new LinkedHashMap<>(value);
        result.put("specification", map(value.get("specification")));
        return result;
    }
}
