package com.xuya.island.account;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.xuya.island.common.BusinessException;
import com.xuya.island.config.DatabaseConfiguration;
import java.net.InetSocketAddress;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpCookie;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

/** 真实密码校验和短期会话，覆盖账号/来源锁定、自适应验证码与一次性会话绑定。 */
class AccountGatewayTest {
    @TempDir Path directory;
    private AccountService accounts;
    private AccountGateway gateway;

    @BeforeEach
    void setup() {
        var source = DatabaseConfiguration.openDatabase(directory.resolve("db/xuya.db"));
        accounts =
                new AccountService(
                        JdbcClient.create(source),
                        new TransactionTemplate(new DataSourceTransactionManager(source)));
        accounts.setup(new AccountRequests.Setup("admin", "管理员", "test-password"));
        gateway = new AccountGateway(accounts, null);
    }

    private record Browser(String token, String csrf) {}

    private Browser browser() {
        var exchange =
                MockServerWebExchange.from(
                        MockServerHttpRequest.get("http://localhost:43172/api/v1/auth/state"));
        var state = gateway.state(exchange);
        return new Browser(
                exchange.getResponse().getCookies().getFirst(AccountGateway.COOKIE).getValue(),
                state.csrf());
    }

    private MockServerWebExchange request(Browser browser, String source) {
        return MockServerWebExchange.from(
                MockServerHttpRequest.post("http://localhost:43172/api/v1/auth/login")
                        .remoteAddress(new InetSocketAddress(source, 12000))
                        .cookie(new HttpCookie(AccountGateway.COOKIE, browser.token()))
                        .header(AccountGateway.CSRF_HEADER, browser.csrf()));
    }

    @Test
    void fiveFailuresLockBothTheAccountAndSourceEvenWithCaptchaOff() {
        accounts.setSetting("captcha_mode", "off");
        var browser = browser();
        for (int index = 0; index < 5; index++)
            assertEquals(
                    "LOGIN_FAILED",
                    assertThrows(
                                    BusinessException.class,
                                    () ->
                                            gateway.login(
                                                    request(browser, "192.168.1.2"),
                                                    new AccountRequests.Login(
                                                            "missing", "bad", null, null)))
                            .getCode());
        assertEquals(
                429,
                assertThrows(
                                BusinessException.class,
                                () ->
                                        gateway.login(
                                                request(browser, "192.168.1.2"),
                                                new AccountRequests.Login(
                                                        "another", "bad", null, null)))
                        .getStatus()
                        .value());
        assertEquals(
                429,
                assertThrows(
                                BusinessException.class,
                                () ->
                                        gateway.login(
                                                request(browser, "192.168.1.3"),
                                                new AccountRequests.Login(
                                                        "missing", "bad", null, null)))
                        .getStatus()
                        .value());
    }

    @Test
    void adaptiveCaptchaAppearsAfterThreeFailedPasswords() {
        accounts.setSetting("captcha_mode", "adaptive");
        var browser = browser();
        for (int index = 0; index < 3; index++)
            assertEquals(
                    "LOGIN_FAILED",
                    assertThrows(
                                    BusinessException.class,
                                    () ->
                                            gateway.login(
                                                    request(browser, "192.168.1.2"),
                                                    new AccountRequests.Login(
                                                            "missing", "bad", null, null)))
                            .getCode());
        assertEquals(
                "CAPTCHA_REQUIRED",
                assertThrows(
                                BusinessException.class,
                                () ->
                                        gateway.login(
                                                request(browser, "192.168.1.2"),
                                                new AccountRequests.Login(
                                                        "missing", "bad", null, null)))
                        .getCode());
    }

    @Test
    void captchaIsBoundToOneBrowserAndConsumedExactlyOnce() {
        ReflectionTestUtils.setField(
                gateway,
                "random",
                new java.security.SecureRandom() {
                    @Override
                    public int nextInt(int bound) {
                        return 0;
                    }
                });
        var first = browser();
        var second = browser();
        String challenge = gateway.captcha(request(first, "192.168.1.2")).get("id");
        assertEquals(
                "CAPTCHA_REQUIRED",
                assertThrows(
                                BusinessException.class,
                                () ->
                                        gateway.login(
                                                request(second, "192.168.1.2"),
                                                new AccountRequests.Login(
                                                        "missing", "bad", challenge, "22222")))
                        .getCode());
        assertEquals(
                "CAPTCHA_REQUIRED",
                assertThrows(
                                BusinessException.class,
                                () ->
                                        gateway.login(
                                                request(first, "192.168.1.2"),
                                                new AccountRequests.Login(
                                                        "missing", "bad", challenge, "22222")))
                        .getCode());
        String own = gateway.captcha(request(first, "192.168.1.2")).get("id");
        assertEquals(
                "LOGIN_FAILED",
                assertThrows(
                                BusinessException.class,
                                () ->
                                        gateway.login(
                                                request(first, "192.168.1.2"),
                                                new AccountRequests.Login(
                                                        "missing", "bad", own, "22222")))
                        .getCode());
        assertEquals(
                "CAPTCHA_REQUIRED",
                assertThrows(
                                BusinessException.class,
                                () ->
                                        gateway.login(
                                                request(first, "192.168.1.2"),
                                                new AccountRequests.Login(
                                                        "missing", "bad", own, "22222")))
                        .getCode());
    }
}
