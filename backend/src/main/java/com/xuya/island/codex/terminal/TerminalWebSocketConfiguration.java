package com.xuya.island.codex.terminal;

import com.xuya.island.config.XuyaProperties;
import io.agentscope.core.util.JsonUtils;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.handler.SimpleUrlHandlerMapping;
import org.springframework.web.reactive.socket.CloseStatus;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.WebSocketMessage;
import org.springframework.web.reactive.socket.server.support.WebSocketHandlerAdapter;
import org.springframework.web.util.UriComponentsBuilder;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 浏览器无长期凭证的 WebSocket 握手，消费一次性票据并核对来源。 */
@Configuration
public class TerminalWebSocketConfiguration {
    @Schema(name = "CodexTerminalInput")
    public record Input(String type, String data, int cols, int rows) {}

    @Bean
    public SimpleUrlHandlerMapping terminalWebSocketMapping(
            TerminalService terminals, XuyaProperties properties) {
        WebSocketHandler handler =
                session -> {
                    String origin = session.getHandshakeInfo().getHeaders().getOrigin();
                    if (origin == null || !properties.allowedOrigins().contains(origin))
                        return session.close(CloseStatus.POLICY_VIOLATION);
                    String token =
                            UriComponentsBuilder.fromUri(session.getHandshakeInfo().getUri())
                                    .build()
                                    .getQueryParams()
                                    .getFirst("ticket");
                    String id;
                    try {
                        id = terminals.consumeTicket(token);
                    } catch (RuntimeException exception) {
                        return session.close(CloseStatus.POLICY_VIOLATION);
                    }
                    Mono<Void> receive =
                            session.receive()
                                    .filter(
                                            message ->
                                                    message.getType() == WebSocketMessage.Type.TEXT)
                                    .map(WebSocketMessage::getPayloadAsText)
                                    .concatMap(
                                            text ->
                                                    Mono.fromRunnable(
                                                                    () -> {
                                                                        Input input =
                                                                                JsonUtils
                                                                                        .getJsonCodec()
                                                                                        .fromJson(
                                                                                                text,
                                                                                                Input
                                                                                                        .class);
                                                                        try {
                                                                            if ("input"
                                                                                    .equals(
                                                                                            input
                                                                                                    .type()))
                                                                                terminals.input(
                                                                                        id,
                                                                                        input
                                                                                                .data());
                                                                            else if ("resize"
                                                                                    .equals(
                                                                                            input
                                                                                                    .type()))
                                                                                terminals.resize(
                                                                                        id,
                                                                                        input
                                                                                                .cols(),
                                                                                        input
                                                                                                .rows());
                                                                            else
                                                                                throw new IllegalArgumentException(
                                                                                        "未知终端消息");
                                                                        } catch (
                                                                                java.io.IOException
                                                                                        exception) {
                                                                            throw new IllegalStateException(
                                                                                    "终端输入失败",
                                                                                    exception);
                                                                        }
                                                                    })
                                                            .subscribeOn(
                                                                    Schedulers.boundedElastic()))
                                    .then();
                    Mono<Void> send =
                            session.send(
                                            terminals
                                                    .events(id)
                                                    .map(
                                                            frame ->
                                                                    session.textMessage(
                                                                            JsonUtils.getJsonCodec()
                                                                                    .toJson(
                                                                                            frame))))
                                    .then(session.close());
                    return send.and(receive);
                };
        return new SimpleUrlHandlerMapping(Map.of("/api/v1/codex/terminal/socket", handler), -1);
    }

    @Bean
    public WebSocketHandlerAdapter terminalWebSocketHandlerAdapter() {
        return new WebSocketHandlerAdapter();
    }
}
