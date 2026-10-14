package com.xuya.island.account;

import cn.dev33.satoken.stp.StpUtil;
import com.xuya.island.common.BusinessException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** 统一家庭账户及RBAC；同步数据库操作由控制器/鉴权入口调度到弹性线程池。 */
@Service
public class AccountService {
    private final JdbcClient jdbc;
    private final TransactionTemplate transaction;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);

    public AccountService(JdbcClient jdbc, TransactionTemplate transaction) {
        this.jdbc = jdbc;
        this.transaction = transaction;
    }

    public boolean initialized() {
        return jdbc.sql("SELECT COUNT(*) FROM sys_users").query(Integer.class).single() > 0;
    }

    public List<String> roles(String id) {
        return jdbc.sql(
                        "SELECT r.id FROM sys_roles r JOIN sys_user_roles ur ON ur.role_id=r.id WHERE ur.user_id=:id AND r.enabled=1 ORDER BY r.id")
                .param("id", id)
                .query(String.class)
                .list();
    }

    public List<String> permissions(String id) {
        if (roles(id).contains("super-admin")) return List.of("*");
        return jdbc.sql(
                        "SELECT DISTINCT m.permission FROM sys_user_roles ur JOIN sys_roles r ON r.id=ur.role_id JOIN sys_role_menus rm ON rm.role_id=r.id JOIN sys_menus m ON m.id=rm.menu_id WHERE ur.user_id=:id AND r.enabled=1 AND m.enabled=1 AND m.permission!='' ORDER BY m.permission")
                .param("id", id)
                .query(String.class)
                .list();
    }

    public AccountViews.User user(String id) {
        return jdbc.sql("SELECT * FROM sys_users WHERE id=:id")
                .param("id", id)
                .query(
                        (rs, row) ->
                                new AccountViews.User(
                                        rs.getString("id"),
                                        rs.getString("username"),
                                        rs.getString("nickname"),
                                        rs.getBoolean("enabled"),
                                        rs.getBoolean("change_password"),
                                        roles(id),
                                        permissions(id)))
                .optional()
                .orElseThrow(() -> missing("账户不存在"));
    }

    public int authVersion(String id) {
        return jdbc.sql("SELECT auth_version FROM sys_users WHERE id=:id")
                .param("id", id)
                .query(Integer.class)
                .optional()
                .orElse(-1);
    }

    public String authenticate(String username, String password) {
        var ids =
                jdbc.sql("SELECT id FROM sys_users WHERE username=:name COLLATE NOCASE")
                        .param("name", username.trim())
                        .query(String.class)
                        .list();
        if (ids.isEmpty()) {
            encoder.matches(
                    password, "$2a$12$wJi4VPBCQjhzRlUz3RtKh.fgnAjMR65xnXHcaHo4v1LnjLcFCL/Kq");
            throw invalidLogin();
        }
        String id = ids.get(0);
        String hash =
                jdbc.sql("SELECT password_hash FROM sys_users WHERE id=:id")
                        .param("id", id)
                        .query(String.class)
                        .single();
        if (!encoder.matches(password, hash) || !user(id).enabled()) throw invalidLogin();
        return id;
    }

    public synchronized String setup(AccountRequests.Setup request) {
        if (initialized()) throw conflict("管理员已经设置，请登录");
        return transaction.execute(
                status ->
                        createUser(
                                new AccountRequests.SaveUser(
                                        request.username(),
                                        request.nickname(),
                                        request.password(),
                                        true,
                                        List.of("super-admin", "learner")),
                                false));
    }

    public List<AccountViews.User> users() {
        return jdbc
                .sql("SELECT id FROM sys_users ORDER BY created_at")
                .query(String.class)
                .list()
                .stream()
                .map(this::user)
                .toList();
    }

    public synchronized String createUser(AccountRequests.SaveUser request, boolean requireChange) {
        validateUsername(request.username());
        validatePassword(request.password());
        List<String> selected = checkedRoles(request.roles());
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        return transaction.execute(
                status -> {
                    if (jdbc.sql(
                                            "SELECT COUNT(*) FROM sys_users WHERE username=:name COLLATE NOCASE")
                                    .param("name", request.username())
                                    .query(Integer.class)
                                    .single()
                            > 0) throw conflict("账号已经存在，请换一个账号");
                    jdbc.sql(
                                    "INSERT INTO sys_users(id,username,nickname,password_hash,enabled,change_password,created_at,updated_at) VALUES(:id,:name,:nick,:hash,:enabled,:change,:now,:now)")
                            .param("id", id)
                            .param("name", request.username().trim())
                            .param("nick", request.nickname().trim())
                            .param("hash", encoder.encode(request.password()))
                            .param("enabled", request.enabled())
                            .param("change", requireChange)
                            .param("now", now)
                            .update();
                    assignRoles(id, selected);
                    if (selected.contains("learner")) {
                        ensureLearner(id);
                        if (!selected.contains("super-admin")) claimLegacy(id);
                    }
                    if (selected.contains("super-admin")) {
                        if (setting("legacy_codex_owner", "").isBlank())
                            setSetting("legacy_codex_owner", id);
                        jdbc.sql("UPDATE codex_conversations SET owner_id=:id WHERE owner_id=''")
                                .param("id", id)
                                .update();
                    }
                    audit("user:create", id, true);
                    return id;
                });
    }

    public synchronized void saveUser(String id, AccountRequests.SaveUser request) {
        AccountViews.User previous = user(id);
        List<String> selected = checkedRoles(request.roles());
        if (!previous.username().equals(request.username().trim()))
            throw invalid("账号创建后不能修改，请修改昵称");
        if (request.password() != null && !request.password().isBlank())
            validatePassword(request.password());
        transaction.executeWithoutResult(
                status -> {
                    protectLastAdmin(id, selected.contains("super-admin") && request.enabled());
                    jdbc.sql(
                                    "UPDATE sys_users SET nickname=:nick,enabled=:enabled,auth_version=auth_version+1,updated_at=:now WHERE id=:id")
                            .param("nick", request.nickname().trim())
                            .param("enabled", request.enabled())
                            .param("now", Instant.now().toString())
                            .param("id", id)
                            .update();
                    if (request.password() != null && !request.password().isBlank())
                        jdbc.sql(
                                        "UPDATE sys_users SET password_hash=:hash,change_password=1 WHERE id=:id")
                                .param("hash", encoder.encode(request.password()))
                                .param("id", id)
                                .update();
                    assignRoles(id, selected);
                    if (selected.contains("learner")) {
                        ensureLearner(id);
                        if (!selected.contains("super-admin")) claimLegacy(id);
                    }
                    audit("user:update", id, true);
                });
        StpUtil.kickout(id);
    }

    public void changePassword(String id, AccountRequests.Password request) {
        validatePassword(request.newPassword());
        AccountViews.User current = user(id);
        authenticate(current.username(), request.oldPassword());
        jdbc.sql(
                        "UPDATE sys_users SET password_hash=:hash,change_password=0,auth_version=auth_version+1,updated_at=:now WHERE id=:id")
                .param("hash", encoder.encode(request.newPassword()))
                .param("now", Instant.now().toString())
                .param("id", id)
                .update();
        StpUtil.kickout(id);
        audit("password:change", id, true);
    }

    public List<AccountViews.Menu> menus() {
        return jdbc.sql("SELECT * FROM sys_menus ORDER BY sort_order,id")
                .query(
                        (rs, row) ->
                                new AccountViews.Menu(
                                        rs.getString("id"),
                                        rs.getString("parent_id"),
                                        rs.getString("title"),
                                        rs.getString("path"),
                                        rs.getString("permission"),
                                        rs.getString("kind"),
                                        rs.getInt("sort_order"),
                                        rs.getBoolean("enabled")))
                .list();
    }

    public List<AccountViews.Menu> visibleMenus(String id) {
        Set<String> allowed = new HashSet<>(permissions(id));
        boolean manager = roles(id).contains("super-admin");
        return menus().stream()
                .filter(menu -> manager || !menu.path().equals("/admin"))
                .filter(
                        m ->
                                m.enabled()
                                        && !m.kind().equals("action")
                                        && (allowed.contains("*")
                                                || m.permission().isBlank()
                                                || allowed.contains(m.permission())))
                .toList();
    }

    public List<AccountViews.Role> allRoles() {
        return jdbc.sql("SELECT * FROM sys_roles ORDER BY protected DESC,id")
                .query(
                        (rs, row) -> {
                            String id = rs.getString("id");
                            return new AccountViews.Role(
                                    id,
                                    rs.getString("name"),
                                    rs.getString("description"),
                                    rs.getBoolean("enabled"),
                                    rs.getBoolean("protected"),
                                    jdbc.sql("SELECT menu_id FROM sys_role_menus WHERE role_id=:id")
                                            .param("id", id)
                                            .query(String.class)
                                            .list());
                        })
                .list();
    }

    public String saveRole(String id, AccountRequests.SaveRole request) {
        String actual = id == null ? "role-" + UUID.randomUUID() : id;
        if (actual.equals("super-admin")) throw invalid("超级管理员的内置权限不能修改");
        List<String> ids =
                request.menuIds() == null
                        ? List.of()
                        : request.menuIds().stream().distinct().toList();
        Set<String> registered =
                new HashSet<>(menus().stream().map(AccountViews.Menu::id).toList());
        if (!registered.containsAll(ids)) throw invalid("菜单选择无效");
        transaction.executeWithoutResult(
                status -> {
                    jdbc.sql(
                                    "INSERT INTO sys_roles(id,name,description,enabled,protected) VALUES(:id,:name,:description,:enabled,0) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,enabled=excluded.enabled")
                            .param("id", actual)
                            .param("name", request.name())
                            .param(
                                    "description",
                                    request.description() == null ? "" : request.description())
                            .param("enabled", request.enabled())
                            .update();
                    jdbc.sql("DELETE FROM sys_role_menus WHERE role_id=:id")
                            .param("id", actual)
                            .update();
                    for (String menu : ids)
                        jdbc.sql("INSERT INTO sys_role_menus VALUES(:role,:menu)")
                                .param("role", actual)
                                .param("menu", menu)
                                .update();
                    audit("role:save", actual, true);
                });
        return actual;
    }

    public String saveMenu(String id, AccountRequests.SaveMenu request) {
        String actual = id == null ? "menu-" + UUID.randomUUID() : id;
        String path = request.path() == null ? "" : request.path();
        String permission = request.permission() == null ? "" : request.permission();
        Set<String> paths =
                Set.of(
                        "",
                        "/",
                        "/games",
                        "/classroom",
                        "/adventure/town-cup-order",
                        "/studio",
                        "/works",
                        "/growth",
                        "/codex",
                        "/admin");
        Set<String> codes =
                Set.of(
                        "",
                        "learning:read",
                        "games:use",
                        "classroom:use",
                        "adventure:use",
                        "studio:use",
                        "works:manage",
                        "execution:run",
                        "codex:access",
                        "codex:workspace",
                        "codex:terminal",
                        "codex:plugin",
                        "system:manage",
                        "system:python",
                        "rewards:manage");
        if (!paths.contains(path)
                || !codes.contains(permission)
                || !Set.of("menu", "directory", "action").contains(request.kind()))
            throw invalid("请选择已登记的页面和权限");
        if (actual.equals(request.parentId())) throw invalid("菜单不能把自己作为父节点");
        Map<String, AccountViews.Menu> hierarchy = new java.util.HashMap<>();
        menus().forEach(menu -> hierarchy.put(menu.id(), menu));
        String ancestor = request.parentId();
        Set<String> visited = new HashSet<>();
        while (ancestor != null && !ancestor.isBlank()) {
            if (ancestor.equals(actual) || !visited.add(ancestor)) throw invalid("菜单层级不能形成循环");
            var parent = hierarchy.get(ancestor);
            if (parent == null) throw invalid("父菜单不存在");
            ancestor = parent.parentId();
        }
        if (request.parentId() != null
                && !request.parentId().isBlank()
                && menus().stream().noneMatch(m -> m.id().equals(request.parentId())))
            throw invalid("父菜单不存在");
        jdbc.sql(
                        "INSERT INTO sys_menus(id,parent_id,title,path,permission,kind,sort_order,enabled) VALUES(:id,:parent,:title,:path,:permission,:kind,:sort,:enabled) ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,title=excluded.title,path=excluded.path,permission=excluded.permission,kind=excluded.kind,sort_order=excluded.sort_order,enabled=excluded.enabled")
                .param("id", actual)
                .param("parent", request.parentId())
                .param("title", request.title())
                .param("path", path)
                .param("permission", permission)
                .param("kind", request.kind())
                .param("sort", request.sortOrder())
                .param("enabled", request.enabled())
                .update();
        audit("menu:save", actual, true);
        return actual;
    }

    public String setting(String key, String fallback) {
        return jdbc.sql("SELECT value FROM sys_settings WHERE key=:key")
                .param("key", key)
                .query(String.class)
                .optional()
                .orElse(fallback);
    }

    public void setSetting(String key, String value) {
        jdbc.sql(
                        "INSERT INTO sys_settings VALUES(:key,:value) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
                .param("key", key)
                .param("value", value)
                .update();
    }

    public List<Map<String, Object>> auditLog() {
        return jdbc.sql(
                        "SELECT a.id,a.action,a.target_id,a.success,a.created_at,COALESCE(u.nickname,'') actor FROM sys_audit a LEFT JOIN sys_users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200")
                .query(
                        (rs, row) ->
                                Map.<String, Object>of(
                                        "id",
                                        rs.getLong("id"),
                                        "action",
                                        rs.getString("action"),
                                        "target",
                                        rs.getString("target_id"),
                                        "success",
                                        rs.getBoolean("success"),
                                        "createdAt",
                                        rs.getString("created_at"),
                                        "actor",
                                        rs.getString("actor")))
                .list();
    }

    public void audit(String action, String target, boolean success) {
        jdbc.sql(
                        "INSERT INTO sys_audit(actor_id,action,target_id,success,created_at) VALUES(:actor,:action,:target,:success,:now)")
                .param("actor", AccountScope.id())
                .param("action", action)
                .param("target", target)
                .param("success", success)
                .param("now", Instant.now().toString())
                .update();
    }

    private void assignRoles(String id, List<String> roles) {
        jdbc.sql("DELETE FROM sys_user_roles WHERE user_id=:id").param("id", id).update();
        for (String role : roles)
            jdbc.sql("INSERT INTO sys_user_roles VALUES(:id,:role)")
                    .param("id", id)
                    .param("role", role)
                    .update();
    }

    private List<String> checkedRoles(List<String> ids) {
        List<String> selected = ids == null ? List.of("learner") : ids.stream().distinct().toList();
        Set<String> registered =
                new HashSet<>(
                        jdbc.sql("SELECT id FROM sys_roles WHERE enabled=1")
                                .query(String.class)
                                .list());
        if (!registered.containsAll(selected)) throw invalid("角色选择无效");
        return selected;
    }

    private void protectLastAdmin(String id, boolean remainsAdmin) {
        if (remainsAdmin || !roles(id).contains("super-admin")) return;
        int count =
                jdbc.sql(
                                "SELECT COUNT(*) FROM sys_users u JOIN sys_user_roles ur ON u.id=ur.user_id WHERE u.enabled=1 AND ur.role_id='super-admin' AND u.id!=:id")
                        .param("id", id)
                        .query(Integer.class)
                        .single();
        if (count == 0) throw conflict("至少需要保留一个有效超级管理员");
    }

    private void ensureLearner(String id) {
        jdbc.sql(
                        "INSERT INTO learner_profiles(id,account_id,created_at) VALUES(:id,:id,:now) ON CONFLICT(account_id) DO NOTHING")
                .param("id", id)
                .param("now", Instant.now().toString())
                .update();
    }

    private void claimLegacy(String id) {
        if (!setting("legacy_learning_owner", "").isBlank()) return;
        for (String table :
                List.of(
                        "works",
                        "attempts",
                        "exercise_attempts",
                        "lesson_progress",
                        "studio_projects"))
            jdbc.sql("UPDATE " + table + " SET owner_id=:id WHERE owner_id=''")
                    .param("id", id)
                    .update();
        setSetting("legacy_learning_owner", id);
    }

    private void validateUsername(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_\\-]{3,40}"))
            throw invalid("账号请使用3至40位字母、数字、下划线或短横线");
    }

    private void validatePassword(String value) {
        if (value == null
                || value.length() < 8
                || value.length() > 64
                || value.getBytes(StandardCharsets.UTF_8).length > 72)
            throw invalid("密码需要8至64个字符，UTF-8长度不超过72字节");
    }

    public static BusinessException invalid(String message) {
        return new BusinessException("INVALID_INPUT", message, HttpStatus.BAD_REQUEST);
    }

    public static BusinessException missing(String message) {
        return new BusinessException("NOT_FOUND", message, HttpStatus.NOT_FOUND);
    }

    public static BusinessException conflict(String message) {
        return new BusinessException("CONFLICT", message, HttpStatus.CONFLICT);
    }

    private static BusinessException invalidLogin() {
        return new BusinessException("LOGIN_FAILED", "账号或密码不正确，请再看看", HttpStatus.UNAUTHORIZED);
    }
}
