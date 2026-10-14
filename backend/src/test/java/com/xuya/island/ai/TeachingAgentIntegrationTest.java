package com.xuya.island.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.xuya.island.ai.agent.TeachingAgentFactory;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.message.Msg;
import io.agentscope.core.message.TextBlock;
import io.agentscope.core.model.ChatResponse;
import io.agentscope.core.model.Model;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import reactor.core.publisher.Flux;

/**
 * 真实 HarnessAgent 加确定性模型：不调用付费 API，验证原生会话与权限装配。
 *
 * @author Codex代码助手
 */
class TeachingAgentIntegrationTest {

    @TempDir private Path workspace;

    @Test
    void harnessRespondsAndRestoresSessionWithoutMachineTools() throws Exception {
        AtomicReference<List<Msg>> seen = new AtomicReference<>();
        Model model = mock(Model.class);
        when(model.getModelName()).thenReturn("test-model");
        when(model.stream(anyList(), any(), any()))
                .thenAnswer(
                        invocation -> {
                            seen.set(invocation.getArgument(0));
                            List<?> tools = invocation.getArgument(1);
                            assertTrue(tools == null || tools.isEmpty(), "教学试验不应开放任何机器工具");
                            return Flux.just(
                                    new ChatResponse(
                                            "test-reply",
                                            List.of(
                                                    TextBlock.builder()
                                                            .text("试着只改引号里的故事名字，再运行。你觉得哪一行会变化？")
                                                            .build()),
                                            null,
                                            Map.of(),
                                            "stop"));
                        });
        var factory = new TeachingAgentFactory();
        var context =
                RuntimeContext.builder().userId("test-family").sessionId("story-session").build();
        try (var agent = factory.build(model, workspace, null, null)) {
            assertTrue(agent.call("我想讲一个云朵邮局的故事", context).block().getTextContent().contains("引号"));
        }
        try (var reopened = factory.build(model, workspace, null, null)) {
            assertEquals(
                    "试着只改引号里的故事名字，再运行。你觉得哪一行会变化？",
                    reopened.call("刚才的故事名字是什么？", context).block().getTextContent());
        }
        assertTrue(
                seen.get().stream()
                        .map(Msg::getTextContent)
                        .anyMatch(text -> text.contains("云朵邮局")),
                "重建 Agent 后应恢复框架原生会话");
        try (var paths = Files.walk(workspace)) {
            assertFalse(paths.filter(Files::isRegularFile).toList().isEmpty());
        }
    }
}
