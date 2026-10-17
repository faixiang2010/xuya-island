# 叙芽岛 Java 开发规范

本项目按老大提供的[阿里云文章](https://developer.aliyun.com/article/1589859)及[Alibaba P3C 官方仓库](https://github.com/alibaba/p3c)实施。2026-10-10 核验时，官方仓库 README 将黄山版（2022-02-03）列为最新版本；文章的发布时间不等同于手册版本。

## 代码组织

```text
com.xuya.island
├── account/      家庭账户、角色菜单、本机信任与局域网共享
├── lesson/       内置课程，controller / service / vo
├── learning/     学习记录与练习尝试，controller / dto / repository / service / vo
├── adventure/    冒险剧情课程，controller / service / vo
├── work/         作品，controller / dto / entity / repository / service / vo
├── attempt/      实际运行记录，controller / dto / entity / repository / service
├── studio/       创作室项目与学习会话，controller / dto / repository / service / vo
├── growth/       成长账本、积分与礼物审批
├── execution/    主机原生 Python 执行、Windows Job 回收与执行世界
├── ai/           agent / controller / dto / service
├── 成人工作台包/  工作区、终端、插件、决策与配置
├── agentapi/     会话、AG-UI 协议与访问凭据
├── observability/日志、追踪与脱敏
├── config/       SQLite、配置、数据目录锁、隔离资源服务、来源限制
└── common/       业务异常、统一错误响应、就绪接口
```

作品保存调用链是 `WorkController → WorkService → WorkServiceImpl → WorkRepository → JdbcWorkRepository`。`SaveWorkRequest` 是输入 DTO，`WorkDO` 对应数据库，`WorkVO` 对应页面响应。小模块没有为了层数额外引入空接口；需要第二种实现时再抽象。

## 编码规则

- 产品根包、测试根包和 Maven groupId 统一为 `com.xuya.island`，入口为 `XuyaIslandApplication`。业务命名按实际职责表达，配置模板、课程示例和测试夹具保留对应用途的名称。
- Java 17、UTF-8、4 空格；类使用 UpperCamelCase，方法与变量使用 lowerCamelCase，常量使用 UPPER_SNAKE_CASE。
- 使用显式 import；构造器注入依赖；覆盖接口方法加 `@Override`；不使用过时 API。
- 类注释解释职责，关键代码解释原因。代码长度、超时等边界用具名常量表达。
- Controller 保持简短：校验 DTO，再调用用例。业务判断与事务放 Service，SQL 放 Repository。
- SQL 绑定参数，不拼接孩子输入。当前版本与历史版本在同一事务写入；revision 冲突返回 HTTP 409，不静默覆盖。
- 捕获可以处理的异常；禁止空 catch。凭证、孩子问题与代码不写普通运行日志；SDK 异常正文不返回页面。
- 同步 JDBC/SDK/文件工作通过 `boundedElastic` 调度。一个事务在同一任务内执行，不拆到不同 Reactor 线程。
- SQLite 表名与列名使用小写下划线，时间列 `gmt_create` / `gmt_modified`；设计迁移而不是启动时反复重建数据库。

## 自动检查与验证

`mvn verify` 的 validate 阶段运行 Checkstyle，检查 Tab、通配导入、未使用导入、命名与空 catch。它覆盖部分手册规则，不能替代架构、事务、权限和注释的人工检查。

JUnit 测试使用真实临时 SQLite，覆盖中文恢复、事务回滚、同时保存冲突、API 参数和来源限制。Harness 测试真实装配 Agent，模型返回固定响应；兼容接口使用本机 HTTP 服务验证路径与请求内容。

```powershell
Set-Location 'D:\electron\xuya-island'
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/backend.ps1 -Task test
```
