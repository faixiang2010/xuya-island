package com.xuya.island.adventure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.adventure.service.AdventureService;
import com.xuya.island.common.BusinessException;
import org.junit.jupiter.api.Test;

/** 新故事目录保持独立版本与可用行为检查，旧课程不受影响。 */
class AdventureServiceTest {

    @Test
    void suppliesFourPlayableEpisodesAndKeepsStableIds() {
        var service = new AdventureService();
        var course = service.curriculum();
        assertEquals("absurd-town-1.0", course.version());
        assertEquals(4, course.episodes().size());
        assertEquals("奶茶店开业即停业", course.chapters().get(0).title());
        for (var episode : course.episodes()) {
            assertEquals(episode, service.get(episode.id()));
            assertEquals(3, episode.hints().size());
            assertTrue(episode.remixes().size() >= 2);
            assertTrue(episode.starterCode().contains("from xuya.stage import"));
            assertTrue(
                    episode.checks().stream().allMatch(check -> !check.expectedState().isEmpty()));
        }
        assertEquals(3, service.get("town-double-order").checks().size());
        assertEquals(
                "EPISODE_NOT_FOUND",
                assertThrows(BusinessException.class, () -> service.get("not-an-episode"))
                        .getCode());
    }
}
