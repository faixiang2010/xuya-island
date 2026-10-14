package com.xuya.island.codex.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.message.ToolResultBlock;
import io.agentscope.core.message.ToolUseBlock;
import io.agentscope.core.tool.Tool;
import io.agentscope.core.tool.ToolCallParam;
import io.agentscope.core.tool.ToolParam;
import io.agentscope.core.tool.Toolkit;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class EditedApprovalTest {
    @TempDir Path directory;

    final class Commands {
        final AtomicInteger executions = new AtomicInteger();

        @Tool(name = "execute_command", description = "local fixture")
        public String execute(
                @ToolParam(name = "command", description = "text to append") String command)
                throws Exception {
            executions.incrementAndGet();
            Files.writeString(directory.resolve("approvals.txt"), command);
            return "executed";
        }
    }

    @Test
    void editedArgsPassNativeSchemaAndInvokeActualRegisteredTool() throws Exception {
        Commands commands = new Commands();
        Toolkit source = new Toolkit();
        source.registerTool(commands);
        Toolkit scoped = new Toolkit();
        scoped.registerAgentTool(new ScopedAgentTool(source.getTool("execute_command"), false));
        var original =
                ToolUseBlock.builder()
                        .id("approval-fixture")
                        .name("execute_command")
                        .input(Map.of("command", "original"))
                        .content("{\"command\":\"original\"}")
                        .metadata(Map.of("fixture", "retained"))
                        .build();
        var edited = AgentRuntimeAdapter.editedCall(original, Map.of("command", "edited-once"));
        assertNotNull(edited.getContent());
        assertEquals(original.getMetadata(), edited.getMetadata());
        ToolResultBlock result =
                scoped.callTool(
                                ToolCallParam.builder()
                                        .toolUseBlock(edited)
                                        .runtimeContext(RuntimeContext.empty())
                                        .build())
                        .block();
        assertNotNull(result);
        assertFalse(result.getOutput().toString().contains("Schema validation"));
        assertEquals("edited-once", Files.readString(directory.resolve("approvals.txt")));
        assertEquals(1, commands.executions.get());
    }
}
