package com.xuya.island.account;

import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import com.xuya.island.common.BusinessException;
import java.awt.Color;
import java.awt.Font;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import javax.imageio.ImageIO;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ServerWebExchange;

/** Sa-Token身份、每设备CSRF、验证码和登录限流；只保留有界短期会话数据。 */
@Service
public class AccountGateway {
    public static final String COOKIE = "xuya-session";
    public static final String CSRF_HEADER = "X-Xuya-CSRF";
    private static final long LOGIN_LIFETIME = Duration.ofHours(8).toMillis();
    private static final long IDLE_LIFETIME = Duration.ofMinutes(30).toMillis();
    private static final long ANONYMOUS_LIFETIME = Duration.ofMinutes(10).toMillis();
    private final AccountService accounts;
    private final com.xuya.island.execution.NativePythonService python;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private final Map<String, Challenge> challenges = new ConcurrentHashMap<>();
    private final Map<String, Failure> failures = new ConcurrentHashMap<>();

    private static final class Session {
        private final String account;
        private final String csrf;
        private final int version;
        private final long expires;
        private volatile long active;

        Session(String account, String csrf, int version, long lifetime) {
            this.account = account;
            this.csrf = csrf;
            this.version = version;
            this.active = System.currentTimeMillis();
            this.expires = active + lifetime;
        }
    }

    private record Challenge(String token, String answer, long expires) {}

    private record Failure(int count, long until) {}

    public AccountGateway(
            AccountService accounts, com.xuya.island.execution.NativePythonService python) {
        this.accounts = accounts;
        this.python = python;
    }

    public AccountViews.State state(ServerWebExchange exchange) {
        String token = token(exchange);
        Session session = validSession(token, false);
        if (session == null) {
            prune();
            if (sessions.size() >= 4096) throw limited();
            token = randomToken();
            session = new Session("", randomToken(), 0, ANONYMOUS_LIFETIME);
            sessions.put(token, session);
            cookie(exchange, token, ANONYMOUS_LIFETIME);
        }
        boolean initialized = accounts.initialized();
        AccountViews.User user = session.account.isBlank() ? null : accounts.user(session.account);
        return new AccountViews.State(
                initialized,
                !initialized && local(exchange),
                local(exchange),
                accounts.setting("captcha_mode", "always"),
                session.csrf,
                user,
                user == null
                        ? List.of()
                        : accounts.visibleMenus(user.id()).stream()
                                .filter(
                                        menu ->
                                                local(exchange)
                                                        || !menu.path().startsWith("/codex"))
                                .toList());
    }

