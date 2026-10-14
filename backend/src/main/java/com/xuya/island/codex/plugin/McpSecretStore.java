package com.xuya.island.codex.plugin;

import com.xuya.island.codex.workspace.PlatformStore;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.AclEntry;
import java.nio.file.attribute.AclEntryPermission;
import java.nio.file.attribute.AclEntryType;
import java.nio.file.attribute.AclFileAttributeView;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/** MCP 凭证 AES-GCM 加密；密钥是独立私有文件，不属于工作区或可下载产物。 */
@Component
public class McpSecretStore {
    private final PlatformStore store;
    private final SecureRandom random = new SecureRandom();

    public McpSecretStore(PlatformStore store) {
        this.store = store;
    }

    public synchronized Map<String, String> seal(Map<String, String> values) throws IOException {
        Map<String, String> output = new LinkedHashMap<>();
        for (var item : values.entrySet()) output.put(item.getKey(), encode(item.getValue()));
        return Map.copyOf(output);
    }

    public synchronized Map<String, String> open(Map<String, String> values) throws IOException {
        Map<String, String> output = new LinkedHashMap<>();
        for (var item : values.entrySet()) output.put(item.getKey(), decode(item.getValue()));
        return Map.copyOf(output);
    }

    private byte[] key() throws IOException {
        Path directory = store.root().resolve("mcp/private");
        Files.createDirectories(directory);
        Path key = directory.resolve("key.bin");
        if (Files.isSymbolicLink(key)) throw new IOException("MCP private key cannot be a link");
        if (!Files.exists(key)) {
            byte[] bytes = new byte[32];
            random.nextBytes(bytes);
            Files.write(key, bytes, StandardOpenOption.CREATE_NEW);
        }
        var acl = Files.getFileAttributeView(key, AclFileAttributeView.class);
        if (acl != null)
            acl.setAcl(
                    List.of(
                            AclEntry.newBuilder()
                                    .setType(AclEntryType.ALLOW)
                                    .setPrincipal(acl.getOwner())
                                    .setPermissions(EnumSet.allOf(AclEntryPermission.class))
                                    .build()));
        else Files.setPosixFilePermissions(key, PosixFilePermissions.fromString("rw-------"));
        byte[] bytes = Files.readAllBytes(key);
        if (bytes.length != 32) throw new IOException("MCP private key invalid");
        return bytes;
    }

    private String encode(String text) throws IOException {
        try {
            byte[] nonce = new byte[12];
            random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(key(), "AES"),
                    new GCMParameterSpec(128, nonce));
            return Base64.getEncoder().encodeToString(nonce)
                    + "."
                    + Base64.getEncoder()
                            .encodeToString(
                                    cipher.doFinal(
                                            text.getBytes(
                                                    java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException exception) {
            throw new IOException("MCP credentials could not be encrypted");
        }
    }

    private String decode(String text) throws IOException {
        try {
            String[] parts = text.split("\\.", 2);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    new SecretKeySpec(key(), "AES"),
                    new GCMParameterSpec(128, Base64.getDecoder().decode(parts[0])));
            return new String(
                    cipher.doFinal(Base64.getDecoder().decode(parts[1])),
                    java.nio.charset.StandardCharsets.UTF_8);
        } catch (java.security.GeneralSecurityException | RuntimeException exception) {
            throw new IOException("MCP credentials could not be decrypted");
        }
    }
}
