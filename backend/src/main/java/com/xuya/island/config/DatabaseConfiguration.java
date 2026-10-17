package com.xuya.island.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.support.TransactionTemplate;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

/**
 * SQLite 连接与版本化迁移。所有 SQL 操作由业务服务在弹性线程池执行。
 *
 * <p>迁移脚本放在 {@code db/migration} 下，按 {@code V<序号>__<说明>.sql} 命名即可：版本从文件名解析、
 * 按序号排序后逐个执行，序号必须唯一且连续。这里不再登记脚本清单或版本常量，因此新增脚本只需要放文件。
 *
 * @author Codex代码助手
 */
@Configuration
public class DatabaseConfiguration {

    /**
     * 迁移脚本的定位与命名约定；缺号按“脚本丢失”处理并拒绝启动，避免静默跳过某一次迁移。
     */
    private static final String MIGRATION_LOCATION = "classpath*:db/migration/V*__*.sql";

    private static final Pattern MIGRATION_NAME = Pattern.compile("^V(\\d+)__[^/]+\\.sql$");
    private static final int BUSY_TIMEOUT_MILLIS = 5000;

    @Bean
    @DependsOn("dataDirectoryLock")
    DataSource dataSource(XuyaProperties properties) {
        return openDatabase(properties.dataDir().resolve("db/xuya.db"));
    }

    @Bean
    JdbcClient jdbcClient(DataSource dataSource) {
        return JdbcClient.create(dataSource);
    }

    @Bean
    TransactionTemplate transactionTemplate(DataSource dataSource) {
        return new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    }

    /**
     * 本次构建内置的最高迁移版本；数据库停在它上面才说明脚本都跑完了。
     *
     * @return 最高迁移版本号
     */
    public static int latestMigrationVersion() {
        return discoverMigrations().lastKey();
    }

    /**
     * 打开数据库并迁移；测试也使用同一实现，不以 H2 替代。
     *
     * @param databaseFile SQLite 文件路径
     * @return 已初始化的数据源
     */
    public static DataSource openDatabase(Path databaseFile) {
        Path absoluteFile = databaseFile.toAbsolutePath().normalize();
        try {
            Files.createDirectories(absoluteFile.getParent());
        } catch (IOException exception) {
            throw new IllegalStateException("无法创建数据库目录", exception);
        }
        SQLiteConfig config = new SQLiteConfig();
        config.enforceForeignKeys(true);
        config.setBusyTimeout(BUSY_TIMEOUT_MILLIS);
        config.setJournalMode(SQLiteConfig.JournalMode.WAL);
        SQLiteDataSource source = new SQLiteDataSource(config);
        source.setUrl("jdbc:sqlite:" + absoluteFile);
        JdbcClient client = JdbcClient.create(source);
        client.sql("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)")
                .update();
        int currentVersion =
                client.sql("SELECT COALESCE(MAX(version), 0) FROM schema_version")
                        .query(Integer.class)
                        .single();
        SortedMap<Integer, Resource> migrations = discoverMigrations();
        int latestVersion = migrations.lastKey();
        if (currentVersion > latestVersion) {
            throw new IllegalStateException("数据库版本较新，请使用对应版本的叙芽岛");
        }
        if (currentVersion > 0 && currentVersion < latestVersion) {
            Path backupDirectory = absoluteFile.getParent().getParent().resolve("backups");
            try {
                Files.createDirectories(backupDirectory);
            } catch (IOException exception) {
                throw new IllegalStateException("无法创建升级备份目录，已停止升级", exception);
            }
            Path backup =
                    backupDirectory.resolve(
                            "xuya-v" + currentVersion + "-" + System.nanoTime() + ".db");
            // VACUUM INTO 生成一致性副本，包含 WAL 中的已提交数据，不直接复制活动数据库文件。
            client.sql("VACUUM INTO :file").param("file", backup.toString()).update();
        }
        for (int version = currentVersion + 1; version <= latestVersion; version++) {
            int nextVersion = version;
            Resource script = migrations.get(version);
            new TransactionTemplate(new DataSourceTransactionManager(source))
                    .executeWithoutResult(
                            status -> {
                                new ResourceDatabasePopulator(script).execute(source);
                                client.sql("INSERT INTO schema_version (version) VALUES (:version)")
                                        .param("version", nextVersion)
                                        .update();
                            });
        }
        return source;
    }

    /** 从 classpath 发现全部迁移脚本：按序号排序，并校验命名、唯一与连续。 */
    private static SortedMap<Integer, Resource> discoverMigrations() {
        Resource[] scripts;
        try {
            scripts = new PathMatchingResourcePatternResolver().getResources(MIGRATION_LOCATION);
        } catch (IOException exception) {
            throw new IllegalStateException("无法读取数据库迁移脚本", exception);
        }
        if (scripts.length == 0) {
            throw new IllegalStateException("没有找到任何数据库迁移脚本");
        }
        SortedMap<Integer, Resource> migrations = new TreeMap<>();
        for (Resource script : scripts) {
            int version = migrationVersion(script.getFilename());
            if (migrations.put(version, script) != null) {
                throw new IllegalStateException("数据库迁移版本重复：V" + version);
            }
        }
        int expected = 1;
        for (Integer version : migrations.keySet()) {
            if (version != expected) {
                throw new IllegalStateException("数据库迁移版本不连续：缺少 V" + expected);
            }
            expected++;
        }
        return migrations;
    }

    private static int migrationVersion(String filename) {
        Matcher matcher = filename == null ? null : MIGRATION_NAME.matcher(filename);
        if (matcher == null || !matcher.matches()) {
            throw new IllegalStateException("迁移脚本需命名为 V<序号>__<说明>.sql：" + filename);
        }
        return Integer.parseInt(matcher.group(1));
    }
}
