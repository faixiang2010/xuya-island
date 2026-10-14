package com.xuya.island.codex.artifact;

import java.nio.charset.StandardCharsets;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 原件始终下载，图片预览只提供服务端重新编码的 PNG。 */
@RestController
@RequestMapping("/api/v1/codex/artifacts")
public class ArtifactController {
    private final ArtifactService artifacts;

    public ArtifactController(ArtifactService artifacts) {
        this.artifacts = artifacts;
    }

    @GetMapping("/{id}/content")
    public Mono<ResponseEntity<FileSystemResource>> content(@PathVariable String id) {
        return Mono.fromCallable(
                        () -> {
                            var item = artifacts.requireArtifact(id);
                            return ResponseEntity.ok()
                                    .header(
                                            HttpHeaders.CONTENT_DISPOSITION,
                                            ContentDisposition.attachment()
                                                    .filename(item.name(), StandardCharsets.UTF_8)
                                                    .build()
                                                    .toString())
                                    .header("X-Content-Type-Options", "nosniff")
                                    .contentType(MediaType.parseMediaType(item.mediaType()))
                                    .body(new FileSystemResource(artifacts.contentPath(id)));
                        })
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/{id}/preview")
    public Mono<ArtifactService.Preview> preview(@PathVariable String id) {
        return Mono.fromCallable(() -> artifacts.preview(id))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/{id}/preview/image")
    public Mono<ResponseEntity<FileSystemResource>> image(@PathVariable String id) {
        return Mono.fromCallable(
                        () ->
                                ResponseEntity.ok()
                                        .header("X-Content-Type-Options", "nosniff")
                                        .contentType(MediaType.IMAGE_PNG)
                                        .body(
                                                new FileSystemResource(
                                                        artifacts.previewImagePath(id))))
                .subscribeOn(Schedulers.boundedElastic());
    }
}
