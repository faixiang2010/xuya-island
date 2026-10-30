package com.xuya.island.leaderboard;

import com.xuya.island.account.AccountScope;
import com.xuya.island.account.AccountService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/** 家庭共享的成绩：每位家人每关只保留最佳记录，按得分降序、用时升序排名。 */
@Service
public class GameScoreService {
    public record Submit(
            String gameId, String levelId, Integer levelVersion, Long durationMs, Integer score) {}

    /** 旧版浏览器只留下通关状态、没有成绩的补齐请求。 */
    public record Legacy(String gameId, String levelId, Integer levelVersion) {}

    /** 游戏中心全部游戏；计分小游戏报分，练习小游戏报准确率。 */
    private static final Set<String> GAMES =
            Set.of(
                    "keyboard",
                    "pinyin",
                    "finger",
                    "falling",
                    "passage",
                    "passage-en",
                    "style",
                    "quiz",
                    "tetris",
                    "minesweeper",
                    "echo",
                    "wind",
                    "melody",
                    "piano",
                    "mirror",
                    "memory");

    /** 关卡由前端内容定义（拼音词表、课文篇目会扩充），这里只校验编号格式，避免两处清单漂移。 */
    private static final Pattern LEVEL_ID = Pattern.compile("[a-z0-9-]{1,48}");

    private static final int MAX_SCORE = 1_000_000;
    private static final long MAX_DURATION_MS = 86_400_000L;

    private final GameScoreRepository repository;

    public GameScoreService(GameScoreRepository repository) {
        this.repository = repository;
    }

    public Map<String, Object> submit(Submit body) {
        if (body == null) throw AccountService.invalid("缺少成绩内容");
        checkLevel(body.gameId(), body.levelId());
        int version = checkVersion(body.levelVersion());
        Long durationMs = body.durationMs();
        Integer score = body.score();
        if (durationMs == null || durationMs < 1 || durationMs > MAX_DURATION_MS)
            throw AccountService.invalid("通关用时无效");
        if (score == null || score < 1 || score > MAX_SCORE) throw AccountService.invalid("得分无效");
        repository.saveBest(
                AccountScope.id(),
                body.gameId(),
                body.levelId(),
                version,
                score,
                durationMs,
                Instant.now().toString());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("saved", true);
        result.put("best", mine(body.gameId(), body.levelId(), version));
        return result;
    }

    /** 补齐旧版只在浏览器里保存过的通关状态；0 分占位不会进入排行榜。 */
    public Map<String, Object> completeLegacy(List<Legacy> items) {
        if (items == null || items.isEmpty() || items.size() > 100)
            throw AccountService.invalid("通关记录数量无效");
        String owner = AccountScope.id();
        String now = Instant.now().toString();
        for (Legacy item : items) {
            if (item == null) throw AccountService.invalid("缺少通关记录");
            checkLevel(item.gameId(), item.levelId());
            int version = checkVersion(item.levelVersion());
            repository.saveCompletion(owner, item.gameId(), item.levelId(), version, now);
        }
        return Map.of("saved", items.size());
    }

    /** 当前账户的全部最佳成绩；前端登录后据此恢复已通关状态。 */
    public List<Map<String, Object>> mine() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (var row : repository.mine(AccountScope.id())) {
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("gameId", row.gameId());
            value.put("levelId", row.levelId());
            value.put("levelVersion", row.levelVersion());
            value.put("score", row.score());
            value.put("durationMs", row.durationMs());
            value.put("achievedAt", row.achievedAt());
            result.add(value);
        }
        return result;
    }

    public Map<String, Object> leaderboard(
            String gameId, String levelId, Integer version, Integer limit) {
        checkLevel(gameId, levelId);
        int resolvedVersion = checkVersion(version);
        int resolvedLimit = limit == null ? 20 : Math.max(1, Math.min(50, limit));
        String owner = AccountScope.id();
        List<Map<String, Object>> entries = new ArrayList<>();
        int index = 1;
        for (var row : repository.top(gameId, levelId, resolvedVersion, resolvedLimit)) {
            entries.add(entry(index, row, owner));
            index += 1;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("gameId", gameId);
        result.put("levelId", levelId);
        result.put("levelVersion", resolvedVersion);
        result.put("total", repository.count(gameId, levelId, resolvedVersion));
        result.put("entries", entries);
        result.put("mine", mine(gameId, levelId, resolvedVersion));
        return result;
    }

    private static void checkLevel(String gameId, String levelId) {
        if (gameId == null || !GAMES.contains(gameId)) throw AccountService.invalid("这个游戏还没有开放排行榜");
        if (levelId == null || !LEVEL_ID.matcher(levelId).matches())
            throw AccountService.invalid("关卡不在排行榜范围内");
    }

    private static int checkVersion(Integer version) {
        int value = version == null ? 1 : version;
        if (value < 1 || value > 1000) throw AccountService.invalid("关卡版本无效");
        return value;
    }

    private Map<String, Object> mine(String gameId, String levelId, int version) {
        var best = repository.best(AccountScope.id(), gameId, levelId, version).orElse(null);
        if (best == null) return null;
        var rank =
                repository.rank(
                        gameId,
                        levelId,
                        version,
                        best.score(),
                        best.durationMs(),
                        best.achievedAt());
        return entry(rank, best, AccountScope.id());
    }

    private static Map<String, Object> entry(
            int rank, GameScoreRepository.ScoreRow row, String owner) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("rank", rank);
        value.put("nickname", row.nickname());
        value.put("score", row.score());
        value.put("durationMs", row.durationMs());
        value.put("achievedAt", row.achievedAt());
        value.put("self", row.learnerId().equals(owner));
        return value;
    }
}
