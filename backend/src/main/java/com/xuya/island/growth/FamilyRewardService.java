package com.xuya.island.growth;

import com.xuya.island.account.AccountScope;
import com.xuya.island.account.AccountService;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** 礼物库存与冻结账本在同一SQLite事务内变化，价格快照和退款流水不可覆盖。 */
@Service
public class FamilyRewardService {
    public record SaveReward(
            String title, String description, int cost, int stock, boolean enabled, int revision) {}

    public record Request(String clientId, String rewardId) {}

    public record Action(String action, int revision) {}

    private final GrowthRepository repository;
    private final GrowthService growth;
    private final TransactionTemplate transaction;
    private final AccountService accounts;

    public FamilyRewardService(
            GrowthRepository repository,
            GrowthService growth,
            TransactionTemplate transaction,
            AccountService accounts) {
        this.repository = repository;
        this.growth = growth;
        this.transaction = transaction;
        this.accounts = accounts;
    }

    public List<Map<String, Object>> catalogue(boolean management) {
        return repository.rewards(management);
    }

    /** 读取已保存的奖励规则，不改变历史账本。 */
    public Map<String, Object> rules() {
        return Map.of("dailyCap", Integer.parseInt(accounts.setting("daily_point_cap", "40")));
    }

    public List<Map<String, Object>> requests(String owner) {
        return repository.redemptions(owner);
    }

    public Map<String, Object> balance() {
        return repository.balance(AccountScope.id());
    }

    public List<Map<String, Object>> ledger() {
        return repository.ledger(AccountScope.id());
    }

    public synchronized Map<String, Object> save(String id, SaveReward request) {
        if (request == null
                || request.title() == null
                || request.title().isBlank()
                || request.title().length() > 80
                || request.description() == null
                || request.description().length() > 1000
                || request.cost() < 1
                || request.cost() > 100000
                || request.stock() < 0
                || request.stock() > 10000) throw AccountService.invalid("请填写礼物名称、正整数成本和可用数量");
        String actual = id == null ? UUID.randomUUID().toString() : id;
        return transaction.execute(
                status -> {
                    growth.lockWrite();
                    if (id == null)
                        repository
                                .jdbc()
                                .sql(
                                        "INSERT INTO family_rewards VALUES(:id,:title,:description,:cost,:stock,:enabled,1,:now)")
                                .param("id", actual)
                                .param("title", request.title())
                                .param("description", request.description())
                                .param("cost", request.cost())
                                .param("stock", request.stock())
                                .param("enabled", request.enabled())
                                .param("now", growth.now())
                                .update();
                    else if (repository
                                    .jdbc()
                                    .sql(
                                            "UPDATE family_rewards SET title=:title,description=:description,cost=:cost,stock=:stock,enabled=:enabled,revision=revision+1,updated_at=:now WHERE id=:id AND revision=:revision")
                                    .param("id", actual)
                                    .param("title", request.title())
                                    .param("description", request.description())
                                    .param("cost", request.cost())
                                    .param("stock", request.stock())
                                    .param("enabled", request.enabled())
                                    .param("now", growth.now())
                                    .param("revision", request.revision())
                                    .update()
                            != 1) throw AccountService.conflict("礼物已经被修改，请重新加载后再保存");
                    accounts.audit("reward:save", actual, true);
                    return repository.reward(actual);
                });
    }

