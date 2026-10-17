# 叙芽岛后端

Java 17 / Spring Boot 4.0.8 WebFlux / SQLite / AgentScope 2.1.0-BETA1，启动类 `com.xuya.island.XuyaIslandApplication`。

## 启动与验证

从项目根目录执行：

```powershell
node backend/scripts/dev.mjs                 # 联合启动 React 与 Java
& backend/scripts/backend.ps1 -Task run      # 单独运行后端
& backend/scripts/backend.ps1 -Task test     # 测试
node backend/scripts/build.mjs               # 集成构建
& backend/scripts/run-jar.ps1                # 运行已构建 JAR
```

API 默认 43172、React 43171，43173 为历史资源端口。工具路径、端口与调试见[本地开发与首次使用](../docs/getting-started.md)。

## 分层与存储

Controller 管协议与校验，Service 管规则/事务，Repository 管参数化 SQL；JDBC、文件与同步 SDK 调度到弹性线程池，规范见 [Java 开发规范](../docs/java-style.md)。

| 目录/业务 | 职责 |
|---|---|
| `src/main/java/com/xuya/island` | account 家庭账户、execution 原生执行、growth 成长账本、lesson/adventure/studio/work 及成人工作台 |
| `src/main/resources` | 公开配置、V1–V11 迁移、版本化课程（含逐行中文注释）、教学 Python 与 Agent 技能资源 |
| `scripts` | 开发、Maven 验证、集成构建、JAR 运行、端口归属检查、清理与文档链接检查 |
| `config` | 公开 example 模板与 Git 忽略的本机配置 |
| `data` | 真实 SQLite、作品、Agent 工作区、任务目录及升级前备份 |
| `target` | 编译、测试临时数据与 generated-resources，可清理 |
| `logs` / `dist` | 运行日志 / 正式一体 JAR |

SQLite 迁移至 V11，升级前 `VACUUM INTO` 一致性备份；迁移脚本按 `db/migration/V<序号>__<说明>.sql` 自动发现，序号唯一且连续，缺号拒绝启动，不覆盖旧 SQL。

## 接口与权限

- `/api/health`、`/api/health/live`、`/api/health/ready`：应用身份与就绪检查。
- `/api/v1/auth`、`/api/v1/system`：账户与家庭管理，以 Controller 与 Swagger 契约为准。
- `/api/v1/execution`：解释器环境、任务创建/轮询/输入/停止，带真实身份、权限与归属校验。
- `/api/v1/learning`：活动事实、续学与成长数据；游戏进度不算编程掌握证据。
- `/api/curriculum`、`/api/lessons`、`/api/adventure`：版本化内容。
- `/api/works`、`/api/projects`、`/api/study-sessions` 等：作品版本、候选与教学会话。
- 成人工作台 API：会话、项目、工作区、终端、目标与插件，见[成人开发工作台](../docs/workbench.md)。

家庭版接入 Sa-Token、HttpOnly 会话、CSRF 与 RBAC；写请求需真实来源与会话校验，不能只补 Origin 绕过。默认绑定回环，开启共享后提供局域网 HTTP，成人工作台仅本机开放。

原生 Python 每次独立进程/目录，Windows Job 限制与回收；这是家庭可信执行，代码具有启动软件的 Windows 用户权限。解释器优先使用 Electron 注入的内置 Python；没有内置时，启动阶段自动从 `PATH` 和常见安装目录选择一个可用的 Python 3，管理员仍可在家庭管理切换。教学 AI 由 `TeachingAgentFactory` 装配受控工具，成人由成人 Agent 工厂独立装配，权限由真实工具检查保证。

成人工作台的 `codex/web` 提供两个只读联网工具：`weather_query` 查询真实天气，`web_fetch` 抓取公网网页正文；均限时、限大小并拒绝本机与内网地址。

## 模型与配置

公共 `application.yml` 只含环境变量占位与公开默认值；模型 Key 放 Git 忽略的 `config/application-local.yml`，不打入 JAR。开发脚本用本模块 config/data/logs，安装版路径由 Electron 注入。环境变量与模型操作统一见[根 README](../README.md) 与[成人开发工作台](../docs/workbench.md)；测试用临时 SQLite 与本机固定模型响应，不访问付费 API。
