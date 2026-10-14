package com.xuya.island.studio.service;

import com.xuya.island.common.BusinessException;
import com.xuya.island.studio.vo.StudioViews;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

/** 文件、舞台事件与浏览器回执的限制，不把浏览器事实作为认证成绩。 */
public final class StudioValidation {
    private static final Set<String> STAGE_KINDS =
            Set.of(
                    "cup", "pour", "lid", "pearls", "drink", "say", "actor", "move", "size",
                    "counter");

    private StudioValidation() {}

    public static List<StudioViews.ProjectFile> files(List<StudioViews.ProjectFile> files) {
        if (files == null || files.isEmpty() || files.size() > 32)
            invalid("项目需要 main.py，最多保存 32 个文本文件");
        var names = new HashSet<String>();
        int total = 0;
        for (var file : files) {
            if (file == null
                    || !safePath(file.path())
                    || file.content() == null
                    || !names.add(file.path())) {
                invalid("文件路径无效或重复，请使用项目内的相对路径");
            }
            int bytes = file.content().getBytes(StandardCharsets.UTF_8).length;
            total += bytes;
            if (bytes > 65536 || total > 524288) invalid("单个文件最多 64 KiB，项目文本总计最多 512 KiB");
        }
        if (!names.contains("main.py")) invalid("项目需要 main.py 入口文件");
        return List.copyOf(files);
    }

    public static boolean safePath(String path) {
        if (path == null || path.length() > 240 || path.contains("..") || path.contains("\\"))
            return false;
        String[] parts = path.split("/", -1);
        if (parts.length > 4) return false;
        for (String part : parts) {
            if (part.equals(".") || !part.matches("[\\w\\u4e00-\\u9fff. -]{1,80}")) return false;
        }
        return true;
    }

    public static StudioViews.Preferences preferences(StudioViews.Preferences value) {
        if (value == null) return new StudioViews.Preferences(List.of(), "轻松荒诞");
        if (value.favoriteThemes() == null
                || value.favoriteThemes().size() > 12
                || value.humor() == null
                || value.humor().length() > 160
                || value.favoriteThemes().stream().anyMatch(s -> s == null || s.length() > 40)) {
            invalid("偏好只保存简短的创作主题和幽默口味");
        }
        return new StudioViews.Preferences(List.copyOf(value.favoriteThemes()), value.humor());
    }

    public static void run(StudioViews.RunResult result) {
        if (result == null
                || result.runId() == null
                || result.runId().length() > 100
                || !Set.of("success", "error", "stopped", "timeout").contains(result.status())
                || result.output() == null
                || result.output().length() > 20000
                || result.error() == null
                || result.error().length() > 20000
                || result.durationMs() < 0
                || result.durationMs() > 600000) invalid("运行回执格式无效");
        if (result.inputs() == null
                || result.inputs().size() > 50
                || result.inputs().stream().anyMatch(s -> s == null || s.length() > 4096))
            invalid("运行输入超过限制");
        if (result.files() == null || result.files().size() > 32) invalid("运行文件超过限制");
        int total = 0;
        for (var file : result.files()) {
            if (file == null || !safePath(file.get("name")) || file.get("content") == null)
                invalid("运行文件无效");
            int bytes = file.get("content").getBytes(StandardCharsets.UTF_8).length;
            total += bytes;
            if (bytes > 65536 || total > 524288) invalid("运行文件超过大小限制");
        }
        if (result.drawings() == null
                || result.drawings().size() > 5000
                || result.stageEvents() == null
                || result.stageEvents().size() > 5000
                || result.stageState() == null) invalid("舞台或画笔结果超过限制");
        for (Map<String, Object> event : result.stageEvents()) {
            if (event == null || !STAGE_KINDS.contains(event.get("kind"))) invalid("舞台事件无效");
            for (String key : List.of("amount", "x", "y"))
                if (event.containsKey(key)) number(event.get(key), -10000, 10000);
            for (String key : List.of("actor", "name"))
                if (event.containsKey(key)) text(event.get(key), 40);
            if (event.containsKey("text")) text(event.get("text"), 200);
            if (event.containsKey("value")) {
                Object value = event.get("value");
                if (value instanceof Number)
                    number(
                            value,
                            "size".equals(event.get("kind")) ? 0 : -10000,
                            "size".equals(event.get("kind")) ? 3 : 10000);
                else text(value, 200);
            }
        }
        // 客户端 stageState 仅是资料；实际教学观察依赖受限事件，限制其体积并不赋予认证意义。
        if (result.stageState().size() > 16) invalid("舞台状态字段超过限制");
    }

    private static void number(Object value, double minimum, double maximum) {
        if (!(value instanceof Number number)
                || !Double.isFinite(number.doubleValue())
                || number.doubleValue() < minimum
                || number.doubleValue() > maximum) invalid("舞台数值无效");
    }

    private static void text(Object value, int maximum) {
        if (!(value instanceof String text) || text.length() > maximum) invalid("舞台文本无效");
    }

    public static void invalid(String message) {
        throw new BusinessException("INVALID_STUDIO_INPUT", message, HttpStatus.BAD_REQUEST);
    }
}