    public Map<String, String> captcha(ServerWebExchange exchange) {
        requireCsrf(exchange);
        prune();
        if (challenges.size() >= 4096) throw limited();
        String alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        StringBuilder answer = new StringBuilder();
        for (int i = 0; i < 5; i++)
            answer.append(alphabet.charAt(random.nextInt(alphabet.length())));
        String id = randomToken();
        challenges.put(
                id,
                new Challenge(
                        token(exchange), answer.toString(), System.currentTimeMillis() + 120000));
        try {
            BufferedImage image = new BufferedImage(170, 54, BufferedImage.TYPE_INT_RGB);
            var graphics = image.createGraphics();
            try {
                graphics.setColor(new Color(255, 247, 240));
                graphics.fillRect(0, 0, 170, 54);
                graphics.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 27));
                for (int i = 0; i < 5; i++) {
                    graphics.setColor(
                            new Color(
                                    80 + random.nextInt(70),
                                    50 + random.nextInt(50),
                                    90 + random.nextInt(70)));
                    graphics.drawString(
                            answer.substring(i, i + 1), 12 + i * 29, 35 + random.nextInt(7));
                }
                for (int i = 0; i < 60; i++) {
                    graphics.setColor(
                            new Color(
                                    180 + random.nextInt(65),
                                    170 + random.nextInt(70),
                                    190 + random.nextInt(60)));
                    graphics.fillOval(random.nextInt(170), random.nextInt(54), 2, 2);
                }
            } finally {
                graphics.dispose();
            }
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            ImageIO.write(image, "png", bytes);
            return Map.of(
                    "id",
                    id,
                    "image",
                    "data:image/png;base64,"
                            + Base64.getEncoder().encodeToString(bytes.toByteArray()));
        } catch (java.io.IOException exception) {
            throw new IllegalStateException("验证码生成失败", exception);
        }
    }

    public synchronized AccountViews.State login(
            ServerWebExchange exchange, AccountRequests.Login request) {
        requireCsrf(exchange);
        String source =
                exchange.getRequest().getRemoteAddress() == null
                        ? "unknown"
                        : exchange.getRequest().getRemoteAddress().getAddress().getHostAddress();
        String key = "account:" + request.username().trim().toLowerCase(java.util.Locale.ROOT);
        String sourceKey = "source:" + source;
        Failure previous = failures.get(key);
        long now = System.currentTimeMillis();
        if (previous != null && previous.until > now && previous.count >= 5) throw limited();
        Failure sourceFailures = failures.get(sourceKey);
        if (sourceFailures != null && sourceFailures.until > now && sourceFailures.count >= 5)
            throw limited();
        int count = previous == null || previous.until <= now ? 0 : previous.count;
        String mode = accounts.setting("captcha_mode", "always");
        if (mode.equals("always") || (mode.equals("adaptive") && count >= 3)) {
            Challenge challenge =
                    request.captchaId() == null ? null : challenges.remove(request.captchaId());
            if (challenge == null
                    || challenge.expires < now
                    || !challenge.token.equals(token(exchange))
                    || request.captcha() == null
                    || !challenge.answer.equalsIgnoreCase(request.captcha().trim()))
                throw new BusinessException(
                        "CAPTCHA_REQUIRED", "验证码不正确或已过期，请换一张再试", HttpStatus.BAD_REQUEST);
        }
        try {
            String id = accounts.authenticate(request.username(), request.password());
            failures.remove(key);
            failures.remove(sourceKey);
            signIn(exchange, id);
            AccountScope.call(
                    id,
                    () -> {
                        accounts.audit("login", id, true);
                        return null;
                    });
            return state(exchange);
        } catch (BusinessException exception) {
            if (exception.getCode().equals("LOGIN_FAILED")) {
                prune();
                if (failures.size() < 9999) {
                    failures.put(key, new Failure(count + 1, now + 900000));
                    failures.put(
                            sourceKey,
                            new Failure(
                                    sourceFailures == null || sourceFailures.until <= now
                                            ? 1
                                            : sourceFailures.count + 1,
                                    now + 900000));
                }
                accounts.audit("login", "", false);
            }
            throw exception;
        }
    }

    public AccountViews.State setup(ServerWebExchange exchange, AccountRequests.Setup request) {
        requireCsrf(exchange);
        if (!local(exchange)) throw denied("请在安装叙芽岛的主机上设置管理员");
        String id = accounts.setup(request);
        signIn(exchange, id);
        return state(exchange);
    }

    public void logout(ServerWebExchange exchange) {
        requireCsrf(exchange);
        String token = token(exchange);
        Session previous = sessions.remove(token);
        if (previous != null && !previous.account.isBlank()) {
            StpUtil.logoutByTokenValue(token);
            python.stopOwner(previous.account);
        }
        cookie(exchange, "", 0);
    }

    public String requireAccount(ServerWebExchange exchange) {
        Session session = validSession(token(exchange), true);
        if (session == null || session.account.isBlank())
            throw new BusinessException("LOGIN_REQUIRED", "请先领取你的小岛通行证", HttpStatus.UNAUTHORIZED);
        return session.account;
    }

    public void requireCsrf(ServerWebExchange exchange) {
        Session session = validSession(token(exchange), false);
        String header = exchange.getRequest().getHeaders().getFirst(CSRF_HEADER);
        if (session == null
                || header == null
                || !java.security.MessageDigest.isEqual(
                        session.csrf.getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                        header.getBytes(java.nio.charset.StandardCharsets.US_ASCII)))
            throw denied("连接状态已变化，请刷新页面后重试");
    }

    private void signIn(ServerWebExchange exchange, String account) {
        String previous = token(exchange);
        if (previous != null) sessions.remove(previous);
        String value =
                StpUtil.getStpLogic()
                        .createLoginSession(
                                account,
                                new SaLoginParameter()
                                        .setTimeout(28800)
                                        .setActiveTimeout(1800)
                                        .setIsConcurrent(true)
                                        .setIsShare(false)
                                        .setIsWriteHeader(false)
                                        .setIsLastingCookie(false));
        sessions.put(
                value,
                new Session(account, randomToken(), accounts.authVersion(account), LOGIN_LIFETIME));
        exchange.getAttributes().put(COOKIE, value);
        cookie(exchange, value, LOGIN_LIFETIME);
    }

    private Session validSession(String token, boolean touch) {
        if (token == null) return null;
        Session session = sessions.get(token);
        long now = System.currentTimeMillis();
        if (session == null) return null;
        boolean expired =
                session.expires <= now
                        || (!session.account.isBlank() && session.active + IDLE_LIFETIME <= now);
        if (!expired && !session.account.isBlank()) {
            expired =
                    StpUtil.getLoginIdByToken(token) == null
                            || accounts.authVersion(session.account) != session.version;
            if (!expired) expired = !accounts.user(session.account).enabled();
        }
        if (expired) {
            sessions.remove(token);
            return null;
        }
        if (touch) {
            session.active = now;
            if (!session.account.isBlank()) StpUtil.getStpLogic().updateLastActiveToNow(token);
        }
        return session;
    }

    private void prune() {
        long now = System.currentTimeMillis();
        sessions.entrySet().removeIf(e -> e.getValue().expires <= now);
        challenges.entrySet().removeIf(e -> e.getValue().expires <= now);
        failures.entrySet().removeIf(e -> e.getValue().until <= now);
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String token(ServerWebExchange exchange) {
        String issued = exchange.getAttribute(COOKIE);
        if (issued != null) return issued;
        var cookie = exchange.getRequest().getCookies().getFirst(COOKIE);
        return cookie == null ? null : cookie.getValue();
    }

    private void cookie(ServerWebExchange exchange, String value, long lifetime) {
        exchange.getResponse()
                .addCookie(
                        ResponseCookie.from(COOKIE, value)
                                .path("/")
                                .httpOnly(true)
                                .sameSite("Strict")
                                .secure(exchange.getRequest().getURI().getScheme().equals("https"))
                                .maxAge(Duration.ofMillis(lifetime))
                                .build());
    }

    public static boolean local(ServerWebExchange exchange) {
        var address = exchange.getRequest().getRemoteAddress();
        return address != null
                && address.getAddress().isLoopbackAddress()
                && exchange.getRequest().getHeaders().getFirst("Forwarded") == null
                && exchange.getRequest().getHeaders().getFirst("X-Forwarded-For") == null;
    }

    public static BusinessException denied(String message) {
        return new BusinessException("ACCESS_DENIED", message, HttpStatus.FORBIDDEN);
    }

    private static BusinessException limited() {
        return new BusinessException(
                "LOGIN_LIMIT", "尝试次数有点多，请休息十五分钟再试", HttpStatus.TOO_MANY_REQUESTS);
    }
}
