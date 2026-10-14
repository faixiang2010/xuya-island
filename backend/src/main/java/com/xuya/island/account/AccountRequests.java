package com.xuya.island.account;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 明确区分登录凭据、账户管理和角色授权的入参。 */
public final class AccountRequests {
    private AccountRequests() {}

    public record Login(
            @NotBlank @Size(max = 40) String username,
            @NotBlank @Size(max = 64) String password,
            String captchaId,
            String captcha) {}

    public record Setup(
            @NotBlank @Size(max = 40) String username,
            @NotBlank @Size(max = 40) String nickname,
            @NotBlank @Size(min = 8, max = 64) String password) {}

    public record SaveUser(
            @NotBlank @Size(max = 40) String username,
            @NotBlank @Size(max = 40) String nickname,
            String password,
            boolean enabled,
            List<String> roles) {}

    public record Password(
            @NotBlank String oldPassword, @NotBlank @Size(min = 8, max = 64) String newPassword) {}

    public record SaveRole(
            @NotBlank @Size(max = 40) String name,
            @Size(max = 200) String description,
            boolean enabled,
            List<String> menuIds) {}

    public record SaveMenu(
            @NotBlank @Size(max = 40) String title,
            String parentId,
            String path,
            String permission,
            String kind,
            int sortOrder,
            boolean enabled) {}
}
