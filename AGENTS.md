# 叙芽岛开发约定

本文档是代码助手在本仓库协作开发时的行为准则，覆盖沟通、工具链、编码、安全、验证与目录管理，所有智能体均应遵守。

## 协作与沟通

- 使用中文沟通，称呼用户「老大」，助手名称为「代码助手」。

## 环境与工具链

- 本项目使用 Java 17 与 Maven 3.9+，两者均不做自动探测。
- 必须由开发人员复制 `backend/config/toolchain.example.json` 为 Git 忽略的 `backend/config/toolchain.json` 并填写 `javaHome`、`mavenHome`；或用 `XUYA_JAVA_HOME`、`XUYA_MAVEN_HOME` 覆盖。
- 源码、脚本和文档不得写入个人电脑的实际安装路径；不修改系统默认 JDK 8。

## 统一入口与端口

- 源码启动、测试、构建、JAR 运行、跨平台运行包和清理在 Windows 与 macOS 使用同一套 Node 入口：`dev.mjs`、`backend-task.mjs`、`build.mjs`、`run-jar.mjs`、`package-jar.mjs`、`clean.mjs`，端口检查统一为 `ports.mjs`。
- 不再保留平台专用的 PowerShell 启动脚本；改动启动链路时两平台都要验证。
- 默认端口：前端 43171、后端 43172、Python 资源 43173，配置在 `backend/config/ports.json`。端口变化需同步代理、允许来源和执行域。
- 端口与进程归属统一由 `backend/scripts/ports.mjs` 检查（Windows 走 Win32 进程信息，macOS 走 `lsof` + `ps`），禁止仅凭端口或进程名关闭程序，必须确认本工程路径与入口；其他程序占用时换空闲端口。

## 编码与跨平台兼容

- 含中文的 PowerShell、VBS 等脚本必须写入 UTF-8 BOM，避免系统默认编码（GBK）导致乱码。
- 跨平台涉及文件读写、命令行参数传递或脚本输出中文时，显式使用 UTF-8，不依赖系统默认编码。
- 提交到 Git 的文档使用英文文件名，保证跨平台路径与编码兼容；本机过程文档不受此限制。
- 可执行文件名与命令拼接需考虑平台差异（`.cmd` / `.sh` / `.exe`），不得写死单平台后缀。
- 启动脚本需校验 JDK 版本：低于 17 时给出明确提示，不得回退或误用系统默认 JDK 8。

## 编码与架构

- 参考阿里巴巴 Java 开发手册：UTF-8、4 空格、显式 import、构造器注入、常量命名和清楚的类注释。
- Controller 处理协议与校验，Service 控制规则与事务，Repository 负责参数化 SQL；DTO、DO、VO 职责区分清楚。
- 产品 Java 根包与 Maven groupId 统一为 `com.xuya.island`，启动类为 `XuyaIslandApplication`；业务类、模块和产品入口不得使用 Demo、示例工程或占位包名。课程示例、配置模板和测试夹具按真实用途命名。
- JDBC、文件与同步 SDK 调用不得阻塞 WebFlux 事件循环。

## AI 领域装配与代码执行

- 教学 AI 从 `TeachingAgentFactory` 装配 `HarnessAgent`；成人开发工作台从成人 Agent 工厂装配。两域独立检查真实工具权限，不通过提示词声称禁用机器工具。
- 学习代码按 3.11 家庭部署设计，使用管理员选定的主机 Python：每次独立进程/目录，Windows 用 Job Object 限制内存和回收子进程，macOS 用进程树回收。这是家庭可信执行，代码具有启动软件的账户权限。
- 教学 AI 不接入任意宿主 Shell；运行协议不传账户凭证、模型密钥或 Electron 桥。
- 浏览器 Worker 仅保留历史兼容源码，正式入口使用原生运行接口。

## 安全边界

- 密钥不写源码、不发前端、不输出第三方异常正文。
- 测试使用临时 SQLite 和本机模型固定响应，不访问付费 API。
- 本机模型 Key 保存在 Git 忽略的 `backend/config/application-local.yml`，JDK 与 Maven 路径保存在 Git 忽略的 `backend/config/toolchain.json`；公共配置只保留环境变量占位。禁止输出 Key、个人安装路径，或将本机配置打入 JAR/安装包。

## 前端技术栈

- 正式前端为 `frontend-react`；`frontend-vue` 已删除，不再保留历史源码。前端开发、验证、构建和发布统一使用 React，默认入口不得指向 Vue。

## 验证与交付

