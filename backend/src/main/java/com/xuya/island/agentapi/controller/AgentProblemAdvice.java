package com.xuya.island.agentapi.controller;

import com.xuya.island.agentapi.service.ApiFailure;
import com.xuya.island.common.BusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.support.WebExchangeBindException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.ServerWebInputException;

/** 新API采用RFC9457；旧教学Controller保持既有错误形状。 */
@Order(-100)
@RestControllerAdvice(basePackages = {"com.xuya.island.agentapi", "com.xuya.island.codex"})
public class AgentProblemAdvice {
    private static final Logger LOG = LoggerFactory.getLogger(AgentProblemAdvice.class);

    @ExceptionHandler(ApiFailure.class)
    ResponseEntity<ProblemDetail> failure(ApiFailure error, ServerWebExchange exchange) {
        return problem(error.status(), error.code(), error.getMessage(), exchange);
    }

    @ExceptionHandler(BusinessException.class)
    ResponseEntity<ProblemDetail> business(BusinessException error, ServerWebExchange exchange) {
        return problem(error.getStatus(), error.getCode(), error.getMessage(), exchange);
    }

    @ExceptionHandler({
        WebExchangeBindException.class,
        ServerWebInputException.class,
        IllegalArgumentException.class
    })
    ResponseEntity<ProblemDetail> invalid(Exception error, ServerWebExchange exchange) {
        // 参数绑定失败是客户端输入问题；其它 IllegalArgumentException 往往是服务端解析或状态出错。
        // 两者过去只回一句“请检查请求参数和长度”，排障时完全看不到原因，所以这里留下类型与堆栈。
        LOG.warn(
                "Agent API invalid request={} type={} message={} stack={}",
                exchange.getAttributeOrDefault("requestId", ""),
                error.getClass().getSimpleName(),
                error.getMessage(),
                stackTrace(error));
        return problem(HttpStatus.BAD_REQUEST, "INVALID_INPUT", "请检查请求参数和长度", exchange);
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ProblemDetail> http(ResponseStatusException error, ServerWebExchange exchange) {
        return problem(
                HttpStatus.valueOf(error.getStatusCode().value()),
                "HTTP_ERROR",
                "请求资源或操作不符合当前状态",
                exchange);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> unexpected(Exception error, ServerWebExchange exchange) {
        LOG.error(
                "Agent API failed request={} errorType={} stack={}",
                exchange.getAttributeOrDefault("requestId", ""),
                error.getClass().getSimpleName(),
                stackTrace(error));
        return problem(
                HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "操作未完成，现有数据仍保留", exchange);
    }

    /** 堆栈仅进服务端日志用于诊断，截断防爆量；响应体仍不含第三方异常正文。 */
    private static String stackTrace(Throwable error) {
        var writer = new java.io.StringWriter();
        error.printStackTrace(new java.io.PrintWriter(writer));
        String trace = writer.toString();
        return trace.length() > 4000 ? trace.substring(0, 4000) + "..." : trace;
    }

    private ResponseEntity<ProblemDetail> problem(
            HttpStatus status, String code, String detail, ServerWebExchange exchange) {
        LOG.warn(
                "Agent API rejected request={} status={} code={}",
                exchange.getAttributeOrDefault("requestId", ""),
                status.value(),
                code);
        ProblemDetail result = ProblemDetail.forStatusAndDetail(status, detail);
        result.setProperty("code", code);
        result.setProperty("traceId", exchange.getAttributeOrDefault("requestId", ""));
        return ResponseEntity.status(status).body(result);
    }
}
