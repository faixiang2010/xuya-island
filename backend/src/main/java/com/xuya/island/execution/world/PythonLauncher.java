package com.xuya.island.execution.world;

import java.io.IOException;
import java.nio.file.Path;

/** 受限 Python 运行器：按执行世界启动受内存与回收边界约束的解释器进程。 */
public interface PythonLauncher {

    /**
     * 启动一次隔离的 Python 运行。
     *
     * @param executable 家庭管理员选定的解释器
     * @param helper 运行协议脚本
     * @param directory 本会话独享的代码目录
     */
    PythonProcess launch(Path executable, Path helper, Path directory) throws IOException;
}
