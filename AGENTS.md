# 叙芽岛开发约定

- 使用中文沟通，称呼用户“老大”，助手名称“代码助手”。
- 此项目使用 Java 17 与 Maven 3.9+。两者不做自动探测，必须由开发人员复制 `backend/config/toolchain.example.json` 为 Git 忽略的 `backend/config/toolchain.json` 并填写 `javaHome`、`mavenHome`，或用 `XUYA_JAVA_HOME`、`XUYA_MAVEN_HOME` 覆盖。源码、脚本和文档不得写入个人电脑的实际安装路径。不要修改系统默认 JDK 8。
- 源码启动、测试、构建、JAR 运行和清理在 Windows 与 macOS 使用同一套 Node 入口：`dev.mjs`、`backend-task.mjs`、`build.mjs`、`run-jar.mjs`、`clean.mjs`，端口检查统一为 `ports.mjs`。不再保留平台专用的 PowerShell 启动脚本；改动启动链路时两平台都要验证。
- 参考阿里巴巴 Java 开发手册，Java 使用 UTF-8、4 空格、显式 import、构造器注入、常量命名和清楚的类注释。
- Controller 处理协议与校验，Service 控制规则与事务，Repository 负责参数化 SQL。DTO、DO、VO 的职责区分清楚。
- 产品 Java 根包与 Maven groupId 统一为 com.xuya.island，启动类为 XuyaIslandApplication；业务类、模块和产品入口不得使用 Demo、示例工程或占位包名。课程示例、配置模板和测试夹具按真实用途命名。
- JDBC、文件与同步 SDK 调用不得阻塞 WebFlux 事件循环。
- 教学 AI 从 `TeachingAgentFactory` 装配 HarnessAgent；成人开发工作台从成人 Agent 工厂装配。两域独立检查真实工具权限，不通过提示词声称禁用机器工具。
- 学习代码按3.11家庭部署设计使用管理员选定的主机Python：每次独立进程/目录，Windows 用 Job Object 限制内存和回收子进程，macOS 用进程树回收；这是家庭可信执行，代码具有启动软件的账户权限。教学AI不接入任意宿主Shell；运行协议不传账户凭证、模型密钥或Electron桥。浏览器Worker仅保留历史兼容源码，正式入口使用原生运行接口。
- 密钥不写源码，不发给前端，不输出第三方异常正文。测试使用临时 SQLite 和本机模型固定响应，不访问付费 API。
- 正式前端为 frontend-react；frontend-vue 已删除，不再保留历史源码。后续前端开发、验证、构建和发布统一使用 React，默认入口不得指向 Vue。
- 功能交付需同步 README 和验证记录。前端执行 `npm --prefix frontend-react test`，跨平台脚本执行 `node --test backend/scripts/runtime.test.mjs`；后端统一用 `node backend/scripts/backend-task.mjs test` 验证，全栈构建执行 `node backend/scripts/build.mjs`；运行器、存储或编辑行为变更还需在隔离测试数据上执行浏览器测试。
- 浏览器测试使用 `npm --prefix frontend-react run test:e2e` 的自动隔离入口，不手动连接正式服务。当前先打磨 Java/React 产品功能，日常开发和 CI 不运行 Electron；产品稳定后最后再打包。
- 阶段边界（由老大集中统一安排）：日常每个改动先不考虑手机端界面适配，也不做 Electron 打包与安装验证。这两项不是不做，而是留给后续专门阶段由老大统一安排，届时再集中处理；不要因单个小改动顺手做移动端或打包，避免重复耗费时间精力。浏览器测试与界面验收默认聚焦桌面，除非该次任务明确要求移动端。
- 默认端口为前端 43171、后端 43172、Python 资源 43173，脚本配置在 backend/config/ports.json。端口变化需同步代理、允许来源和执行域；端口与进程归属统一由 `backend/scripts/ports.mjs` 检查，禁止仅凭端口或进程名关闭程序，必须确认本工程路径与入口。其他程序占用时换空闲端口。
- 不修改其他示例项目；不自行提交或推送 Git。

## 规划文档维护

- 产品、课程、教学体验与技术规划统一维护在本机 `.agent/design/plan.md`（不进 Git）；后续优化直接修改该文件，不新增同级重复规划或单独课程调整方案。
- 主规划区分当前实现与待开发目标；可执行课文、代码、用例和素材在版本化资源中维护，README 记录当前能力，验收结论与证据归 `.agent/evidence/`（不进 Git）。
- Git 只提交成果性内容：产品能力、课程/技术规格、契约、可复现步骤与验证结果；过程、思考、调研、逐条修复史与历史快照不提交 Git。本机证据（截图、JSON）由 .gitignore 排除。
- 各智能体（Trae 等）的中间文件、过程文件、计划方案、草稿与临时产物写入自己的工作目录（如 `.agent/`、`.trae/`，其他智能体类推），不写入 docs 或根目录，并由 .gitignore 排除；验证截图与 smoke/check JSON 证据同样归 `.agent/evidence/`，不进 docs。
- 处理验收、回归、历史结论或“之前是怎么验证的”类任务前，先读本机工作区地图 `.agent/README.md` 与 `.agent/evidence/`（验收记录、截图、smoke/check 报告），不要重复造过程文档或写回 docs。
- docs 只沉淀成果与结论，开发过程中不频繁更新，通常在 Git 提交前统一整合一次；开发过程中高频修改的是智能体自己的工作目录与各模块源码。

## 目录与交付清理

- 保持工程干净、清晰：前后端和 Electron 的源码、依赖、锁文件、格式配置、脚本、日志与产物归各自模块；根目录只保留入口说明、开发约定与共享编辑器/Git 配置。不要重建根目录 npm 工作区、node_modules 或 scripts。
- 提交到 Git 的文档集中在 docs/；规划文档在本机 `.agent/design/`。不要随手在根目录新增说明文档或日志。
- 后端数据放 backend/data，日志放各模块 logs，正式产物放各模块 dist。生成资源只进 backend/target/generated-resources，禁止写入 src。
- 每次开发交付前清理自己创建的临时脚本、下载副本、测试库、截图副本和编译缓存；必要的验证证据先分类归档。执行 `node backend/scripts/clean.mjs`（需要时加 `--all`）后检查根目录及 git status，保留未参与本轮的 Electron 历史产物。
- 本机模型 Key 保存在 Git 忽略的 backend/config/application-local.yml，JDK 与 Maven 路径保存在 Git 忽略的 backend/config/toolchain.json；公共配置只保留环境变量占位。禁止输出 Key、个人安装路径或将本机配置打入 JAR/安装包。
- 清理仅操作已确认归属的中间产物；保留源码、锁文件、正式交付包、真实数据库与学习记录。不得把 .gitignore 当作清理动作，也不得忽略所有 Markdown 或 SQL。
