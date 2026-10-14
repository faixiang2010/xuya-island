# 叙芽岛桌面壳

Electron 加载 Java 提供的共用 React 页面（frontend-react）。主进程管理窗口、健康检查及自己创建的后端；渲染进程没有 Node 或宿主桥，Python由后端启动独立原生进程，不使用历史 Pyodide iframe。

主进程源码使用 TypeScript（`.cts`），编译为 CommonJS 运行入口。职责分为 `main.cts`（应用事件与装配）、`configuration.cts`（路径与配置校验）、`ports.cts`（端口选择）、`backend-lifecycle.cts`（Java 服务启动、复用与关闭）、`window.cts`（窗口与导航）、`validation.cts`（隐藏窗口验证）。渲染进程通过 HTTP 与 Java 通信，保留独立运行域。

`npm.cmd --prefix electron run typecheck` 执行严格类型检查；`build:main` 编译到 `build/main`。start/dev/pack/dist 自动先编译，安装包只包含编译后的主进程模块，源码不混入运行产物。前端仍由现有 Vite 管理，不增加另一套前端构建入口。

本模块独立拥有 package.json、package-lock.json、.prettierrc.json 和 node_modules，依赖不会提升到项目根目录。首次执行 `npm.cmd --prefix electron ci`；它与前端的依赖安装互不影响。

## 构建与运行

从项目根目录执行：

```powershell
# 从当前源码构建展开应用（自动构建前后端和 Java）
npm.cmd --prefix electron run pack
# 或构建安装包
npm.cmd --prefix electron run dist
```

家庭版隔离验收使用 `node electron/scripts/build-desktop.mjs dist --validation`，产物放 `dist/family-validation`，保留已有安装包；之后 `npm.cmd --prefix electron run test:desktop -- --reuse-pack` 验证生成后的展开包。直接运行 `test:desktop` 会先从当前源码构建独立展开包。测试自动创建随机数据目录和端口，完成后回收；验证期间不检查自动更新。

`electron/dist/win-unpacked` 为展开的应用，NSIS 安装程序放在 `electron/dist`。`src/` 保存主进程源码，`scripts/` 保存运行时准备，`build/runtime/` 与 `build/python/` 保存可清理的 Java/Python 构建缓存，`resources/scripts/` 保存升级过渡窗脚本，`logs/` 保存构建验证日志。已接入自动升级（electron-updater + per-user 安装 + 静默升级过渡窗）与内置 Python；安装包签名仍为占位（见下），完整家庭交付与干净电脑验收属于 M5。

本地 Java 使用 Java 17。`prepare:java` 通过 jlink 创建包含 HTTP、JDBC、字符集和 TLS 所需模块的运行时，不拷贝整个 JDK。pack/dist 自动从当前源码重建前后端，再准备该运行时；升级 JDK 或变更模块配置时自动重建缓存，生成成功后才替换原运行时。构建报告归 logs/builder-debug.yml。

## 自动升级与环境

- 更新通道：electron-builder `publish`（GitHub Releases）+ electron-updater。托盘“检查更新”可手动检查；安装版启动后延迟静默检查，发现新版本才提示，不强制自动更新。
- 升级流程：下载完成 → 显示无边框过渡窗（`resources/scripts/launch-update-progress.vbs` + `update-progress.ps1`，隐藏中转避免黑窗闪烁）→ 静默 NSIS 覆盖安装 → 自动重启。安装前由 `before-quit` 停掉本程序创建的 Java/Python 子进程，避免占用被覆盖的文件。
- 发布渠道：`electron/package.json` 的 `build.publish` 指向 `faixiang2010/xuya-island`；`release.yml` 构建前会用当前仓库（`github.repository`）覆盖，便于 fork。另可用环境变量 `XUYA_UPDATE_URL` 在运行时把通道指向 generic 静态源。产物由 `action-gh-release` 上传，构建时固定 `--publish never`，不需要 GH_TOKEN。**该仓库需为 public**，否则安装端无法免鉴权读取 Releases 里的 `latest.yml`。
- 安装方式：NSIS `perMachine:false`，默认装到 `%LOCALAPPDATA%\Programs`，免管理员权限，自动更新最顺。
- 内置 Python：`prepare:python` 下载 Windows 官方 embeddable Python（仅标准库、无 pip/tkinter）到 `build/python`，随 `extraResources` 分发；Electron 启动 Java 时通过 `XUYA_BUNDLED_PYTHON` 注入。后端默认使用内置解释器，管理员可在“家庭管理 → Python环境”切换到主机已安装的 Python，并一键恢复内置（B+C 兼容）。
- 签名占位：`win.signAndEditExecutable` 默认 false（未签名）。在仓库配置 `WINDOWS_CERT_BASE64`/`WINDOWS_CERT_PASSWORD` Secret 后，`release.yml` 会自动改用证书签名。
- 安装自检：安装版启动时校验后端 JAR 与 Java 运行时是否齐全，缺失时提示重新安装；学习数据保存在用户目录，不受影响。

