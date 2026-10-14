# codex 接口与开发

`POST /api/v1/conversations` 的 `projectId`、`workspaceId` 为可选字段；均省略时创建独立聊天，响应 `projectId` 为空字符串、`workspaceId` 为服务端持久独立目录标识。项目聊天须同时提供二者并验证归属。AG-UI 首次请求可以省略 `forwardedProps.workspaceId`，沿用同一规则。独立目录可用于附件、产物、文件操作和终端；`diff` 比较独立目录的初始空基线，源项目回写返回 `409 SOURCE_PROJECT_REQUIRED`。重复运行不会重新分配目录。全局新聊天清空前端上下文选择，不影响原会话后台执行。

成人工作台从叙芽岛一级菜单 codex 进入，地址 `/#/codex`。后端公共会话协议不依赖前端框架；替换前端时保留请求标识、事件游标和交互ID，继续调用相同接口。

## 启动与配置

从项目根目录执行 `node backend/scripts/dev.mjs`。Java17/Maven路径沿用项目脚本，不改系统JDK8。页面与API使用脚本选择的实际端口；正式课堂Python由主机原生服务执行，43173只保留历史资源配置。源码数据默认位于backend/data，成人数据从该目录的codex子目录派生；测试必须指定临时XUYA_DATA_DIR。

`backend/config/application-local.yml`受Git忽略，保存本机私有配置；公开模板为application-local.example.yml。设置页可配置OpenAI兼容模型地址、真实模型名、密钥及已确认的图像/推理能力。产品返回configured与能力声明，不返回密钥。修改模型在下一执行段生效，运行期间先中断；修改模型不清空历史或预算。

JEV地址由application-local.yml私有配置填写，公开模板保留空占位。开启后由真实类型化请求判断可用性，离线、超时和错误回到标准编码流程。Studio沿用本机现有配置，地址由环境变量XUYA_STUDIO_URL配置，首次真实请求后异步连接；安装/维护情况在设置页查看。`PUT /api/v1/codex/settings/jev`与`.../studio`接受`{enabled:boolean}`，开关保存到成人数据域的settings/optional-services.json。模型、JEV与Studio凭据不要作为工作台Bearer填写。

Chrome连接注册入口为backend/scripts/codex-chrome.ps1，扩展源码在backend/src/main/resources/codex/chrome/extension。扩展需要在用户Chrome中加载，并使用实际扩展ID注册Native Messaging；安装操作与已经连接是不同状态。诊断中connectionVerified为真才表示桥已经握手。文档渲染依赖LibreOffice，Docker依赖本机Docker引擎；缺少依赖页面应明确显示。

## 鉴权与稳定契约

家庭版先通过真实账户登录并具备成人codex权限，成人域只允许主机访问；Bearer不能替代账户身份。可信页面再`POST /api/v1/codex/access/bootstrap`，取得`{token,expiresAt}`。后续REST与SSE设置`Authorization: Bearer ...`。凭据30分钟过期；浏览器在受信来源重新领取后恢复快照与游标，不重新提交任务。非浏览器客户端可通过可信本机入口领取，后续携带Bearer。运行域、预览域和任意外站不能签发凭据。

Swagger位于`/swagger-ui.html`，OpenAPI为`/v3/api-docs`、`/v3/api-docs.yaml`及三个分组`agent-v1`、`codex-v1`、`teaching-legacy`。Swagger不保存授权信息。通用DTO是Conversation、RunReceipt、ConversationSnapshot、InteractionRequest，前端类型契约由OpenAPI生成；流解析模块独立于 React 组件。

```json
{
  "projectId": "已登记项目ID",
  "workspaceId": "已创建工作区ID",
  "title": "登录模块",
  "modelId": "default",
  "reasoningEffort": "default",
  "permissionMode": "auto",
  "planMode": false,
  "maxTokens": 100000,
  "maxActiveMs": 1800000
}
```

向`POST /api/v1/conversations`提交上述对象；创建返回201。列表接口直接返回数组。任务向`POST /api/v1/conversations/{id}/runs`发送`{clientRequestId,text,attachments:[{id}]}`，返回202及`{conversationId,executionId,clientRequestId,status,eventsUrl}`。生成一次clientRequestId后保存到客户端，网络重试沿用它；修改内容使用新ID。同ID内容不同409。

先获取`GET /api/v1/conversations/{id}/snapshot`，包含conversation、cursor、messages、runs、pendingInteractions、usage、goals和plan。再用`GET .../events?after={cursor}`或Last-Event-ID观察之后的事件。附件/产物/来源通过`GET /api/v1/codex/conversations/{id}/resources`补齐，子Agent通过同路径的agents接口补齐，不假设它们包含在快照中。

SSE帧示例：

