package com.xuya.island.account;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestConstructor;
import org.springframework.test.web.reactive.server.WebTestClient;

/** 真实HTTP、真实Sa-Token和临时SQLite，验证登录、CSRF、角色与异步账户隔离。 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestConstructor(autowireMode = TestConstructor.AutowireMode.ALL)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class FamilyAccountIntegrationTest {
    @TempDir static Path data;
    private final int port;

    FamilyAccountIntegrationTest(@Value("${local.server.port}") int port) {
        this.port = port;
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("xuya.data-dir", () -> data.toString());
        registry.add("xuya.codex.data-dir", () -> data.resolve("codex").toString());
        registry.add("xuya.runner-port", () -> "0");
        registry.add("xuya.model.api-key", () -> "");
        registry.add("xuya.auth.enabled", () -> "true");
    }

    @Test
    void familyAccountsCannotShareDataOrBypassPermissions() {
        Browser anonymous = new Browser();
        anonymous.state();
        anonymous.get("/api/works", 401);
        anonymous.post("/api/v1/auth/login", Map.of("username", "unknown", "password", "bad"), 400);
        assertNotNull(anonymous.post("/api/v1/auth/captcha", Map.of(), 200).get("image"));
        Browser admin = new Browser();
        admin.state();
        var setup =
                admin.post(
                        "/api/v1/auth/setup",
                        Map.of(
                                "username",
                                "admin",
                                "nickname",
                                "家庭管理员",
                                "password",
                                "admin-password"),
                        200);
        admin.bind(setup);
        assertEquals(40, admin.get("/api/v1/admin/reward-rules", 200).get("dailyCap"));
        admin.put("/api/v1/admin/reward-rules", Map.of("dailyCap", 27), 200);
        assertEquals(27, admin.get("/api/v1/admin/reward-rules", 200).get("dailyCap"));
        anonymous.get("/api/v1/admin/reward-rules", 401);
        admin.post(
                "/api/v1/auth/setup",
                Map.of("username", "second", "nickname", "重复", "password", "admin-password"),
                409);
        admin.put("/api/v1/system/security", Map.of("captchaMode", "off"), 200);
        var first = admin.post("/api/v1/system/users", user("daughter", List.of("learner")), 200);
        var second = admin.post("/api/v1/system/users", user("brother", List.of("learner")), 200);
        Browser daughter = new Browser();
        daughter.state();
        daughter.bind(
                daughter.post(
                        "/api/v1/auth/login",
                        Map.of("username", "daughter", "password", "first-password"),
                        200));
        daughter.get("/api/works", 403);
        daughter.post(
                "/api/v1/auth/password",
                Map.of("oldPassword", "first-password", "newPassword", "daughter-password"),
                200);
        daughter.get("/api/works", 401);
        daughter.state();
        daughter.bind(
                daughter.post(
                        "/api/v1/auth/login",
                        Map.of("username", "daughter", "password", "daughter-password"),
                        200));
        Browser brother = new Browser();
        daughter.get("/api/v1/admin/reward-rules", 403);
        brother.state();
        brother.bind(
                brother.post(
                        "/api/v1/auth/login",
                        Map.of("username", "brother", "password", "first-password"),
                        200));
        brother.post(
                "/api/v1/auth/password",
                Map.of("oldPassword", "first-password", "newPassword", "brother-password"),
                200);
        brother.state();
        brother.bind(
                brother.post(
                        "/api/v1/auth/login",
                        Map.of("username", "brother", "password", "brother-password"),
                        200));
        var saved =
                daughter.post(
                        "/api/works",
                        Map.of(
                                "lessonId",
                                "story-cover",
                                "title",
                                "女儿的小岛",
                                "code",
                                "print('只属于我')",
                                "revision",
                                0),
                        201);
        String id = saved.get("id").toString();
        daughter.get("/api/works/" + id, 200);
        brother.get("/api/works/" + id, 404);
        brother.put(
                "/api/works/" + id,
                Map.of(
                        "lessonId",
                        "story-cover",
                        "title",
                        "不能覆盖",
                        "code",
                        "print('bad')",
                        "revision",
                        1),
                404);
        brother.list("/api/works").expectBody().json("[]");
        daughter.get("/api/v1/system/users", 403);
        daughter.post("/api/v1/codex/access/bootstrap", Map.of(), 403);
        var forged =
                daughter.client
                        .post()
                        .uri("/api/works")
                        .cookie(AccountGateway.COOKIE, daughter.cookie)
                        .header("Origin", daughter.origin)
                        .bodyValue(
                                Map.of(
                                        "lessonId",
                                        "story-cover",
                                        "title",
                                        "伪造",
                                        "code",
                                        "print(1)",
                                        "revision",
                                        0))
                        .exchange();
        forged.expectStatus().isForbidden();
        var wrongOrigin =
                daughter.client
                        .post()
                        .uri("/api/works")
                        .cookie(AccountGateway.COOKIE, daughter.cookie)
                        .header("Origin", "http://evil.example")
                        .header(AccountGateway.CSRF_HEADER, daughter.csrf)
                        .bodyValue(Map.of())
                        .exchange();
        wrongOrigin.expectStatus().isForbidden();
        admin.put(
                "/api/v1/system/users/" + second.get("id"),
                Map.of(
                        "username",
                        "brother",
                        "nickname",
                        "弟弟",
                        "enabled",
                        false,
                        "roles",
                        List.of("learner")),
                200);
        brother.get("/api/works", 401);
        var adminUser = (Map<?, ?>) setup.get("user");
        admin.put(
                "/api/v1/system/users/" + adminUser.get("id"),
                Map.of(
                        "username",
                        "admin",
                        "nickname",
                        "管理员",
                        "enabled",
                        false,
                        "roles",
                        List.of("learner")),
                409);
        assertTrue(first.get("id") != null);
        assertEquals("女儿的小岛", daughter.get("/api/works/" + id, 200).get("title"));
        daughter.post("/api/v1/auth/logout", Map.of(), 200);
        daughter.get("/api/works", 401);
    }

    private Map<String, Object> user(String name, List<String> roles) {
        return Map.of(
                "username",
                name,
                "nickname",
                name,
                "password",
                "first-password",
                "enabled",
                true,
                "roles",
                roles);
    }

    private final class Browser {
        private final String origin = "http://127.0.0.1:" + port;
        private final WebTestClient client =
                WebTestClient.bindToServer()
                        .baseUrl(origin)
                        .responseTimeout(Duration.ofSeconds(20))
                        .build();
        private String cookie = "";
        private String csrf = "";

        void state() {
            bind(get("/api/v1/auth/state", 200));
        }

        void bind(Map<String, Object> state) {
            csrf = state.get("csrf").toString();
        }

        Map<String, Object> get(String url, int status) {
            return call(HttpMethod.GET, url, null, status);
        }

        Map<String, Object> post(String url, Object body, int status) {
            return call(HttpMethod.POST, url, body, status);
        }

        Map<String, Object> put(String url, Object body, int status) {
            return call(HttpMethod.PUT, url, body, status);
        }

        WebTestClient.ResponseSpec list(String url) {
            return client.get()
                    .uri(url)
                    .cookie(AccountGateway.COOKIE, cookie)
                    .exchange()
                    .expectStatus()
                    .isOk();
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> call(HttpMethod method, String url, Object body, int status) {
            var request =
                    client.method(method)
                            .uri(url)
                            .cookie(AccountGateway.COOKIE, cookie)
                            .header("Origin", origin)
                            .header(AccountGateway.CSRF_HEADER, csrf);
            var response =
                    (body == null ? request.exchange() : request.bodyValue(body).exchange())
                            .expectStatus()
                            .isEqualTo(status)
                            .expectBody(Map.class)
                            .returnResult();
            var issued = response.getResponseCookies().getFirst(AccountGateway.COOKIE);
            if (issued != null) {
                cookie = issued.getValue();
                assertTrue(issued.isHttpOnly());
            }
            return response.getResponseBody();
        }
    }
}
