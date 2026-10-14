package com.xuya.island.execution.world;

import java.time.Duration;
import java.util.List;

/** 一条有界命令的启动计划：命令数组与超时由执行世界决定，目录与环境由调用方统一施加。 */
public record LaunchPlan(List<String> command, Duration timeout) {}
