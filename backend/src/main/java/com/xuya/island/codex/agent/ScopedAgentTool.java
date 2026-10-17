package com.xuya.island.codex.agent;

import com.xuya.island.account.AccountScope;
import com.xuya.island.account.AccountService;
import io.agentscope.core.message.ToolResultBlock;
import io.agentscope.core.permission.PermissionBehavior;
import io.agentscope.core.permission.PermissionContextState;
import io.agentscope.core.permission.PermissionDecision;
import io.agentscope.core.permission.PermissionMode;
import io.agentscope.core.tool.AgentTool;
import io.agentscope.core.tool.ToolBase;
import io.agentscope.core.tool.ToolCallParam;
import java.util.Map;
import java.util.regex.Pattern;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 权限决策发生在原生 PermissionEngine 内，批准请求原生持久化、可恢复。 */
public final class ScopedAgentTool extends ToolBase {
    private static final Pattern SAFE_COMMAND =
            Pattern.compile(
                    "(?i)^(?:rg(?:\\s|$)|git\\s+(?:status|diff|log|show|branch)(?:\\s|$)|(?:mvn|mvnw|\\.\\\\mvnw\\.cmd)\\s+(?:test|verify|compile|package)(?:\\s|$)|(?:npm|pnpm)\\s+(?:test|run\\s+(?:test|build|lint|typecheck))(?:\\s|$)|(?:python|python3)\\s+-m\\s+pytest(?:\\s|$)).*");
    private final AgentTool delegate;
    private final boolean forceReadOnly;
    private final String owner;
    private final AccountService accounts;

    public ScopedAgentTool(AgentTool delegate, boolean forceReadOnly) {
        this(delegate, forceReadOnly, null);
    }

    public ScopedAgentTool(AgentTool delegate, boolean forceReadOnly, AccountService accounts) {
        super(metadata(delegate));
        this.delegate = delegate;
        this.forceReadOnly = forceReadOnly;
        this.owner = AccountScope.id();
        this.accounts = accounts;
    }

    private static ToolBase.Builder metadata(AgentTool delegate) {
        var builder =
                ToolBase.builder()
                        .name(delegate.getName())
                        .description(delegate.getDescription())
                        .inputSchema(delegate.getParameters())
                        .readOnly(delegate.isReadOnly())
                        .returnDirect(delegate.isReturnDirect());
        if (delegate instanceof ToolBase base) {
            builder.concurrencySafe(base.isConcurrencySafe())
                    .externalTool(base.isExternalTool())
                    .stateInjected(base.isStateInjected());
            if (base.isMcp()) builder.mcp(base.getMcpName());
        }
        return builder;
    }

    @Override
    public Mono<ToolResultBlock> callAsync(ToolCallParam param) {
        return Mono.fromCallable(
                        () -> {
                            requireAccountPermission();
                            return true;
                        })
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(
                        allowed -> {
                            try (var identity = AccountScope.bind(owner)) {
                                return delegate.callAsync(param);
                            }
                        })
                .contextWrite(context -> context.put(AccountScope.CONTEXT_KEY, owner));
    }

    @Override
    public Mono<PermissionDecision> checkPermissions(
            Map<String, Object> input, PermissionContextState state) {
        return Mono.fromCallable(
                        () -> {
                            requireAccountPermission();
                            return true;
                        })
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(allowed -> toolDecision(input, state));
    }

    private void requireAccountPermission() {
        if (accounts == null || owner.isEmpty()) return;
        var user = accounts.user(owner);
        String name = getName();
        var required = new java.util.ArrayList<String>();
        required.add("codex:access");
        if (TERMINAL_TOOLS.contains(name)) required.add("codex:terminal");
        if (WORKSPACE_TOOLS.contains(name)
                || name.startsWith("design_")
                || name.startsWith("documents_")
                || name.equals("pdf_export")) required.add("codex:workspace");
        if (isMcp()
                || name.startsWith("github_")
                || name.startsWith("chrome_")
                || name.startsWith("web_")
                || name.equals("weather_query")
                || name.startsWith("design_")
                || name.startsWith("documents_")
                || name.equals("pdf_export")) required.add("codex:plugin");
        var permissions = user.permissions();
        if (!user.enabled()
                || user.changePassword()
                || !(permissions.contains("*") || permissions.containsAll(required)))
            throw new com.xuya.island.common.BusinessException(
                    "TOOL_PERMISSION_REVOKED",
                    "账户已停用或工具权限已撤销",
                    org.springframework.http.HttpStatus.FORBIDDEN);
    }

    private static final java.util.Set<String> WORKSPACE_TOOLS =
            java.util.Set.of(
                    "read_file",
                    "write_file",
                    "list_files",
                    "search_files",
                    "git_status",
                    "git_diff",
                    "list_artifacts",
                    "read_artifact",
                    "capture_artifact");
    private static final java.util.Set<String> TERMINAL_TOOLS =
            java.util.Set.of(
                    "execute_command",
                    "list_terminals",
                    "read_terminal_output",
                    "design_build_preview");

    private Mono<PermissionDecision> toolDecision(
            Map<String, Object> input, PermissionContextState state) {
        if (forceReadOnly && !isReadOnly())
            return decision(PermissionBehavior.DENY, "子智能体只有读取权限", "safety: read-only subagent");
        if (state.getMode() == PermissionMode.BYPASS)
            return decision(PermissionBehavior.ALLOW, "完全访问", "explicit full access");
        if (isReadOnly()) return decision(PermissionBehavior.ALLOW, "读取工作区", "read-only");
        if (state.getMode() == PermissionMode.DEFAULT)
            return decision(PermissionBehavior.ASK, "请批准写入或执行操作", "safety: explicit approval mode");
        if (getName().equals("write_file"))
            return decision(
                    PermissionBehavior.ALLOW, "修改已登记工作区", "workspace compare-and-swap write");
        if (getName().equals("execute_command")) {
            String command = String.valueOf(input.getOrDefault("command", "")).trim();
            if (SAFE_COMMAND.matcher(command).matches()
                    && !command.matches("(?s).*[;&|`<>\\r\\n].*")) {
                return decision(
                        PermissionBehavior.ALLOW, "执行工作区验证命令", "bounded validation command");
            }
            return decision(PermissionBehavior.ASK, "请批准执行命令", "safety: command requires approval");
        }
        return decision(
                PermissionBehavior.ASK, "请批准工具操作", "safety: mutable tool requires approval");
    }

    private Mono<PermissionDecision> decision(
            PermissionBehavior behavior, String message, String reason) {
        return Mono.just(
                PermissionDecision.builder()
                        .behavior(behavior)
                        .message(message)
                        .decisionReason(reason)
                        .build());
    }
}
