package com.xuya.island.execution.world;

/** 已启动的 Python 进程与其内存/回收边界；边界与进程同生命周期。 */
public record PythonProcess(Process process, AutoCloseable boundary) {}
