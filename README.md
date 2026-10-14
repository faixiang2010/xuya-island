# 叙芽岛 · XuyaIsland

**AI 亲子 Python 创作室，让故事，在代码里长大。**

工程版本 0.2.1，规划修订 3.12。正式前端为 `frontend-react`，后端为 Java 17；成人 codex 工作台与儿童教学空间分别校验权限。当前先打磨 Java/React 功能，桌面安装与升级按独立验收流程推进。

## 当前能力与边界

| 模块 | 当前可用 | 尚待完成 |
|---|---|---|
| 家庭账户 | 首次本机建超级管理员、建号/角色/菜单、初始密码修改、验证码、账户数据隔离 | 真实家庭使用反馈 |
| 学习入口 | 侦探手册路线、字母数字与拼音汉字游戏、学习主题、三段本地教学视频 | 真实儿童试学 |
| 编程与创作 | 六阶段48活动、离谱小镇前四集、多文件创作、作品版本、候选采用/拒绝/撤销 | 故事第5–24集 |
| Python | 主机原生解释器、实时input、预设输入、画笔/舞台、停止与超时、Windows Job回收进程树 | 更多Conda、缺库及内存极限实测 |
| 学习成长 | 活动事实、积分账本、礼物审批、成长手册、跨设备续学、显式旧浏览器记录导入 | 全级个人纪录、编程复习变式、管理备份界面 |
| 小奇 | AgentScope持续共创、受控教学工具、SSE恢复；模型未配置时仍可编辑/运行/保存 | 真实厂商工具兼容与兴趣效果验证 |
| 成人codex | 独立/项目聊天、持久会话、终端、文件、工具审批、Git工作区、技能和插件入口 | 会话迁移/分叉/排队、完整Git审阅与插件生命周期等，见主规划第15节 |
| 桌面与共享 | 内置/自备Python切换、托盘、局域网HTTP、NSIS验收包、草稿Release流水线 | 真实第二设备、干净电脑安装、真实自动升级闭环与正式签名 |

运行通过、练习完成与知识掌握分别记录。历史验证结果不代表当前全部功能已验收。

## 本地启动

在项目根目录执行：

```powershell
npm.cmd --prefix frontend-react ci
node backend/scripts/dev.mjs
```

依赖已安装且锁文件未变时可跳过 `ci`。项目默认使用 `D:\GreenSoft\java\jdk-17.0.14`、`D:\GreenSoft\apache-maven-3.9.11`，不修改系统默认JDK 8；Node.js需22.12或更新。其他路径通过 `XUYA_JAVA_HOME`、`XUYA_MAVEN_HOME` 设置。

页面默认 [43171](http://127.0.0.1:43171)，API默认43172；43173为历史资源端口配置，正式原生教学无需独立浏览器Python服务。脚本依据 `backend/config/ports.json`（未配置时使用example模板）选择端口，其他程序占用时改用空闲端口，以终端实际地址为准。

首次打开先创建超级管理员，再到“家庭管理 → 运行与共享”检查并使用主机 Python；“家人账户”可添加学习者。安装版优先显示可用的内置 Python；无公开注册，新增账户首次登录须修改初始密码。儿童账户没有成人 codex 或家庭管理权限。“我的成长”先看最近探索，礼物和积分在“心愿礼物”。

**没有预置账号或默认密码**：管理员账号密码由首次使用的大人自行设置，家人初始密码由管理员提供。详细步骤见[首次使用与家庭配置](./docs/getting-started.md#first-use)，包括密码规则、环境配置、重置密码、小奇和局域网共享。

界面正文和输入以 16px 为主，功能性辅助文字至少 14px。登录表单保持水平对齐，家庭管理与成长页沿用暖色手册布局。本轮验收聚焦电脑端，手机适配留给后续专门阶段。

## 学习与数据

从首页开始/继续，先练打字或直接进入编程课堂。课堂可以分次完成，提示和参考渐进展开；保存作品与保存学习记录是不同操作。故事中的代码改变二维舞台，可带进小奇创作室继续。自由共创默认“陪我改”，完整制作候选需孩子明确选择“帮我做出来”。

Python每次使用独立进程与任务目录，Windows Job负责限制与回收。**家庭可信执行具有启动软件的Windows用户权限，任务目录不是操作系统安全沙箱。** 教学AI不接入任意宿主Shell；成人终端只在独立codex域中使用。项目文本支持最多32文件、单文件64 KiB、合计512 KiB、最多四层相对路径。

SQLite保存账户、作品、学习记录及账本，当前迁移至V9；升级前做一致性备份。开发数据在 `backend/data`，安装版在 `%LOCALAPPDATA%/XuyaIsland`。同一后端提供账户续学；浏览器草稿按账户和来源保留，旧浏览器记录需显式导入。管理员启用局域网共享后重启服务，远端设备无需安装Python，运行依赖主机在线。

模型Key只放在Git忽略的 `backend/config/application-local.yml`，格式见同目录example模板；也可通过 `XUYA_MODEL_*` 环境变量注入。Key不发前端、不随JAR或安装包分发。模型可能接收允许的课程资料、作品及运行快照。

## 验证与构建

```powershell
npm.cmd --prefix frontend-react test
npm.cmd --prefix frontend-react run format:check
& backend/scripts/backend.ps1 -Task test
node backend/scripts/build.mjs
npm.cmd --prefix frontend-react run test:e2e
node backend/scripts/check-docs.mjs
```

集成JAR在 `backend/dist/xuya-backend.jar`；通过 `backend/scripts/run-jar.ps1` 运行。浏览器测试使用随机端口、临时SQLite和空模型配置，不连接正式学习数据。`test:curriculum`、`test:adventure`仍为历史Pyodide课程兼容检查，不能代替主机原生Python验收。

日常开发不启动Electron；桌面验证与打包入口见 [Electron说明](./electron/README.md)。现有验收包位于 `electron/dist/family-validation`。推送 `v*` 标签会构建草稿Release；正式发布与升级验收仍需单独确认，本项目不自行提交或推送Git。

## 文档与维护

- [文档索引与目录职责](./docs/README.md)：按阅读目的选择入口。
- [本地开发快速上手](./docs/getting-started.md)、[Java规范](./docs/java-style.md)、[codex接口与开发](./docs/codex.md)。
- 模块说明：[后端](./backend/README.md)、[React](./frontend-react/README.md)、[Electron](./electron/README.md)。

源码、依赖、日志和产物归各自模块；根目录不建立npm工作区。交付前归档必要证据，执行 `backend/scripts/clean.ps1 -WebOnly` 清理编译与测试中间物，保留正式dist、用户数据、本机配置和未参与本轮的Electron产物。