    public synchronized Map<String, Object> request(Request request) {
        if (request == null
                || request.clientId() == null
                || !request.clientId().matches("[a-zA-Z0-9-]{1,100}"))
            throw AccountService.invalid("兑换请求标识无效");
        String owner = AccountScope.id();
        return transaction.execute(
                status -> {
                    growth.lockWrite();
                    var previous =
                            repository
                                    .jdbc()
                                    .sql(
                                            "SELECT * FROM reward_redemptions WHERE learner_id=:owner AND client_id=:client")
                                    .param("owner", owner)
                                    .param("client", request.clientId())
                                    .query()
                                    .listOfRows()
                                    .stream()
                                    .findFirst();
                    if (previous.isPresent()) {
                        if (!previous.get().get("reward_id").equals(request.rewardId()))
                            throw AccountService.conflict("同一次兑换不能换成另一件礼物");
                        return previous.get();
                    }
                    var reward = repository.reward(request.rewardId());
                    if (GrowthService.number(reward, "enabled") != 1
                            || GrowthService.number(reward, "stock") < 1)
                        throw AccountService.conflict("这件礼物暂时没有可用数量，可以先加入心愿");
                    var balance = repository.balance(owner);
                    int cost = GrowthService.number(reward, "cost");
                    if (GrowthService.number(balance, "balance")
                                    - GrowthService.number(balance, "frozen")
                            < cost) throw AccountService.conflict("可用积分还不够，可以先放进心愿里");
                    String id = UUID.randomUUID().toString();
                    repository
                            .jdbc()
                            .sql(
                                    "UPDATE family_rewards SET stock=stock-1,revision=revision+1 WHERE id=:id AND stock>0")
                            .param("id", request.rewardId())
                            .update();
                    growth.ledger(owner, "freeze:" + id, 0, cost, "申请礼物，等待家庭管理员确认");
                    repository
                            .jdbc()
                            .sql(
                                    "INSERT INTO reward_redemptions(id,learner_id,reward_id,client_id,title,cost,created_at,updated_at) VALUES(:id,:owner,:gift,:client,:title,:cost,:now,:now)")
                            .param("id", id)
                            .param("owner", owner)
                            .param("gift", request.rewardId())
                            .param("client", request.clientId())
                            .param("title", reward.get("title"))
                            .param("cost", cost)
                            .param("now", growth.now())
                            .update();
                    return redemption(id, false);
                });
    }

    public synchronized Map<String, Object> action(String id, Action request, boolean management) {
        return transaction.execute(
                status -> {
                    growth.lockWrite();
                    var current = redemption(id, management);
                    String from = current.get("status").toString();
                    String target;
                    switch (request.action()) {
                        case "cancel" -> target = "cancelled";
                        case "reject" -> target = "rejected";
                        case "approve" -> target = "approved";
                        case "fulfill" -> target = "fulfilled";
                        case "refund" -> target = "refunded";
                        default -> throw AccountService.invalid("兑换操作无效");
                    }
                    if (!management && !request.action().equals("cancel"))
                        throw AccountService.invalid("学习账户只能取消自己的待确认申请");
                    if (from.equals(target)) return current;
                    boolean permitted =
                            from.equals("pending")
                                            && List.of("cancelled", "rejected", "approved")
                                                    .contains(target)
                                    || from.equals("approved")
                                            && List.of("fulfilled", "refunded").contains(target);
                    if (!permitted
                            || GrowthService.number(current, "revision") != request.revision())
                        throw AccountService.conflict("兑换状态已变化，请重新加载。已兑现礼物不能重复退款");
                    int cost = GrowthService.number(current, "cost");
                    String owner = current.get("learner_id").toString();
                    if (repository
                                    .jdbc()
                                    .sql(
                                            "UPDATE reward_redemptions SET status=:status,revision=revision+1,actor_id=:actor,updated_at=:now WHERE id=:id AND revision=:revision AND status=:from")
                                    .param("status", target)
                                    .param("actor", AccountScope.id())
                                    .param("now", growth.now())
                                    .param("id", id)
                                    .param("revision", request.revision())
                                    .param("from", from)
                                    .update()
                            != 1) throw AccountService.conflict("兑换已经由另一操作处理");
                    if (target.equals("approved"))
                        growth.ledger(
                                owner,
                                "spend:" + id,
                                -cost,
                                -cost,
                                "管理员批准礼物：" + current.get("title"));
                    if (target.equals("cancelled") || target.equals("rejected"))
                        growth.ledger(owner, "release:" + id, 0, -cost, "申请取消或拒绝，释放冻结积分");
                    if (target.equals("refunded"))
                        growth.ledger(owner, "refund:" + id, cost, 0, "已批准礼物取消，退回积分");
                    if (List.of("cancelled", "rejected", "refunded").contains(target))
                        repository
                                .jdbc()
                                .sql(
                                        "UPDATE family_rewards SET stock=stock+1,revision=revision+1 WHERE id=:id")
                                .param("id", current.get("reward_id"))
                                .update();
                    accounts.audit("redemption:" + target, id, true);
                    return redemption(id, management);
                });
    }

