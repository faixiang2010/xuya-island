# 叙芽岛 · XuyaIsland

**AI 亲子 Python 创作室 —— 让故事，在代码里长大。**

孩子跟着「离谱小镇」侦探故事，用真实的 Python 改代码、修机器、做出能试玩的作品；大人用小奇陪伴孩子，用成人工作台（码穹）自己开发。整个产品跑在一台家庭电脑上，数据自持，不依赖云端账号。

工程版本 0.1.0。正式前端为 React + TypeScript，后端为 Java 17，数据库为内嵌 SQLite。

## 这是什么

叙芽岛是一个**给家庭用的编程学习与创作环境**，两个角色、一套数据：

| 角色 | 能做什么 |
|---|---|
| 孩子（学习者） | 侦探手册路线学指法/打字/拼音，进「离谱小镇」剧情课写真实 Python，做出能试玩的作品 |
| 大人 | 建号与家庭管理、审阅孩子作品、配 Python 与局域网共享；需要开发时进入「码穹」成人工作台 |

内容已覆盖：六年级上下册全部英语词汇（字母雨/词雨）、部编版六年级上下册 440 个「看拼音写词语」、语文/英语长篇课文打字、六阶段 48 个课堂活动、离谱小镇前四集剧情。

> 故事第 5–24 集、真实家庭试学、正式签名发布仍在推进，不属于当前交付范围。

## 三种用法，先选一种

拿到叙芽岛，最常见的是下面三种情况。**不知道自己属于哪种，直接看最后一行**。

| 我是谁 | 用哪种 | 怎么开始 |
|---|---|---|
| 家庭用户，想在 Windows 上双击就用，不想折腾 Java/Python | **Windows 安装包** | 下载 `XuyaIsland-Setup-*.exe` 双击安装，见[打包与分发](./docs/packaging.md) |
| 想在任意 Windows/macOS/Linux 上跑，机器已有 JDK 17+ | **跨平台 JAR 运行包** | 解压后复制 `.env.example` 为 `.env` 填 `JAVA_HOME`，跑 `start.cmd` / `bash start.sh`，见[打包与分发](./docs/packaging.md) |
| 开发者，要改代码、跑测试、看源码 | **源码开发** | 按[快速上手](./docs/quickstart.md)五分钟跑起来 |

**不确定就选「源码开发」**：它是理解另外两种的起点，也最完整。

## 五分钟跑起来（开发者）

```bash
# 1. 复制工具链模板，填你自己的 JDK 17+ 与 Maven 3.9+ 路径
cp backend/config/toolchain.example.json backend/config/toolchain.json

# 2. 装前端依赖
npm --prefix frontend-react ci

# 3. 启动（自动拉起前后端）
node backend/scripts/dev.mjs
```

启动后浏览器打开 `http://127.0.0.1:43171`，首次进入会引导你创建超级管理员。完整的分步说明（含 macOS、每步的"成功标志"）见[快速上手](./docs/quickstart.md)。

> **没有预置账号或默认密码。** 首次打开先创建超级管理员，再到「家庭管理 → 家人账户」添加学习者。Python 通常无需手动配置：源码版自动选用本机已安装的 Python，安装版优先用内置 Python。

## 关键边界

- **平台**：源码启动、构建、JAR 运行在 Windows 与 macOS 用同一套 Node 命令；Electron 桌面打包目前只做 Windows，留到专门阶段。
- **家庭可信执行**：课堂代码以启动软件的账户权限运行，任务目录只是组织方式，不是操作系统沙箱。Windows 用 Job Object 限制内存并回收子进程；macOS 靠进程树回收，不提供同等内存上限。
- **密钥**：模型 Key 只放 Git 忽略的 `backend/config/application-local.yml`，不发前端、不进 JAR 或安装包。
- **数据**：源码版在 `backend/data`，安装版在 `%LOCALAPPDATA%\XuyaIsland`；升级前自动做一致性备份。

## 验证

```bash
node --test backend/scripts/runtime.test.mjs
npm --prefix frontend-react test
npm --prefix frontend-react run format:check
node backend/scripts/backend-task.mjs test
node backend/scripts/build.mjs
npm --prefix frontend-react run test:e2e
```

浏览器测试用随机端口、临时 SQLite 和空模型配置，不碰正式学习数据；macOS 首次运行前需执行 `npx playwright install chromium`。

## 文档

- [快速上手](./docs/quickstart.md) —— 从零把项目跑起来（推荐先看）
- [本地开发与首次使用](./docs/getting-started.md) —— 依赖、配置、家庭使用全说明
- [打包与跨平台分发](./docs/packaging.md) —— 安装包 / JAR 运行包 / 源码包怎么选、怎么用
- [Java 开发规范](./docs/java-style.md) · [成人开发工作台（码穹）](./docs/workbench.md)
- 模块说明：[后端](./backend/README.md) · [React](./frontend-react/README.md) · [Electron](./electron/README.md)
- [文档索引](./docs/README.md)
