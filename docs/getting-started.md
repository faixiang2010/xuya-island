# 本地开发与首次使用

源码启动、构建和 JAR 运行在 **Windows 与 macOS 使用同一套 Node 命令**。JDK 与 Maven 不做自动探测，必须由开发人员在 Git 忽略的本机配置中显式填写。

## 依赖清单

### 必须安装

| 依赖 | 版本要求 | 用途 |
|---|---|---|
| JDK | 17+ | 编译、测试、运行后端；需配置 `javaHome` |
| Maven | 3.9+ | 拉取依赖、编译、打包；需配置 `mavenHome` |
| Node.js | 22.12+（含 npm） | 启动脚本、前端构建、资源准备 |
| Windows 10/11 或 macOS 12+ | — | 当前源码运行支持的两个平台 |

项目不内置 Maven Wrapper，也不读取系统默认 JDK 8。不要用 `sudo` 运行构建脚本：它不会补上缺失的依赖，还会让构建产物变成 root 所有。

### 首次配置工具链

复制模板：

```bash
cp backend/config/toolchain.example.json backend/config/toolchain.json
```

Windows PowerShell 用：

```powershell
Copy-Item backend/config/toolchain.example.json backend/config/toolchain.json
```

然后填写自己的 JDK 与 Maven 根目录（不是 `bin` 目录）：

```json
{
  "javaHome": "/path/to/jdk-17",
  "mavenHome": "/path/to/apache-maven-3.9"
}
```

Windows 路径可以写成 `C:/Java/jdk-17` 或 `C:\\Java\\jdk-17`。也可以用环境变量临时覆盖：

| 环境变量 | 对应配置 |
|---|---|
| `XUYA_JAVA_HOME` | `javaHome` |
| `XUYA_MAVEN_HOME` | `mavenHome` |

`backend/config/toolchain.json` 已被 Git 忽略，不会提交，也不会写进文档或安装包。脚本找不到配置时会直接报错并给出填写指引，不再扫描 PATH 或常见安装目录。

### 可选安装

| 依赖 | 不装的后果 | 安装建议 |
|---|---|---|
| Python 3 | 课堂里不能运行代码，但可以编辑和保存 | Windows 装官方 Python 并勾选 PATH；macOS `brew install python@3.12` |
| Git | 成人工作台的改动、diff、工作区功能不可用 | Windows 装 Git for Windows；macOS `xcode-select --install` 或 `brew install git` |
| 模型 API Key | 小奇与成人工作台的 AI 不可用 | 写 `backend/config/application-local.yml`，见下文 |
| LibreOffice | DOCX 不能预览成 PDF | Windows 装 LibreOffice；macOS `brew install --cask libreoffice` |
| Chrome 扩展桥 | 成人工作台的浏览器操作不可用 | 当前仅 Windows 支持 |
| Playwright 浏览器 | 不能跑 `test:e2e` | `npx playwright install chromium` |
| Docker | AgentScope Studio 可选服务不可用 | 默认关闭，日常不需要 |
| Electron | 不能打桌面安装包 | 当前仅 Windows，留到专门阶段 |

SQLite 由 `sqlite-jdbc` 内嵌，自动在 `backend/data/db/xuya.db` 建库并执行迁移，不需要安装 MySQL、PostgreSQL 或 Redis。

### macOS 一次性准备

```bash
brew install openjdk@17 maven node python@3.12 git
```

安装后按“首次配置工具链”填写 `javaHome` 和 `mavenHome`。例如 Homebrew 的 JDK 与 Maven 目录可以直接写入 `toolchain.json`，不需要修改系统默认 Java。

## 启动

先分清两种用法：**正式使用**只看 43172，**开发调试**才用 43171。

| 默认端口 | 用途 | 局域网可访问 |
|---|---|---|
| 43171 | React 开发页面（Vite，仅开发时存在） | 否，只绑定 `127.0.0.1` |
| 43172 | Java 服务；开发时只提供 API，构建后同时提供页面 | 开启共享后可 |
| 43173 | 历史 Python 资源端口配置，正式原生教学不依赖 | 否 |

端口读 `backend/config/ports.json`（缺失用 `ports.example.json`）；被占用时自动换空闲端口，以终端输出为准。

### 开发调试

```bash
npm --prefix frontend-react ci
node backend/scripts/dev.mjs
```

Windows 与 macOS 命令一致。只有 PowerShell 拦截 `npm.ps1` 时，才把 `npm` 换成 `npm.cmd`。依赖已装且锁文件未变时可跳过 `ci`。

