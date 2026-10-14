package com.xuya.island.agentapi.service;

import com.xuya.island.account.AccountScope;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** 受信本机成人入口的短效能力凭据；不存浏览器持久存储，不进入URL。 */
@Service
public class AccessService {
    private static final long LIFETIME_MS = 30 * 60 * 1000L;
    private final SecureRandom random = new SecureRandom();

    private record Credential(String owner, long expires) {}

    private final Map<String, Credential> tokens = new ConcurrentHashMap<>();

    public synchronized Map<String, Object> issue() {
        long now = System.currentTimeMillis();
        tokens.entrySet().removeIf(entry -> entry.getValue().expires() <= now);
        if (tokens.size() >= 1024)
            throw new ApiFailure(HttpStatus.TOO_MANY_REQUESTS, "ACCESS_LIMIT", "本机连接过多，请稍后重试");
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        long expires = now + LIFETIME_MS;
        tokens.put(hash(token), new Credential(AccountScope.id(), expires));
        return Map.of("token", token, "expiresAt", Instant.ofEpochMilli(expires).toString());
    }

    public boolean accepts(String authorization) {
        if (authorization == null
                || !authorization.startsWith("Bearer ")
                || authorization.length() > 256) return false;
        Credential credential = tokens.get(hash(authorization.substring(7)));
        return credential != null
                && credential.expires() > System.currentTimeMillis()
                && credential.owner().equals(AccountScope.id());
    }

    private String hash(String value) {
        try {
            return Base64.getEncoder()
                    .encodeToString(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("缺少本机凭据算法", exception);
        }
    }
}
