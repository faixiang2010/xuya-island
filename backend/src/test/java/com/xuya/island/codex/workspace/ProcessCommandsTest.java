package com.xuya.island.codex.workspace;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/** 校验子进程输出解码：UTF-8 原样通过，中文 Windows 控制台 GBK 输出正确还原。 */
class ProcessCommandsTest {

    @Test
    void utf8OutputDecodesAsUtf8() {
        String text = "构建成功 build succeeded";
        assertEquals(text, ProcessCommands.decode(text.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void gbkConsoleOutputFallsBackToNativeCharset() {
        String text = "无法将参数绑定到形参“Format”";
        byte[] gbkBytes = text.getBytes(Charset.forName("GBK"));
        withNativeConsole("GBK", () -> assertEquals(text, ProcessCommands.decode(gbkBytes)));
    }

    @Test
    void asciiOutputUnchanged() {
        assertEquals(
                "exit 0", ProcessCommands.decode("exit 0".getBytes(StandardCharsets.US_ASCII)));
    }

    /**
     * 目标运行环境是中文 Windows（控制台 GBK）。固定 native.encoding，让断言不依赖 CI 宿主机的
     * 区域设置（英文 Windows 的原生编码是 Cp1252，会把 GBK 字节解成乱码）。
     */
    private static void withNativeConsole(String encoding, Runnable assertion) {
        String previous = System.getProperty("native.encoding");
        System.setProperty("native.encoding", encoding);
        try {
            assertion.run();
        } finally {
            if (previous == null) System.clearProperty("native.encoding");
            else System.setProperty("native.encoding", previous);
        }
    }
}
