package com.xuya.island.common;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.IllegalCharsetNameException;
import java.nio.charset.StandardCharsets;
import java.nio.charset.UnsupportedCharsetException;

/**
 * 中文 Windows 控制台编码支持。启动脚本已强制 file.encoding=UTF-8，但本机子进程
 * （cmd/PowerShell/ConPTY）仍按系统 OEM 代码页输出 GBK；这里统一读取不受 JVM 参数
 * 影响的 native.encoding，并提供“UTF-8 优先、控制台编码兜底”的解码与流嗅探。
 */
public final class NativeCharsets {

    private NativeCharsets() {}

    /** 操作系统原生控制台编码；属性缺失或异常时回退中文 Windows 代码页 GBK。 */
    public static Charset consoleCharset() {
        String encoding = System.getProperty("native.encoding");
        if (encoding != null && !encoding.isBlank()) {
            try {
                return Charset.forName(encoding);
            } catch (IllegalCharsetNameException | UnsupportedCharsetException ignored) {
                // 属性异常时继续回退中文 Windows 控制台编码。
            }
        }
        return Charset.forName("GBK");
    }

    /** 严格 UTF-8 解码；含非法序列时按控制台原生编码解码（GBK 可解码任意字节）。 */
    public static String decodeUtf8OrNative(byte[] bytes) {
        if (isUtf8(bytes, bytes.length)) return new String(bytes, StandardCharsets.UTF_8);
        return new String(bytes, consoleCharset());
    }

    /**
     * 交互流（PTY）编码嗅探：含高位字节且构成合法 UTF-8 判 UTF-8，否则判控制台原生编码。
     * 纯 ASCII 无法区分两种编码（ASCII 是公共子集），按中文 Windows 主场景取控制台编码。
     */
    public static Charset sniffStreamCharset(byte[] head, int length) {
        if (length <= 0) return consoleCharset();
        boolean hasHighBytes = false;
        for (int index = 0; index < length; index++) {
            if ((head[index] & 0x80) != 0) {
                hasHighBytes = true;
                break;
            }
        }
        if (!hasHighBytes) return consoleCharset();
        return isUtf8(head, length) ? StandardCharsets.UTF_8 : consoleCharset();
    }

    /** 严格 UTF-8 校验；容忍块尾被截断的多字节字符（最多回看 3 字节）。 */
    static boolean isUtf8(byte[] bytes, int length) {
        for (int end = length; end > length - 4 && end > 0; end--) {
            if (decodesUtf8(bytes, end)) return true;
        }
        return false;
    }

    private static boolean decodesUtf8(byte[] bytes, int length) {
        try {
            StandardCharsets.UTF_8
                    .newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes, 0, length));
            return true;
        } catch (CharacterCodingException exception) {
            return false;
        }
    }
}
