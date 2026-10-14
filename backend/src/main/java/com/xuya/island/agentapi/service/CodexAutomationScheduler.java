package com.xuya.island.agentapi.service;

import com.xuya.island.agentapi.dto.AgentApi;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.List;
import org.springframework.stereotype.Component;
import reactor.core.Disposable;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 持久时间点作为自动任务幂等标识；重叠周期合并，不创建并行执行。 */
@Component
public class CodexAutomationScheduler {
    private static final org.slf4j.Logger LOG =
            org.slf4j.LoggerFactory.getLogger(CodexAutomationScheduler.class);
    private final TaskMetadataService metadata;
    private final ConversationService conversations;
    private final com.xuya.island.account.AccountService accounts;
    private final Disposable timer;

    public CodexAutomationScheduler(
            TaskMetadataService metadata, ConversationService conversations) {
        this(metadata, conversations, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public CodexAutomationScheduler(
            TaskMetadataService metadata,
            ConversationService conversations,
            com.xuya.island.account.AccountService accounts) {
        this.metadata = metadata;
        this.conversations = conversations;
        this.accounts = accounts;
        timer =
                Flux.interval(Duration.ofSeconds(10))
                        .onBackpressureDrop()
                        .concatMap(
                                tick ->
                                        Mono.fromRunnable(this::scan)
                                                .subscribeOn(Schedulers.boundedElastic())
                                                .onErrorComplete(),
                                1)
                        .subscribe();
    }

    private void scan() {
        if (accounts == null || !accounts.initialized()) {
            scanCurrent();
            return;
        }
        for (var user : accounts.users()) {
            if (!user.enabled()
                    || user.changePassword()
                    || (!user.permissions().contains("*")
                            && !user.permissions().contains("codex:access"))) continue;
            com.xuya.island.account.AccountScope.call(
                    user.id(),
                    () -> {
                        scanCurrent();
                        return null;
                    });
        }
    }

    private void scanCurrent() {
        long now = System.currentTimeMillis();
        for (var automation : metadata.automations()) {
            if (!automation.enabled() || automation.nextRunAt() > now) continue;
            try {
                var snapshot = conversations.snapshot(automation.conversationId());
                if (snapshot.runs().stream()
                        .anyMatch(
                                run ->
                                        List.of("running", "queued", "suspended")
                                                .contains(run.status()))) {
                    metadata.automationStatus(
                            automation.id(),
                            now + automation.intervalMinutes() * 60000L,
                            "deferred");
                    continue;
                }
                String requestId = "automation:" + automation.id() + ":" + automation.nextRunAt();
                conversations.submit(
                        automation.conversationId(),
                        new AgentApi.SubmitRun(requestId, automation.prompt(), List.of()));
                metadata.automationStatus(
                        automation.id(), now + automation.intervalMinutes() * 60000L, "submitted");
            } catch (RuntimeException exception) {
                metadata.automationStatus(
                        automation.id(),
                        now + automation.intervalMinutes() * 60000L,
                        "needs_attention");
            }
        }
        continueGoals();
    }

    /** 完成一个运行段之后继续目标；失败或未知效果先保留成果等待处理。 */
    public void continueGoals() {
        for (var goal : metadata.activeGoals()) {
            synchronized (conversations.lock(goal.conversationId())) {
                try {
                    var snapshot = conversations.snapshot(goal.conversationId());
                    if (snapshot.goals().stream()
                            .noneMatch(
                                    value ->
                                            value.id().equals(goal.id())
                                                    && value.status().equals("active"))) continue;
                    if (snapshot.runs().stream()
                            .anyMatch(
                                    run ->
                                            List.of("running", "queued", "suspended")
                                                    .contains(run.status()))) continue;
                    if (snapshot.conversation().planMode()) continue;
                    var limits = conversations.spec(goal.conversationId());
                    if (snapshot.usage().tokens() >= limits.maxTokens()
                            || snapshot.usage().activeMs() >= limits.maxActiveMs()) {
                        metadata.transitionActiveGoal(goal, "budget_exhausted");
                        continue;
                    }
                    var last =
                            snapshot.runs().stream().reduce((first, second) -> second).orElse(null);
                    boolean sinceGoal =
                            last != null && last.createdAt().compareTo(goal.createdAt()) >= 0;
                    if (sinceGoal && !last.status().equals("completed")) {
                        metadata.transitionActiveGoal(goal, "paused");
                        continue;
                    }
                    String checkpoint = sinceGoal ? last.executionId() : "start";
                    conversations.submit(
                            goal.conversationId(),
                            new AgentApi.SubmitRun(
                                    "goal:" + goal.id() + ":" + checkpoint,
                                    "继续持续目标："
                                            + goal.title()
                                            + "。读取read_task_state、已有代码和执行证据后推进剩余步骤。"
                                            + "保持已用预算，不重复未知效果的工具。工作完成并验证后调用report_goal_result提交具体证据给用户复核。",
                                    List.of()));
                } catch (RuntimeException exception) {
                    LOG.warn(
                            "Goal continuation stopped session={} goal={} errorType={}",
                            goal.conversationId(),
                            goal.id(),
                            exception.getClass().getSimpleName());
                    metadata.transitionActiveGoal(goal, "paused");
                }
            }
        }
    }

    @PreDestroy
    public void close() {
        timer.dispose();
    }
}