```text
id: 42
data: {"type":"TEXT_MESSAGE_CONTENT","threadId":"会话ID","runId":"执行ID","messageId":"消息ID","delta":"正在修改"}

id: 43
data: {"type":"CUSTOM","name":"codex.plan","value":{"version":1,"plan":{"title":"实施","steps":[]}}}
```

消费时以id去重，收到完整帧才推进客户端游标。消息按messageId累加；工具按toolCallId组合start/args/result。断开观察不会取消后台执行。游标非法返回409并要求获取快照。RUN_ERROR与RUN_FINISHED分别表示运行段失败和结束；整个目标状态独立保存。codex与subagent自定义事件value带版本，未知事件可忽略并保存观察游标。

`GET /api/v1/codex/conversations/{id}/agents`返回真实原生后台子任务，包含taskId、agentId、status与终态result。`GET .../agents/{taskId}`追加独立events；父日志验证task_id/session_id和subagent/spawned关联后，读取SDK公开WorkspaceSessionLogStore，再投影为subagent.text/message/tool_call/tool_result/lifecycle。不会把子Agent消息合入父消息或结束父运行。`POST .../agents/{taskId}/cancel {clientRequestId}`幂等取消尚在运行的子任务；已经结束返回cancelled:false。委派异步reviewer时使用原生agent_spawn并显式timeout_seconds:0；权限仍服从当前会话策略。

## 提问、审批和AG-UI

向`POST /api/v1/conversations/{id}/interactions/{interactionId}/responses`发送`{clientRequestId,payload:{answer:"回答"}}`。工具审批payload为`{approved:true}`，拒绝为`{approved:false}`；改参批准为`{approved:true,editedArgs:{完整参数}}`，改参不能替换工具名称或扩大工作区。已回应交互同答案返回已接受，不重复工具；不同答案或过期交互409。

`POST .../actions`接受`{clientRequestId,action,executionId,text?,settings?}`。action为steer、interrupt、cancel、resume、configure。补充要求针对正在执行的段，恢复针对已停止段；未确认效果不会自动重试。配置计划模式独立于权限，退出由用户按钮明确执行。

独立AG-UI客户端向`POST /api/v1/ag-ui/agents/codex/run`提交官方RunAgentInput。已有threadId对应产品会话；首次使用自定义threadId可省略项目上下文，由服务端分配独立目录；项目会话在forwardedProps.workspaceId提供已登记工作区。

```json
{
  "threadId": "产品会话ID",
  "runId": "客户端本次运行ID",
  "messages": [{"id":"客户端消息ID","role":"user","content":"实现登录并验证"}],
  "tools": [], "context": [], "state": {}
}
```

中断使用RUN_FINISHED.outcome.interrupts。恢复请求保持threadId、使用新的runId，提交`resume:[{interruptId,status:"resolved",payload:{approved:true}}]`或提问答案；需回应该段全部待处理交互。相同恢复runId重试补交未投递答案，然后回放原执行。SDK编解码由Controller处理，其他业务服务只接产品DTO。

## 文件、Git和终端

聊天偏好通过`PATCH /api/v1/conversations/{id}`修改，例如`{"pinned":true}`、`{"archived":true}`或`{"archived":false}`。ConversationPatch 是 OpenAPI 的实际字段 Schema，服务端拒绝未知字段/错误布尔类型；有 running/queued/suspended 执行时归档返回409。列表包含已归档会话，由客户端区分显示；恢复保留原会话标识、工作目录、消息、预算和置顶偏好，不提交任务。数据库 V5 保存 pinned，升级前一致性备份。工作区内开始聊天保留该项目选择，全局新聊天独立开始。

登记`POST /api/v1/codex/projects {name,path,mode}`；创建`POST .../projects/{id}/workspaces {mode,baseRef?,environment:"host"|"docker",dockerImage?}`。mode默认独立Git工作树，非Git使用isolated-copy。文件GET返回content/hash，PUT提交path/content/expectedHash；已有文件必须带最近读取的hash。

GET`.../workspaces/{id}/diff`返回基线差异、sourceRevision和resultRevision。POST apply提交`{expectedSourceRevision,resultRevision,strategy:"cas"|"three-way"}`。Agent在审阅后继续修改会使resultRevision失配，必须重新审阅。partial和conflict必须展示未合并文件，不表示全部回写成功。原工程Git索引与无关修改保留。

创建终端`POST .../workspaces/{id}/terminals {shell:"powershell",cols:100,rows:30}`，读取响应id；请求`POST .../terminals/{id}/ticket`。票据60秒一次有效，WebSocket使用返回的url。

客户端帧：`{"type":"input","data":"Write-Output hello\r"}`、`{"type":"resize","cols":100,"rows":30}`。服务端帧为`{type,text,seq,exitCode}`：`type:"output"`携带终端文字，`type:"exit"`携带结束码，seq用于顺序识别。定义见TerminalWebSocketConfiguration与TerminalService.Frame。关闭`DELETE .../terminals/{id}`。WebSocket不接受长期Bearer放在URL中；断开页面观察与关闭PTY生命周期分开处理。

