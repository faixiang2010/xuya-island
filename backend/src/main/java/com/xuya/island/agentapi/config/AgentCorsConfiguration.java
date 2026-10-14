package com.xuya.island.agentapi.config;

import com.xuya.island.config.XuyaProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.config.CorsRegistry;
import org.springframework.web.reactive.config.WebFluxConfigurer;

/** 显式配置受信前端，便于迁移界面；没有任意来源通配符。 */
@Configuration(proxyBeanMethods = false)
public class AgentCorsConfiguration implements WebFluxConfigurer {
    private final XuyaProperties properties;

    public AgentCorsConfiguration(XuyaProperties properties) {
        this.properties = properties;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/v1/**")
                .allowedOrigins(properties.allowedOrigins().toArray(String[]::new))
                .allowedMethods("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("Authorization", "Content-Type", "Last-Event-ID", "X-Request-Id")
                .exposedHeaders("X-Request-Id", "Content-Disposition")
                .maxAge(600);
    }
}
