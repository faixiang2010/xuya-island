# 叙芽岛本地开发快速上手

日常在Java/React中开发和验证；需要安装包时使用[Electron说明](../electron/README.md)中的独立入口。

## 准备与启动

工具默认路径：Java 17为 `D:\GreenSoft\java\jdk-17.0.14`，Maven为 `D:\GreenSoft\apache-maven-3.9.11`，Node.js需22.12或更新。脚本不修改系统默认JDK 8；其他安装位置设置 `XUYA_JAVA_HOME`、`XUYA_MAVEN_HOME`。

```powershell
Set-Location 'D:\electron\xuya-island'
npm.cmd --prefix frontend-react ci
node backend/scripts/dev.mjs
```

保留终端，等待输出实际页面地址。依赖与锁文件未变时可跳过ci。联合启动先等Java健康检查，再启动Vite并检查代理；若出现代理错误，查看后端是否就绪或已退出。

| 默认端口 | 用途 |
|---|---|
| 43171 | React开发页面 |
| 43172 | Java API；`/api/health`查看应用身份与就绪信息 |
| 43173 | 历史Python资源端口配置，正式原生教学不依赖该服务 |

端口优先读取 `backend/config/ports.json`，缺少时使用提交的 `ports.example.json`。启动检查进程路径与入口，确认本工程遗留服务才处理；其他程序占用时改用空闲端口，自动同步代理/允许来源。以终端输出为准。

第一次打开在本机创建超级管理员，在“家庭管理 → 运行与共享”确认主机解释器，再从“家人账户”添加学习者。新增账户首次登录需改初始密码；不提供公开注册。安装版优先显示可用的内置 Python，源码开发选择已有解释器。

<a id="first-use"></a>

## 首次使用与家庭配置

### 账户和密码从哪里来

**程序没有预置登录账户，也没有通用默认密码。** 数据库初始化只创建角色、菜单和设置，不创建可登录用户。测试中的账户和密码只用于临时测试库，不能拿来登录正式软件。

| 使用阶段 | 账户和密码 | 操作 |
|---|---|---|
| 第一次准备小岛 | 大人自行设置超级管理员账号、昵称和密码 | 在安装/运行叙芽岛的主机上完成初始化 |
| 添加家人 | 管理员填写家人的账号、昵称和初始密码 | 在家庭管理中添加账户、分配角色 |
| 家人首次登录或密码被重置后 | 先使用管理员提供的初始/重置密码 | 按页面要求改成自己的密码，重新登录 |
| 以后使用 | 使用自己设置的账号和密码 | 不需要重复初始化或配置Python |

账号使用3–40位英文字母、数字、下划线或短横线；昵称可使用中文。密码需要8–64个字符，UTF-8编码不超过72字节（中文等多字节字符也计入字节限制）。账号创建后不能修改，密码不在说明文档中保存。

### 1. 创建第一个管理员

1. 源码开发按上方步骤启动，在主机上打开终端显示的本机页面；安装版直接打开叙芽岛。
2. 全新数据目录会显示“先请大人准备小岛”。填写账号、管理员昵称和自己选择的密码，完成创建。
3. 记住这组账号密码，进入“家庭管理”配置环境和家人账户。第一个管理员同时具备超级管理员和学习者角色。

初始化只能在主机本地完成，其他设备不能通过局域网代建管理员。已有数据时显示登录页，使用之前创建的账号；重启、重装或升级不会给已有学习库重新生成默认密码。

### 2. 配置Python

- **安装版**：进入“家庭管理 → 运行与共享”，可用的内置 Python 会优先显示；选中后点“检查并使用”。如果安装包没有可用的内置环境，页面会说明现状。
- **源码开发或自定义环境**：先从发现的环境中选主机解释器；找不到时展开“手动填写路径”，填写可执行文件的完整路径（Windows 通常为 `python.exe`，不是安装文件夹），点“检查并使用”。已有虚拟环境也需选择其中的解释器。检查失败时保留原配置和刚填的路径。
- 解释器配置由家庭共用，家人设备无需安装Python。程序不自动安装pip或第三方库；需要额外库时由管理员准备自定义环境。

未配置模型Key也能运行Python、学习固定内容和保存作品；Python未准备好时仍可编辑和查阅，执行需先完成环境配置。

### 3. 添加家人和分配权限

在“家庭管理 → 家人账户”点“添加账户”，填写账号、昵称和初始密码。新账户默认是“学习者”；需要成人 codex 工作台时，明确选择“成人开发者”，如也需上课可同时保留“学习者”。角色、菜单、登录防护和奖励规则在右上角“高级设置”。家庭管理由超级管理员负责。

把账号和初始密码交给对应家人。首次登录进入改密页，用初始密码验证并设置新密码，然后重新登录。没有公开注册入口，孩子账户不应分配成人开发或超级管理员权限。验证码默认始终显示，管理员可调整为失败后启用或关闭。

普通家人忘记密码时，管理员在账户列表点“重置密码”，确认对象并填写新临时密码；对方重新登录后再次改密。昵称与身份通过“编辑资料”调整，账户可单独停用，最后一个有效超级管理员不能停用。如果唯一超级管理员忘记密码，当前没有自助找回入口，需人工协助恢复；不要删除学习数据库来重建账户。

### 4. 可选：配置小奇和局域网共享

