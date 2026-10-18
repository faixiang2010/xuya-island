# 叙芽岛 React 前端

正式页面使用 React + TypeScript + Zustand + React Router，包含家庭登录/管理、侦探手册、指法学院与字母雨/词雨、六年级语文/英语课文打字、48 活动课堂、离谱小镇前四集、小奇创作室、作品与成长手册，以及独立成人开发工作台。

## 开发与验证

从项目根目录执行（Windows 与 macOS 命令一致；PowerShell 拦截 `npm.ps1` 时改用 `npm.cmd`）：

```bash
npm --prefix frontend-react ci
node backend/scripts/dev.mjs
npm --prefix frontend-react test
npm --prefix frontend-react run build
npm --prefix frontend-react run format:check
npm --prefix frontend-react run test:e2e
```

启动前后端前，先按[本地开发与首次使用](../docs/getting-started.md)配置 `backend/config/toolchain.json` 里的 JDK 与 Maven。工具路径、端口与调试见同一文档。macOS 首次跑浏览器测试前执行 `npx playwright install chromium`。

浏览器测试自动构建源码，用临时学习库/随机端口/空模型配置，全部用例经 `tests/support/session.ts` 走真实管理员登录；当前为 13 个 spec、56 条用例，单元测试 28 个文件、103 条。`--reuse-build` 只用于本轮已构建时，`--lan` 走本机私有 IPv4。`test:curriculum`、`test:adventure` 是历史 Pyodide 兼容检查，正式运行由 Java 启动原生 Python。

## 模块职责

| 目录 | 用途 |
|---|---|
| `src/account`、`src/growth` | 登录权限、家庭管理、学习事实、积分与续学 |
| `src/views`、`src/components` | 页面、编辑器、学习地图与舞台 |
| `src/learning`、`src/motivation` | 进度口径与学习偏好；徽章、庆祝反馈与小奇陪伴形象 |
| `src/stores`、`src/api` | 状态、浏览器草稿、版本冲突与接口校验 |
| `src/games` | 指法课程、字母雨词库、语文/英语长篇课文与游戏进度口径 |
| `src/codex` | 码穹工作台状态、SSE 事件、消息时间线、编辑器和终端 |
| `src/runner` | 正式原生 Python HTTP 控制、输入、输出及舞台协议 |
| `runner` | 历史 iframe/Worker 兼容源码，非正式运行入口 |
| `scripts`、`tests` | 资源准备、契约生成、课程兼容与隔离浏览器验证 |
| `public/art`、`public/media/learning` | 正式图像和本地教学视频、字幕 |
| `logs`、`dist`、`test-results` | 日志、正式构建、临时浏览器报告 |

模块独立管理 package.json、锁文件、格式配置与依赖，不用根 npm 工作区；生成资源只进后端 `target/generated-resources`。

## 游戏中心

- 指法学院：完整 QWERTY 键盘、十指分区、家位凸点、盲打模式，键盘下方悬浮双手并对目标手指做下压动画。
- 字母雨/词雨：单字母档练键位，第二档起覆盖 PEP 人教版六年级上下册全部单词与短语；五档难度，按准确率自适应速度，支持暂停、护盾和结算。
- 拼音汉字小站：部编版六年级上下册全部“看拼音写词语”（440 个，按课文分四组）和课文短句，练习拼音输入与选字。
- 语文/英语课文：分成两张卡和两个入口，只收录约 200–500 字长篇；语文 14 篇、英语 12 篇，按六年级上册、下册分组。历史短篇（古诗、文言文）不再混入长篇列表。
- 进度、续学和徽章沿用账户学习记录；自定义文章只保存在本机。

## 码穹消息

- 助手消息下方常驻六个操作：复制、重新生成、赞、踩、朗读、分享；不依赖鼠标悬停。
- 重新生成会重新提交对应的上一条提问，提交期间保留输入框草稿；赞踩按账户保存在本机。
- 打开历史会话时消息直接完整显示；当前会话里新收到的回答逐字流式展开，并跟随滚动。
- SSE 事件按 `id` 去重，消息按 `messageId` 累加；断开观察不取消后台运行。

## 执行与视觉

`usePythonRunner` 经 `/api/v1/execution` 控制主机解释器，不依赖 SharedArrayBuffer；实时输入、预设 EOF、停止、超时、画笔/舞台与文件快照由原生协议提供。任务目录只是组织方式，代码仍具有主机 Windows 用户权限。

学习进度与活动事实按账户同步，离线事件经账户 IndexedDB 队列补交，旧浏览器进度需显式导入。全站视觉由 `src/styles-theme.css` 设计 token 统一提供，学习激励由 `src/motivation` 派生（徽章只来自真实打字与课堂记录，庆祝层不拦截点击、跟随减少动效）。

产品、课程与技术规格在本机 `.agent/design/plan.md`（不进 Git）。契约检查需已启动后端（`XUYA_OPENAPI_URL` 指定地址）或 `--from-files` 读导出的 OpenAPI JSON。
