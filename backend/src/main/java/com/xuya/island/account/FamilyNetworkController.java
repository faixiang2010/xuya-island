package com.xuya.island.account;

import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import tools.jackson.databind.json.JsonMapper;

/** 家庭共享的启动配置，仅主机本地的管理员能改变监听范围。 */
@RestController
public class FamilyNetworkController {
    private final Path configuration;
    private final boolean active;
    private final AccountService accounts;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public FamilyNetworkController(
            @Value("${XUYA_CONFIG_DIR:./config}") String directory,
            @Value("${server.address:127.0.0.1}") String address,
            AccountService accounts) {
        configuration = Path.of(directory).toAbsolutePath().normalize().resolve("network.json");
        active = address.equals("0.0.0.0");
        this.accounts = accounts;
    }

    @GetMapping("/api/v1/system/network")
    public Mono<Map<String, Object>> state(ServerWebExchange exchange) {
        return Mono.fromCallable(() -> stateNow(exchange)).subscribeOn(Schedulers.boundedElastic());
    }

    @PutMapping("/api/v1/system/network")
    public Mono<Map<String, Object>> save(
            ServerWebExchange exchange, @RequestBody Map<String, Boolean> body) {
        return Mono.fromCallable(
                        () -> {
                            if (!AccountGateway.local(exchange))
                                throw AccountGateway.denied("请在安装叙芽岛的主机上修改局域网共享设置");
                            if (!body.containsKey("enabled") || body.get("enabled") == null)
                                throw AccountService.invalid("共享设置无效");
                            Files.createDirectories(configuration.getParent());
                            Path temporary =
                                    Files.createTempFile(
                                            configuration.getParent(), "network-", ".tmp");
                            try {
                                Files.writeString(
                                        temporary,
                                        mapper.writeValueAsString(
                                                Map.of("enabled", body.get("enabled"))),
                                        StandardCharsets.UTF_8);
                                Files.move(
                                        temporary,
                                        configuration,
                                        StandardCopyOption.ATOMIC_MOVE,
                                        StandardCopyOption.REPLACE_EXISTING);
                            } finally {
                                Files.deleteIfExists(temporary);
                            }
                            accounts.audit(
                                    "network:configure", body.get("enabled").toString(), true);
                            return stateNow(exchange);
                        })
                .subscribeOn(Schedulers.boundedElastic());
    }

    private Map<String, Object> stateNow(ServerWebExchange exchange) throws java.io.IOException {
        boolean requested =
                Files.isRegularFile(configuration)
                        && Boolean.TRUE.equals(
                                mapper.readValue(Files.readString(configuration), Map.class)
                                        .get("enabled"));
        var urls = new ArrayList<String>();
        int port =
                exchange.getRequest().getLocalAddress() == null
                        ? 43172
                        : exchange.getRequest().getLocalAddress().getPort();
        for (var interfaces = NetworkInterface.getNetworkInterfaces();
                interfaces.hasMoreElements(); ) {
            var network = interfaces.nextElement();
            if (!network.isUp() || network.isLoopback()) continue;
            for (var addresses = network.getInetAddresses(); addresses.hasMoreElements(); ) {
                var address = addresses.nextElement();
                if (address instanceof java.net.Inet4Address && address.isSiteLocalAddress())
                    urls.add("http://" + address.getHostAddress() + ":" + port);
            }
        }
        return Map.of(
                "enabled",
                requested,
                "active",
                active,
                "restartRequired",
                requested != active,
                "localConfiguration",
                AccountGateway.local(exchange),
                "addresses",
                urls);
    }
}