    private Map<String, Object> redemption(String id, boolean management) {
        return repository
                .jdbc()
                .sql(
                        management
                                ? "SELECT * FROM reward_redemptions WHERE id=:id"
                                : "SELECT * FROM reward_redemptions WHERE id=:id AND learner_id=:owner")
                .param("id", id)
                .params(management ? Map.of() : Map.of("owner", AccountScope.id()))
                .query()
                .listOfRows()
                .stream()
                .findFirst()
                .orElseThrow(() -> AccountService.missing("没有找到这次兑换申请"));
    }

    public List<Map<String, Object>> confirmableProjects(String learner) {
        accounts.user(learner);
        accounts.audit("learning:projects-inspect", learner, true);
        return repository
                .jdbc()
                .sql(
                        "SELECT p.id,p.title,p.revision,p.updated_at FROM studio_projects p WHERE p.owner_id=:owner AND EXISTS(SELECT 1 FROM studio_runs r JOIN python_runs n ON n.id=json_extract(r.result,'$.runId') WHERE r.project_id=p.id AND r.project_revision=p.revision AND json_extract(r.result,'$.status')='success' AND n.owner_id=:owner AND n.status='completed') ORDER BY p.updated_at DESC LIMIT 100")
                .param("owner", learner)
                .query()
                .listOfRows();
    }

    public synchronized Map<String, Object> confirmMilestone(String learner, String projectId) {
        accounts.user(learner);
        return transaction.execute(
                status -> {
                    growth.lockWrite();
                    var project =
                            repository
                                    .jdbc()
                                    .sql(
                                            "SELECT id FROM studio_projects WHERE id=:id AND owner_id=:owner AND EXISTS(SELECT 1 FROM studio_runs r JOIN python_runs n ON n.id=json_extract(r.result,'$.runId') WHERE r.project_id=studio_projects.id AND r.project_revision=studio_projects.revision AND json_extract(r.result,'$.status')='success' AND n.owner_id=:owner AND n.status='completed')")
                                    .param("id", projectId)
                                    .param("owner", learner)
                                    .query(String.class)
                                    .optional();
                    if (project.isEmpty()) throw AccountService.invalid("需要确认该学习者实际运行成功的作品项目");
                    String week =
                            Instant.parse(growth.now())
                                    .atZone(ZoneId.of("Asia/Shanghai"))
                                    .toLocalDate()
                                    .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                                    .atStartOfDay(ZoneId.of("Asia/Shanghai"))
                                    .toInstant()
                                    .toString();
                    int weekly =
                            repository
                                    .jdbc()
                                    .sql(
                                            "SELECT COUNT(*) FROM reward_ledger WHERE learner_id=:owner AND award_key LIKE 'original:%' AND created_at>=:week")
                                    .param("owner", learner)
                                    .param("week", week)
                                    .query(Integer.class)
                                    .single();
                    String key = "original:" + projectId;
                    boolean already =
                            repository
                                            .jdbc()
                                            .sql(
                                                    "SELECT COUNT(*) FROM reward_ledger WHERE learner_id=:owner AND award_key=:key")
                                            .param("owner", learner)
                                            .param("key", key)
                                            .query(Integer.class)
                                            .single()
                                    > 0;
                    if (weekly > 0 && !already)
                        throw AccountService.conflict("本周已经确认过原创成果奖励，仍可继续保存和分享作品");
                    List<Map<String, Object>> awards = new ArrayList<>();
                    growth.award(learner, key, 5, "家庭管理员确认原创可试玩成果", awards);
                    accounts.audit("milestone:confirm", learner + ":" + projectId, true);
                    return Map.of("awards", awards, "balance", repository.balance(learner));
                });
    }
}
