package com.xuya.island.account;

import java.util.function.Supplier;

/** 请求身份经 Reactor Context 传播；后台任务使用已绑定的账户，不能来自客户端ID。 */
public final class AccountScope {
    public static final String CONTEXT_KEY = "xuya.account";
    private static final ThreadLocal<String> ACCOUNT = new ThreadLocal<>();

    private AccountScope() {}

    public static String id() {
        String value = ACCOUNT.get();
        return value == null ? "" : value;
    }

    public static void set(String id) {
        ACCOUNT.set(id);
    }

    public static void clear() {
        ACCOUNT.remove();
    }

    public interface Binding extends AutoCloseable {
        @Override
        void close();
    }

    public static Binding bind(String id) {
        String previous = ACCOUNT.get();
        ACCOUNT.set(id);
        return () -> {
            if (previous == null) ACCOUNT.remove();
            else ACCOUNT.set(previous);
        };
    }

    public static <T> T call(String id, Supplier<T> action) {
        String previous = ACCOUNT.get();
        try {
            ACCOUNT.set(id);
            return action.get();
        } finally {
            if (previous == null) ACCOUNT.remove();
            else ACCOUNT.set(previous);
        }
    }
}
