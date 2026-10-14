package com.xuya.island.codex.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.agentscope.core.message.ToolResultBlock;
import io.agentscope.core.permission.PermissionBehavior;
import io.agentscope.core.permission.PermissionContextState;
import io.agentscope.core.permission.PermissionMode;
import io.agentscope.core.tool.ToolBase;
import io.agentscope.core.tool.ToolCallParam;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import reactor.core.publisher.Mono;

class ScopedAgentToolTest {
    @TempDir java.nio.file.Path data;

    static final class FixtureTool extends ToolBase {
        FixtureTool(String name, boolean readOnly, boolean external) {
            super(
                    ToolBase.builder()
                            .name(name)
                            .description("fixture")
                            .inputSchema(Map.of("type", "object"))
                            .readOnly(readOnly)
                            .concurrencySafe(true)
                            .externalTool(external));
        }

        @Override
        public Mono<ToolResultBlock> callAsync(ToolCallParam param) {
            return Mono.just(ToolResultBlock.text("fixture"));
        }
    }

    @Test
    void fullToolModeCannotBypassRevokedAccountPermission() {
        var source =
                com.xuya.island.config.DatabaseConfiguration.openDatabase(
                        data.resolve("db/xuya.db"));
        var accounts =
                new com.xuya.island.account.AccountService(
                        org.springframework.jdbc.core.simple.JdbcClient.create(source),
                        new org.springframework.transaction.support.TransactionTemplate(
                                new org.springframework.jdbc.datasource
                                        .DataSourceTransactionManager(source)));
        accounts.setup(
                new com.xuya.island.account.AccountRequests.Setup("admin", "管理员", "test-password"));
        String owner =
                accounts.createUser(
                        new com.xuya.island.account.AccountRequests.SaveUser(
                                "adult",
                                "成人",
                                "test-password",
                                true,
                                java.util.List.of("developer")),
                        false);
        try (var scope = com.xuya.island.account.AccountScope.bind(owner)) {
            var tool =
                    new ScopedAgentTool(
                            new FixtureTool("execute_command", false, false), false, accounts);
            var full = PermissionContextState.builder().mode(PermissionMode.BYPASS).build();
            assertEquals(
                    PermissionBehavior.ALLOW,
                    tool.checkPermissions(Map.of("command", "python lesson.py"), full)
                            .block()
                            .getBehavior());
            String restrictedRole =
                    accounts.saveRole(
                            null,
                            new com.xuya.island.account.AccountRequests.SaveRole(
                                    "只开聊天", "", true, java.util.List.of("codex")));
            accounts.saveUser(
                    owner,
                    new com.xuya.island.account.AccountRequests.SaveUser(
                            "adult", "成人", "", true, java.util.List.of(restrictedRole)));
            for (String name :
                    java.util.List.of(
                            "execute_command",
                            "list_terminals",
                            "read_terminal_output",
                            "design_build_preview",
                            "github_query",
                            "chrome_tabs",
                            "read_artifact")) {
                var restricted =
                        new ScopedAgentTool(
                                new FixtureTool(name, !name.equals("execute_command"), false),
                                false,
                                accounts);
                assertThrows(
                        com.xuya.island.common.BusinessException.class,
                        () -> restricted.checkPermissions(Map.of(), full).block());
                assertThrows(
                        com.xuya.island.common.BusinessException.class,
                        () -> restricted.callAsync(null).block());
            }
            accounts.saveUser(
                    owner,
                    new com.xuya.island.account.AccountRequests.SaveUser(
                            "adult", "成人", "", false, java.util.List.of("developer")));
            assertThrows(
                    com.xuya.island.common.BusinessException.class,
                    () -> tool.checkPermissions(Map.of(), full).block());
            assertThrows(
                    com.xuya.island.common.BusinessException.class,
                    () -> tool.callAsync(null).block());
        }
    }

    @Test
    void preservesSdkToolMetadataAndSeparatesThreePermissionModes() {
        var external = new ScopedAgentTool(new FixtureTool("ask_question", true, true), false);
        assertTrue(external.isExternalTool());
        assertTrue(external.isReadOnly());
        var command = new ScopedAgentTool(new FixtureTool("execute_command", false, false), false);
        var ask = PermissionContextState.builder().mode(PermissionMode.DEFAULT).build();
        var auto = PermissionContextState.builder().mode(PermissionMode.ACCEPT_EDITS).build();
        var full = PermissionContextState.builder().mode(PermissionMode.BYPASS).build();
        assertEquals(
                PermissionBehavior.ASK,
                command.checkPermissions(Map.of("command", "mvn test"), ask).block().getBehavior());
        assertEquals(
                PermissionBehavior.ALLOW,
                command.checkPermissions(Map.of("command", "mvn test"), auto)
                        .block()
                        .getBehavior());
        assertEquals(
                PermissionBehavior.ASK,
                command.checkPermissions(Map.of("command", "git reset --hard"), auto)
                        .block()
                        .getBehavior());
        assertEquals(
                PermissionBehavior.ALLOW,
                command.checkPermissions(Map.of("command", "git reset --hard"), full)
                        .block()
                        .getBehavior());
    }
}
