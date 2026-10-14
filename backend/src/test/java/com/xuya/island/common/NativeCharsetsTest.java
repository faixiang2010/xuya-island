package com.xuya.island.common;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.junit.jupiter.api.Test;

/** 控制台编码嗅探与回退解码的行为边界。 */
class NativeCharsetsTest {

    private static final Charset GBK = Charset.forName("GBK");

    @Test
    void utf8TextDecodesAsUtf8() {
        String text = "叙芽岛中文内容";
        assertEquals(
                text, NativeCharsets.decodeUtf8OrNative(text.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void gbkTextFallsBackToConsoleCharset() {
        String text = "无法将参数绑定到形参";
        withNativeConsole(
                "GBK",
                () -> assertEquals(text, NativeCharsets.decodeUtf8OrNative(text.getBytes(GBK))));
    }

    @Test
    void asciiHeadSniffsToConsoleCharset() {
        // 纯 ASCII 两种编码等价；中文 Windows 主场景取控制台编码，保证后续 GBK 输出正确。
        byte[] head = "PS D:\\workspace> ".getBytes(StandardCharsets.US_ASCII);
        assertEquals(
                NativeCharsets.consoleCharset(),
                NativeCharsets.sniffStreamCharset(head, head.length));
    }

    @Test
    void gbkHeadSniffsToConsoleCharset() {
        byte[] head = "版权所有 Microsoft".getBytes(GBK);
        assertEquals(
                NativeCharsets.consoleCharset(),
                NativeCharsets.sniffStreamCharset(head, head.length));
    }

    @Test
    void utf8HeadSniffsToUtf8() {
        byte[] head = "中文提示符".getBytes(StandardCharsets.UTF_8);
        assertEquals(StandardCharsets.UTF_8, NativeCharsets.sniffStreamCharset(head, head.length));
    }

    @Test
    void truncatedUtf8TailStillSniffsToUtf8() {
        byte[] full = "中文提示符".getBytes(StandardCharsets.UTF_8);
        byte[] head = Arrays.copyOf(full, full.length - 1);
        assertEquals(StandardCharsets.UTF_8, NativeCharsets.sniffStreamCharset(head, head.length));
    }

    @Test
    void emptyHeadDefaultsToConsoleCharset() {
        assertEquals(
                NativeCharsets.consoleCharset(), NativeCharsets.sniffStreamCharset(new byte[0], 0));
    }

    /**
     * 目标运行环境是中文 Windows（控制台 GBK）。这里固定 native.encoding，让断言不依赖 CI 宿主机的
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
