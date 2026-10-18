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

**日常正式使用**（页面和 API 都在 43172）：

```powershell
node backend/scripts/build.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/run-jar.ps1
```

**开发调试**（热更新页面在 43171，API 代理到 43172）：

```powershell
npm.cmd --prefix frontend-react ci
node backend/scripts/dev.mjs
```

依赖已装且锁文件未变时可跳过 `ci`。脚本读 `backend/config/ports.json`，端口被占用时自动换空闲端口，以终端输出为准。Java 17 用 `D:\GreenSoft\java\jdk-17.0.14`、Maven 用 `D:\GreenSoft\apache-maven-3.9.11`，Node.js 需 22.12+。两种用法的区别见[本地开发与首次使用](./docs/getting-started.md#启动)。

> **没有预置账号或默认密码。** 首次打开先创建超级管理员，再到「家人账户」添加学习者。Python 通常无需手动选择：安装版优先内置，源码版自动使用本机已安装的 Python。

## 关键边界

- **家庭可信执行**：代码以启动软件的 Windows 用户权限运行，任务目录只是组织方式，不是操作系统安全沙箱。
- **密钥**：模型 Key 只放 Git 忽略的 `backend/config/application-local.yml`，不发前端、不进 JAR 或安装包。
- **数据**：开发数据在 `backend/data`，安装版在 `%LOCALAPPDATA%\XuyaIsland`；升级前自动做一致性备份。
- **阶段边界**：日常改动先不做手机端适配与 Electron 打包，留到专门阶段统一处理。

## 验证

```powershell
npm.cmd --prefix frontend-react test
npm.cmd --prefix frontend-react run format:check
& backend/scripts/backend.ps1 -Task test
node backend/scripts/build.mjs
npm.cmd --prefix frontend-react run test:e2e
```

浏览器测试用随机端口、临时 SQLite 和空模型配置，不碰正式学习数据。日常开发不启动 Electron，桌面打包入口见 [Electron 说明](./electron/README.md)。

## 文档

- [首次使用与家庭配置](./docs/getting-started.md#first-use) · [本地开发上手](./docs/getting-started.md)
- [Java 规范](./docs/java-style.md) · [成人工作台（码穹）](./docs/workbench.md)
- 模块说明：[后端](./backend/README.md) · [React](./frontend-react/README.md) · [Electron](./electron/README.md)
- [文档索引](./docs/README.md)
