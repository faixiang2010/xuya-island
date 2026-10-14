package com.xuya.island.lesson.vo;

import java.util.List;

/** 随应用发布的版本化课程目录，不依赖云端模型。 */
public record CurriculumVO(String version, List<PhaseVO> phases, List<LessonVO> lessons) {

    public record PhaseVO(
            String id, String title, String track, String project, String description) {}
}
