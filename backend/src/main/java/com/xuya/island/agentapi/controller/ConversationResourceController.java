package com.xuya.island.agentapi.controller;

import com.xuya.island.agentapi.service.ApiFailure;
import com.xuya.island.agentapi.service.ConversationService;
import com.xuya.island.codex.artifact.ArtifactService;
import com.xuya.island.config.XuyaProperties;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/** 会话附件与来源映射；上传中间物只留模块临时目录并始终释放。 */
@RestController
public class ConversationResourceController {
    private final ConversationService conversations;
    private final ArtifactService artifacts;
    private final XuyaProperties properties;

    public ConversationResourceController(
            ConversationService conversations,
            ArtifactService artifacts,
            XuyaProperties properties) {
        this.conversations = conversations;
        this.artifacts = artifacts;
        this.properties = properties;
    }

    @GetMapping("/api/v1/codex/conversations/{id}/resources")
    public Mono<Map<String, Object>> resources(@PathVariable String id) {
        return Mono.fromCallable(
                        () -> {
                            var conversation = conversations.get(id);
                            return Map.<String, Object>of(
                                    "artifacts",
                                    artifacts.artifactList(conversation.workspaceId()),
                                    "sources",
                                    artifacts.sourceList(conversation.workspaceId()));
                        })
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping(
            value = "/api/v1/codex/attachments",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<Object> attach(
            @RequestPart("file") FilePart file,
            @RequestPart("conversationId") String conversationId) {
        return Mono.usingWhen(
                Mono.fromCallable(
                                () -> {
                                    conversations.get(conversationId);
                                    Path root = properties.dataDir().resolve("codex/tmp/uploads");
                                    Files.createDirectories(root);
                                    return Files.createTempFile(root, "upload-", ".part");
                                })
                        .subscribeOn(Schedulers.boundedElastic()),
                temporary ->
                        file.transferTo(temporary)
                                .then(
                                        Mono.fromCallable(
                                                        () -> {
                                                            if (Files.size(temporary)
                                                                    > 50 * 1024 * 1024L)
                                                                throw ApiFailure.invalid(
                                                                        "单个附件最多50MB");
                                                            var conversation =
                                                                    conversations.get(
                                                                            conversationId);
                                                            String mediaType =
                                                                    file.headers().getContentType()
                                                                                    == null
                                                                            ? "application/octet-stream"
                                                                            : file.headers()
                                                                                    .getContentType()
                                                                                    .toString();
                                                            return (Object)
                                                                    artifacts.ingest(
                                                                            temporary,
                                                                            file.filename(),
                                                                            mediaType,
                                                                            conversation
                                                                                    .workspaceId(),
                                                                            "attachment",
                                                                            file.filename());
                                                        })
                                                .subscribeOn(Schedulers.boundedElastic())),
                temporary ->
                        Mono.fromRunnable(() -> remove(temporary))
                                .subscribeOn(Schedulers.boundedElastic()),
                (temporary, error) ->
                        Mono.fromRunnable(() -> remove(temporary))
                                .subscribeOn(Schedulers.boundedElastic()),
                temporary ->
                        Mono.fromRunnable(() -> remove(temporary))
                                .subscribeOn(Schedulers.boundedElastic()));
    }

    @GetMapping("/api/v1/codex/attachments/{id}/content")
    public Mono<ResponseEntity<FileSystemResource>> content(@PathVariable String id) {
        return Mono.fromCallable(
                        () ->
                                ResponseEntity.ok()
                                        .contentType(MediaType.APPLICATION_OCTET_STREAM)
                                        .body(new FileSystemResource(artifacts.contentPath(id))))
                .subscribeOn(Schedulers.boundedElastic());
    }

    private void remove(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (java.io.IOException exception) {
            path.toFile().deleteOnExit();
        }
    }
}
