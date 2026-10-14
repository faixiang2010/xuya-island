import { execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const frontendModule = 'frontend-react'
if (process.env.XUYA_FRONTEND_MODULE && process.env.XUYA_FRONTEND_MODULE !== 'frontend-react')
  throw new Error('XUYA_FRONTEND_MODULE 仅支持 frontend-react；frontend-vue 已删除。')
export const frontendDirectory = path.join(root, frontendModule)
export const defaultPorts = JSON.parse(
  readFileSync(
    path.join(
      root,
      existsSync(path.join(root, 'backend/config/ports.json'))
        ? 'backend/config/ports.json'
        : 'backend/config/ports.example.json',
    ),
    'utf8',
  ),
)
const execFileAsync = promisify(execFile)
const npmCli =
  process.env.npm_execpath ||
  path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')

export function checkNode() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 12))
    throw new Error('请使用 Node.js 22.12 或更新版本。')
}

export function requireFile(file, message) {
  if (!existsSync(file)) throw new Error(message)
}

export function checkFrontend(directory = frontendDirectory) {
  checkNode()
  for (const file of ['vite/bin/vite.js', 'pyodide/pyodide.mjs'])
    requireFile(
      path.join(directory, 'node_modules', file),
      `请先在项目根目录执行 npm.cmd --prefix ${path.basename(directory)} ci。`,
    )
}

export async function checkPorts(ports) {
  if (
    ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535) ||
    new Set(ports).size !== ports.length
  )
    throw new Error('端口必须是 1 到 65535 的整数，且各服务不能使用相同端口。')
  const reservations = []
  try {
    for (const port of ports) {
      const server = net.createServer()
      await new Promise((resolve, reject) => {
        server.once('error', () =>
          reject(new Error(`端口 ${port} 已被占用，请关闭对应服务或调整配置。`)),
        )
        server.listen(port, '127.0.0.1', resolve)
      })
      reservations.push(server)
    }
  } finally {
    await Promise.all(reservations.map((server) => new Promise((resolve) => server.close(resolve))))
  }
}

export function readDevSession() {
  try {
    const session = JSON.parse(
      readFileSync(path.join(root, 'backend/logs/dev-session.json'), 'utf8'),
    )
    if (
      session.workspace !== root ||
      !Number.isInteger(session.pid) ||
      !session.ready ||
      !['frontend', 'backend', 'runner'].every(
        (key) =>
          Number.isInteger(session.ports?.[key]) &&
          session.ports[key] > 0 &&
          session.ports[key] <= 65535,
      )
    )
      return null
    return session
  } catch {
    return null
  }
}

export async function managePorts(mode, ports = []) {
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(root, 'backend/scripts/ports.ps1'),
    '-Mode',
    mode,
  ]
  if (ports.length) args.push('-Ports', ports.join(','))
  try {
    const result = await execFileAsync('powershell.exe', args, {
      windowsHide: true,
      encoding: 'utf8',
    })
    return JSON.parse(result.stdout.trim())
  } catch (error) {
    if (mode === 'Guard') {
      if (error.stderr?.includes('Close the project backend or desktop'))
        throw new Error('请先关闭本项目后端或桌面，再构建或清理；服务可能使用了自动选择的端口。')
      throw new Error('无法完成构建前的进程归属检查，请检查运行环境权限。')
    }
    throw new Error(`端口检查失败：${error.stderr?.trim() || error.message}`)
  }
}

export function npm(args, options = {}) {
  requireFile(npmCli, '没有找到 npm，请安装包含 npm 的 Node.js，或设置 npm_execpath。')
  return spawn(process.execPath, [npmCli, ...args], {
    cwd: frontendDirectory,
    stdio: 'inherit',
    ...options,
  })
}

export function backend(task, options = {}) {
  return spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(root, 'backend/scripts/backend.ps1'),
      '-Task',
      task,
    ],
    { cwd: root, stdio: 'inherit', windowsHide: true, ...options },
  )
}

export function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`命令退出码：${code}`)),
    )
  })
}

export async function waitForReady(url, timeout = 120000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch {
      /* Service is still starting. */
    }
    await delay(500)
  }
  throw new Error(`服务启动超时：${url}`)
}

export async function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    // 只终止本次启动的 PID 及其子进程，绝不按端口或进程名结束其他服务。
    await new Promise((resolve) =>
      execFile(
        'taskkill.exe',
        ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true },
        resolve,
      ),
    )
  } else child.kill('SIGTERM')
  if (child.exitCode === null && child.signalCode === null)
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(5000)])
}
