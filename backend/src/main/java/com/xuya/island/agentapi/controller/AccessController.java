package com.xuya.island.agentapi.controller;

import com.xuya.island.agentapi.service.AccessService;
import io.swagger.v3.oas.annotations.Operation;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** 本机受信入口凭据领取。 */
@RestController
public class AccessController {
    private final AccessService service;

    public AccessController(AccessService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/codex/access/bootstrap")
    @Operation(summary = "从受信本机前端领取短效开发凭据")
    public Map<String, Object> bootstrap() {
        return service.issue();
    }
}
