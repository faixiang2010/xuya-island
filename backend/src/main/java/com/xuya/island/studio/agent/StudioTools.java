package com.xuya.island.studio.agent;

import com.xuya.island.account.AccountScope;
import com.xuya.island.common.BusinessException;
import com.xuya.island.studio.repository.StudioRepository;
import com.xuya.island.studio.service.ProjectService;
import com.xuya.island.studio.vo.StudioViews;
import io.agentscope.core.agent.RuntimeContext;
import io.agentscope.core.permission.PermissionContextState;
import io.agentscope.core.permission.PermissionDecision;
import io.agentscope.core.tool.Tool;
import io.agentscope.core.tool.ToolBase;
import io.agentscope.core.tool.ToolParam;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import reactor.core.publisher.Mono;

/** 学生工具只访问指定项目，提议始终写入候选副本，运行由隔离浏览器完成。 */
public class StudioTools {
    private final StudioViews.StudySession session;
    private final StudioRepository repository;
    private final ProjectService projects;
    private final String owner;

    public StudioTools(
            StudioViews.StudySession session,
            StudioRepository repository,
            ProjectService projects) {
        this.session = session;
        this.repository = repository;
        this.projects = projects;
        this.owner = AccountScope.id();
    }

    @Tool(name = "read_project", description = "读取当前创作项目的文件、版本和偏好，只能访问本会话项目", readOnly = true)
    public StudioViews.Project readProject() {
        return AccountScope.call(owner, () -> projects.get(session.projectId()));
    }

    @Tool(name = "read_run_result", description = "读取当前项目最近一次浏览器报告的运行快照；不是服务端认证", readOnly = true)
    public Object readRunResult() {
        try (var identity = AccountScope.bind(owner)) {
            var project = projects.get(session.projectId());
            return repository
                    .lastRun(session.projectId())
                    .<Object>map(
                            value ->
                                    Map.of(
                                            "available",
                                            true,
                                            "matchesCurrentProject",
                                            value.files().equals(project.files()),
                                            "observedRun",
                                            value,
                                            "notice",
                                            "这是该次代码快照的浏览器运行记录，不能证明后来编辑的代码已运行或学习掌握"))
                    .orElse(Map.of("available", false));
        }
    }

    @Tool(name = "propose_edit", description = "创建完整文件候选副本并说明改动，不覆盖当前作品。孩子须显式采用")
    public StudioViews.Candidate proposeEdit(
            @ToolParam(name = "baseRevision", description = "读取到的当前项目版本") int baseRevision,
            @ToolParam(name = "files", description = "完整候选文本文件，包含main.py")
                    List<StudioViews.ProjectFile> files,
            @ToolParam(name = "explanation", description = "简短说明改变了什么，保留孩子的选择") String explanation,
            RuntimeContext context) {
        try (var identity = AccountScope.bind(owner)) {
            String turn = StudioBudgetMiddleware.turn(context);
            String intent = repository.intent(session.id(), turn);
            if ("think".equals(intent))
                throw new BusinessException(
                        "THINK_READ_ONLY", "陪我想模式只讨论，不改代码", HttpStatus.FORBIDDEN);
            if (repository.failedRunForTurn(session.id(), turn)
                    && !repository.reserveRepair(session.id(), turn)) {
                throw new BusinessException(
                        "REPAIR_LIMIT", "已尝试两次修复，先把观察和下一步交给孩子", HttpStatus.TOO_MANY_REQUESTS);
            }
            return projects.propose(
                    session.id(), session.projectId(), baseRevision, files, explanation, turn);
        }
    }

    public ToolBase runProject() {
        return new ToolBase(
                ToolBase.builder()
                        .name("run_project")
                        .description("在孩子当前页面的隔离Python运行器试运行候选副本。关闭页面则等待运行器。不能运行宿主Shell")
                        .inputSchema(
                                Map.of(
                                        "type",
                                        "object",
                                        "properties",
                                        Map.of("candidateId", Map.of("type", "string")),
                                        "required",
                                        List.of("candidateId"),
                                        "additionalProperties",
                                        false))
                        .readOnly(true)
                        .concurrencySafe(false)
                        .externalTool(true)) {
            @Override
            public Mono<PermissionDecision> checkPermissions(
                    Map<String, Object> input, PermissionContextState context) {
                Object candidate = input.get("candidateId");
                if (!(candidate instanceof String id)
                        || !AccountScope.call(
                                owner, () -> repository.ownsCandidate(session.id(), id))) {
                    return Mono.just(PermissionDecision.deny("只能运行本会话产生的候选副本"));
                }
                return Mono.just(PermissionDecision.allow("运行器只试运行受限候选，结果由浏览器回执"));
            }
        };
    }
}
