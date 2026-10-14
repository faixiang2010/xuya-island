package com.xuya.island.work.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 保存作品请求，revision 是客户端最后读到的版本号。
 *
 * @author Codex代码助手
 */
public record SaveWorkRequest(
        @NotBlank @Size(max = 64) String lessonId,
        @NotBlank @Size(max = 80) String title,
        @NotBlank @Size(max = 65536) String code,
        @Min(0) int revision) {}
