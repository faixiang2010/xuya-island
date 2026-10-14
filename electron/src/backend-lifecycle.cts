import { spawn, type ChildProcess } from 'node:child_process'
import { lanEnabled } from './configuration.cjs'
import fs from 'node:fs'
import path from 'node:path'
import type { DesktopConfiguration, RuntimeAddress } from './configuration.cjs'
import { selectRuntimePorts } from './ports.cjs'

async function health(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1500) })
    const data: unknown = await response.json()
    if (!response.ok || !data || typeof data !== 'object') return false
    const value = data as Record<string, unknown>
    return value.application === 'xuya-island' && value.status === 'ready'
  } catch {
    return false
  }
}

/** 对复用的服务没有进程所有权；只终止自己创建的 Java 子进程。 */
export class BackendLifecycle {
  private owned?: ChildProcess
  constructor(private readonly configuration: DesktopConfiguration) {}

  get ownsRunningProcess(): boolean {
    return !!this.owned && this.owned.exitCode === null && this.owned.signalCode === null
  }

  async start(): Promise<RuntimeAddress> {
    const config = this.configuration
    if (await health(config.preferred.backendOrigin)) {
      if (!config.development) {
        const page = await fetch(config.preferred.backendOrigin, {
          signal: AbortSignal.timeout(3000),
        })
        if (!page.ok || !page.headers.get('content-type')?.includes('text/html'))
          throw new Error(
            '已有后端未提供构建后的页面。开发请用 electron run dev；预览请先构建 JAR。',
          )
      }
      return config.preferred
    }
    if (config.development) throw new Error('请先启动前后端开发服务：node backend/scripts/dev.mjs')
    const address = await selectRuntimePorts(config.preferred)
    if (!fs.existsSync(config.jar) || !fs.existsSync(config.java))
      throw new Error(
        config.packaged
          ? '安装资源不完整，请重新安装叙芽岛。学习数据保存在用户目录中。'
          : '没有找到后端或 Java 运行时。请执行 node backend/scripts/build.mjs。',
      )
    fs.mkdirSync(config.logDirectory, { recursive: true })
    const logFile = path.join(config.logDirectory, 'backend.log')
    const log = fs.openSync(logFile, 'a')
    let child: ChildProcess
    try {
      child = spawn(config.java, ['-Dfile.encoding=UTF-8', '-jar', config.jar], {
        cwd: config.workspaceRoot,
        env: {
          ...process.env,
          XUYA_PORT: String(address.backendPort),
          XUYA_RUNNER_PORT: String(address.runnerPort),
          XUYA_DATA_DIR: config.dataDirectory,
          XUYA_CONFIG_DIR: config.configDirectory,
          XUYA_BIND_ADDRESS: lanEnabled(config) ? '0.0.0.0' : '127.0.0.1',
          ...(config.bundledPython ? { XUYA_BUNDLED_PYTHON: config.bundledPython } : {}),
        },
        windowsHide: true,
        stdio: ['ignore', log, log],
      })
      this.owned = child
    } finally {
      fs.closeSync(log)
    }
    let launchError: Error | undefined
    child.once('error', (error) => {
      launchError = error
    })
    const deadline = Date.now() + 45000
    while (Date.now() < deadline) {
      if (launchError) throw launchError
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(`后端启动失败，请查看 ${logFile}，并检查端口和学习数据目录。`)
      if (await health(address.backendOrigin)) return address
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error(`后端启动超过 45 秒，请查看 ${logFile}。`)
  }

  async stop(): Promise<void> {
    const child = this.owned
    if (!child || !this.ownsRunningProcess) return
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5000)
      child.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
      child.kill()
    })
  }
}
