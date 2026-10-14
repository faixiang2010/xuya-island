package com.xuya.island.learning.vo;

/** 按课程版本保留的学习记录。 */
public record ProgressVO(
        String lessonId,
        String lessonVersion,
        String status,
        int hintLevel,
        boolean referenceViewed,
        String reflection,
        String parentObservation,
        String updatedAt) {}
