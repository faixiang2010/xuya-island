# 打包与跨平台分发

这篇文档只解决一个问题：**先看目标机器有什么，再决定打成什么包**。不要混用“源码包”“JAR 运行包”和“Windows 安装包”。

## 先选产物

| 产物 | 生成命令 | 目标机器需要 | 包含 JDK | 包含 Python | 适用场景 |
|---|---|---|---|---|---|
| 源码包 | `git archive` 或压缩源码目录 | Node 22.12+、JDK 17+、Maven 3.9+ | 否 | 否 | 继续开发、在 Mac 上重新构建 |
| **跨平台 JAR 运行包** | `node backend/scripts/package-jar.mjs` | **只需要 JDK 17+** | 否 | 否 | **复制到另一台 Windows/Mac/Linux 直接运行（最常用）** |
| Windows 桌面安装包 | `npm --prefix electron run dist` | Windows | 是 | 是 | 给 Windows 家庭用户双击安装，不想另装 Java/Python |

一句话选择：

- **只要求目标机器有 JDK** → 用跨平台 JAR 运行包。
- **目标机器还要继续写代码** → 用源码包。
- **Windows 用户要双击安装、不关心 Java/Python** → 用 Electron 安装包。
- **macOS 用户要 .app 双击安装** → 目前没有实现。

---

## 一、跨平台 JAR 运行包（重点）

这是“在 Windows 上打包，复制到其他环境，只要有 JDK 就能用”的方式。

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

### 2. 产物位置

```text
backend/dist/xuya-portable/
  xuya-backend.jar
  start.cmd                 # Windows 启动
  start.sh                  # macOS / Linux 启动
  .env.example              # 配置模板；复制为 .env 后填写
  config/
    application-local.example.yml
  README.md                 # 给使用者看的运行说明
backend/dist/xuya-portable.zip
```

运行包自带 `.env.example`，但不会预置 `.env`。复制成 `.env` 后再填写自己的配置。`backend/dist` 已被 Git 忽略，运行包不会提交到仓库。

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

注意 `JAVA_HOME` 指向 **JDK 根目录**，不是 `bin` 目录。机器上装了多个 JDK 时，把这里改成你希望叙芽岛使用的那一个；启动脚本会优先使用它，不再依赖 PATH 默认版本。

端口、数据目录、局域网共享、Python 和模型 Key 也可以直接写在 `.env`，`.env.example` 里已有注释示例。

### 4. 复制到目标机器

复制 `xuya-portable.zip` 或整个 `xuya-portable` 目录即可。目标机器只需要 JDK 17+，并先在 `.env` 填好 `JAVA_HOME`。

Windows：

```powershell
# 解压后进入目录
.\start.cmd
```

macOS / Linux：

```bash
# 从 Windows 压缩包解压后，start.sh 可能没有执行权限
bash start.sh
```

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

启动脚本会优先使用 `JAVA_HOME`，没有则使用 `PATH` 里的 `java`。如果 `PATH` 默认是 JDK 8，脚本会明确提示“需要 JDK 17+”，不会直接抛出难以理解的类版本错误。

### 7. 端口与环境变量

优先写在 `.env`；下面的系统环境变量方式适合临时覆盖。

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

推荐启动后由管理员进入「家庭管理 → 运行与共享 → Python 环境」选择解释器，选择结果保存在 `data` 里。

不想打开界面时，可以在 `.env` 中写 Python 可执行文件的绝对路径：

```text
XUYA_BUNDLED_PYTHON=C:/Python313/python.exe
```

注意这里是 `python.exe` / `python3` 文件，不是 Python 安装目录。

JAR 不内置 Python；不装 Python 仍可启动、浏览、编辑和保存，只是不能运行课堂代码。

#### 模型 Key

推荐放在运行包目录的 `config/application-local.yml`。先复制模板：

```bash
cp config/application-local.example.yml config/application-local.yml
```

然后填写：

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

`.env` 会由启动脚本导出为环境变量，`application.yml` 会读取这些变量。两种方式二选一即可，修改后重启生效。

不配模型 Key 不影响启动、学习和运行 Python，只影响小奇与成人工作台的 AI。

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
| `config/application-local.yml` | Java 后端启动时读取 | 结构化应用配置，模型与可选服务 |

`.env` 本身不会被 Java 直接读取；手动执行 `java -jar` 时不会自动加载 `.env`，需要用启动脚本，或自己设置环境变量。

### 9. 局域网共享

启动前在 `.env` 中取消注释并改为 `XUYA_BIND_ADDRESS=0.0.0.0`，或临时设置：

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

### 11. 常见问题

| 现象 | 处理 |
|---|---|
| 提示“未找到 Java” | 安装 JDK 17+，设置 `JAVA_HOME`，或把 `java` 加入 PATH |
| 提示“当前 Java 版本…需要 JDK 17+” | PATH 里的 `java` 是旧版本；在 `.env` 写 `JAVA_HOME=JDK 17+ 根目录` |
| 机器有多个 JDK | 在 `.env` 写 `JAVA_HOME=想使用的 JDK 17+ 根目录`，启动脚本优先使用它 |
| 页面打不开 | 看控制台端口提示；确认 `XUYA_PORT` 未被占用 |
| 课堂提示未配置 Python | 安装 Python 3，或在家庭管理手动选择 |
| 局域网其他设备打不开 | 设置 `XUYA_BIND_ADDRESS=0.0.0.0`，检查防火墙 |
| 想换数据目录 | 在 `.env` 写 `XUYA_DATA_DIR=新目录` |

---

## 二、源码包

适合“目标机器还要继续开发”，或者想在 Mac 上重新构建。

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

目标机器需要 Node 22.12+、JDK 17+、Maven 3.9+；Python 和 Git 可选。源码包**不含 JDK 和 Python**，也不含依赖缓存。

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
- `start.cmd` 在未配置 JDK 17 时给出明确的“需要 JDK 17+”提示。
- 运行包自动创建 `data` 和 `logs`，不写入源码目录。
- 重复打包会保留 `data`、`logs`、`.env` 和 `config/application-local.yml`；zip 只包含程序文件。

macOS 真实启动仍需在 Mac 上按“源码包”或“跨平台 JAR 运行包”各跑一次；本机只能完成 Windows 实跑和 macOS 分支模拟。
