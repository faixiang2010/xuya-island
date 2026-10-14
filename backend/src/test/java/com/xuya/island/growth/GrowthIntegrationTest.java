package com.xuya.island.growth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.account.AccountRequests;
import com.xuya.island.account.AccountScope;
import com.xuya.island.account.AccountService;
import com.xuya.island.adventure.service.AdventureService;
import com.xuya.island.common.BusinessException;
import com.xuya.island.config.DatabaseConfiguration;
import com.xuya.island.lesson.service.LessonService;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 真实临时SQLite覆盖事实顺序、6分示例、上限、库存冻结、重复审批与跨账户隔离。 */
class GrowthIntegrationTest {
    @TempDir Path data;
    private GrowthService growth;
    private GrowthRepository repository;
    private FamilyRewardService rewards;
    private LearningReportService reports;
    private AccountService accounts;
    private TransactionTemplate transaction;
    private String owner;
    private String other;
    private final Clock clock =
            Clock.fixed(Instant.parse("2026-10-13T02:00:00Z"), ZoneId.of("Asia/Shanghai"));

    @BeforeEach
    void setup() {
        var source = DatabaseConfiguration.openDatabase(data.resolve("db/xuya.db"));
        var jdbc = JdbcClient.create(source);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        accounts = new AccountService(jdbc, transaction);
        owner = accounts.setup(new AccountRequests.Setup("admin", "管理员", "test-password"));
        other =
                accounts.createUser(
                        new AccountRequests.SaveUser(
                                "daughter", "小芽", "test-password", true, List.of("learner")),
                        false);
        repository = new GrowthRepository(jdbc);
        growth =
                new GrowthService(
                        new TeachingActivityCatalog(new LessonService(), new AdventureService()),
                        repository,
                        transaction,
                        null,
                        accounts,
                        clock);
        rewards = new FamilyRewardService(repository, growth, transaction, accounts);
        reports = new LearningReportService(repository, growth, accounts);
        AccountScope.set(owner);
    }

    @AfterEach
    void clear() {
        AccountScope.clear();
    }

    @Test
    void reviewUsesPublishedVariantOnlyWhenDueAndPauseDoesNotCountIdleTime() {
        String initial = create("keyboard:letters", 0, 2);
        growth.events(initial, cards(List.of("f", "j"), List.of(0, 1)));
        finish(initial);
        var request =
                new GrowthService.Create(
                        UUID.randomUUID().toString(),
                        "typing",
                        "keyboard:letters",
                        "1",
                        "review",
                        0,
                        2);
        assertThrows(BusinessException.class, () -> growth.create(request));
        var futureClock = Clock.fixed(clock.instant().plusSeconds(2 * 86400L), clock.getZone());
        growth =
                new GrowthService(
                        new TeachingActivityCatalog(new LessonService(), new AdventureService()),
                        repository,
                        transaction,
                        null,
                        accounts,
                        futureClock);
        String review = growth.create(request).get("id").toString();
        var reversed = growth.map(repository.session(review).get("specification")).get("targets");
        assertEquals(List.of("j", "f"), reversed);
        var events = new ArrayList<GrowthService.Event>();
        for (var fact :
                List.of(
                        Map.of("type", "resume", "seconds", 0),
                        Map.of("type", "heartbeat", "seconds", 10),
                        Map.of("type", "pause", "seconds", 11),
                        Map.of("type", "heartbeat", "seconds", 600),
                        Map.of("type", "resume", "seconds", 601),
                        Map.of("type", "heartbeat", "seconds", 611))) {
            String type = fact.get("type").toString();
            events.add(
                    new GrowthService.Event(
                            UUID.randomUUID().toString(),
                            events.size() + 1,
                            type,
                            futureClock
                                    .instant()
                                    .plusSeconds(((Number) fact.get("seconds")).longValue())
                                    .toString(),
                            type.equals("heartbeat")
                                    ? Map.of("active", !fact.get("seconds").equals(600))
                                    : Map.of()));
        }
        events.add(
                new GrowthService.Event(
                        UUID.randomUUID().toString(),
                        7,
                        "card",
                        futureClock.instant().toString(),
                        Map.of("index", 0, "answer", "j")));
        events.add(
                new GrowthService.Event(
                        UUID.randomUUID().toString(),
                        8,
                        "card",
                        futureClock.instant().toString(),
                        Map.of("index", 1, "answer", "f")));
        growth.events(review, events);
        var receipt = finish(review);
        assertEquals(9, receipt.get("awarded"));
        assertEquals(
                20000, ((Number) growth.map(receipt.get("summary")).get("activeMs")).intValue());
        assertEquals(1, reports.reviews(owner).get(0).get("stage"));
        growth.events(review, events);
        assertEquals(8, repository.events(review).size());
    }