开发页面是 `http://127.0.0.1:43171`，`/api` 自动代理到后端 43172，改前端即时热更新。启动流程只运行服务，不执行测试；测试按需单独跑。

开发期间不要用 43172 验收页面：它提供的是上一次构建写进 `target/generated-resources/static` 的旧页面。

### 正式使用（日常运行）

正式使用不要开 Vite。构建时 React 页面会打进 JAR，页面和 API 共用 43172。

```bash
node backend/scripts/build.mjs
node backend/scripts/run-jar.mjs
```

- 本机打开 `http://127.0.0.1:43172`。
- 家人访问：家庭管理 → 运行与共享开启共享并按提示重启，把页面显示的 `http://192.168.x.x:43172` 发给他们；主机需保持运行。
- 构建会执行后端和前端测试。只想快速出一版日用包时，可先设置 `XUYA_SKIP_TESTS=1` 再构建，测试留到专门验证时跑。
- 每次改完代码都要重新构建再启动 JAR；43171 上正在开发的效果不会自动出现在 43172。

### 统一脚本入口

| 用途 | 命令 |
|---|---|
| 联合启动前后端 | `node backend/scripts/dev.mjs` |
| 单独运行后端 | `node backend/scripts/backend-task.mjs run` |
| 后端测试 | `node backend/scripts/backend-task.mjs test` |
| 后端构建 | `node backend/scripts/backend-task.mjs build` |
| 运行已构建 JAR | `node backend/scripts/run-jar.mjs` |
| 清理中间产物 | `node backend/scripts/clean.mjs`（`--all` 时含 Electron 构建缓存） |
| 端口与进程归属检查 | 由启动/构建脚本自动调用 `backend/scripts/ports.mjs` |

`build.mjs`、`dev.mjs`、`test-e2e.mjs` 内部也调用同一套 Node 入口，不再区分 Windows PowerShell 与 macOS 命令。

<a id="first-use"></a>

## 首次使用与家庭配置

**程序没有预置登录账户，也没有通用默认密码。** 管理员账号由首次使用的大人自行设置，家人初始密码由管理员提供。

### 1. 建管理员

1. 启动后在主机打开本机页面（安装版直接打开叙芽岛）。
2. 全新数据目录显示「先请大人准备小岛」，填账号、昵称和密码完成创建。
3. 记住账号密码，进入「家庭管理」配置环境和家人。

初始化只能在主机本地完成，其他设备不能代建。已有数据时显示登录页；重启、重装、升级不会重建默认密码。

### 2. 配 Python

通常不用手动配置：

- **安装版**：启动时自动使用内置 Python，家人打开课堂就能运行。
- **源码开发（Windows）**：没有内置时，启动阶段自动从 `PATH` 和常见安装目录（`%LOCALAPPDATA%\Programs\Python`、`C:\Python*`、Program Files）选择一个可用的 Python 3。
- **源码开发（macOS）**：自动从 `PATH`、Homebrew（`/opt/homebrew/bin`、`/usr/local/bin`）和 `/Library/Frameworks/Python.framework` 选择 Python 3。
- **自动找不到时**：到「家庭管理 → 运行与共享」选择环境，或展开「手动填写路径」填解释器完整路径。

解释器家庭共用，家人设备无需装 Python；缺第三方库由管理员准备自定义环境。未配模型 Key 也能运行 Python、学固定内容和保存作品；Python 未就绪时仍可编辑查阅，执行前需完成配置。

### 3. 加家人

家庭管理 → 家人账户 → 添加账户，填账号、昵称、初始密码。新账户默认「学习者」；需成人工作台时明确选「成人开发者」。首次登录用初始密码验证后改新密码，再重新登录。

- 账号 3–40 位字母/数字/下划线/短横线，昵称可中文；密码 8–64 字符，UTF-8 不超 72 字节。
- 无公开注册；孩子账户不分配成人开发或超级管理员权限。
- 忘密码由管理员在账户列表「重置密码」；无自助找回，唯一超管忘密码需人工协助，别删学习库。

### 4. 可选：配小奇和局域网共享

| 配置 | 位置 | 是否必须 |
|---|---|---|
| 教学小奇模型 | Git 忽略的 `backend/config/application-local.yml`（`XUYA_MODEL_*`），改后重启 | 用教学 AI 时才需要 |
| 成人工作台模型 | 工作台设置页填地址/模型名/Key | 用成人 AI 时才需要 |
| 局域网共享 | 家庭管理 → 运行与共享开启，按提示重启 | 其他设备访问时才需要 |

