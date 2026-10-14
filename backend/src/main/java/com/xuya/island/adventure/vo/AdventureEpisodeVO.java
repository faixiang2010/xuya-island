package com.xuya.island.adventure.vo;

import java.util.List;
import java.util.Map;

/** 离谱小镇的版本化故事、创作提示与可执行场景检查。 */
public record AdventureEpisodeVO(
        String id,
        int number,
        String chapterId,
        String title,
        String subtitle,
        String hook,
        String mission,
        String concept,
        String starterCode,
        String referenceCode,
        List<String> hints,
        String prediction,
        List<Remix> remixes,
        String transfer,
        List<Dialogue> dialogue,
        List<String> exampleInput,
        String scene,
        List<SceneCheck> checks,
        int minutes) {

    public record Remix(String title, String description) {}

    public record Dialogue(String speaker, String text) {}

    public record SceneCheck(String name, List<String> input, Map<String, Object> expectedState) {}
}