| 配置 | 如何设置 | 是否必须 |
|---|---|---|
| 教学小奇模型 | 源码开发在Git忽略的 `backend/config/application-local.yml` 配置，参考同目录example模板；安装版使用数据目录下 `config/application-local.yml`。教学模型通过 `XUYA_MODEL_PROVIDER`、`XUYA_MODEL_BASE_URL`、`XUYA_MODEL_NAME`、`XUYA_MODEL_API_KEY` 等配置项指定，修改后重启 | 使用教学AI时需要；固定课程、编辑、运行、保存不需要 |
| 成人codex模型 | 成人在独立codex工作台的模型设置中填写服务地址、模型名和Key | 使用成人AI时需要，与教学小奇配置区分 |
| 局域网共享 | 家庭管理的“运行与共享”中开启共享，修改后点“保存共享设置”；出现“等待重启”时按页面提示操作。安装版从托盘明确退出后再打开，源码开发停止并重新启动服务 | 仅其他设备访问时需要 |

共享启用后，把管理页面显示的实际访问地址交给同一局域网的家人，用各自账户登录；主机必须保持运行。共享时安装版关闭窗口会收进托盘，明确退出会停止自己启动的服务。成人codex仍只在主机本地开放。

### 5. 确认可以开始学习

用学习者账户进入第一课，运行一段简单的 `print()`，确认有输出，再保存作品并刷新查看。游戏/成长记录与作品按账户保存到同一后端，浏览器未保存草稿另外保留。

开发数据在 `backend/data`，安装版在 `%LOCALAPPDATA%/XuyaIsland`。升级前数据库会做一致性备份；不要在首次配置、忘记密码或排障时随意删除这些目录。首次配置不要求填写GitHub发版证书、JEV或Studio等可选开发服务。

## 修改与调试

| 修改内容 | 位置 | 生效方式 |
|---|---|---|
| 页面、组件、样式 | `frontend-react/src` | React热更新，必要时刷新 |
| Java协议/规则/存储 | `backend/src/main/java` | 重启Java |
| 原生Python协议与适配 | `backend/src/main/resources/python`、Java的execution包、`frontend-react/src/runner` | 重启后端，必要时重新构建 |
| 课程与活动资源 | `backend/src/main/resources/curriculum`、前端版本化学习目录 | 通过脚本生成到target，再重启/构建 |

浏览器F12查看Console与 `/api/` 请求。Java日志在终端与 `backend/logs/backend.log`，成人工作台日志在 `backend/logs/codex`。不输出模型Key或第三方异常正文。

IDEA打开 `backend/pom.xml`，选择JDK 17，工作目录为backend。先运行 `node --experimental-strip-types frontend-react/scripts/prepare-learning-catalog.mjs` 准备版本化资源，再执行Maven `process-resources`，Debug启动 `com.xuya.island.XuyaIslandApplication`；另一终端运行 `npm.cmd --prefix frontend-react run dev`。不要同时启动两份后端；IDE独立运行时自行保证端口和前端来源与配置一致。

模型Key放Git忽略的 `backend/config/application-local.yml`，参考example模板，重启加载。源码数据在 `backend/data`，安装数据在 `%LOCALAPPDATA%/XuyaIsland`；不要用正式学习库跑自动化测试。

## 验证与构建

```powershell
npm.cmd --prefix frontend-react test
npm.cmd --prefix frontend-react run format:check
& backend/scripts/backend.ps1 -Task test
node backend/scripts/build.mjs
# 自动构建当前源码，随机端口、临时SQLite、关闭真实模型
npm.cmd --prefix frontend-react run test:e2e
# 本轮已构建后，单独复验当前家庭版场景
npm.cmd --prefix frontend-react run test:e2e -- --reuse-build family-account.spec.ts
# 通过本机私有IPv4验证HTTP流程；不代表真实第二设备验收
npm.cmd --prefix frontend-react run test:e2e -- --reuse-build --lan family-account.spec.ts
node backend/scripts/check-docs.mjs
```

目前部分浏览器测试仍针对历史免登录/Worker入口，完整套件的迁移是待确认事项。家庭场景的通过不能替代全套覆盖。课程 `test:curriculum` / `test:adventure`仍使用Pyodide，只证明历史兼容；正式教学通过原生Python专项及家庭场景验证。

一体JAR在 `backend/dist/xuya-backend.jar`，运行入口为 `backend/scripts/run-jar.ps1`。Java格式/风格由构建检查；React格式检查包含共享构建脚本。契约变更执行 `npm.cmd --prefix frontend-react run contract:check`。

## 执行故障与停止

课堂默认实时input，预设输入用于重复检查，每次执行是新的主机Python进程。等待回答、停止和超时由原生协议管理，不需要浏览器SharedArrayBuffer或旧iframe隔离响应头。Python未配置时到家庭管理选择环境；选择失效或连接失败时查看运行按钮旁原因，确认主机在线后重新准备。刷新前先保存/复制无法暂存的代码。

任务目录不是安全沙箱，代码具有启动软件的Windows用户权限。旧 `frontend-react/runner`是历史兼容源码，修改它不会改变正式教学执行。

联合终端Ctrl+C停止本次前后端。清理前先停止本项目服务；Guard会检查归属并阻止误删正在运行的目录。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/clean.ps1 -WebOnly
git status --short
```

清理保留真实数据、配置、日志、依赖和正式dist，本轮不清理Electron旧产物。PowerShell源码使用UTF-8 BOM以兼容Windows PowerShell 5，其他源码使用UTF-8；不要把生成物写回src或把日志移到根目录。

契约检查需要已启动的本机后端（`XUYA_OPENAPI_URL`指定实际地址），或通过 `--from-files`读取导出的两个OpenAPI JSON；默认43172未启动时会连接失败。独立隔离验收可运行 `npm.cmd --prefix frontend-react run test:e2e -- --reuse-build codex.spec.ts -g OpenAPI`，只比较现有类型，不改写源码。
