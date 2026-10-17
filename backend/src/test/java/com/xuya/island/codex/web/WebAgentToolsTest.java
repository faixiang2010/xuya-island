package com.xuya.island.codex.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.common.BusinessException;
import io.agentscope.core.tool.Toolkit;
import org.junit.jupiter.api.Test;

/** 联网工具必须拒绝本机与内网地址，并且不把空参数发给外部服务。 */
class WebAgentToolsTest {
    private final WebAgentTools.BoundTools tools = new WebAgentTools().new BoundTools();

    @Test
    void rejectsLocalhostAndPrivateAddresses() {
        for (String url :
                new String[] {
                    "http://127.0.0.1/",
                    "http://localhost:43172/api/health",
                    "http://192.168.1.10/",
                    "http://10.0.0.1/",
                    "http://[::1]/",
                    "file:///C:/Windows/win.ini"
                }) {
            BusinessException failure =
                    assertThrows(
                            BusinessException.class,
                            () -> tools.fetch(url, 1000).block(),
                            "应当拒绝 " + url);
            assertTrue(
                    failure.getCode().startsWith("WEB_URL_")
                            || failure.getCode().startsWith("WEB_HOST_"),
                    failure.getCode());
        }
    }

    @Test
    void rejectsBlankCityBeforeCallingNetwork() {
        BusinessException failure =
                assertThrows(BusinessException.class, () -> tools.weather("   ", 3).block());
        assertEquals("WEATHER_CITY_REQUIRED", failure.getCode());
    }

    @Test
    void registersBothReadOnlyTools() {
        Toolkit toolkit = new WebAgentTools().tools(null);
        assertEquals(
                java.util.Set.of("weather_query", "web_fetch"),
                new java.util.HashSet<>(toolkit.getToolNames()));
        assertTrue(toolkit.getTool("weather_query").isReadOnly());
        assertTrue(toolkit.getTool("web_fetch").isReadOnly());
    }
}
