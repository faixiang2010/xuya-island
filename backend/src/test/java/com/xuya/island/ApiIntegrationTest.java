package com.xuya.island;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestConstructor;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * 真实随机端口和临时数据库，验证 API 合同与隔离执行来源。
 *
 * @author Codex代码助手
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "xuya.auth.enabled=false")
@TestConstructor(autowireMode = TestConstructor.AutowireMode.ALL)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ApiIntegrationTest {

    @TempDir static Path dataDirectory;
    private static final String FRONTEND_ORIGIN = "http://127.0.0.1:43171";

    private final int port;

    ApiIntegrationTest(@Value("${local.server.port}") int port) {
        this.port = port;
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("xuya.data-dir", () -> dataDirectory.toString());
        registry.add("xuya.runner-port", () -> "0");
        registry.add("xuya.model.api-key", () -> "");
    }

    @Test
    void savesChineseWorkAndReturnsStructuredConflict() {
        var client = client();
        var saved =
                client.post()
                        .uri("/api/works")
                        .header("Origin", FRONTEND_ORIGIN)
                        .bodyValue(
                                Map.of(
                                        "lessonId",
                                        "story-cover",
                                        "title",
                                        "云朵邮局",
                                        "code",
                                        "print('你好')",
                                        "revision",
                                        0))
                        .exchange()
                        .expectStatus()
                        .isCreated()
                        .expectBody()
                        .jsonPath("$.revision")
                        .isEqualTo(1)
                        .returnResult();
        String id =
                JsonPath.read(new String(saved.getResponseBody(), StandardCharsets.UTF_8), "$.id");
        client.put()
                .uri("/api/works/" + id)
                .header("Origin", FRONTEND_ORIGIN)
                .bodyValue(
                        Map.of(
                                "lessonId",
                                "story-cover",
                                "title",
                                "新故事",
                                "code",
                                "print('新')",
                                "revision",
                                0))
                .exchange()
                .expectStatus()
                .isEqualTo(409)
                .expectBody()
                .jsonPath("$.code")
                .isEqualTo("WORK_CONFLICT");
        client.get()
                .uri("/api/works/" + id)
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.code")
                .isEqualTo("print('你好')");
    }

    @Test
    void runnerAndUntrustedSitesCannotWriteBusinessData() {
        client().post()
                .uri("/api/works")
                .header("Origin", "http://127.0.0.1:43173")
                .bodyValue(Map.of())
                .exchange()
                .expectStatus()
                .isForbidden();
        client().post()
                .uri("/api/works")
                .header("Origin", "https://untrusted.example")
                .bodyValue(Map.of())
                .exchange()
                .expectStatus()
                .isForbidden();
    }

    @Test
    void missingRoutesAndUnsupportedMethodsKeepHttpStatus() {
        client().get()
                .uri("/api/no-such-route")
                .exchange()
                .expectStatus()
                .isNotFound()
                .expectBody()
                .jsonPath("$.code")
                .isEqualTo("NOT_FOUND");
        client().delete()
                .uri("/api/works")
                .header("Origin", FRONTEND_ORIGIN)
                .exchange()
                .expectStatus()
                .isEqualTo(405)
                .expectBody()
                .jsonPath("$.code")
                .isEqualTo("HTTP_ERROR");
    }

    @Test
    void invalidPayloadAndMissingModelAreExplicitErrors() {
        client().post()
                .uri("/api/works")
                .header("Origin", FRONTEND_ORIGIN)
                .bodyValue(Map.of())
                .exchange()
                .expectStatus()
                .isBadRequest()
                .expectBody()
                .jsonPath("$.code")
                .isEqualTo("INVALID_INPUT");
        client().get()
                .uri("/api/tutor/status")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.configured")
                .isEqualTo(false);
        client().post()
                .uri("/api/tutor/ask")
                .header("Origin", FRONTEND_ORIGIN)
                .bodyValue(
                        Map.of(
                                "sessionId",
                                "test-session",
                                "lessonId",
                                "story-cover",
                                "question",
                                "怎么改名字？",
                                "currentCode",
                                "print('云')",
                                "executedCode",
                                "",
                                "output",
                                "",
                                "error",
                                ""))
                .exchange()
                .expectStatus()
                .isEqualTo(503)
                .expectBody()
                .jsonPath("$.code")
                .isEqualTo("MODEL_NOT_CONFIGURED");
    }

    private WebTestClient client() {
        return WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();
    }

    @Test
    void curriculumAndReadinessAreAvailableWithoutModel() {
        client().get()
                .uri("/api/curriculum")
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .valueEquals("Cross-Origin-Embedder-Policy", "require-corp")
                .expectBody()
                .jsonPath("$.lessons.length()")
                .isEqualTo(48)
                .jsonPath("$.phases.length()")
                .isEqualTo(6);
        client().get().uri("/api/health/live").exchange().expectStatus().isOk();
        client().get()
                .uri("/api/health/ready")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.status")
                .isEqualTo("ready");
    }
}