- 功能交付需同步 README 和验证记录。
- 前端执行 `npm --prefix frontend-react test`，跨平台脚本执行 `node --test backend/scripts/runtime.test.mjs`，后端统一用 `node backend/scripts/backend-task.mjs test` 验证，全栈构建执行 `node backend/scripts/build.mjs`。
- 前端测试、构建及所有 `npm`/`npx` 命令必须在 `frontend-react` 目录下或带 `--prefix frontend-react` 执行，禁止在根目录直接运行，避免缓存（`.vite`、`.vite-temp`、`node_modules`）落入根目录。
- 改打包或运行包链路时还需执行 `node backend/scripts/package-jar.mjs --reuse-build` 并启动验证。
- 运行器、存储或编辑行为变更还需在隔离测试数据上执行浏览器测试。
- 浏览器测试使用 `npm --prefix frontend-react run test:e2e` 的自动隔离入口，不手动连接正式服务。
- 当前先打磨 Java/React 产品功能，日常开发和 CI 不运行 Electron；产品稳定后最后再打包。

## 阶段边界

- 阶段边界由老大集中统一安排：日常每个改动先不考虑手机端界面适配，也不做 Electron 打包与安装验证，这两项留给后续专门阶段统一处理。
- 不要因单个小改动顺手做移动端或打包，避免重复耗费时间精力。
- 浏览器测试与界面验收默认聚焦桌面，除非该次任务明确要求移动端。

## 规划与证据管理

- 产品、课程、教学体验与技术规划统一维护在本机 `.agent/design/plan.md`（不进 Git）；后续优化直接修改该文件，不新增同级重复规划或单独方案。
- 主规划区分当前实现与待开发目标；可执行课文、代码、用例和素材在版本化资源中维护，README 记录当前能力，验收结论与证据归 `.agent/evidence/`（不进 Git）。
- Git 只提交成果性内容：产品能力、课程/技术规格、契约、可复现步骤与验证结果；过程、思考、调研、逐条修复史与历史快照不提交 Git。本机证据（截图、JSON）由 `.gitignore` 排除。
- 各智能体（Trae 等）的中间文件、过程文件、计划方案、草稿与临时产物写入自己的工作目录（如 `.agent/`、`.trae/`），不写入 docs 或根目录，并由 `.gitignore` 排除；验证截图与 smoke/check JSON 证据归 `.agent/evidence/`，不进 docs。
- 处理验收、回归、历史结论或「之前是怎么验证的」类任务前，先读本机工作区地图 `.agent/README.md` 与 `.agent/evidence/`，不要重复造过程文档或写回 docs。
- docs 只沉淀成果与结论，开发过程中不频繁更新，通常在 Git 提交前统一整合一次；开发过程中高频修改的是智能体自己的工作目录与各模块源码。

## 目录与交付清理

- 保持工程干净、清晰：前后端和 Electron 的源码、依赖、锁文件、格式配置、脚本、日志与产物归各自模块；根目录只保留入口说明、开发约定与共享编辑器/Git 配置。不要重建根目录 npm 工作区、node_modules 或 scripts。
- 中间文件、过程文档与缓存按产生者归属：`backend/`、`electron/`、`frontend-react/` 三个模块产生的放各自模块目录；各智能体产生的放各自以 `.` 开头的目录（如 `.agent/`、`.trae/`），禁止散落到根目录或其他模块目录。
- 提交到 Git 的文档集中在 docs/；规划文档在本机 `.agent/design/`。不要随手在根目录新增说明文档或日志。
- 后端数据放 `backend/data`，日志放各模块 `logs`，正式产物放各模块 `dist`。生成资源只进 `backend/target/generated-resources`，禁止写入 src。
- 每次开发交付前清理自己创建的临时脚本、下载副本、测试库、截图副本和编译缓存；必要的验证证据先分类归档。执行 `node backend/scripts/clean.mjs`（需要时加 `--all`）后检查根目录及 git status，保留未参与本轮的 Electron 历史产物。
- `clean.mjs` 只清理模块内中间产物（`backend/target`、`electron/build`、`.tmp`、测试缓存、`.vite`/`.vite-temp`），保留 `dist`（正式包）、`node_modules`（依赖）、`data`（数据）、`logs`（日志）；根目录的 `node_modules` 不在其清理范围，需单独确认后人工删除。
- 清理仅操作已确认归属的中间产物；保留源码、锁文件、正式交付包、真实数据库与学习记录。不得把 `.gitignore` 当作清理动作，也不得忽略所有 Markdown 或 SQL。

## Git 纪律

- 不修改其他示例项目。
- 不自行提交或推送 Git。
