# 打包与跨平台分发

这篇文档只解决一个问题：**先看目标机器有什么，再决定打成什么包**。不要混用「源码包」「JAR 运行包」和「Windows 安装包」。

## 先选产物

先回答三个问题：

1. **给谁用？** 家庭用户 → 装安装包；开发者/服务器 → 源码包或运行包。
2. **目标机器有 JDK 吗？** 有 → 运行包；没有且是 Windows → 安装包。
3. **还要继续改代码吗？** 要 → 源码包。

| 产物 | 生成命令 | 目标机器需要 | 含 JDK | 含 Python | 适用场景 |
|---|---|---|---|---|---|
| 源码包 | `git archive` 或压缩源码目录 | Node 22.12+、JDK 17+、Maven 3.9+ | 否 | 否 | 继续开发、在 Mac 上重新构建 |
| **跨平台 JAR 运行包** | `node backend/scripts/package-jar.mjs` | **只需要 JDK 17+** | 否 | 否 | **复制到另一台 Windows/Mac/Linux 直接运行（最常用）** |
| Windows 桌面安装包 | `npm --prefix electron run dist` | Windows | 是 | 是 | 给 Windows 家庭用户双击安装，不想另装 Java/Python |

一句话选择：

- **只要求目标机器有 JDK** → 用跨平台 JAR 运行包。
- **目标机器还要继续写代码** → 用源码包。
- **Windows 用户要双击安装、不关心 Java/Python** → 用 Electron 安装包。
- **macOS 用户要 .app 双击安装** → 目前没有实现。