共享启用后把管理页显示的实际地址给同局域网家人，各自账户登录，主机保持运行。成人工作台仍仅主机本地开放。

### 5. 确认能学习

用学习者账户进第一课跑一段 `print()`，确认有输出，再保存作品并刷新查看。开发数据在 `backend/data`，安装版在 `%LOCALAPPDATA%\XuyaIsland`；升级前自动备份，别随意删除。

## 验证与构建

```bash
node --test backend/scripts/runtime.test.mjs
npm --prefix frontend-react test
npm --prefix frontend-react run format:check
node backend/scripts/backend-task.mjs test
node backend/scripts/build.mjs
npm --prefix frontend-react run test:e2e
```

浏览器用例自动构建源码、随机端口、临时 SQLite、空模型配置，走真实管理员登录；不碰正式学习库。一体 JAR 在 `backend/dist/xuya-backend.jar`。macOS 首次跑浏览器测试前执行 `npx playwright install chromium`。

### 新机器首次验收清单

```bash
node -v                                  # >= 22.12
node -e "import('./backend/scripts/runtime.mjs').then(m => { console.log(m.resolveJavaExecutable()); console.log(m.resolveMavenExecutable()) })"
node --test backend/scripts/runtime.test.mjs
npm --prefix frontend-react ci
node backend/scripts/dev.mjs             # 打开 http://127.0.0.1:43171
node backend/scripts/build.mjs
node backend/scripts/run-jar.mjs         # 打开 http://127.0.0.1:43172
```

## 平台差异与已知限制

| 项目 | Windows | macOS |
|---|---|---|
| 启动/构建命令 | Node 脚本 | 同一套 Node 脚本 |
| 进程归属检查 | `ports.mjs` 调 PowerShell 读取 Win32 进程 | `ports.mjs` 使用 `lsof` + `ps` |
| Python 进程边界 | Job Object：512MB 内存上限 + 强制回收子进程树 | 进程树回收；**没有 512MB 内存上限** |
| 终端 Shell | PowerShell / cmd | bash / zsh |
| Chrome 原生桥 | 支持 | 暂不支持 |
| LibreOffice 探测 | Program Files | `/Applications/LibreOffice.app` |
| Electron 打包 | 支持（专门阶段） | 暂不支持 |

## 排障与清理

| 现象 | 处理 |
|---|---|
| `未配置 JDK 17+` | 复制 `toolchain.example.json` 为 `toolchain.json` 并填写 `javaHome`，或设置 `XUYA_JAVA_HOME` |
| `JDK 路径无效` | `javaHome` 必须是 JDK 根目录，内部要有 `bin/java`（Windows 为 `bin/java.exe`） |
| `未配置 Maven` / `Maven 路径无效` | 填写 `mavenHome`，内部要有 `bin/mvn`（Windows 为 `bin/mvn.cmd`） |
| `需要 Java 17+` | 换用 JDK 17 或更高版本 |
| `未找到 lsof` | 检查 macOS `PATH` 是否包含 `/usr/sbin` |
| 端口检查失败 | 先关闭本项目后端/桌面；脚本只会结束确认属于本工程的进程 |
| 运行按钮旁提示未配 Python | 到家庭管理选解释器，确认主机在线后重新准备 |
| 自动找不到 Python（Windows 应用商店版） | 应用商店的 `python.exe` 是别名，后端可能无法探测；安装官方 Python 并勾选 PATH，或在家庭管理手动选择解释器 |
| Vite 代理报错 | 后端未就绪或已退出，看后端日志 |
| 改 Java 不生效 | 重启 Java；页面改动走 React 热更新 |
| 改课程/资源不生效 | 走脚本生成到 target，再重启/构建 |
| 构建产物权限错误 | 之前用 `sudo` 构建过；对项目目录执行 `sudo chown -R "$(id -u):$(id -g)" .` 后重新构建 |

任务目录不是安全沙箱，代码具有启动软件的账户权限。清理前先停服务：

```bash
node backend/scripts/clean.mjs
git status --short
```

需要连 Electron 构建缓存一起清理时使用 `node backend/scripts/clean.mjs --all`。清理脚本只删除已确认在工程目录内的中间产物，保留源码、依赖、学习数据、日志和正式 JAR。

契约检查需已启动后端（`XUYA_OPENAPI_URL` 指定地址）或用 `--from-files` 读导出的 OpenAPI JSON；默认 43172 未启动会连失败。
