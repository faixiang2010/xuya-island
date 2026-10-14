package com.xuya.island.codex.agent;

import io.agentscope.core.tool.Toolkit;
import io.agentscope.harness.agent.filesystem.AbstractFilesystem;

/** 平台工具与真实执行环境的装配桥。 */
public interface CodexToolProvider {
    Toolkit tools(AgentRuntimeAdapter.RuntimeSpec spec);

    default AbstractFilesystem filesystem(AgentRuntimeAdapter.RuntimeSpec spec) {
        return null;
    }

    default long revision() {
        return 0;
    }
}
