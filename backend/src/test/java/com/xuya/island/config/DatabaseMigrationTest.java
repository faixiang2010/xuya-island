package com.xuya.island.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * 迁移脚本按文件名自动发现：新增脚本只需要放进 {@code db/migration}，不需要再登记清单或改版本常量。
 * 这里守住“发现 → 按序号执行 → 登记版本”这条链，并覆盖老安装升级。
 */
class DatabaseMigrationTest {

    @TempDir private Path directory;

    @Test
    void freshDatabaseAppliesEveryDiscoveredMigrationExactlyOnceAndStaysPut() {
        Path file = directory.resolve("db/xuya.db");
        int latest = DatabaseConfiguration.latestMigrationVersion();
        assertTrue(latest >= 10, "V1 起的迁移脚本应全部被发现，实际最高版本：" + latest);

        JdbcClient client = JdbcClient.create(DatabaseConfiguration.openDatabase(file));
        assertEquals(
                latest,
                client.sql("SELECT MAX(version) FROM schema_version").query(Integer.class).single(),
                "数据库应停在本次构建内置的最高迁移版本");
        assertEquals(
                latest,
                client.sql("SELECT COUNT(*) FROM schema_version").query(Integer.class).single(),
                "序号连续且每个只执行一次，版本行数应等于最高版本号");

        // 再次启动不重复执行、不追加版本。
        DatabaseConfiguration.openDatabase(file);
        assertEquals(
                latest,
                client.sql("SELECT COUNT(*) FROM schema_version").query(Integer.class).single(),
                "重复启动不能重复登记迁移");
    }

    @Test
    void appliesPendingMigrationWhenDatabaseIsOneVersionBehind() throws IOException {
        Path file = directory.resolve("db/xuya.db");
        JdbcClient client = JdbcClient.create(DatabaseConfiguration.openDatabase(file));
        int latest = DatabaseConfiguration.latestMigrationVersion();
        // 把库退回上一个版本，模拟老安装升级：待执行集合就是被删掉的那一版。
        client.sql("DELETE FROM schema_version WHERE version = :version")
                .param("version", latest)
                .update();
        // 当前最新迁移 V12 建立 game_scores；新增迁移后同步调整这里要撤回的对象。
        client.sql("DROP TABLE game_scores").update();

        JdbcClient upgraded = JdbcClient.create(DatabaseConfiguration.openDatabase(file));
        int upgradedVersion =
                upgraded.sql("SELECT MAX(version) FROM schema_version")
                        .query(Integer.class)
                        .single();
        assertEquals(latest, upgradedVersion, "老库打开后应补上待执行的迁移");
        int versionRows =
                upgraded.sql("SELECT COUNT(*) FROM schema_version").query(Integer.class).single();
        assertEquals(versionRows, latest, "补迁移不应重复登记其它版本");
        assertEquals(
                1,
                upgraded.sql(
                                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='game_scores'")
                        .query(Integer.class)
                        .single(),
                "待执行的迁移要真的执行，而不只是登记版本号");
        try (var backups = Files.list(directory.resolve("backups"))) {
            assertEquals(1, backups.count(), "升级前应做一次一致性备份");
        }
    }
}
