package com.xuya.island.execution.world;

import com.xuya.island.execution.WindowsPythonJob;
import java.io.IOException;
import java.nio.file.Path;
import org.springframework.stereotype.Component;

/** 本机受限 Python：主机解释器加 Windows Job 内存与回收边界，环境变量先剥离凭证。 */
@Component
public class LocalPythonLauncher implements PythonLauncher {

    @Override
    public PythonProcess launch(Path executable, Path helper, Path directory) throws IOException {
        ProcessBuilder builder =
                new ProcessBuilder(executable.toString(), "-u", helper.toString())
                        .directory(directory.toFile());
        builder.environment()
                .keySet()
                .removeIf(
                        name ->
                                name.startsWith("XUYA_")
                                        || name.contains("API_KEY")
                                        || name.contains("TOKEN")
                                        || name.startsWith("SA_TOKEN"));
        builder.environment().put("PYTHONIOENCODING", "utf-8");
        builder.environment().put("PYTHONUTF8", "1");
        Process process = builder.start();
        return new PythonProcess(process, new WindowsPythonJob(process));
    }
}
