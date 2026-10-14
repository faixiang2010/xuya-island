package com.xuya.island.lesson.controller;

import com.xuya.island.lesson.service.LessonService;
import com.xuya.island.lesson.vo.CurriculumVO;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 课程阶段与建议学习路线。 */
@RestController
public class CurriculumController {

    private final LessonService lessons;

    public CurriculumController(LessonService lessons) {
        this.lessons = lessons;
    }

    @GetMapping("/api/curriculum")
    public CurriculumVO get() {
        return lessons.curriculum();
    }
}
