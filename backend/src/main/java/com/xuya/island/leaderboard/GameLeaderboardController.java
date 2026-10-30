package com.xuya.island.leaderboard;

import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 小游戏成绩按学习账户隔离写入，榜单对同一家庭的成员共享。 */
@RestController
public class GameLeaderboardController {
    private final GameScoreService scores;

    public GameLeaderboardController(GameScoreService scores) {
        this.scores = scores;
    }

    @PostMapping("/api/v1/learning/game-scores")
    public Mono<Map<String, Object>> submit(@RequestBody GameScoreService.Submit body) {
        return blocking(() -> scores.submit(body));
    }

    @GetMapping("/api/v1/learning/game-scores")
    public Mono<List<Map<String, Object>>> mine() {
        return blocking(scores::mine);
    }

    @PostMapping("/api/v1/learning/game-completions")
    public Mono<Map<String, Object>> completions(@RequestBody List<GameScoreService.Legacy> items) {
        return blocking(() -> scores.completeLegacy(items));
    }

    @GetMapping("/api/v1/learning/leaderboard")
    public Mono<Map<String, Object>> leaderboard(
            @RequestParam String gameId,
            @RequestParam String levelId,
            @RequestParam(required = false) Integer version,
            @RequestParam(required = false) Integer limit) {
        return blocking(() -> scores.leaderboard(gameId, levelId, version, limit));
    }

    private <T> Mono<T> blocking(Supplier<T> action) {
        return Mono.fromCallable(action::get).subscribeOn(Schedulers.boundedElastic());
    }
}
