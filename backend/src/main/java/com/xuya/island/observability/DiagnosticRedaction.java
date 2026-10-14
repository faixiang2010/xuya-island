package com.xuya.island.observability;

/** 外部判断与日志共同使用的输出边界；SDK 正文日志另行关闭。 */
public final class DiagnosticRedaction {
    private DiagnosticRedaction() {}

    public static String text(String value, int maximum) {
        if (value == null) return "";
        String safe =
                value.replaceAll(
                                "(?i)([\"'](?:api[_-]?key|token|secret|password|authorization)[\"']\\s*:\\s*)([\"'])(.*?)\\2",
                                "$1$2[REDACTED]$2")
                        .replaceAll(
                                "(?i)([\"']?(?:api[_-]?key|token|secret|password|authorization)[\"']?\\s*[:=]\\s*[\"']?)(?:Bearer\\s+)?[^\"'\\s,;]+",
                                "$1[REDACTED]")
                        .replaceAll("(?:sk-|ghp_|github_pat_)[a-zA-Z0-9_-]{12,}", "[REDACTED]");
        return safe.substring(0, Math.min(maximum, safe.length()));
    }
}
