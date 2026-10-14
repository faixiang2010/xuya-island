package com.xuya.island;

import com.xuya.island.config.XuyaProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/**
 * 叙芽岛后端入口。业务数据与 AgentScope 会话数据分别保存。
 *
 * @author Codex代码助手
 */
@SpringBootApplication
@EnableConfigurationProperties(XuyaProperties.class)
public class XuyaIslandApplication {

    public static void main(String[] args) {
        SpringApplication.run(XuyaIslandApplication.class, args);
    }
}
