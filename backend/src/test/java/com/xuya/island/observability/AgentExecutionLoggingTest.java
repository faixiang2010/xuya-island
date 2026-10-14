package com.xuya.island.observability;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.agentscope.core.agent.Agent;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.event.AgentEndEvent;
import io.agentscope.core.hook.PostActingEvent;
import io.agentscope.core.hook.PreActingEvent;
import io.agentscope.core.message.ToolResultBlock;
import io.agentscope.core.message.ToolUseBlock;
import io.agentscope.core.middleware.AgentInput;
import io.agentscope.core.tool.Toolkit;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.config.Property;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;

/** 在真实Log4j绑定上检查生命周期日志，不运行模型或访问外部Studio。 */
class AgentExecutionLoggingTest {
    @Test
    void recordsLifecycleAndToolMetadataWithoutReadingSensitivePayloads() {
        var logger =
                (org.apache.logging.log4j.core.Logger)
                        LogManager.getLogger("com.xuya.island.codex.execution");
        var messages = new CopyOnWriteArrayList<String>();
        var capture =
                new AbstractAppender("ExecutionFixture", null, null, true, Property.EMPTY_ARRAY) {
                    @Override
                    public void append(LogEvent event) {
                        messages.add(event.getMessage().getFormattedMessage());
                    }
                };
        capture.start();
        var originalLevel = logger.getLevel();
        logger.setLevel(org.apache.logging.log4j.Level.INFO);
        logger.addAppender(capture);
        try {
            Agent agent = mock(Agent.class);
            when(agent.getName()).thenReturn("codex-fixture");
            var context =
                    RuntimeContext.builder()
                            .sessionId("session-fixture")
                            .runId("run-fixture")
                            .build();
            var logging = new AgentExecutionLogging();
            logging.onAgent(
                            agent,
                            context,
                            new AgentInput(List.of()),
                            input -> Flux.just(new AgentEndEvent("reply")))
                    .blockLast();
            var hook = AgentExecutionLogging.toolHook("session-fixture");
            var call =
                    ToolUseBlock.builder()
                            .id("tool-fixture")
                            .name("execute_command")
                            .input(
                                    Map.of(
                                            "command",
                                            "PRIVATE_COMMAND_SENTINEL",
                                            "apiKey",
                                            "PRIVATE_KEY_SENTINEL"))
                            .build();
            hook.onEvent(new PreActingEvent(agent, new Toolkit(), call)).block();
            hook.onEvent(
                            new PostActingEvent(
                                    agent,
                                    new Toolkit(),
                                    call,
                                    ToolResultBlock.text("PRIVATE_OUTPUT_SENTINEL")))
                    .block();
            String combined = String.join("\n", messages);
            assertTrue(combined.contains("Agent started") && combined.contains("Agent ended"));
            assertTrue(
                    combined.contains("Tool started")
                            && combined.contains("Tool ended")
                            && combined.contains("execute_command"));
            assertTrue(combined.contains("session-fixture") && combined.contains("durationMs="));
            assertFalse(combined.contains("PRIVATE_"));
        } finally {
            logger.removeAppender(capture);
            logger.setLevel(originalLevel);
            capture.stop();
        }
    }
}
