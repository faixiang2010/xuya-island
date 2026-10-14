package com.xuya.island.codex.terminal;

import com.xuya.island.common.BusinessException;
import org.springframework.http.HttpStatus;

/** 有界终端原始输出；游标是 UTF-16 字符偏移，读取不改变进程或其他订阅者。 */
final class TerminalTranscript {
    private static final int CAPACITY = 131072;
    private final StringBuilder text = new StringBuilder();
    private long firstCursor;

    synchronized void append(String value) {
        text.append(value);
        int remove = text.length() - CAPACITY;
        if (remove > 0) {
            // 不在缓存边界留下孤立的低代理字符。
            if (remove < text.length() && Character.isLowSurrogate(text.charAt(remove))) remove++;
            text.delete(0, remove);
            firstCursor += remove;
        }
    }

    synchronized TerminalService.Output read(String id, Long after, int limit, boolean running) {
        long latest = firstCursor + text.length();
        long start =
                after == null
                        ? Math.max(firstCursor, latest - limit)
                        : Math.max(firstCursor, after);
        if (start > latest)
            throw new BusinessException(
                    "TERMINAL_CURSOR_INVALID", "输出游标超过当前终端位置", HttpStatus.CONFLICT);
        int offset = (int) (start - firstCursor);
        if (offset < text.length() && Character.isLowSurrogate(text.charAt(offset))) {
            offset++;
            start++;
        }
        int end = Math.min(text.length(), offset + limit);
        // PTY 分块也可能拆开代理对；等下一块到达后再推进游标，避免吞掉半个字符。
        if (end > offset && Character.isHighSurrogate(text.charAt(end - 1))) end--;
        return new TerminalService.Output(
                id,
                text.substring(offset, end),
                start,
                firstCursor + end,
                latest,
                after != null && after < firstCursor,
                firstCursor + end < latest,
                running);
    }
}