    @Test
    void sixCardsFourFirstCorrectAndTwoCorrectionsGiveSixPointsOnlyOnce() {
        String id = create("keyboard:letters", 0, 6);
        var events =
                cards(
                        List.of("f", "j", "a", "s", "D", "d", "G", "g"),
                        List.of(0, 1, 2, 3, 4, 4, 5, 5));
        growth.events(id, events);
        Map<String, Object> receipt = finish(id);
        assertEquals(6, receipt.get("awarded"));
        assertEquals(67, growth.map(receipt.get("summary")).get("accuracy"));
        assertEquals(6, repository.balance(owner).get("balance"));
        growth.complete(id, new GrowthService.Complete(1, 0));
        assertEquals(6, repository.balance(owner).get("balance"));
        growth.events(id, events);
        assertEquals(8, repository.events(id).size());
        String repeated = create("keyboard:letters", 0, 6);
        growth.events(
                repeated, cards(List.of("f", "j", "a", "s", "d", "g"), List.of(0, 1, 2, 3, 4, 5)));
        assertEquals(0, finish(repeated).get("awarded"));
        assertEquals(6, repository.balance(owner).get("balance"));
    }

    @Test
    void outOfOrderChangedEventsAndIncompleteTasksCannotReceivePoints() {
        String id = create("keyboard:mixed", 0, 2);
        assertThrows(
                BusinessException.class,
                () ->
                        growth.events(
                                id,
                                List.of(
                                        new GrowthService.Event(
                                                UUID.randomUUID().toString(),
                                                2,
                                                "card",
                                                clock.instant().toString(),
                                                Map.of("index", 0, "answer", "a1")))));
        assertThrows(
                BusinessException.class, () -> growth.events(id, cards(List.of("a"), List.of(0))));
        var event = cards(List.of("a1"), List.of(0)).get(0);
        growth.events(id, List.of(event));
        assertThrows(
                BusinessException.class,
                () ->
                        growth.events(
                                id,
                                List.of(
                                        new GrowthService.Event(
                                                event.id(),
                                                1,
                                                "card",
                                                event.clientAt(),
                                                Map.of("index", 0, "answer", "A1")))));
        assertThrows(BusinessException.class, () -> finish(id));
        assertEquals(0, repository.balance(owner).get("balance"));
    }

