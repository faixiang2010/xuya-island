package com.xuya.island.config;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import org.springframework.stereotype.Component;

/**
 * 防止两个后端同时操作同一数据目录。浏览器与 Electron 应连接同一个服务。
 *
 * @author Codex代码助手
 */
@Component
public class DataDirectoryLock implements AutoCloseable {

    private final FileChannel channel;
    private final FileLock lock;

    public DataDirectoryLock(XuyaProperties properties) throws IOException {
        Files.createDirectories(properties.dataDir());
        channel =
                FileChannel.open(
                        properties.dataDir().resolve("backend.lock"),
                        StandardOpenOption.CREATE,
                        StandardOpenOption.WRITE);
        lock = channel.tryLock();
        if (lock == null) {
            channel.close();
            throw new IllegalStateException("此数据目录已有后端运行，请连接已有服务或选择其他目录");
        }
    }

    @Override
    public void close() throws IOException {
        lock.release();
        channel.close();
    }
}