开发模式：先运行 `node backend/scripts/dev.mjs`，待前后端就绪后在另一个终端执行 `npm.cmd --prefix electron run dev`，桌面加载 React 热更新页面。预览模式：先运行 `node backend/scripts/build.mjs`，再执行 `npm.cmd --prefix electron start`，桌面加载集成 JAR 的页面。安装包模式：打开 dist/win-unpacked/叙芽岛.exe 或安装程序。先关闭预览或开发服务，再进行打包。

采用展开资源（asar=false），避免 ASAR 完整性写入问题。渲染进程使用 sandbox/contextIsolation，且没有 Node 或宿主桥。正式交付阶段再验证 ASAR、应用签名与自定义图标。

Electron 44 的 npm 包不含 `postinstall`，`npm ci` 不会下载 Electron 二进制。首次或二进制缺失时执行 `npm.cmd --prefix electron run prepare:electron`（即 `node node_modules/electron/install.js`）下载；下载慢或失败时可先设置 `ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/`。桌面构建复用 node_modules 中的本地 Electron 发行目录，发布流水线也在安装依赖后显式执行该步骤。

开发版使用 `backend/data`，安装版使用 `%LOCALAPPDATA%\XuyaIsland`。已有 43172 服务且确认应用健康时直接连接；否则启动自己的 JAR。关闭窗口只终止本程序创建的 Java 子进程，保留用户独立启动的后端。

开发桌面自动读取 backend/config/application-local.yml；安装版默认读取数据目录下 config/application-local.yml，也可设置 XUYA_CONFIG_DIR。本机 Key 不嵌入安装包。

同时运行浏览器和桌面时，可在浏览器打开 `http://127.0.0.1:43172`。共享启用时关闭窗口收进托盘并继续服务；明确退出时仅关闭桌面自己创建的服务，复用外部后端时保留它。

业务默认端口为43172，43173仅保留历史资源端口配置；已有健康服务时复用，其他程序占用时为自己的 Java 服务选择空闲端口并自动加载。桌面开发读取 backend/logs/dev-session.json 中本次联合启动的实际端口，不依赖固定的 43171。该会话文件属于本机运行日志，不提交 Git；同机浏览器应按服务实际端口访问。

## 隐藏窗口冒烟验证

`XUYA_DESKTOP_SMOKE=1` 会隐藏窗口，检查页面、来源、Node 隔离并截图后退出。`XUYA_SMOKE_DIR` 指定报告目录，开发时默认 `electron/.tmp/smoke`；安装包验证必须显式指定可写报告目录，避免写入安装资源。测试需设置独立 XUYA_DATA_DIR 和 XUYA_CONFIG_DIR。必要证据归档到 `.codex/evidence/`，临时副本在交付前清理。它是构建验证入口，不参与孩子使用流程。


## 完整桌面验证

在项目根目录执行 `npm.cmd --prefix electron run test:desktop`。入口自动构建当前源码，使用临时数据与空模型配置启动展开应用，故意占用随机端口以验证自动更换。验证家庭管理员初始化、内置/自备Python、中文连续输入、保存恢复、本地绘图和托盘退出回收。测试窗口隐藏，结束后关闭自己创建的应用与服务并删除临时学习库；必要截图归 `.codex/evidence/previews`。
