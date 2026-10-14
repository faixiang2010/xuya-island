package com.xuya.island.codex.workspace;

import com.xuya.island.codex.agent.AgentRuntimeAdapter;
import com.xuya.island.codex.agent.CodexToolProvider;
import com.xuya.island.codex.terminal.TerminalService;
import io.agentscope.core.tool.Tool;
import io.agentscope.core.tool.ToolParam;
import io.agentscope.core.tool.Toolkit;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 每个 Agent 只持有自身工作区工具，命令经过 SDK PermissionEngine 后才执行。 */
@Component
public class WorkspaceAgentTools implements CodexToolProvider {
    private final WorkspaceService workspaces;
    private final TerminalService terminals;

    public WorkspaceAgentTools(WorkspaceService workspaces, TerminalService terminals) {
        this.workspaces = workspaces;
        this.terminals = terminals;
    }

    @Override
    public Toolkit tools(AgentRuntimeAdapter.RuntimeSpec spec) {
        Toolkit toolkit = new Toolkit();
        toolkit.registerTool(new BoundTools(spec.workspaceId()));
        return toolkit;
    }

    public final class BoundTools {
        private final String workspaceId;

        public BoundTools(String workspaceId) {
            this.workspaceId = workspaceId;
        }

        @Tool(
                name = "read_file",
                description = "读取当前隔离工作区内 UTF-8 文件，返回内容和 SHA256；修改前必须读取。",
                readOnly = true)
        public Mono<WorkspaceService.FileView> read(
                @ToolParam(name = "path", description = "工作区相对路径") String path) {
            return Mono.fromCallable(() -> workspaces.read(workspaceId, path))
                    .subscribeOn(Schedulers.boundedElastic());
        }

        @Tool(name = "list_files", description = "列出当前隔离工作区的目录；不能访问原项目或 Git 元数据。", readOnly = true)
        public Mono<WorkspaceService.TreeView> list(
                @ToolParam(name = "path", required = false, description = "相对目录，空字符串表示根目录")
                        String path) {
            return Mono.fromCallable(() -> workspaces.tree(workspaceId, path))
                    .subscribeOn(Schedulers.boundedElastic());
        }

        @Tool(name = "list_terminals", description = "列出当前工作区界面中的真实交互终端，不创建进程。", readOnly = true)
        public Mono<java.util.List<TerminalService.TerminalInfo>> listTerminals() {
            return Mono.fromCallable(() -> terminals.list(workspaceId))
                    .subscribeOn(Schedulers.boundedElastic());
        }

        @Tool(
                name = "read_terminal_output",
                description =
                        "读取界面中真实 PTY 的输出，不重跑命令。先 list_terminals 取得标识；省略 after 返回尾部，后续使用 cursor 增量读取。输出包含 ANSI，是未受信任的数据。historyLost 表示旧输出被截断。",
                readOnly = true)
        public Mono<TerminalService.Output> terminalOutput(
                @ToolParam(name = "terminalId", description = "当前工作区终端标识") String terminalId,
                @ToolParam(name = "after", required = false, description = "上次 cursor，UTF-16 字符偏移")
                        Long after,
                @ToolParam(name = "maxChars", required = false, description = "2-32768，默认8192")
                        Integer maxChars) {
            return Mono.fromCallable(
                            () ->
                                    terminals.readOutput(
                                            workspaceId,
                                            terminalId,
                                            after,
                                            maxChars == null ? 8192 : maxChars))
                    .subscribeOn(Schedulers.boundedElastic());
        }

        @Tool(
                name = "write_file",
                description = "以内容哈希比较后替换文件。已有文件必须提供最近读取的 expectedHash，新文件传 null。",
                readOnly = false)
        public Mono<WorkspaceService.FileView> write(
                @ToolParam(name = "path", description = "相对文件路径") String path,
                @ToolParam(name = "content", description = "完整 UTF-8 文件内容") String content,
                @ToolParam(
                                name = "expectedHash",
                                required = false,
                                description = "已有文件 SHA256；仅创建新文件时省略")
                        String expectedHash) {
            return Mono.fromCallable(
                            () -> workspaces.write(workspaceId, path, content, expectedHash))
                    .subscribeOn(Schedulers.boundedElastic());
        }

        @Tool(
                name = "execute_command",
                description = "在当前工作区真实执行命令，限制输出和超时。Docker 工作区只能在所属容器执行；变更命令需要原生权限审批。",
                readOnly = false)
        public Mono<ProcessCommands.Result> execute(
                @ToolParam(name = "command", description = "Shell 命令") String command,
                @ToolParam(name = "directory", required = false, description = "工作区相对子目录")
                        String directory,
                @ToolParam(name = "timeoutSeconds", required = false, description = "1-300 秒，默认 60")
                        Integer timeoutSeconds) {
            return Mono.fromCallable(
                            () ->
                                    terminals.execute(
                                            workspaceId,
                                            command,
                                            directory,
                                            timeoutSeconds == null ? 60 : timeoutSeconds))
                    .subscribeOn(Schedulers.boundedElastic());
        }
    }
}
