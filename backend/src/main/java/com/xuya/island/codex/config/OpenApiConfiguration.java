package com.xuya.island.codex.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** OpenAPI 描述真实 REST；凭据由本机用户显式输入且不持久保存。 */
@Configuration(proxyBeanMethods = false)
public class OpenApiConfiguration {
    @Bean
    OpenAPI productOpenApi() {
        return new OpenAPI()
                .info(new Info().title("叙芽岛与 Codex 工作台 API").version("0.3.0"))
                .components(
                        new Components()
                                .addSecuritySchemes(
                                        "codexBearer",
                                        new SecurityScheme()
                                                .type(SecurityScheme.Type.HTTP)
                                                .scheme("bearer")
                                                .description("仅使用本机 Codex 短效访问凭据，切勿输入模型 API Key")));
    }

    @Bean
    GroupedOpenApi agentOpenApi() {
        return GroupedOpenApi.builder()
                .group("agent-v1")
                .pathsToMatch(
                        "/api/v1/conversations/**", "/api/v1/agents/**", "/api/v1/capabilities")
                .build();
    }

    @Bean
    GroupedOpenApi codexOpenApi() {
        return GroupedOpenApi.builder().group("codex-v1").pathsToMatch("/api/v1/codex/**").build();
    }

    @Bean
    GroupedOpenApi teachingOpenApi() {
        return GroupedOpenApi.builder()
                .group("teaching-legacy")
                .pathsToMatch("/api/**")
                .pathsToExclude("/api/v1/**")
                .build();
    }
}
