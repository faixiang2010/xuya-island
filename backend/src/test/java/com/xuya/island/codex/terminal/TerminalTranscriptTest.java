package com.xuya.island.codex.terminal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.common.BusinessException;
import org.junit.jupiter.api.Test;

/** 对真实输出缓存验证增量游标、限额、丢失与 Unicode 边界，避免重复或无限返回。 */
class TerminalTranscriptTest {
    @Test
    void cursorSupportsIncrementalReadAndTailWithoutConsumption() {
        var transcript = new TerminalTranscript();
        transcript.append("0123456789");
        var first = transcript.read("terminal", 0L, 4, true);
        assertEquals("0123", first.text());
        assertEquals(4, first.cursor());
        assertTrue(first.hasMore());
        assertEquals("4567", transcript.read("terminal", first.cursor(), 4, true).text());
        assertEquals("6789", transcript.read("terminal", null, 4, true).text());
        assertEquals("", transcript.read("terminal", 10L, 4, true).text());
        assertThrows(BusinessException.class, () -> transcript.read("terminal", 11L, 4, true));
    }

    @Test
    void overflowReportsLostHistoryAndAbsoluteCursorSurvives() {
        var transcript = new TerminalTranscript();
        transcript.append("x".repeat(140000));
        transcript.append("READY");
        var result = transcript.read("terminal", 0L, 8, false);
        assertTrue(result.historyLost());
        assertEquals(8933, result.fromCursor());
        assertEquals(140005, result.latestCursor());
        assertEquals("READY", transcript.read("terminal", null, 5, false).text());
        assertFalse(result.running());
    }

    @Test
    void pagesDoNotSplitSupplementaryCharacters() {
        var transcript = new TerminalTranscript();
        transcript.append("a😀b");
        var page = transcript.read("terminal", 0L, 2, true);
        assertEquals("a", page.text());
        assertEquals("😀", transcript.read("terminal", page.cursor(), 2, true).text());
        assertEquals("b", transcript.read("terminal", null, 2, true).text());
    }

    @Test
    void ptyChunksCannotAdvanceCursorPastHalfOfSurrogatePair() {
        var transcript = new TerminalTranscript();
        transcript.append("a\uD83D");
        var first = transcript.read("terminal", 0L, 8, true);
        assertEquals("a", first.text());
        assertEquals(1, first.cursor());
        transcript.append("\uDE00b");
        assertEquals("😀b", transcript.read("terminal", first.cursor(), 8, true).text());
    }
}
