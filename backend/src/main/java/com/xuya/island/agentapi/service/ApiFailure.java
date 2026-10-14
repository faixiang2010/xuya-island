package com.xuya.island.agentapi.service;

import org.springframework.http.HttpStatus;

/** 可安全公开的业务错误，不携带供应商异常或用户文件内容。 */
public class ApiFailure extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public ApiFailure(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public static ApiFailure invalid(String message) {
        return new ApiFailure(HttpStatus.BAD_REQUEST, "INVALID_INPUT", message);
    }

    public static ApiFailure conflict(String message) {
        return new ApiFailure(HttpStatus.CONFLICT, "STATE_CONFLICT", message);
    }

    public static ApiFailure missing() {
        return new ApiFailure(HttpStatus.NOT_FOUND, "NOT_FOUND", "没有找到这个资源");
    }
}
