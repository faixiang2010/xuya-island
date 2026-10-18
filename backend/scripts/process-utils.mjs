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

/** npm 入口：优先使用当前 Node 的 npm-cli.js，macOS 上再回退到 PATH 里的 npm。 */
function resolveNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  ]
  return candidates.find((candidate) => candidate && existsSync(candidate)) || ''
}

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
      `请先在项目根目录执行 npm --prefix ${path.basename(directory)} ci。`,
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
  const { runPorts } = await import('./ports.mjs')
  try {
    return await runPorts(mode, ports)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (mode === 'Guard') {
      if (message.includes('Close the project backend or desktop'))
        throw new Error('请先关闭本项目后端或桌面，再构建或清理；服务可能使用了自动选择的端口。')
      throw new Error(`无法完成构建前的进程归属检查：${message}`)
    }
    throw new Error(`端口检查失败：${message}`)
  }
}

export function npm(args, options = {}) {
  const cli = resolveNpmCli()
  if (cli)
    return spawn(process.execPath, [cli, ...args], {
      cwd: frontendDirectory,
      stdio: 'inherit',
      ...options,
    })
  if (process.platform === 'win32')
    throw new Error('没有找到 npm，请安装包含 npm 的 Node.js，或设置 npm_execpath。')
  return spawn('npm', args, {
    cwd: frontendDirectory,
    stdio: 'inherit',
    ...options,
  })
}

export function backend(task, options = {}) {
  return spawn(process.execPath, [path.join(root, 'backend/scripts/backend-task.mjs'), task], {
    cwd: root,
    stdio: 'inherit',
    ...options,
  })
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

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function processDescendants(pid) {
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' })
    const children = new Map()
    for (const line of stdout.split(/\r?\n/)) {
      const [childText, parentText] = line.trim().split(/\s+/)
      const childPid = Number(childText)
      const parentPid = Number(parentText)
      if (!Number.isInteger(childPid) || !Number.isInteger(parentPid)) continue
      if (!children.has(parentPid)) children.set(parentPid, [])
      children.get(parentPid).push(childPid)
    }
    const result = []
    const queue = [pid]
    while (queue.length && result.length < 512) {
      const current = queue.shift()
      for (const next of children.get(current) || []) {
        if (result.includes(next)) continue
        result.push(next)
        queue.push(next)
      }
    }
    return result
  } catch {
    return []
  }
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
    if (child.exitCode === null && child.signalCode === null)
      await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(5000)])
    return
  }
  // macOS/Linux 用 ps 进程树只结束本次启动的子进程，避免残留 Maven/Vite/Java。
  const descendants = await processDescendants(child.pid)
  const targets = [...descendants].reverse()
  for (const pid of targets) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* 已退出。 */
    }
  }
  try {
    child.kill('SIGTERM')
  } catch {
    /* 已退出。 */
  }
  if (child.exitCode === null && child.signalCode === null)
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(3000)])
  for (const pid of [...targets, child.pid]) {
    if (!processAlive(pid)) continue
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* 权限或时序变化，保持原状。 */
    }
  }
  if (child.exitCode === null && child.signalCode === null)
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(2000)])
}
