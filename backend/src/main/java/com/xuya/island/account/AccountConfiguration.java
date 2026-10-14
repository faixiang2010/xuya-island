package com.xuya.island.account;

import cn.dev33.satoken.stp.StpInterface;
import io.micrometer.context.ContextRegistry;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import reactor.core.publisher.Hooks;

/** Sa-Token加载数据库授权；Reactor将账户作用域安全传播到业务弹性线程。 */
@Configuration
public class AccountConfiguration {
    public AccountConfiguration() {
        ContextRegistry.getInstance()
                .registerThreadLocalAccessor(
                        AccountScope.CONTEXT_KEY,
                        AccountScope::id,
                        AccountScope::set,
                        AccountScope::clear);
        Hooks.enableAutomaticContextPropagation();
    }

    @Bean
    StpInterface accountPermissions(AccountService accounts) {
        return new StpInterface() {
            @Override
            public List<String> getPermissionList(Object loginId, String loginType) {
                return accounts.permissions(loginId.toString());
            }

            @Override
            public List<String> getRoleList(Object loginId, String loginType) {
                return accounts.roles(loginId.toString());
            }
        };
    }
}
