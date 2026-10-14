package com.xuya.island.growth;

import com.xuya.island.account.AccountService;
import com.xuya.island.adventure.service.AdventureService;
import com.xuya.island.adventure.vo.AdventureEpisodeVO;
import com.xuya.island.lesson.service.LessonService;
import com.xuya.island.lesson.vo.LessonVO;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** 发布内容定义任务边界；前端不能自行指定题目、分数或已完成数量。 */
@Component
public class TeachingActivityCatalog {
    public record Activity(
            String module,
            String id,
            String version,
            String title,
            String knowledge,
            List<String> targets,
            List<LessonVO.TestCaseVO> tests,
            List<AdventureEpisodeVO.SceneCheck> scenes) {}

    private final List<Activity> activities;

    @SuppressWarnings("unchecked")
    public TeachingActivityCatalog(LessonService lessons, AdventureService adventures) {
        var values = new ArrayList<Activity>();
        try {
            Map<String, Object> content =
                    JsonMapper.builder()
                            .build()
                            .readValue(
                                    new ClassPathResource("learning/typing-v1.json")
                                            .getContentAsString(StandardCharsets.UTF_8),
                                    Map.class);
            Map<String, Object> games = (Map<String, Object>) content.get("games");
            for (var game : games.entrySet()) {
                Map<String, Object> definition = (Map<String, Object>) game.getValue();
                for (var item : (List<Map<String, Object>>) definition.get("levels")) {
                    List<String> targets =
                            ((List<Map<String, Object>>) item.get("tasks"))
                                    .stream().map(task -> task.get("target").toString()).toList();
                    String id = game.getKey() + ":" + item.get("id");
                    values.add(
                            new Activity(
                                    "typing",
                                    id,
                                    item.get("version").toString(),
                                    item.get("title").toString(),
                                    id,
                                    targets,
                                    List.of(),
                                    List.of()));
                }
            }
        } catch (java.io.IOException exception) {
            throw new IllegalStateException("无法读取版本化打字活动，请通过项目脚本准备学习资源", exception);
        }
        for (var lesson : lessons.list()) {
            if (lesson.exercises().isEmpty()) continue;
            values.add(
                    new Activity(
                            "classroom",
                            lesson.id(),
                            lesson.version(),
                            lesson.title(),
                            "python:" + lesson.phaseId(),
                            List.of(),
                            lesson.exercises().get(0).tests(),
                            List.of()));
        }
        for (var episode : adventures.curriculum().episodes())
            values.add(
                    new Activity(
                            "adventure",
                            episode.id(),
                            adventures.curriculum().version(),
                            episode.title(),
                            "story:" + episode.concept(),
                            List.of(),
                            List.of(),
                            episode.checks()));
        activities = List.copyOf(values);
    }

    public List<Activity> list() {
        return activities;
    }

    public Activity require(String module, String id, String version) {
        return activities.stream()
                .filter(
                        value ->
                                value.module().equals(module)
                                        && value.id().equals(id)
                                        && value.version().equals(version))
                .findFirst()
                .orElseThrow(() -> AccountService.invalid("活动内容或版本没有发布，请重新打开课程"));
    }
}
