package com.xuya.island.growth;

import com.xuya.island.account.AccountScope;
import com.xuya.island.account.AccountService;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 学习账户只操作本人资源；跨账户查询与奖励管理走独立超级管理员入口。 */
@RestController
public class GrowthController {
    private final GrowthService growth;
    private final FamilyRewardService rewards;
    private final LearningReportService reports;
    private final AccountService accounts;
    private final TypingProgressService typing;
    private final LearningImportService imports;

    public GrowthController(
            GrowthService growth,
            FamilyRewardService rewards,
            LearningReportService reports,
            AccountService accounts,
            TypingProgressService typing,
            LearningImportService imports) {
        this.growth = growth;
        this.rewards = rewards;
        this.reports = reports;
        this.accounts = accounts;
        this.typing = typing;
        this.imports = imports;
    }

    @GetMapping("/api/v1/learning/typing-progress")
    public Mono<Map<String, Object>> typingProgress() {
        return blocking(typing::progress);
    }

    @GetMapping("/api/v1/learning/imports")
    public Mono<Map<String, Object>> importState() {
        return blocking(imports::state);
    }

    @PostMapping("/api/v1/learning/imports")
    public Mono<Map<String, Object>> importLegacy(
            @RequestBody LearningImportService.Snapshot body) {
        return blocking(() -> imports.save(body));
    }

    @GetMapping("/api/v1/learning/catalog")
    public Mono<List<TeachingActivityCatalog.Activity>> catalog() {
        return blocking(growth::catalog);
    }

    @PostMapping("/api/v1/learning/sessions")
    public Mono<Map<String, Object>> create(@RequestBody GrowthService.Create body) {
        return blocking(() -> growth.create(body));
    }

    @GetMapping("/api/v1/learning/sessions/{id}")
    public Mono<Map<String, Object>> session(@PathVariable String id) {
        return blocking(() -> growth.get(id));
    }

    @PostMapping("/api/v1/learning/sessions/{id}/events")
    public Mono<Map<String, Object>> events(
            @PathVariable String id, @RequestBody List<GrowthService.Event> body) {
        return blocking(() -> growth.events(id, body));
    }

    @PostMapping("/api/v1/learning/sessions/{id}/complete")
    public Mono<Map<String, Object>> complete(
            @PathVariable String id, @RequestBody GrowthService.Complete body) {
        return blocking(() -> growth.complete(id, body));
    }

    @GetMapping("/api/v1/learning/dashboard")
    public Mono<Map<String, Object>> dashboard() {
        return blocking(() -> reports.dashboard(AccountScope.id(), false));
    }

    @GetMapping("/api/v1/learning/reports")
    public Mono<List<Map<String, Object>>> reports() {
        return blocking(() -> reports.reports(AccountScope.id()));
    }

    @GetMapping("/api/v1/learning/report")
    public Mono<Map<String, Object>> report(@RequestParam String period) {
        return blocking(
                () -> {
                    LocalDate monday;
                    try {
                        monday = LocalDate.parse(period);
                    } catch (RuntimeException exception) {
                        throw AccountService.invalid("周报日期请使用年-月-日格式");
                    }
                    return reports.report(AccountScope.id(), monday);
                });
    }

    @GetMapping("/api/v1/rewards/catalog")
    public Mono<List<Map<String, Object>>> catalogue() {
        return blocking(() -> rewards.catalogue(false));
    }

    @GetMapping("/api/v1/rewards/balance")
    public Mono<Map<String, Object>> balance() {
        return blocking(rewards::balance);
    }

    @GetMapping("/api/v1/rewards/ledger")
    public Mono<List<Map<String, Object>>> ledger() {
        return blocking(rewards::ledger);
    }

    @GetMapping("/api/v1/rewards/redemptions")
    public Mono<List<Map<String, Object>>> redemptions() {
        return blocking(() -> rewards.requests(AccountScope.id()));
    }

    @PostMapping("/api/v1/rewards/redemptions")
    public Mono<Map<String, Object>> redeem(@RequestBody FamilyRewardService.Request body) {
        return blocking(() -> rewards.request(body));
    }

    @PostMapping("/api/v1/rewards/redemptions/{id}/cancel")
    public Mono<Map<String, Object>> cancel(
            @PathVariable String id, @RequestBody FamilyRewardService.Action body) {
        return blocking(
                () ->
                        rewards.action(
                                id,
                                new FamilyRewardService.Action("cancel", body.revision()),
                                false));
    }

    @GetMapping("/api/v1/admin/rewards")
    public Mono<List<Map<String, Object>>> gifts() {
        return blocking(() -> rewards.catalogue(true));
    }

    @PostMapping("/api/v1/admin/rewards")
    public Mono<Map<String, Object>> newGift(@RequestBody FamilyRewardService.SaveReward body) {
        return blocking(() -> rewards.save(null, body));
    }

    @PutMapping("/api/v1/admin/rewards/{id}")
    public Mono<Map<String, Object>> saveGift(
            @PathVariable String id, @RequestBody FamilyRewardService.SaveReward body) {
        return blocking(() -> rewards.save(id, body));
    }

    @GetMapping("/api/v1/admin/learners/{id}/dashboard")
    public Mono<Map<String, Object>> inspect(@PathVariable String id) {
        return blocking(
                () -> {
                    accounts.audit("learning:inspect", id, true);
                    return reports.dashboard(id, true);
                });
    }

    @GetMapping("/api/v1/admin/learners/{id}/redemptions")
    public Mono<List<Map<String, Object>>> requests(@PathVariable String id) {
        return blocking(() -> rewards.requests(id));
    }

    @PostMapping("/api/v1/admin/redemptions/{id}/action")
    public Mono<Map<String, Object>> action(
            @PathVariable String id, @RequestBody FamilyRewardService.Action body) {
        return blocking(() -> rewards.action(id, body, true));
    }

    @GetMapping("/api/v1/admin/learners/{id}/projects")
    public Mono<List<Map<String, Object>>> projects(@PathVariable String id) {
        return blocking(() -> rewards.confirmableProjects(id));
    }

    @PostMapping("/api/v1/admin/learners/{id}/milestones")
    public Mono<Map<String, Object>> milestone(
            @PathVariable String id, @RequestBody Map<String, String> body) {
        return blocking(() -> rewards.confirmMilestone(id, body.get("projectId")));
    }

    @GetMapping("/api/v1/admin/reward-rules")
    public Mono<Map<String, Object>> rules() {
        return blocking(rewards::rules);
    }

    @PutMapping("/api/v1/admin/reward-rules")
    public Mono<Map<String, Object>> rules(@RequestBody Map<String, Integer> body) {
        return blocking(
                () -> {
                    Integer cap = body.get("dailyCap");
                    if (cap == null || cap < 1 || cap > 100)
                        throw AccountService.invalid("每日正向积分上限请设置为1至100");
                    accounts.setSetting("daily_point_cap", cap.toString());
                    accounts.audit("rewards:rule", cap.toString(), true);
                    return Map.of("dailyCap", cap, "notice", "只影响之后的奖励，不改历史账本。");
                });
    }

    private <T> Mono<T> blocking(Supplier<T> action) {
        return Mono.fromCallable(action::get).subscribeOn(Schedulers.boundedElastic());
    }
}
