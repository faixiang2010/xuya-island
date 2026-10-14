package com.xuya.island.codex.plugin;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 成人配置协议；没有 tools/call REST，工具执行仅经过 Agent 原生权限管线。 */
@RestController
@RequestMapping("/api/v1/codex/mcp/servers")
public class McpController {
    private final McpService mcp;

    public McpController(McpService mcp) {
        this.mcp = mcp;
    }

    @GetMapping
    public Mono<List<McpService.ServerView>> list() {
        return Mono.fromCallable(mcp::list).subscribeOn(Schedulers.boundedElastic());
    }

    @PutMapping("/{id}")
    public Mono<McpService.ServerView> put(
            @PathVariable String id, @RequestBody McpService.ServerInput input) {
        return Mono.fromCallable(() -> mcp.put(id, input)).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/{id}/connect")
    public Mono<McpService.ServerView> connect(@PathVariable String id) {
        return Mono.fromCallable(() -> mcp.connect(id)).subscribeOn(Schedulers.boundedElastic());
    }

    @DeleteMapping("/{id}")
    public Mono<Map<String, Object>> delete(@PathVariable String id) {
        return Mono.fromCallable(
                        () -> {
                            mcp.delete(id);
                            return Map.<String, Object>of("deleted", true);
                        })
                .subscribeOn(Schedulers.boundedElastic());
    }
}
