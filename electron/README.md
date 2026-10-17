# 叙芽岛桌面壳

Electron 加载 Java 提供的共用 React 页面（frontend-react）。主进程用 TypeScript（`.cts`）编译为 CommonJS，管理窗口、健康检查及自己创建的后端；渲染进程无 Node 或宿主桥，Python 由后端启动独立原生进程，不使用历史 Pyodide iframe。主进程源码分 `main.cts`、`configuration.cts`、`ports.cts`、`backend-lifecycle.cts`、`window.cts`、`validation.cts`、`installation.cts`、`update.cts` 等职责文件。

## 构建与运行

从项目根目录执行：

```powershell
npm.cmd --prefix electron ci
npm.cmd --prefix electron run pack     # 从当前源码构建展开应用
npm.cmd --prefix electron run dist     # 构建 NSIS 安装包
```

- **开发模式**：先 `node backend/scripts/dev.mjs`，另一终端 `npm.cmd --prefix electron run dev`，桌面加载 React 热更新页面。
- **预览模式**：先 `node backend/scripts/build.mjs`，再 `npm.cmd --prefix electron start`，加载集成 JAR 页面。
- **安装包模式**：打开 `dist/win-unpacked/叙芽岛.exe` 或安装程序。打包前先关闭开发/预览服务。

`npm.cmd --prefix electron run typecheck` 严格类型检查；`build:main` 编译到 `build/main`。`electron/dist/win-unpacked` 是展开应用，NSIS 安装程序在 `electron/dist`；`src/` 主进程源码，`scripts/` 运行时准备，`build/runtime/`、`build/python/` 是可清理缓存，`logs/` 构建验证日志。

家庭版隔离验收：`node electron/scripts/build-desktop.mjs dist --validation` 产 `dist/family-validation`；`npm.cmd --prefix electron run test:desktop -- --reuse-pack` 验证展开包。测试用临时数据目录和端口，完成后回收，验证期间不检查自动更新。

## 自动升级与环境

- **更新通道**：electron-builder `publish`（GitHub Releases）+ electron-updater。托盘「检查更新」手动检查，启动后延迟静默检查，发现新版才提示，不强制更新。
- **升级流程**：下载 → 无边框过渡窗（`resources/scripts/` 下的 VBS/PS1 过渡脚本）→ 静默 NSIS 覆盖安装 → 自动重启；安装前 `before-quit` 停掉本程序创建的 Java/Python 子进程。
- **发布渠道**：`electron/package.json` 的 `build.publish` 指向 `faixiang2010/xuya-island`，`release.yml` 用当前仓库覆盖；可用 `XUYA_UPDATE_URL` 运行时指向 generic 静态源。**仓库需 public**，否则安装端无法免鉴权读取 `latest.yml`。
- **安装方式**：NSIS `perMachine:false`，默认装 `%LOCALAPPDATA%\Programs`，免管理员权限。
- **内置 Python**：`prepare:python` 下载官方 embeddable Python（仅标准库）到 `build/python` 随包分发，经 `XUYA_BUNDLED_PYTHON` 注入；管理员可在「家庭管理 → Python 环境」切换主机 Python，也可一键恢复内置。
- **签名**：`win.signAndEditExecutable` 默认 false；配置 `WINDOWS_CERT_BASE64`/`WINDOWS_CERT_PASSWORD` Secret 后 `release.yml` 自动改证书签名。
- **安装自检**：启动时校验后端 JAR 与 Java 运行时，缺失提示重装；学习数据在用户目录不受影响。

本地 Java 用 Java 17；`prepare:java` 经 jlink 生成含 HTTP/JDBC/字符集/TLS 的运行时，不拷整个 JDK。展开资源 `asar=false`，渲染进程 sandbox/contextIsolation 且无 Node 桥；正式交付阶段再验 ASAR、签名与自定义图标。

Electron 44 的 npm 包无 `postinstall`，首次或二进制缺失时执行 `npm.cmd --prefix electron run prepare:electron` 下载；下载慢设 `ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/`。

开发版数据在 `backend/data`，安装版在 `%LOCALAPPDATA%\XuyaIsland`。已有 43172 健康服务时直接复用，否则启动自己的 JAR；关闭窗口只终止本程序创建的 Java 子进程。桌面开发读取 `backend/logs/dev-session.json` 中本次实际端口，不依赖固定 43171。

## 隐藏窗口冒烟与完整验证

`XUYA_DESKTOP_SMOKE=1` 隐藏窗口，检查页面、来源、Node 隔离并截图后退出，报告目录由 `XUYA_SMOKE_DIR` 指定。完整验证 `npm.cmd --prefix electron run test:desktop` 覆盖管理员初始化、内置/自备 Python、中文连续输入、保存恢复、绘图与托盘退出回收；必要截图归 `.agent/evidence/previews`。