> 配置项（Python、模型 Key、端口、局域网共享）的**含义**统一见[本地开发与首次使用](./getting-started.md#配置集中说明)；本文只讲「运行包在哪个文件里填」。

---

## 一、跨平台 JAR 运行包（重点）

这是"在 Windows 上打包，复制到其他环境，只要有 JDK 就能用"的方式。

### 1. 构建

在项目根目录执行：

```bash
node backend/scripts/package-jar.mjs
```

它会：

1. 先执行完整构建（前后端测试 + 前端打包 + 后端 JAR）。
2. 生成运行包目录。
3. 生成压缩包。

只想复用已经构建好的 JAR、不再跑测试时：

```bash
node backend/scripts/package-jar.mjs --reuse-build
```

只生成目录、不生成 zip：

```bash
node backend/scripts/package-jar.mjs --reuse-build --no-zip
```

构建机器需要源码开发环境（Node、JDK、Maven 和 `backend/config/toolchain.json`），因为要先编译；**目标机器不需要这些**。

重复执行打包不会删除运行包目录里已有的 `data`、`logs`、`.env` 和 `config/application-local.yml`，只会覆盖 JAR、启动脚本、示例配置文件与 README。

#### GitHub Actions 自动打包

不想在本机打包时，推送 `v*` 标签会触发 `.github/workflows/release.yml`，在同一个**草稿 Release** 里自动产出：

- Windows Electron 安装包（`.exe`、`.blockmap`、`latest.yml`）
- 跨平台 JAR 运行包 `xuya-portable-<version>.zip`（版本取自 `electron/package.json`）

流水线复用构建安装包时已经生成的 `backend/dist/xuya-backend.jar`（`--reuse-build`），不会重复跑测试。注意：

- 只有推 `v*` 标签才会触发；普通分支 `git push` 只跑 `verify.yml` 的测试，不打包。
- 标签指向的提交必须已有一次成功的 Verify 运行，否则 `gate` 步骤直接失败。
- 缺少 `xuya-portable-<version>.zip` 时"收集发布资产"会失败，避免草稿 Release 少产物。
- 标签版本要与 `electron/package.json` 的 `version` 一致（例如 `v0.1.0`）。

### 2. 产物位置

```text
backend/dist/xuya-portable/
  xuya-backend.jar
  start.cmd                 # Windows 启动
  start.sh                  # macOS / Linux 启动
  .env.example              # 配置模板；复制为 .env 后填写
  config/
    application-local.example.yml
    application-local.yml   # 可直接编辑；默认无 Key
  README.md                 # 给使用者看的运行说明
backend/dist/xuya-portable-<version>.zip
```

运行包自带 `.env.example`，但不会预置 `.env`。复制成 `.env` 后再填写自己的配置。`backend/dist` 已被 Git 忽略，运行包不会提交到仓库。

运行包也会带一个空的 `config/application-local.yml`，可以直接编辑；如果你把所有配置都放在 `.env`，这个文件保持默认即可。重复打包不会覆盖已有的 `application-local.yml`。

解压后建议先核对文件：

```text
.env.example
README.md
start.cmd
start.sh
xuya-backend.jar
config/application-local.example.yml
config/application-local.yml
```

macOS 的 `.env.example` 以点开头，Finder 默认隐藏，终端里用 `ls -a` 查看，或按 `Cmd + Shift + .` 显示隐藏文件。压缩包内路径使用标准正斜杠，`config/` 目录会正常解出。

所有文本文件都是 UTF-8（无 BOM），`start.sh` 使用 LF 换行。编辑 `.env` 或 YAML 时请保持 UTF-8，不要另存为 UTF-16 或 ANSI。

### 3. 复制 .env.example 为 .env

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

macOS / Linux：

```bash
cp .env.example .env
```

然后用记事本或编辑器打开 `.env`，至少填写 JDK 17+ 的根目录：

```text
JAVA_HOME=C:/Java/jdk-17
```

macOS 示例：

```text
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home
```

注意 `JAVA_HOME` 指向 **JDK 根目录**，不是 `bin` 目录。机器上装了多个 JDK 时，把这里改成你希望叙芽岛使用的那一个；启动脚本会优先使用它，不再依赖 PATH 默认版本。路径中可以写 `~/...` 或 `$HOME/...`，启动脚本会展开。

只有复制出来的 `.env` 才会被读取，直接修改 `.env.example` 不生效；`.env` 里留空的项（例如 `JAVA_HOME=`）不会覆盖系统已有的环境变量。`JAVA_HOME` 留空时，`start.sh` 会依次检查 PATH 中的 `java`、`/usr/libexec/java_home` 和常见 JDK 安装目录，自动选择 17 或更高版本；找不到时打印实际检查到的 java 路径与版本。

Windows 路径请写正斜杠，例如 `C:/Java/jdk-17`。`start.sh` 会把反斜杠当作转义符，`C:\Java\jdk-17` 在 macOS/Linux 上会解析错误。

端口、数据目录、局域网共享、Python 和模型 Key 也可以直接写在 `.env`，`.env.example` 里已有注释示例。端口示例：

```text
XUYA_PORT=43172
XUYA_RUNNER_PORT=43173
```

### 4. 复制到目标机器

复制 `xuya-portable-<version>.zip` 或整个 `xuya-portable` 目录即可。目标机器只需要 JDK 17+，并先在 `.env` 填好 `JAVA_HOME`。

Windows：

```powershell
# 解压后进入目录
.\start.cmd
```

macOS / Linux，推荐直接用 bash 启动，不依赖执行权限：

```bash
bash start.sh
```

新压缩包已经给 `start.sh` 写入执行位，在支持 Unix 权限的本地磁盘上也可以直接 `./start.sh`。如果运行包放在外置硬盘、NTFS/exFAT 或 noexec 卷上，`chmod +x` 也可能无效，此时请始终使用 `bash start.sh`。

也可以完全手动运行：

```bash
java -Dfile.encoding=UTF-8 -jar xuya-backend.jar
```

启动后打开：

```text
http://127.0.0.1:43172
```

### 5. JAR 里有什么

- Java 后端全部代码与依赖
- React 构建后的静态页面
- SQLite 驱动和 V1–V11 数据库迁移
- 课程、活动、教学资源
- Python 运行辅助脚本
- Windows/macOS/Linux 的 PTY、SQLite 原生库

**JAR 里没有**：JDK、Python、模型 Key、学习数据。数据在首次运行时自动创建。

### 6. 目标机器要求

| 依赖 | 是否必须 | 说明 |
|---|---|---|
| JDK | 必须 | 17 或更高；在 `.env` 的 `JAVA_HOME` 填写根目录 |
| Python 3 | 可选 | 课堂运行代码时需要；不装仍能登录、浏览、编辑、保存 |
| 模型 Key | 可选 | 小奇和成人工作台的 AI 需要 |
| Git | 可选 | 成人工作台的 Git 功能需要 |

`start.sh` 的选择顺序是：`.env` / 系统环境变量中的 `JAVA_HOME` → PATH 里的 `java` → macOS/Linux 常见 JDK 安装目录（`/usr/libexec/java_home`、`/Library/Java/JavaVirtualMachines`、Homebrew、`/usr/lib/jvm`）。自动改用其他 JDK 时会打印实际路径和版本；全部低于 17 时会明确提示需要 JDK 17+，并列出检查到的 java 路径与版本，不会直接抛出难以理解的类版本错误。`start.cmd` 在 `JAVA_HOME` 无效时也会提示并回退到 PATH。

部署前按这张表检查：

| 检查项 | 操作 |
|---|---|
| JDK | 目标机器安装 JDK 17+，运行包里**不包含 JDK** |
| `.env` | 从 `.env.example` 复制，填写 `JAVA_HOME` |
| Python | 需要课堂运行代码时安装 Python 3；运行包里**不包含 Python** |
| 端口 | 默认 43172 / 43173，可在 `.env` 改 `XUYA_PORT`、`XUYA_RUNNER_PORT` |
| 模型 Key | 需要 AI 时配置 `config/application-local.yml` 或 `.env` |
| 数据目录 | 默认运行包下 `data`，首次启动自动创建 |

### 7. 端口与环境变量

优先写在 `.env`；下面的系统环境变量方式适合临时覆盖。各变量含义见[配置集中说明](./getting-started.md#配置集中说明)。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `XUYA_PORT` | 43172 | 页面和 API 端口 |
| `XUYA_RUNNER_PORT` | 43173 | 历史 Python 资源端口 |
| `XUYA_DATA_DIR` | `./data` | 数据库、作品和运行数据 |
| `XUYA_CONFIG_DIR` | `./config` | 本机配置目录 |
| `LOGGING_FILE_NAME` | `./logs/backend.log` | 后端日志 |
| `XUYA_BIND_ADDRESS` | 127.0.0.1 | 局域网共享时设为 0.0.0.0 |

Windows PowerShell 换端口：

```powershell
$env:XUYA_PORT=43272
$env:XUYA_RUNNER_PORT=43273
.\start.cmd
```

macOS / Linux 换端口：

```bash
XUYA_PORT=43272 XUYA_RUNNER_PORT=43273 bash start.sh
```

### 8. 配置 Python 与模型 Key

#### Python

推荐启动后由管理员进入「家庭管理 → 运行与共享 → Python 环境」选择解释器，选择结果保存在 `data` 里。字段含义见[本地开发与首次使用](./getting-started.md#2-配-python)。

不想打开界面时，可以在 `.env` 中写 Python 可执行文件的绝对路径：

```text
XUYA_BUNDLED_PYTHON=C:/Python313/python.exe
```

注意这里是 `python.exe` / `python3` 文件，不是 Python 安装目录。JAR 不内置 Python；不装 Python 仍可启动、浏览、编辑和保存，只是不能运行课堂代码。

#### 模型 Key

推荐放在运行包目录的 `config/application-local.yml`。运行包已经带一个空的该文件，可以直接编辑；只有文件被删除时，才需要从示例复制：

```bash
cp config/application-local.example.yml config/application-local.yml
```

然后填写（字段含义见[配置集中说明](./getting-started.md#模型-key)）：

```yaml
xuya:
  model:
    api-key: 你的Key
```

如果使用非默认模型服务，再补充：

```yaml
xuya:
  model:
    api-key: 你的Key
    base-url: https://api.deepseek.com
    name: deepseek-flash
```

也可以直接在 `.env` 中配置，适合不想维护 YAML 的情况：

```text
XUYA_MODEL_API_KEY=你的Key
XUYA_MODEL_BASE_URL=https://api.deepseek.com
XUYA_MODEL_NAME=deepseek-flash
```

`.env` 会由启动脚本导出为环境变量，`application.yml` 会读取这些变量。两种方式二选一即可，修改后重启生效。不配模型 Key 不影响启动、学习和运行 Python，只影响小奇与成人工作台的 AI。

#### JEV / Studio 扩展服务

`jev` 和 `studio` 是 AgentScope 的可选扩展服务，默认都是 `false`，普通使用不需要打开。

如需启用，可以二选一：

```text
# .env
XUYA_JEV_ENABLED=true
XUYA_STUDIO_ENABLED=true
```

或在 `config/application-local.yml` 中把对应 `enabled` 改为 `true`。两种方式不要设置成不同的值。

配置分工：

| 文件 | 读取方 | 适合放什么 |
|---|---|---|
| `.env` | `start.cmd` / `start.sh` 读取并导出为环境变量 | JDK、端口、Python、模型 Key、局域网、扩展服务开关 |
| `config/network.json` | 家庭管理界面写入，启动脚本读取 | 局域网共享开关（重启生效，`.env` 显式设置优先） |
| `config/application-local.yml` | Java 后端启动时读取 | 结构化应用配置，模型与可选服务 |

`.env` 本身不会被 Java 直接读取；手动执行 `java -jar` 时不会自动加载 `.env`，需要用启动脚本，或自己设置环境变量。

### 9. 局域网共享

可以在「家庭管理 → 局域网共享」里打开并保存。设置写入 `config/network.json`，**需要重启叙芽岛服务后才生效**；重启时启动脚本会先自动停止同一数据目录的旧实例。`start.sh` / `start.cmd` 启动时会读取该文件；`.env` 或系统环境变量里显式设置的 `XUYA_BIND_ADDRESS` 优先。

也可以启动前在 `.env` 中取消注释并改为 `XUYA_BIND_ADDRESS=0.0.0.0`，或临时设置：

```powershell
# Windows PowerShell
$env:XUYA_BIND_ADDRESS="0.0.0.0"
.\start.cmd
```

```bash
# macOS / Linux
XUYA_BIND_ADDRESS=0.0.0.0 bash start.sh
```

然后用本机局域网地址访问，例如 `http://192.168.1.10:43172`。主机需要保持运行，防火墙放行 43172。

### 10. 升级、备份与换机器

- 升级：停止程序，替换 `xuya-backend.jar`，保留 `data`、`config` 和 `.env`。
- 备份：复制整个 `data` 目录；数据库升级前程序也会自动做一致性备份。
- 换机器：复制整个运行包目录，或至少复制 `xuya-backend.jar`、`.env`、`data`、`config`。
- 不要删除 `data`，里面是账户、作品和学习记录。

### 11. 编码与换行约定

运行包内文本文件统一为 **UTF-8 无 BOM**，但换行按平台区分：

| 文件 | 编码 | 换行 | 平台 |
|---|---|---|---|
| `start.sh` | UTF-8 无 BOM | LF | macOS / Linux |
| `start.cmd` | UTF-8 无 BOM | CRLF | Windows |
| `.env` / `.env.example` | UTF-8 无 BOM | LF | 两平台 |
| `application-local*.yml` | UTF-8 无 BOM | LF | 两平台 |
| `README.md` | UTF-8 无 BOM | LF | 两平台 |
| `xuya-backend.jar` | 二进制 | 不适用 | 两平台 |

打包脚本会强制检查：出现 BOM、非 UTF-8、`start.sh` 含 CR、`start.cmd` 不是 CRLF，都会直接失败。

解压后可以这样确认：

```bash
file start.sh start.cmd .env.example config/application-local.yml
bash -n start.sh
```

预期：

- `start.sh` 显示 UTF-8 文本，且没有 CR
- `start.cmd` 显示 UTF-8 文本，使用 CRLF
- `.env.example`、YAML 显示 UTF-8 文本
- `bash -n start.sh` 无输出，退出码为 0

Windows 的 `start.cmd` 内部执行 `chcp 65001`，因此 UTF-8 中文提示可以正常显示。不要用会把文件保存成 UTF-16 或 ANSI 的编辑器修改这些文件。

### 12. 常见问题

| 现象 | 处理 |
|---|---|
| 解压后看不到 `.env.example` | 这是隐藏文件；macOS 用 `ls -a` 或 `Cmd + Shift + .` 查看 |
| `zsh: permission denied: ./start.sh` | 直接改用 `bash start.sh`；外置 NTFS/exFAT 或 noexec 卷不支持执行位，`chmod` 也可能无效 |
| `start.sh` 报 `line 1: ...: command not found` | 文件被保存成了 UTF-16、带 BOM 或换行损坏；从新压缩包重新解压，保持 UTF-8 无 BOM + LF，并用 `bash start.sh` |
| 配置文件打开乱码 | 编辑器另存为 UTF-8（无 BOM）；不要用 ANSI/GBK/UTF-16 |
| 提示"未找到可用的 JDK 17+" | 安装 JDK 17+，或在 `.env` 写 `JAVA_HOME=JDK 根目录`；按输出确认脚本检查到的 java 路径与版本 |
| 配置了 JDK 仍提示 Java 1.8 | 确认改的是复制出来的 `.env` 而不是 `.env.example`；`JAVA_HOME` 要写 JDK 根目录；留空则自动探测 PATH 与常见安装目录 |
| 机器有多个 JDK | 在 `.env` 写 `JAVA_HOME=想使用的 JDK 17+ 根目录`，启动脚本优先使用它 |
| 启动报"此数据目录已有后端运行" | 脚本会先自动停止同一数据目录的旧实例；仍出现时确认没有其他副本共用同一 `data` 目录，或手动结束旧进程 |
| 页面打不开 | 看控制台端口提示；确认 `XUYA_PORT` 未被占用 |
| 课堂提示未配置 Python | 安装 Python 3，或在家庭管理手动选择 |
| 局域网其他设备打不开 | 在界面保存共享设置后重启服务；脚本会读取 `config/network.json`，`.env` 的 `XUYA_BIND_ADDRESS` 优先；再检查防火墙 |
| 想换数据目录 | 在 `.env` 写 `XUYA_DATA_DIR=新目录` |

---

## 二、源码包

适合"目标机器还要继续开发"，或者想在 Mac 上重新构建。

在 Windows 上生成只包含 Git 跟踪文件的源码包：

```powershell
git archive --format=zip --output xuya-island-source.zip HEAD
```

它不包含：

- `node_modules`
- `backend/data`
- `backend/logs`
- `backend/dist`
- `backend/config/toolchain.json`
- 模型 Key 等本机配置

复制到 Mac 后：

```bash
unzip xuya-island-source.zip -d xuya-island
cd xuya-island
cp backend/config/toolchain.example.json backend/config/toolchain.json
# 编辑 toolchain.json，填写 Mac 上的 javaHome、mavenHome
npm --prefix frontend-react ci
node backend/scripts/dev.mjs
```

或构建后运行：

```bash
node backend/scripts/build.mjs
node backend/scripts/run-jar.mjs
```

目标机器需要 Node 22.12+、JDK 17+、Maven 3.9+；Python 和 Git 可选。源码包**不含 JDK 和 Python**，也不含依赖缓存。完整的从零到跑起来见[快速上手](./quickstart.md)。

---

## 三、Windows 桌面安装包

这是给 Windows 家庭用户双击安装的方式，和跨平台 JAR 不是一回事。

```powershell
npm --prefix electron ci
npm --prefix electron run pack    # 展开应用
npm --prefix electron run dist    # NSIS 安装包
```

产物在 `electron/dist`。它会：

- 用 jlink 生成精简 JDK 运行时并打进安装包
- 下载 Windows embeddable Python 并打进安装包
- 打包成 NSIS 安装程序

因此 Windows 安装包**包含 JDK 和 Python**，但它是 **Windows 专用**的：

- 里面是 `electron.exe`、`java.exe`、`python.exe` 和 NSIS 安装器
- 不能复制到 macOS 运行
- macOS 桌面打包目前没有实现

详见 [Electron 说明](../electron/README.md)。

---

## 四、跨平台对照

| 问题 | 跨平台 JAR 运行包 | Windows Electron 安装包 |
|---|---|---|
| 在 Windows 上构建 | 可以 | 可以 |
| 在 macOS 上运行 | 可以，需 JDK 17+ | 不可以 |
| 包含 JDK | 否 | 是，jlink 精简运行时 |
| 包含 Python | 否 | 是，Windows embeddable |
| 目标机器要装 Java | 是 | 否 |
| 目标机器要装 Python | 课堂运行代码时需要 | 不需要 |
| 产物形式 | 目录 / zip + JAR | NSIS `.exe` / 展开目录 |
| 适合 | 开发、测试、服务器、跨平台复制 | Windows 家庭用户安装 |

**JAR 的平台无关性**来自 Java 字节码和前端静态资源；PTY、SQLite 等原生库已经包含 Windows、macOS、Linux 版本。Python 是宿主进程，所以不放进 JAR。

---

## 五、验证记录

已在 Windows 上完成以下验证：

- 只复制 `xuya-backend.jar` 到临时目录，不依赖仓库文件，用 JDK 17 启动成功。
- `/api/health` 返回 `ready`，首页返回 HTTP 200。
- `package-jar.mjs` 生成的 `start.cmd` 在 JDK 17 下启动成功。
- `.env.example` 复制为 `.env` 并填写 JDK 17 后，即使系统 PATH 默认是 JDK 8，也能用 JDK 17 启动。
- `start.cmd` 在未配置 JDK 17 时给出明确的"需要 JDK 17+"提示。
- 运行包自动创建 `data` 和 `logs`，不写入源码目录。
- 重复打包会保留 `data`、`logs`、`.env` 和 `config/application-local.yml`；zip 只包含程序文件。
- `start.sh` 在 Windows Git Bash 下用假 JDK 模拟验证：`.env` 优先、空值不覆盖、CRLF 与引号、`~` / `$HOME` / `${HOME}` 展开、`JAVA_HOME` 指向 `bin`、旧 JDK 诊断、缺少 `.env` 提示、自动补执行位、PATH 与常见安装目录探测，共 12 项通过。
- 启动脚本读取 `config/network.json` 决定 `XUYA_BIND_ADDRESS`，并优先采用 `.env` / 系统环境变量；启动前会停止同一数据目录的旧实例，避免 `backend.lock` 冲突。
- 打包脚本会在 zip 中央目录给 `start.sh` 写入 `0755`，macOS 解压后可直接执行；noexec 卷仍推荐 `bash start.sh`。

macOS 真实启动仍需在 Mac 上按"源码包"或"跨平台 JAR 运行包"各跑一次；本机只能完成 Windows 实跑和 macOS 分支模拟。
