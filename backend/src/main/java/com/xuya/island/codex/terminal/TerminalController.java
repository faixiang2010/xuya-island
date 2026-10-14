package com.xuya.island.codex.terminal;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** HTTP 只负责发票据和生命周期；终端输入通过真实 PTY WebSocket。 */
@RestController
@RequestMapping("/api/v1/codex")
public class TerminalController {
    private final TerminalService terminals;

    public TerminalController(TerminalService terminals) {
        this.terminals = terminals;
    }

    @Schema(name = "CodexTerminalCreate")
    public record Create(String shell, int cols, int rows) {}

    private <T> Mono<T> blocking(Callable<T> operation) {
        return Mono.fromCallable(operation).subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/workspaces/{id}/terminals")
    public Mono<List<TerminalService.TerminalInfo>> list(@PathVariable String id) {
        return blocking(() -> terminals.list(id));
    }

    @PostMapping("/workspaces/{id}/terminals")
    public Mono<TerminalService.TerminalInfo> create(
            @PathVariable String id, @RequestBody Create request) {
        return blocking(
                () -> terminals.create(id, request.shell(), request.cols(), request.rows()));
    }

    @io.swagger.v3.oas.annotations.Operation(
            summary = "读取共享终端输出",
            description = "省略 after 时返回最近输出；传上次 cursor 增量读取。historyLost 表示旧输出已超出有界缓存；读取不执行命令。")
    @GetMapping("/workspaces/{workspaceId}/terminals/{id}/output")
    public Mono<TerminalService.Output> output(
            @PathVariable String workspaceId,
            @PathVariable String id,
            @RequestParam(required = false) Long after,
            @RequestParam(defaultValue = "8192") int maxChars) {
        return blocking(() -> terminals.readOutput(workspaceId, id, after, maxChars));
    }

    @PostMapping("/terminals/{id}/ticket")
    public Mono<TerminalService.Ticket> ticket(@PathVariable String id) {
        return blocking(() -> terminals.ticket(id));
    }

    @DeleteMapping("/terminals/{id}")
    public Mono<Map<String, Boolean>> close(@PathVariable String id) {
        return blocking(
                () -> {
                    terminals.close(id);
                    return Map.of("closed", true);
                });
    }
}
