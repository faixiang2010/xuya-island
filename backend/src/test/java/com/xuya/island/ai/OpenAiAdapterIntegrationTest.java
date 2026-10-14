package com.xuya.island.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import com.xuya.island.ai.dto.AskTutorRequest;
import com.xuya.island.ai.service.TutorService;
import com.xuya.island.config.XuyaProperties;
import com.xuya.island.lesson.service.LessonService;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * 通过本机 HTTP 固定响应验证兼容协议，密钥为测试字符串，绝不访问付费服务。
 *
 * @author Codex代码助手
 */
class OpenAiAdapterIntegrationTest {

    @TempDir private Path directory;

    @Test
    void nativeSdkCallsCompatibleEndpointAndPassesBothCodeSnapshots() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        AtomicReference<String> authorization = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/v1/chat/completions",
                exchange -> {
                    authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
                    requestBody.set(
                            new String(
                                    exchange.getRequestBody().readAllBytes(),
                                    StandardCharsets.UTF_8));
                    byte[] response =
                            """
                    {"id":"fixture-1","object":"chat.completion","created":1,"model":"fixture-model",
                     "choices":[{"index":0,"message":{"role":"assistant","content":"先观察引号，再试着运行。"},
                     "finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":10,"total_tokens":30}}
                    """
                                    .getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, response.length);
                    exchange.getResponseBody().write(response);
                    exchange.close();
                });
        server.start();
        try {
            var properties =
                    new XuyaProperties(
                            directory,
                            0,
                            List.of(),
                            new XuyaProperties.ModelProperties(
                                    "fixture",
                                    "http://127.0.0.1:" + server.getAddress().getPort(),
                                    "fixture-model",
                                    "test-key-only"));
            var service = new TutorService(properties, new LessonService(), null);
            var reply =
                    service.ask(
                            new AskTutorRequest(
                                    "fixture-session",
                                    "author-interview",
                                    "为什么要转换章节？",
                                    "print('新故事')",
                                    "print('旧故事')",
                                    "旧故事",
                                    "",
                                    "python-interest-1.0",
                                    "practice",
                                    2,
                                    false,
                                    List.of("云朵", "3")));
            assertEquals("先观察引号，再试着运行。", reply.answer());
            assertEquals("Bearer test-key-only", authorization.get());
            assertTrue(requestBody.get().contains("新故事"));
            assertTrue(requestBody.get().contains("旧故事"));
            assertTrue(requestBody.get().contains("已打开提示层级：2"));
            assertTrue(requestBody.get().contains("云朵, 3"));
            assertTrue(requestBody.get().contains("章节数增加 1"));
        } finally {
            server.stop(0);
        }
    }
}
