package com.xuya.island.common;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import tools.jackson.databind.json.JsonMapper;

/** 幂等内容按键排序后编码，避免Map迭代顺序或服务重启改变同一请求的摘要。 */
public final class CanonicalJson {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private CanonicalJson() {}

    public static String string(Object value) {
        return MAPPER.writeValueAsString(
                ordered(MAPPER.readValue(MAPPER.writeValueAsBytes(value), Object.class)));
    }

    public static byte[] bytes(Object value) {
        return string(value).getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    private static Object ordered(Object value) {
        if (value instanceof Map<?, ?> map) {
            var result = new TreeMap<String, Object>();
            map.forEach((key, item) -> result.put(key.toString(), ordered(item)));
            return result;
        }
        if (value instanceof List<?> list)
            return list.stream().map(CanonicalJson::ordered).toList();
        return value;
    }
}
