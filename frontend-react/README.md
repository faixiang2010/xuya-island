# 叙芽岛 React 前端

正式页面使用React + TypeScript + Zustand + React Router，包含家庭登录/管理、侦探手册、打字游戏、48活动课堂、离谱小镇前四集、小奇创作室、作品与成长手册，以及独立成人codex工作台。

## 开发与验证

从项目根目录执行：

```powershell
npm.cmd --prefix frontend-react ci
node backend/scripts/dev.mjs
npm.cmd --prefix frontend-react test
npm.cmd --prefix frontend-react run build
npm.cmd --prefix frontend-react run format:check
npm.cmd --prefix frontend-react run test:e2e
```

联合启动、工具路径、端口与调试见[开发快速上手](../docs/getting-started.md)。浏览器测试自动构建当前源码、使用临时学习库/随机端口/空模型配置；`--reuse-build`只用于本轮源码已完成集成构建时。当前家庭流程可用 `npm.cmd --prefix frontend-react run test:e2e -- --reuse-build family-account.spec.ts` 单独验证；`--lan`使用本机私有IPv4。旧免登录测试不能计入当前家庭版通过项。

`test:curriculum`、`test:adventure`使用历史Pyodide Worker检查课程兼容，保留为辅助检查；正式运行由Java启动原生Python，当前运行验收以家庭版浏览器与后端测试为准。

## 模块职责

| 目录 | 用途 |
|---|---|
| `src/account`、`src/growth` | 登录权限、家庭管理、学习事实、积分与续学 |
| `src/views`、`src/components` | 页面、编辑器、学习地图与舞台 |
| `src/stores`、`src/api` | 状态、浏览器草稿、版本冲突与接口校验 |
| `src/runner` | 正式原生Python HTTP控制、输入、输出及舞台协议 |
| `runner` | 历史iframe/Worker兼容源码，不是正式运行入口 |
| `scripts`、`tests` | 资源准备、契约生成、课程兼容与隔离浏览器验证 |
| `public/art`、`public/media/learning` | 正式图像和本地教学视频、字幕 |
| `logs`、`dist`、`test-results` | 日志、正式构建、临时浏览器报告 |

模块独立管理package.json、锁文件、格式配置和依赖，不使用根npm工作区。生成资源只进入后端 `target/generated-resources`。`prepare:runtime`默认不生成旧Pyodide资源，历史资源仅在显式 `XUYA_LEGACY_RUNNER=1` 时准备。

## 执行与记录

`usePythonRunner`通过 `/api/v1/execution` 控制主机解释器，不依赖SharedArrayBuffer或浏览器自身Python。管理员选择环境；安装版支持内置/自备切换。实时input、预设EOF、停止、超时、画笔/舞台与文件快照由原生协议提供。任务目录是组织方式，代码仍具有主机Windows用户权限。

学习进度和活动事实按账户同步到同一后端，离线事件通过账户IndexedDB队列补交；旧浏览器进度需显式导入，不补造历史积分。浏览器草稿与作品保存分别处理，作品冲突不能强制覆盖。项目文本限制及教学AI边界见[根README](../README.md)。

首页使用 `public/art/notebook` 下的放大镜、路线、桌面纸张和任务纸页，交互文字由HTML承担。主题支持粉色侦探社、云朵绘画馆、星光琴房及减少动效；琴音默认关闭。本地教学视频可主动播放/重播，生成入口为 `prepare:learning-media`，需要FFmpeg与字体，日常启动无需重新生成。

产品、课程与技术规格在本机 `.codex/design/plan.md`（不进 Git）。

契约检查需要已启动的本机后端（`XUYA_OPENAPI_URL`指定实际地址），或通过 `--from-files`读取导出的两个OpenAPI JSON；默认43172未启动时会连接失败。独立隔离验收可运行 `npm.cmd --prefix frontend-react run test:e2e -- --reuse-build codex.spec.ts -g OpenAPI`，只比较现有类型，不改写源码。
