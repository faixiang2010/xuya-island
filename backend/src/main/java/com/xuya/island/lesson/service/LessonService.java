package com.xuya.island.lesson.service;

import com.xuya.island.common.BusinessException;
import com.xuya.island.lesson.vo.CurriculumVO;
import com.xuya.island.lesson.vo.LessonVO;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/** 读取并校验随包课程；升级资源不修改孩子的作品、草稿或历史记录。 */
@Service
public class LessonService {

    private static final CurriculumVO CONTENT = load();

    private static CurriculumVO load() {
        try {
            String json =
                    new ClassPathResource("curriculum/python-interest-v1.json")
                            .getContentAsString(StandardCharsets.UTF_8);
            CurriculumVO content = JsonMapper.builder().build().readValue(json, CurriculumVO.class);
            List<LessonVO> lessons =
                    content.lessons().stream().filter(item -> item.number() > 0).toList();
            if (lessons.isEmpty()
                    || lessons.stream().map(LessonVO::number).distinct().count() != lessons.size()
                    || content.lessons().stream().map(LessonVO::id).distinct().count()
                            != content.lessons().size()
                    || content.phases().isEmpty()) {
                throw new IllegalStateException("课程目录不完整或存在重复课程");
            }
            for (LessonVO lesson : content.lessons()) {
                if (!content.version().equals(lesson.version())
                        || lesson.hints().size() != 3
                        || lesson.exercises().isEmpty()
                        || lesson.exercises().get(0).tests().isEmpty()) {
                    throw new IllegalStateException("课程资源缺少版本、三级提示或练习检查：" + lesson.id());
                }
            }
            return content;
        } catch (IOException exception) {
            throw new IllegalStateException("无法读取内置课程", exception);
        }
    }

    public CurriculumVO curriculum() {
        return new CurriculumVO(
                CONTENT.version(),
                CONTENT.phases(),
                CONTENT.lessons().stream().filter(item -> item.number() > 0).toList());
    }

    public List<LessonVO> list() {
        return CONTENT.lessons();
    }

    public LessonVO get(String id) {
        return CONTENT.lessons().stream()
                .filter(lesson -> lesson.id().equals(id))
                .findFirst()
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        "LESSON_NOT_FOUND", "没有找到这节课", HttpStatus.NOT_FOUND));
    }

    public LessonVO versioned(String id, String version) {
        LessonVO lesson = get(id);
        if (version != null && !lesson.version().equals(version)) {
            throw new BusinessException(
                    "LESSON_VERSION_CHANGED", "课程已更新，请刷新目录；你的代码仍保留着", HttpStatus.CONFLICT);
        }
        return lesson;
    }
}
