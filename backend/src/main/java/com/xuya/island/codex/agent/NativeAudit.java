package com.xuya.island.codex.agent;

import io.agentscope.core.session.SessionRecorder;

/** 原生日志的应用扩展必须标记 optional；未知 mandatory 类型会阻止 SDK 投影和恢复。 */
public final class NativeAudit {
    private NativeAudit() {}

    public static boolean record(SessionRecorder recorder, String type, Object data) {
        if (recorder == null) return false;
        synchronized (recorder) {
            try {
                recorder.append(type, data, false);
                recorder.flushNow();
                return true;
            } catch (io.agentscope.core.session.SessionLogException
                    | IllegalStateException closed) {
                if (closed.getMessage() == null
                        || !closed.getMessage()
                                .toLowerCase(java.util.Locale.ROOT)
                                .contains("closed")) throw closed;
                return false;
            }
        }
    }
}