## 目标、插件与观测

共享终端读取：`GET /api/v1/codex/workspaces/{workspaceId}/terminals/{id}/output?after={cursor}&maxChars=8192`。须携带正常 Bearer；终端不属于工作区返回404，负游标/非法限额400，未来游标409。省略 after 返回最近输出；响应`{terminalId,text,fromCursor,cursor,latestCursor,historyLost,hasMore,running}`，游标为 UTF-16 字符偏移，ANSI 原样保留。单次2至32768字符，缓存131072字符；historyLost 需重新读取可用窗口，hasMore 可继续使用 cursor 分页。读取不消费其他订阅者的数据，也不执行命令。Harness 提供只读 list_terminals/read_terminal_output，权限绑定运行工作区。Ctrl+反引号只显隐终端，进程仍持续；服务重启后需新建 PTY，不能以日志冒充存活进程。

目标、计划、自动化均在`/api/v1/codex`下维护。持续目标默认30分钟/100,000Token，完成一个段后继续；失败和未知效果暂停，达到预算暂停，提交成果转needs_review待用户复核。增额恢复沿用已用预算。计划编辑保存完整steps，状态pending/in_progress/completed/cancelled。

插件接口提供GitHub query/pull-requests/issues，design export/build/preview/verify，documents export/read/edit/render及pdf export。已上传附件通过服务端ID引用，禁止跨工作区使用。插件缺少凭据或渲染工具时返回明确业务错误，不能返回伪造成功产物。

MCP使用原生McpClientBuilder/McpTool接入stdio与streamable-http。`GET /api/v1/codex/mcp/servers`列配置，`PUT .../servers/{id}`保存，`POST .../{id}/connect`进行真实工具发现，`DELETE .../{id}`禁用并释放连接。只有enabled且allowedTools显式列出的工具进入下一执行段；只读同时要求本地readonly名单与服务器只读声明。凭据独立AES-GCM存储，读取只返回名称；宿主敏感环境变量不自动继承。修改参数仍经过原生审批，服务端没有绕过Harness的直接MCP调用接口。

日志默认只含状态、耗时、工具名、关联ID和异常类型。Codex与主日志分目录，Log4j2有界异步丢弃计数在diagnostics查看；本地原生日志和SQLite账本承担恢复事实，观测服务故障不会删除执行历史。API文档和运行日志不记录提示词、文件/命令正文或凭据。Studio保留本机其他工具已完成的调试接入，覆盖课堂和Codex，包含输入及工具参数/结果；与这里的运行日志策略分别管理。

验证入口沿用`backend/scripts/backend.ps1 -Task test`、`npm --prefix frontend-react test`、`node backend/scripts/build.mjs`及隔离`npm --prefix frontend-react run test:e2e`。不启动Electron、不访问付费模型；实际测试结果见验证记录。

## 开发日志与代码格式

控制台及 `backend/logs/backend.log` 输出启动端口、日志位置、请求开始/结束、错误类型；`backend/logs/codex/codex.log` 另存 Codex 会话、Harness、工具、Git 工作区、审批、JEV 降级和终端生命周期。启动日志会显示实际路径；目录不可写时使用临时回退目录。成功的普通 GET 默认 DEBUG，修改操作和执行过程默认 INFO，失败 WARN/ERROR。命令正文、工具结果及密钥不写入运行日志。请求通过 `X-Request-ID` 关联后台日志。

需要更多诊断时，在启动前设置 PowerShell `$env:XUYA_LOG_LEVEL='DEBUG'`。第三方 AgentScope 原始日志默认关闭，避免 SDK 打印模型正文；应用自己的执行日志仍可用。Log4j2 使用单一 SLF4J 绑定、有界异步输出和按日/20 MB 滚动。

Java 使用 Java 17 执行 Maven `spotless:apply` 格式化、`spotless:check` 检查；常规 validate 同时检查格式与 Checkstyle。React 使用 `npm.cmd --prefix frontend-react run format` 和 `format:check`。关键恢复、幂等、预算、权限和协议适配处保留解释原因的中文注释。

已完成当前源码的集成构建后，可以使用 `npm.cmd --prefix frontend-react run test:e2e -- --reuse-build tests/codex.spec.ts` 定向复核已有 JAR；修改源码后需先重新构建。默认 E2E 命令仍执行完整构建和后端验证。

目标时间预算按父/子 Agent 共用的活动时间区间计算，重叠只计一次；后台子任务尾段继续计时。父记录封存后的用量使用独立审计 writer 持久保存，原运行关联保留在事件数据中，恢复读取累计值而不是重复相加。
