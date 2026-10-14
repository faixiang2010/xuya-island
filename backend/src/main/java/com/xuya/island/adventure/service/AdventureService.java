package com.xuya.island.adventure.service;

import com.xuya.island.adventure.vo.AdventureCurriculumVO;
import com.xuya.island.adventure.vo.AdventureEpisodeVO;
import com.xuya.island.common.BusinessException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/** 本地故事课无需模型或网络；旧 Python 课程资源保留不变。 */
@Service
public class AdventureService {

    private static final AdventureCurriculumVO CONTENT = load();

    private static AdventureCurriculumVO load() {
        try {
            String json =
                    new ClassPathResource("curriculum/absurd-town-v1.json")
                            .getContentAsString(StandardCharsets.UTF_8);
            AdventureCurriculumVO content =
                    JsonMapper.builder().build().readValue(json, AdventureCurriculumVO.class);
            Set<String> chapters =
                    content.chapters().stream()
                            .map(AdventureCurriculumVO.Chapter::id)
                            .collect(Collectors.toSet());
            if (!"absurd-town-1.0".equals(content.version())
                    || content.episodes().isEmpty()
                    || content.episodes().stream().map(AdventureEpisodeVO::id).distinct().count()
                            != content.episodes().size()
                    || content.episodes().stream()
                                    .map(AdventureEpisodeVO::number)
                                    .distinct()
                                    .count()
                            != content.episodes().size()) {
                throw new IllegalStateException("离谱小镇目录版本或集编号不完整");
            }
            for (AdventureEpisodeVO episode : content.episodes()) {
                if (!chapters.contains(episode.chapterId())
                        || episode.hints().size() != 3
                        || episode.remixes().size() < 2
                        || episode.checks().isEmpty()
                        || episode.dialogue().isEmpty()
                        || episode.starterCode().isBlank()
                        || episode.referenceCode().isBlank()
                        || !"milk-tea".equals(episode.scene())
                        || episode.checks().stream()
                                .anyMatch(check -> check.expectedState().isEmpty())) {
                    throw new IllegalStateException("故事课缺少场景、三级提示或行为检查：" + episode.id());
                }
            }
            return content;
        } catch (IOException exception) {
            throw new IllegalStateException("无法读取本地离谱小镇课程", exception);
        }
    }

    public AdventureCurriculumVO curriculum() {
        return CONTENT;
    }

    public AdventureEpisodeVO get(String id) {
        return CONTENT.episodes().stream()
                .filter(episode -> episode.id().equals(id))
                .findFirst()
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        "EPISODE_NOT_FOUND", "小镇还没有这集故事", HttpStatus.NOT_FOUND));
    }
}
