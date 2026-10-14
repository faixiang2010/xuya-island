package com.xuya.island.adventure.vo;

import java.util.List;

/** 第一季目录；尚未可玩的章节不会伪装成已上线课程。 */
public record AdventureCurriculumVO(
        String version, List<Chapter> chapters, List<AdventureEpisodeVO> episodes) {

    public record Chapter(String id, String title, String description) {}
}
