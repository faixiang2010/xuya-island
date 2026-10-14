package com.xuya.island.execution;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 与页面相同的确定性舞台重放，运行观察不采信客户端上传的舞台状态。 */
public final class StageProjection {
    private StageProjection() {}

    public static boolean safe(Map<String, Object> event) {
        if (event == null || event.size() > 6 || !(event.get("kind") instanceof String kind))
            return false;
        if (!Set.of(
                        "cup", "lid", "pour", "pearls", "drink", "say", "actor", "move", "size",
                        "counter")
                .contains(kind)) return false;
        for (Object value : event.values()) {
            if (value instanceof String text) {
                if (text.length() > 200) return false;
            } else if (value instanceof Number number) {
                if (!Double.isFinite(number.doubleValue())
                        || Math.abs(number.doubleValue()) > 10000) return false;
            } else return false;
        }
        if (Set.of("say", "actor", "move", "size", "counter").contains(kind)
                && !name(event.get("actor"))) return false;
        return switch (kind) {
            case "pour", "pearls" -> quantity(event.get("amount"));
            case "drink" -> quantity(event.get("amount")) && event.get("value") instanceof String;
            case "say" -> event.get("text") instanceof String;
            case "actor" -> Set.of("monster", "robot", "cat", "ghost").contains(event.get("value"));
            case "move" -> event.get("x") instanceof Number && event.get("y") instanceof Number;
            case "size" ->
                    quantity(event.get("value"))
                            && ((Number) event.get("value")).doubleValue() <= 3;
            case "counter" -> event.get("value") instanceof Number;
            default -> true;
        };
    }

    private static boolean name(Object value) {
        return value instanceof String text
                && text.matches("[a-zA-Z0-9_\\u4e00-\\u9fff -]{1,40}")
                && !Set.of("__proto__", "prototype", "constructor").contains(text);
    }

    private static boolean quantity(Object value) {
        return value instanceof Number number && number.doubleValue() >= 0;
    }

    private static Map<String, Object> actor(String kind) {
        return new LinkedHashMap<>(Map.of("kind", kind, "x", 0, "y", 0, "size", 1, "text", ""));
    }

    public static Map<String, Object> replay(List<Map<String, Object>> events) {
        Map<String, Object> state =
                new LinkedHashMap<>(
                        Map.of(
                                "cupOpen",
                                true,
                                "filled",
                                0.0,
                                "spilled",
                                0.0,
                                "pearls",
                                0.0,
                                "drinks",
                                0.0,
                                "flavour",
                                "",
                                "lastSpeech",
                                ""));
        Map<String, Map<String, Object>> actors = new LinkedHashMap<>();
        actors.put("bubu", actor("robot"));
        Map<String, Object> counters = new LinkedHashMap<>();
        state.put("actors", actors);
        state.put("counters", counters);
        for (var event : events) {
            if (!safe(event)) continue;
            String kind = (String) event.get("kind");
            String name = (String) event.get("actor");
            Map<String, Object> person = null;
            if (name != null && (actors.containsKey(name) || actors.size() < 32))
                person = actors.computeIfAbsent(name, ignored -> actor("monster"));
            switch (kind) {
                case "cup" -> {
                    state.put("cupOpen", true);
                    state.put("filled", 0.0);
                    state.put("spilled", 0.0);
                    state.put("pearls", 0.0);
                    state.put("flavour", "");
                }
                case "lid" -> state.put("cupOpen", false);
                case "pour" -> {
                    String key = Boolean.TRUE.equals(state.get("cupOpen")) ? "filled" : "spilled";
                    state.put(
                            key,
                            ((Number) state.get(key)).doubleValue()
                                    + ((Number) event.get("amount")).doubleValue());
                }
                case "pearls" -> state.put("pearls", event.get("amount"));
                case "drink" -> {
                    state.put("flavour", event.get("value"));
                    state.put(
                            "drinks",
                            ((Number) state.get("drinks")).doubleValue()
                                    + ((Number) event.get("amount")).doubleValue());
                }
                case "say" -> {
                    state.put("lastSpeech", event.get("text"));
                    if (person != null) person.put("text", event.get("text"));
                }
                case "actor" -> {
                    if (person != null) person.put("kind", event.get("value"));
                }
                case "move" -> {
                    if (person != null) {
                        person.put("x", event.get("x"));
                        person.put("y", event.get("y"));
                    }
                }
                case "size" -> {
                    if (person != null) person.put("size", event.get("value"));
                }
                case "counter" -> {
                    if (counters.containsKey(name) || counters.size() < 32)
                        counters.put(name, event.get("value"));
                }
                default -> {}
            }
        }
        return state;
    }
}
