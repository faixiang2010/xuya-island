package com.xuya.island.execution.world;

import java.util.List;

/** 一个交互终端的启动计划：命令、解析后的 Shell 名称与是否需要 ConPTY。 */
public record TerminalPlan(List<String> command, String shell, boolean windowsConPty) {}
