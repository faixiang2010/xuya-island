package com.xuya.island.execution.world;

import com.xuya.island.codex.workspace.ProcessCommands;
import com.xuya.island.codex.workspace.WorkspaceService;
import java.nio.file.Path;

/**
 * 一个可替换的执行世界：按环境（本机、Docker，未来远程沙箱）决定命令与终端的启动方式。
 *
 * <p>文件的读写由工作区在主机侧完成（Docker 为绑定挂载，同一份文件），因此这里只收口随环境而变的
 * 行为：命令规划、终端规划与超时语义。换一个 Provider 就把执行位置整体迁移，消费方无需再判断 kind。
 */
public interface ExecutionProvider {

    /** 执行世界标识，与 {@link WorkspaceService.ExecutionEnvironment#kind()} 对应。 */
    String kind();

    /**
     * 规划一条有界命令。
     *
     * @param environment 已解析的执行环境
     * @param directory 已解析且存在的主机工作目录
     * @param command 用户或 Agent 提供的命令
     * @param timeoutSeconds 已限定的超时秒数
     */
    LaunchPlan command(
            WorkspaceService.ExecutionEnvironment environment,
            Path directory,
            String command,
            int timeoutSeconds);

    /** 规划一个交互终端；Shell 缺省值、合法性与命令拼装由执行世界决定。 */
    TerminalPlan terminal(WorkspaceService.ExecutionEnvironment environment, String requestedShell);

    /** 按执行世界语义标注超时（容器内 timeout 以退出码表达）。默认不改变结果。 */
    default ProcessCommands.Result normalizeTimeout(ProcessCommands.Result result) {
        return result;
    }
}
