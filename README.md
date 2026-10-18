# 叙芽岛 · XuyaIsland

**AI 亲子 Python 创作室 —— 让故事，在代码里长大。**

孩子跟着「离谱小镇」侦探故事，用真实 Python 改代码、修机器、做出能试玩的作品；大人用小奇和成人工作台陪伴与开发。正式前端为 `frontend-react`（React + TypeScript + Zustand + React Router），后端为 Java 17。工程版本 0.2.1。

## 现在能做什么

| 模块 | 已可用 |
|---|---|
| 家庭账户 | 首次本机建超级管理员；建号、角色、菜单；改初始密码；验证码；账户数据隔离 |
| 学习入口 | 侦探手册路线；指法学院（十指分区与盲打）、字母雨/词雨（PEP 六年级上下册全部词汇）、语文/英语六年级上下册长篇课文（分卡），以及部编版六年级上下册全部看拼音写词语（440 个）与句子小站；学习主题；三段本地教学视频 |
| 编程与创作 | 六阶段 48 活动；离谱小镇前四集；教学代码逐行中文注释；多文件创作；作品版本；候选采用/拒绝/撤销 |
| Python | 内置优先并自动选用可用解释器；主机原生运行；实时输入；画笔/舞台；停止与超时；Windows Job 回收进程树 |
| 学习成长 | 活动事实；积分账本；礼物审批；跨设备续学；旧浏览器记录显式导入 |
| 小奇 | AgentScope 共创；受控教学工具；SSE 恢复；未配模型仍可编辑/运行/保存 |
| 码穹（成人工作台） | 独立/项目聊天；会话重命名与删除；回答复制、重新生成、评价、朗读与分享；新回答流式输出；终端；文件；工具审批；Git 工作区；天气与公开网页查询 |
| 桌面与共享 | 内置/自备 Python 切换；托盘；局域网 HTTP；NSIS 安装包；自动升级 |

游戏中心的语文和英语分开成两张卡，只收录约 200–500 字长篇，按六年级上册、下册分组；古诗和文言文不再混入长篇列表。

故事第 5–24 集、真实家庭试学、正式签名发布仍在推进，不属于当前交付范围。

## 快速开始

### 本机依赖

| 依赖 | 版本 | 说明 |
|---|---|---|
| JDK | 17+ | 必须显式配置 `javaHome`，脚本不做自动探测 |
| Maven | 3.9+ | 必须显式配置 `mavenHome`，脚本不做自动探测 |
| Node.js | 22.12+ | 含 npm，用于启动、前端构建和脚本 |
| Python 3 | 可选 | 用于课堂运行代码；启动时自动扫描 `PATH` 与常见安装目录 |
| Git | 可选 | 成人工作台的改动/工作区功能需要 |

数据库使用内嵌 SQLite，不需要安装 MySQL、PostgreSQL 或 Redis。模型 Key、Python 与局域网共享都是可选项，详见[本地开发与首次使用](./docs/getting-started.md)。

### 首次配置工具链

JDK 和 Maven 路径不写进源码或文档，也不自动查找。复制模板后填写自己的安装目录：

```bash
cp backend/config/toolchain.example.json backend/config/toolchain.json
```

Windows PowerShell：

```powershell
Copy-Item backend/config/toolchain.example.json backend/config/toolchain.json
```

编辑 `backend/config/toolchain.json`：

```json
{
  "javaHome": "/path/to/jdk-17",
  "mavenHome": "/path/to/apache-maven-3.9"
}
```

也可以用环境变量 `XUYA_JAVA_HOME`、`XUYA_MAVEN_HOME` 临时覆盖。`toolchain.json` 已被 Git 忽略，不会提交。

### 启动

**开发调试**（热更新页面 43171，API 代理到 43172）：

```bash
npm --prefix frontend-react ci
node backend/scripts/dev.mjs
```

**正式使用**（页面和 API 都在 43172）：

```bash
node backend/scripts/build.mjs
node backend/scripts/run-jar.mjs
```

Windows 与 macOS 使用同一套 Node 命令。只有在 PowerShell 拦截 `npm.ps1` 时，才把 `npm` 换成 `npm.cmd`。依赖已装且锁文件未变时可跳过 `ci`。脚本读 `backend/config/ports.json`，端口被占用时自动换空闲端口，以终端输出为准。

### 打包

最常用的是跨平台 JAR 运行包，目标机器只需要 JDK 17+：

```bash
node backend/scripts/package-jar.mjs
```

产物：

```text
backend/dist/xuya-portable/
backend/dist/xuya-portable.zip
```

复制到其他 Windows/macOS/Linux 机器后，先把 `.env.example` 复制为 `.env` 并填写 JDK 17+ 的 `JAVA_HOME`（留空时启动脚本会自动探测），然后 Windows 执行 `start.cmd`，macOS/Linux 先 `chmod +x start.sh` 再 `./start.sh`（或直接 `bash start.sh`）。源码包与 Windows 安装包的区别见[打包与跨平台分发](./docs/packaging.md)。

> **没有预置账号或默认密码。** 首次打开先创建超级管理员，再到「家人账户」添加学习者。Python 通常无需手动选择：安装版优先内置，源码版自动使用本机已安装的 Python。

## 关键边界

- **平台支持**：源码启动、构建、JAR 运行使用同一套 Node 命令；Electron 打包目前仍只做 Windows，留到专门阶段。
- **家庭可信执行**：代码以启动软件的账户权限运行，任务目录只是组织方式，不是操作系统安全沙箱。Windows 用 Job Object 限制内存并回收子进程；macOS 依靠进程树回收，不提供同等内存上限。
- **密钥**：模型 Key 只放 Git 忽略的 `backend/config/application-local.yml`，不发前端、不进 JAR 或安装包。
- **数据**：开发数据在 `backend/data`，安装版在 `%LOCALAPPDATA%\XuyaIsland`；升级前自动做一致性备份。
- **阶段边界**：日常改动先不做手机端适配与 Electron 打包，留到专门阶段统一处理。

## 验证

```bash
node --test backend/scripts/runtime.test.mjs
npm --prefix frontend-react test
npm --prefix frontend-react run format:check
node backend/scripts/backend-task.mjs test
node backend/scripts/build.mjs
npm --prefix frontend-react run test:e2e
```

浏览器测试用随机端口、临时 SQLite 和空模型配置，不碰正式学习数据；macOS 首次运行前需执行 `npx playwright install chromium`。日常开发不启动 Electron，桌面打包入口见 [Electron 说明](./electron/README.md)。

## 文档

- [首次使用与家庭配置](./docs/getting-started.md#first-use) · [本地开发上手](./docs/getting-started.md)
- [打包与跨平台分发](./docs/packaging.md)
- [Java 规范](./docs/java-style.md) · [成人工作台（码穹）](./docs/workbench.md)
- 模块说明：[后端](./backend/README.md) · [React](./frontend-react/README.md) · [Electron](./electron/README.md)
- [文档索引](./docs/README.md)
