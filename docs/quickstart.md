# 快速上手：五分钟跑起来

目标：让**第一次接触本项目的人**，照着做就能把前后端跑起来、打开页面、建好管理员账号。

每一步都给了「成功标志」。卡在哪一步，直接看该步末尾的提示；更多细节和排障在[本地开发与首次使用](./getting-started.md)。

## 你需要装什么

| 依赖 | 版本 | 必装？ | 一句话作用 |
|---|---|---|---|
| JDK | 17+ | ✅ 必装 | 编译、运行后端 |
| Maven | 3.9+ | ✅ 必装 | 拉依赖、编译 |
| Node.js | 22.12+（含 npm） | ✅ 必装 | 启动脚本、前端构建 |
| Python 3 | 3.x | 可选 | 课堂里运行孩子代码；不装也能编辑保存 |
| Git | 2.x | 可选 | 成人工作台的改动/工作区功能 |

数据库用内嵌 SQLite，**不需要**装 MySQL / PostgreSQL / Redis。

> 本项目**不会自动探测** JDK 和 Maven，也不读系统默认 JDK 8。装完必须自己告诉它路径（见第 2 步）。

## 第 1 步：确认依赖装好

分别执行下面命令，看版本号是否符合（`>=` 右侧要求）：

```bash
java -version       # 期望 17 或更高，不要是 1.8
mvn -version        # 期望 3.9 或更高
node -v             # 期望 22.12 或更高
npm -v              # 能显示版本即可
```

- Windows 用 PowerShell；macOS 用终端。
- 若 `java -version` 显示 `1.8`：说明系统默认还是 JDK 8，没关系，第 2 步会显式指定 JDK 17 的路径，无需卸载或修改系统 JDK。

**成功标志**：四条命令都能打印出版本号，且 JDK ≥ 17、Maven ≥ 3.9、Node ≥ 22.12。

## 第 2 步：配置工具链（告诉项目 JDK/Maven 在哪）

先复制模板：

```bash
# macOS / Linux
cp backend/config/toolchain.example.json backend/config/toolchain.json
```

```powershell
# Windows PowerShell
Copy-Item backend/config/toolchain.example.json backend/config/toolchain.json
```

然后打开 `backend/config/toolchain.json`，填入你的 **JDK 根目录** 和 **Maven 根目录**（注意是根目录，不是 `bin`）：

```json
{
  "javaHome": "C:/Java/jdk-17",
  "mavenHome": "C:/apache-maven-3.9"
}
```

- macOS 示例：JDK 写 `/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home`，Maven 写 Homebrew 安装目录（`brew --prefix maven` 查看）。
- Windows 路径用正斜杠 `C:/...` 或双反斜杠 `C:\\...` 都可以。
- 这个文件已被 Git 忽略，不会提交。

也可以用环境变量临时覆盖：`XUYA_JAVA_HOME` 对应 `javaHome`，`XUYA_MAVEN_HOME` 对应 `mavenHome`。

**成功标志**：文件里两个路径都填了，且对应目录下分别存在 `bin/java`（Windows 为 `bin/java.exe`）和 `bin/mvn`（Windows 为 `bin/mvn.cmd`）。

> 填错会怎样：启动脚本会明确报「未配置 JDK 17+」或「JDK 路径无效」，不会静默用错版本。照着提示改路径即可。

## 第 3 步：装前端依赖

```bash
npm --prefix frontend-react ci
```

> 必须带 `--prefix frontend-react`，不要直接在项目根目录跑 `npm install`，否则依赖缓存会落到根目录。

**成功标志**：命令跑完无报错，`frontend-react/node_modules` 已生成。

## 第 4 步：启动

```bash
node backend/scripts/dev.mjs
```

这条命令会**同时拉起前端和后端**，Windows 与 macOS 命令完全一致。

**成功标志**：终端持续输出启动日志，最后能看到端口信息（默认前端 43171、后端 43172；被占用会自动换空闲端口，以终端输出为准）。

## 第 5 步：打开页面，建管理员

浏览器打开开发页面：

```text
http://127.0.0.1:43171
```

首次进入会显示「先请大人准备小岛」，填账号、昵称、密码，创建**超级管理员**。

**成功标志**：创建成功并进入主界面，能看到左侧菜单（家庭管理、学习入口等）。

> 说明：
> - 开发模式看 `43171`（页面会热更新）；`43172` 是后端，开发时只提供 API，不提供最新页面。
> - 想用「正式使用」模式（页面和 API 都在 43172），见[本地开发与首次使用](./getting-started.md#正式使用日常运行)。

## 第 6 步（可选）：验证能跑 Python

1. 以管理员进入「家庭管理 → 家人账户」，添加一个「学习者」账号。
2. 用学习者账号登录，进第一课，跑一段 `print("hello")`。
3. 看到输出、能保存作品，说明 Python 链路也通了。

源码版会自动选用本机已安装的 Python 3；找不到时在「家庭管理 → 运行与共享」手动选解释器，详见[本地开发与首次使用](./getting-started.md#2-配-python)。

## 接下来

- 想知道每一步的详细解释、可选依赖、排障 → [本地开发与首次使用](./getting-started.md)
- 想把程序打包给别人用 → [打包与跨平台分发](./packaging.md)
- 想了解后端/前端/桌面模块分工 → [后端](./../backend/README.md) · [React](./../frontend-react/README.md) · [Electron](./../electron/README.md)

## 常见卡点速查

| 现象 | 一句话处理 |
|---|---|
| `java -version` 是 1.8 | 装 JDK 17，并在 `toolchain.json` 写 `javaHome`，不用改系统默认 |
| 启动报「未配置 JDK 17+」 | 没复制 `toolchain.json` 或没填 `javaHome` |
| 启动报「JDK 路径无效」 | `javaHome` 要填 JDK 根目录，里面要有 `bin/java(.exe)` |
| `npm ci` 很慢或失败 | 用国内镜像：`npm --prefix frontend-react ci --registry=https://registry.npmmirror.com` |
| 打开 43171 打不开 | 后端可能没起来，看启动终端日志；`/api` 代理失败通常是后端未就绪 |
| 页面是旧的 | 开发模式看 43171，别用 43172 验收页面 |
