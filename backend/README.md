# 叙芽岛后端

Java 17 / Spring Boot 4.0.8 WebFlux / SQLite / AgentScope 2.1.0-BETA1。启动类为 `com.xuya.island.XuyaIslandApplication`。

## 启动与验证

从项目根目录执行：

```powershell
# 推荐联合启动React与Java
node backend/scripts/dev.mjs
# 单独运行后端
& backend/scripts/backend.ps1 -Task run
# 测试与集成构建
& backend/scripts/backend.ps1 -Task test
node backend/scripts/build.mjs
# 运行已构建的JAR
& backend/scripts/run-jar.ps1
```

首次开发先安装React依赖，工具路径、端口与调试方法统一见[开发快速上手](../docs/getting-started.md)。API默认43172，React默认43171；43173仅为历史资源端口配置。正式教学使用主机Python，不打包Pyodide资源。

## 职责与存储

Controller负责协议与校验，Service负责规则/事务，Repository负责参数化SQL。JDBC、文件和同步SDK操作调度到弹性线程池；规范见[Java开发规范](../docs/java-style.md)。

| 目录/业务 | 职责 |
|---|---|
| `src/main/java/com/xuya/island` | account家庭账户，execution原生执行，growth成长账本，以及lesson/adventure/studio/work/codex等业务 |
| `src/main/resources` | 公开配置、V1–V9迁移、版本化课程、教学Python及Agent技能资源 |
| `scripts` | 开发、Maven验证、集成构建、JAR运行、端口归属检查与清理 |
| `config` | 公开example模板与Git忽略的本机配置 |
| `data` | 真实SQLite、账户作品、Agent工作区、任务目录及升级前备份 |
| `target` | 编译、测试临时数据与generated-resources，可清理 |
| `logs` / `dist` | 运行验证日志 / 正式一体JAR |

SQLite迁移至V9，升级前 `VACUUM INTO` 一致性备份，不修改已发布迁移。新功能追加迁移，同时更新迁移清单与版本；不能用覆盖旧SQL代替升级。

## 接口与权限

- `/api/health`、`/api/health/live`、`/api/health/ready`：应用身份与就绪检查。
- `/api/v1/auth`、`/api/v1/system`：账户与家庭管理；具体接口以Controller和Swagger契约为准。
- `/api/v1/execution`：解释器环境、任务创建/轮询/输入/停止；真实身份、权限与任务归属校验。
- `/api/v1/learning`：活动事实、续学与成长数据；游戏进度同步不会被视为编程掌握证据。
- `/api/curriculum`、`/api/lessons`、`/api/adventure`：版本化内容。
- `/api/works`、`/api/projects`、`/api/study-sessions`等：作品版本、候选与教学会话。
- `/api/v1/codex`：成人开发域，完整REST/AG-UI/终端协议见[codex接口与开发](../docs/codex.md)。

家庭版已接入Sa-Token、HttpOnly会话、CSRF与RBAC。写请求需满足实际来源及会话校验，不能只补Origin头绕过登录。默认绑定回环；管理员启用共享后可提供局域网HTTP教学，成人codex仅本机开放。

原生Python每次独立进程/目录、Windows Job限制与回收；这是家庭可信执行，代码具有启动软件的Windows用户权限。教学AI由 `TeachingAgentFactory` 装配受控工具，成人由 `CodexAgentFactory` 独立装配，权限由真实工具检查保证。

## 模型与配置

公共 `application.yml` 只含环境变量占位与公开默认值。本机模型Key在Git忽略的 `config/application-local.yml`，不打入JAR。开发脚本自动使用本模块config/data/logs；安装版路径由Electron注入。

环境变量及模型操作统一见[根README](../README.md)和[codex开发指南](../docs/codex.md)，不在此重复维护模型名和接口厂商默认值。测试使用临时SQLite与本机固定模型响应，不访问付费API。
