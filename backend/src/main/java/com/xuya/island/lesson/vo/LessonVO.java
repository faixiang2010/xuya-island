package com.xuya.island.lesson.vo;

import java.util.List;

/**
 * 课程展示数据。示例、学习目标与提示分开，避免直接替换孩子代码。
 *
 * @author Codex代码助手
 */
public record LessonVO(
        String id,
        int number,
        String title,
        String subtitle,
        String mission,
        String starterCode,
        List<String> goals,
        List<String> hints,
        String previewType,
        String version,
        String phaseId,
        String track,
        List<String> prerequisites,
        int minutes,
        String explanation,
        String prediction,
        String creation,
        String quickChallenge,
        List<String> commonErrors,
        String parentPrompt,
        List<String> reflectionPrompts,
        List<ExerciseVO> exercises,
        List<String> rubric,
        List<String> exampleInput) {

    public record ExerciseVO(
            String id,
            String title,
            String instruction,
            String referenceCode,
            List<TestCaseVO> tests) {}

    public record TestCaseVO(
            String name,
            List<String> input,
            List<String> outputContains,
            int minDrawings,
            List<String> expectedFiles) {}
}