    @Test
    void parallelCompletionCannotExceedDailyFortyAndReportsKeepEvidence() throws Exception {
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            String id = create("keyboard:letters", i, 1);
            String target = "fjasdghklqwertyuiopzxcvbnm".substring(i, i + 1);
            growth.events(id, cards(List.of(target), List.of(0)));
            ids.add(id);
        }
        var executor = Executors.newFixedThreadPool(4);
        try {
            var futures =
                    ids.stream()
                            .map(
                                    id ->
                                            executor.submit(
                                                    () ->
                                                            AccountScope.call(
                                                                    owner, () -> finish(id))))
                            .toList();
            for (var future : futures) future.get();
        } finally {
            executor.shutdownNow();
        }
        assertEquals(40, repository.balance(owner).get("balance"));
        assertEquals(
                40,
                repository
                        .jdbc()
                        .sql("SELECT SUM(delta) FROM reward_ledger WHERE learner_id=:owner")
                        .param("owner", owner)
                        .query(Integer.class)
                        .single());
        var report = reports.dashboard(owner, false);
        assertEquals(10, growth.map(report.get("report")).get("completed"));
        assertEquals(10, ((List<?>) growth.map(report.get("report")).get("references")).size());
        assertTrue(
                ((List<?>) report.get("skills"))
                        .stream()
                                .map(growth::map)
                                .noneMatch(value -> value.get("state").equals("表现稳定")));
    }

    @Test
    void rewardFreezeApprovalRefundAndStockAreAtomicAndReplaySafe() {
        String id = create("keyboard:letters", 0, 6);
        growth.events(
                id,
                cards(
                        List.of("f", "j", "a", "s", "D", "d", "G", "g"),
                        List.of(0, 1, 2, 3, 4, 4, 5, 5)));
        finish(id);
        var gift =
                rewards.save(
                        null, new FamilyRewardService.SaveReward("一起看展", "约好周末", 5, 1, true, 0));
        String client = UUID.randomUUID().toString();
        var request =
                rewards.request(new FamilyRewardService.Request(client, gift.get("id").toString()));
        assertEquals(5, repository.balance(owner).get("frozen"));
        rewards.request(new FamilyRewardService.Request(client, gift.get("id").toString()));
        assertEquals(5, repository.balance(owner).get("frozen"));
        assertThrows(
                BusinessException.class,
                () ->
                        rewards.request(
                                new FamilyRewardService.Request(
                                        UUID.randomUUID().toString(), gift.get("id").toString())));
        var approved =
                rewards.action(
                        request.get("id").toString(),
                        new FamilyRewardService.Action("approve", 1),
                        true);
        rewards.action(
                request.get("id").toString(), new FamilyRewardService.Action("approve", 1), true);
        assertEquals(1, repository.balance(owner).get("balance"));
        assertEquals(0, repository.balance(owner).get("frozen"));
        var refunded =
                rewards.action(
                        request.get("id").toString(),
                        new FamilyRewardService.Action(
                                "refund", GrowthService.number(approved, "revision")),
                        true);
        assertEquals("refunded", refunded.get("status"));
        assertEquals(6, repository.balance(owner).get("balance"));
        assertEquals(1, repository.reward(gift.get("id").toString()).get("stock"));
        assertThrows(
                BusinessException.class,
                () ->
                        rewards.action(
                                request.get("id").toString(),
                                new FamilyRewardService.Action(
                                        "fulfill", GrowthService.number(refunded, "revision")),
                                true));
    }

    @Test
    void historicalReportsAreNotTruncatedOrRewrittenByLaterWeeks() {
        String first = create("keyboard:letters", 0, 1);
        growth.events(first, cards(List.of("f"), List.of(0)));
        finish(first);
        var monday = java.time.LocalDate.of(2026, 10, 12);
        var before = reports.report(owner, monday);
        assertEquals(1, before.get("completed"));
        assertEquals(6, ((Number) growth.map(before.get("balance")).get("balance")).intValue());
        transaction.executeWithoutResult(
                status -> {
                    for (int i = 0; i < 225; i++)
                        repository
                                .jdbc()
                                .sql(
                                        "INSERT INTO learning_sessions(id,learner_id,module,activity_id,content_version,mode,specification,started_at,updated_at) VALUES(:id,:owner,'typing','keyboard:letters','1','practice','{}','2026-10-20T00:00:00.001Z','2026-10-20T00:00:00.001Z')")
                                .param("id", UUID.randomUUID().toString())
                                .param("owner", owner)
                                .update();
                    repository
                            .jdbc()
                            .sql(
                                    "INSERT INTO reward_ledger(learner_id,award_key,delta,frozen_delta,reason,rule_version,created_at) VALUES(:owner,'later-reward',3,0,'之后的奖励','family-v1','2026-10-20T00:00:00Z')")
                            .param("owner", owner)
                            .update();
                    repository
                            .jdbc()
                            .sql(
                                    "UPDATE reward_balances SET balance=balance+3,revision=revision+1 WHERE learner_id=:owner")
                            .param("owner", owner)
                            .update();
                    repository
                            .jdbc()
                            .sql(
                                    "UPDATE learning_sessions SET updated_at='2026-10-20T00:00:00Z' WHERE id=:id")
                            .param("id", first)
                            .update();
                });
        var after = reports.report(owner, monday);
        assertEquals(1, after.get("completed"));
        assertEquals(1, after.get("learningCount"));
        assertEquals(6, ((Number) growth.map(after.get("balance")).get("balance")).intValue());
        assertEquals(before.get("strong"), after.get("strong"));
        assertEquals(1, ((List<?>) after.get("references")).size());
        assertEquals(225, reports.report(owner, monday.plusDays(7)).get("learningCount"));
        assertEquals(
                2,
                reports.reports(owner).stream()
                        .filter(value -> value.get("period").equals(monday.toString()))
                        .count());
    }

    @Test
    void typingContinuationAndExplicitLegacyImportsStayOwnedAndNeverAwardPoints() {
        AccountScope.set(other);
        var catalog = new TeachingActivityCatalog(new LessonService(), new AdventureService());
        var imports = new LearningImportService(repository.jdbc(), accounts, catalog, transaction);
        var projection = new TypingProgressService(catalog, repository, growth, imports);
        assertEquals(true, imports.state().get("allowed"));
        var snapshot =
                new LearningImportService.Snapshot(
                        UUID.randomUUID().toString(),
                        Map.of(
                                "records",
                                List.of(),
                                "drafts",
                                List.of(
                                        Map.of(
                                                "gameId",
                                                "pinyin",
                                                "levelId",
                                                "characters",
                                                "levelVersion",
                                                1,
                                                "nextIndex",
                                                3,
                                                "attempts",
                                                3))),
                        List.of(
                                Map.of(
                                        "lessonId",
                                        "story-cover",
                                        "title",
                                        "原来的草稿",
                                        "code",
                                        "print('旧点子')")));
        imports.save(snapshot);
        imports.save(snapshot);
        assertEquals(
                1,
                repository
                        .jdbc()
                        .sql("SELECT COUNT(*) FROM learning_imports")
                        .query(Integer.class)
                        .single());
        assertEquals(0, repository.balance(other).get("balance"));
        assertEquals(1, ((List<?>) projection.progress().get("drafts")).size());
        String session = create("keyboard:letters", 0, 6);
        growth.events(session, cards(List.of("f", "j"), List.of(0, 1)));
        var drafts = (List<Map<String, Object>>) projection.progress().get("drafts");
        var keyboard =
                drafts.stream()
                        .filter(value -> value.get("gameId").equals("keyboard"))
                        .findFirst()
                        .orElseThrow();
        assertEquals(2, keyboard.get("nextIndex"));
        assertEquals(session, growth.map(keyboard.get("growth")).get("sessionId"));
        AccountScope.set(owner);
        assertTrue(((List<?>) projection.progress().get("drafts")).isEmpty());
        assertThrows(BusinessException.class, () -> imports.save(snapshot));
        assertTrue(growth.map(imports.state().get("latest")).isEmpty());
    }

    @Test
    void anotherAccountCannotReadSessionsCancelGiftsOrInspectReports() {
        String id = create("keyboard:letters", 0, 1);
        growth.events(id, cards(List.of("f"), List.of(0)));
        finish(id);
        var gift =
                rewards.save(
                        null, new FamilyRewardService.SaveReward("侦探书", "家人一起读", 5, 1, true, 0));
        var request =
                rewards.request(
                        new FamilyRewardService.Request(
                                UUID.randomUUID().toString(), gift.get("id").toString()));
        AccountScope.set(other);
        assertThrows(BusinessException.class, () -> growth.get(id));
        assertThrows(
                BusinessException.class,
                () ->
                        rewards.action(
                                request.get("id").toString(),
                                new FamilyRewardService.Action("cancel", 1),
                                false));
        assertThrows(BusinessException.class, () -> reports.dashboard(owner, false));
        assertEquals(0, repository.balance(other).get("balance"));
        assertTrue(rewards.requests(other).isEmpty());
    }

    private String create(String activity, int start, int count) {
        String id = UUID.randomUUID().toString();
        growth.create(
                new GrowthService.Create(
                        id,
                        "typing",
                        activity,
                        activity.equals("keyboard:mixed") ? "2" : "1",
                        "practice",
                        start,
                        count));
        return id;
    }

    private List<GrowthService.Event> cards(List<String> answers, List<Integer> indices) {
        var result = new ArrayList<GrowthService.Event>();
        for (int i = 0; i < answers.size(); i++)
            result.add(
                    new GrowthService.Event(
                            UUID.randomUUID().toString(),
                            i + 1,
                            "card",
                            clock.instant().plusSeconds(i).toString(),
                            Map.of("index", indices.get(i), "answer", answers.get(i))));
        return result;
    }

    private Map<String, Object> finish(String id) {
        var session = growth.get(id);
        return growth.complete(
                id,
                new GrowthService.Complete(
                        GrowthService.number(session, "revision"),
                        GrowthService.number(session, "cursor")));
    }
}
