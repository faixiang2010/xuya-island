package com.xuya.island.lesson.controller;

import com.xuya.island.lesson.service.LessonService;
import com.xuya.island.lesson.vo.LessonVO;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 内置课程查询接口。
 *
 * @author Codex代码助手
 */
@RestController
@RequestMapping("/api/lessons")
public class LessonController {

    private final LessonService lessonService;

    public LessonController(LessonService lessonService) {
        this.lessonService = lessonService;
    }

    @GetMapping
    public List<LessonVO> list() {
        return lessonService.list();
    }

    @GetMapping("/{id}")
    public LessonVO get(@PathVariable String id) {
        return lessonService.get(id);
    }
}
