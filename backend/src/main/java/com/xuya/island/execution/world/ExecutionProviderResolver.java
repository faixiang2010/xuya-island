package com.xuya.island.execution.world;

import com.xuya.island.common.BusinessException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** 按执行环境选择执行世界；未登记的环境明确失败，不回退到本机。 */
@Component
public class ExecutionProviderResolver {
    private final Map<String, ExecutionProvider> providers;

    public ExecutionProviderResolver(List<ExecutionProvider> providers) {
        Map<String, ExecutionProvider> byKind = new LinkedHashMap<>();
        for (ExecutionProvider provider : providers) byKind.put(provider.kind(), provider);
        this.providers = Map.copyOf(byKind);
    }

    public ExecutionProvider resolve(String kind) {
        ExecutionProvider provider = providers.get(kind == null ? "host" : kind);
        if (provider == null)
            throw new BusinessException(
                    "EXECUTION_ENVIRONMENT_UNSUPPORTED",
                    "当前执行环境没有可用的执行世界",
                    HttpStatus.SERVICE_UNAVAILABLE);
        return provider;
    }
}
