---
name: github
description: 查询真实 GitHub 仓库、Issue、Pull Request 和 CI，并在批准后创建 Issue 或草稿 PR。
---

# GitHub 工作流

使用 github_query 查询 repository、pulls、issues 或 actions，读取返回结果及来源产物；CI 结论必须依据真实 runs 的 status/conclusion，不从提交信息猜测。

提交 Issue 使用 github_create_issue；创建草稿 PR 使用 github_create_draft_pull_request。这些操作由原生 PermissionEngine 请求批准。不要通过其他工具绕过批准，也不要在技能文本中声明已经批准。

草稿 PR 的 head 必须是已存在的远端分支。工具不会替用户 commit 或 push；本地代码修改、验证和差异审阅与远端写入分别完成。密钥只由后端从本机环境变量读取，不要求用户在消息、源码或终端命令中粘贴 Token。

保留真实 URL、响应产物和执行状态。缺凭证、网络失败、权限不足或不存在的远端分支应说明对应限制，不产生模拟 Issue/PR，不声称发布成功。
