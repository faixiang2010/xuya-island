package com.xuya.island.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.support.TransactionTemplate;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

/**
 * SQLite 连接与版本化迁移。所有 SQL 操作由业务服务在弹性线程池执行。
 *
 * @author Codex代码助手
 */
@Configuration
public class DatabaseConfiguration {

    private static final int SCHEMA_VERSION = 9;
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
        if (currentVersion > SCHEMA_VERSION) {
            throw new IllegalStateException("数据库版本较新，请使用对应版本的叙芽岛");
        }
        if (currentVersion > 0 && currentVersion < SCHEMA_VERSION) {
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
        String[] migrations = {
            "V1__initial.sql",
            "V2__learning.sql",
            "V3__studio.sql",
            "V4__codex.sql",
            "V5__conversation_pins.sql",
            "V6__family_accounts.sql",
            "V7__native_execution.sql",
            "V8__learning_growth.sql",
            "V9__learning_snapshots.sql"
        };
        for (int version = currentVersion + 1; version <= SCHEMA_VERSION; version++) {
            int nextVersion = version;
            new TransactionTemplate(new DataSourceTransactionManager(source))
                    .executeWithoutResult(
                            status -> {
                                new ResourceDatabasePopulator(
                                                new ClassPathResource(
                                                        "db/migration/"
                                                                + migrations[nextVersion - 1]))
                                        .execute(source);
                                client.sql("INSERT INTO schema_version (version) VALUES (:version)")
                                        .param("version", nextVersion)
                                        .update();
                            });
        }
        return source;
    }
}
