package com.xuya.island.adventure.controller;

import com.xuya.island.adventure.service.AdventureService;
import com.xuya.island.adventure.vo.AdventureCurriculumVO;
import com.xuya.island.adventure.vo.AdventureEpisodeVO;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** 动画冒险课目录与单集内容。 */
@RestController
public class AdventureController {

    private final AdventureService adventure;

    public AdventureController(AdventureService adventure) {
        this.adventure = adventure;
    }

    @GetMapping("/api/adventure")
    public AdventureCurriculumVO curriculum() {
        return adventure.curriculum();
    }

    @GetMapping("/api/adventure/episodes/{id}")
    public AdventureEpisodeVO episode(@PathVariable String id) {
        return adventure.get(id);
    }
}
