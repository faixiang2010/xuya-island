package com.xuya.island.account;

import java.net.URI;
import java.util.List;
import org.springframework.web.server.ServerWebExchange;

/** 固定开发来源或同源私网地址；Host或转发头不能单独取得本机开发权限。 */
public final class RequestTrust {
    private RequestTrust() {}

    public static boolean origin(ServerWebExchange exchange, List<String> configured) {
        String source = exchange.getRequest().getHeaders().getOrigin();
        if (source == null) return false;
        if (configured.contains(source)) return true;
        try {
            URI origin = URI.create(source);
            URI requested = exchange.getRequest().getURI();
            String host = origin.getHost();
            if (host == null
                    || !host.equals(requested.getHost())
                    || origin.getPort() != requested.getPort()
                    || !origin.getScheme().equals(requested.getScheme())
                    || origin.getUserInfo() != null) return false;
            if (!host.matches("(?:10\\.|192\\.168\\.|172\\.(?:1[6-9]|2[0-9]|3[01])\\.).+"))
                return AccountGateway.local(exchange)
                        && (host.equals("127.0.0.1") || host.equals("localhost"));
            var address = exchange.getRequest().getRemoteAddress();
            return address != null
                    && (address.getAddress().isSiteLocalAddress()
                            || address.getAddress().isLoopbackAddress());
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }
}
