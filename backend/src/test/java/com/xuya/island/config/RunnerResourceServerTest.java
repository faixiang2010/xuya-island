package com.xuya.island.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * 静态执行域不得暴露业务资源和任意本机文件。
 *
 * @author Codex代码助手
 */
class RunnerResourceServerTest {

    @Test
    void acceptsRuntimeResourcesAndRejectsTraversalAndApi() {
        assertTrue(RunnerResourceServer.isAllowedPath("/index.html"));
        assertTrue(RunnerResourceServer.isAllowedPath("/pyodide/pyodide.asm.wasm"));
        assertFalse(RunnerResourceServer.isAllowedPath("/api/works"));
        assertFalse(RunnerResourceServer.isAllowedPath("/pyodide/../../application.yml"));
        assertFalse(RunnerResourceServer.isAllowedPath("/pyodide/..\\application.yml"));
        assertFalse(RunnerResourceServer.isAllowedPath("/application.yml"));
    }
}
