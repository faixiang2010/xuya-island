package com.xuya.island.account;

import java.util.List;

/** 身份与管理视图；永不包含密码哈希或认证令牌。 */
public final class AccountViews {
    private AccountViews() {}

    public record User(
            String id,
            String username,
            String nickname,
            boolean enabled,
            boolean changePassword,
            List<String> roles,
            List<String> permissions) {}

    public record Menu(
            String id,
            String parentId,
            String title,
            String path,
            String permission,
            String kind,
            int sortOrder,
            boolean enabled) {}

    public record Role(
            String id,
            String name,
            String description,
            boolean enabled,
            boolean protectedRole,
            List<String> menuIds) {}

    public record State(
            boolean initialized,
            boolean localSetup,
            boolean localHost,
            String captchaMode,
            String csrf,
            User user,
            List<Menu> menus) {}
}
