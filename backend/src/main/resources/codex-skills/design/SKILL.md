---
name: design
description: 从当前工作区的设计参考图像实现真实前端源码，构建独立来源预览，并通过 Chrome 快照和截图核验。
---

# 设计到实现

先使用 list_artifacts 查找设计参考，再用 read_artifact 读取真实图像或 PDF 首页。确认模型具有图像能力；未启用图像能力时使用可读文字和用户明确描述，不虚构已看过的图像内容。

用 list_files/read_file 阅读项目技术栈和规则。先复用项目已有组件与样式，再用 write_file 的 expectedHash 写入实际源码。需要 SVG 独立产物时可用 design_export_svg；SVG 导出本身不能代表完成前端实现。

真实构建使用 design_build_preview，指定构建目录、明确命令和生成 index.html 的输出目录。status=build-failed 时分析 build.output/exitCode，修复源码后重试；仅 status=ready 且存在实际 url 才能报告预览可用。静态无构建项目使用 design_static_preview。

预览在独立端口和短效票据下运行，不共享教学运行器或后台凭证。不要请求扩大页面对后端的权限。完成后，在用户已连接的 Chrome 标签执行 design_verify_screenshot，获取真实 DOM 快照与截图产物；再次 read_artifact 比较参考与结果，检查布局、颜色、字体、间距、响应行为并修正。

Chrome 未连接或截图失败时明确说明未完成视觉核验，保留代码、构建结果和预览。不得以测试夹具、占位图或模型猜测替代实际截图证据。
