package com.xuya.island.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.support.WebExchangeBindException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebInputException;

/**
 * 统一 API 错误协议，保留正确的 HTTP 状态码。
 *
 * @author Codex代码助手
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    ResponseEntity<ErrorResponse> handleBusiness(BusinessException exception) {
        return ResponseEntity.status(exception.getStatus())
                .body(new ErrorResponse(exception.getCode(), exception.getMessage()));
    }

    @ExceptionHandler({WebExchangeBindException.class, ServerWebInputException.class})
    ResponseEntity<ErrorResponse> handleInput(Exception exception) {
        return ResponseEntity.badRequest().body(new ErrorResponse("INVALID_INPUT", "请检查输入内容和长度"));
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ErrorResponse> handleHttp(ResponseStatusException exception) {
        boolean notFound = exception.getStatusCode().value() == HttpStatus.NOT_FOUND.value();
        return ResponseEntity.status(exception.getStatusCode())
                .body(
                        new ErrorResponse(
                                notFound ? "NOT_FOUND" : "HTTP_ERROR",
                                notFound ? "没有找到这个页面或接口" : "请求方式或访问地址不正确"));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorResponse> handleUnexpected(Exception exception) {
        // 日志只记录异常类型，避免第三方 SDK 异常携带密钥或孩子代码。
        LOGGER.error("API 请求失败，异常类型：{}", exception.getClass().getSimpleName());
        return ResponseEntity.internalServerError()
                .body(new ErrorResponse("INTERNAL_ERROR", "这次操作没有完成，请稍后再试"));
    }

    public record ErrorResponse(String code, String message) {}
}
