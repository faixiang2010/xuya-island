# 本地开发与首次使用

日常在 Java/React 中开发验证；需要安装包时看 [Electron 说明](../electron/README.md)。

## 启动

工具默认路径：Java 17 为 `D:\GreenSoft\java\jdk-17.0.14`，Maven 为 `D:\GreenSoft\apache-maven-3.9.11`，Node.js 需 22.12+。脚本不改系统默认 JDK 8；其他位置用 `XUYA_JAVA_HOME`、`XUYA_MAVEN_HOME` 指定。

```powershell
Set-Location 'D:\electron\xuya-island'
npm.cmd --prefix frontend-react ci
node backend/scripts/dev.mjs
```

| 默认端口 | 用途 |
|---|---|
| 43171 | React 开发页面 |
| 43172 | Java API；`/api/health` 查看应用身份与就绪 |
| 43173 | 历史 Python 资源端口配置，正式原生教学不依赖 |

端口读 `backend/config/ports.json`（缺失用 `ports.example.json`）；被占用时换空闲端口，以终端输出为准。

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
- **源码开发**：没有内置时，启动阶段自动从 `PATH` 和常见安装目录（`%LOCALAPPDATA%\Programs\Python`、`C:\Python*`、Program Files）选择一个可用的 Python 3。
- **自动找不到时**：才需要到「家庭管理 → 运行与共享」选择环境，或展开「手动填写路径」填 `python.exe` 完整路径。

解释器家庭共用，家人设备无需装 Python；缺第三方库由管理员准备自定义环境。

未配模型 Key 也能运行 Python、学固定内容和保存作品；Python 未就绪时仍可编辑查阅，执行前需完成配置。

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

```powershell
npm.cmd --prefix frontend-react test
npm.cmd --prefix frontend-react run format:check
& backend/scripts/backend.ps1 -Task test
node backend/scripts/build.mjs
npm.cmd --prefix frontend-react run test:e2e
```

浏览器用例自动构建源码、随机端口、临时 SQLite、空模型配置，走真实管理员登录；不碰正式学习库。一体 JAR 在 `backend/dist/xuya-backend.jar`，入口 `backend/scripts/run-jar.ps1`。

## 排障与清理

| 现象 | 处理 |
|---|---|
| 运行按钮旁提示未配 Python | 到家庭管理选解释器，确认主机在线后重新准备 |
| Vite 代理报错 | 后端未就绪或已退出，看后端日志 |
| 改 Java 不生效 | 重启 Java；页面改动走 React 热更新 |
| 改课程/资源不生效 | 走脚本生成到 target，再重启/构建 |

任务目录不是安全沙箱，代码具有启动软件的 Windows 用户权限；旧 `frontend-react/runner` 是历史兼容源码，改动不影响正式执行。清理前先停服务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/clean.ps1 -WebOnly
git status --short
```

契约检查需已启动后端（`XUYA_OPENAPI_URL` 指定地址）或用 `--from-files` 读导出的 OpenAPI JSON；默认 43172 未启动会连失败。
