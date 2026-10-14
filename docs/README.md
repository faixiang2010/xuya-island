# 叙芽岛文档索引

本页只负责导航。产品状态见根 README。规划文档、验收记录与证据都在本机 `.codex/`（不进 Git）。

## 按阅读目的进入

| 目的 | 入口 |
|---|---|
| 了解当前可用能力、启动和数据 | [项目 README](../README.md) |
| 第一次使用、账号密码、Python 和共享配置 | [首次使用与家庭配置](./getting-started.md#first-use) |
| 启动、调试、验证与清理 | [本地开发快速上手](./getting-started.md) |
| Java 分层与编码规则 | [Java 开发规范](./java-style.md) |
| 成人工作台契约与接入 | [codex 接口与开发](./codex.md) |

## 目录职责

| 位置 | 内容 |
|---|---|
| `docs/` | 提交到 Git 的文档：本页索引 + 上手、Java 规范、codex 接口 |
| `.codex/design/` | 唯一产品、课程与技术规划（本机，不进 Git） |
| `.codex/evidence/` | 本机验收证据与记录（截图、JSON、验证记录），不进 Git |

根目录只保留 README、AGENTS 与共享编辑器/Git 配置；各模块源码、脚本、配置、数据、日志与产物归各自模块。
