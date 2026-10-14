package com.xuya.island.common;

import org.springframework.http.HttpStatus;

/**
 * 可向用户解释的业务错误；系统异常不向客户端暴露堆栈或文件路径。
 *
 * @author Codex代码助手
 */
public class BusinessException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public BusinessException(String code, String message, HttpStatus status) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public String getCode() {
        return code;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
