import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

/**
 * 所有平台统一的端口选择与进程归属检查：
 * Windows 通过 PowerShell 读取 Win32 进程信息，macOS/Linux 使用 lsof 与 ps。
 */

const execFileAsync = promisify(execFile)

export const workspaceRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))

const DEFAULT_PORTS = ['backend', 'runner', 'frontend']
const GUARD_MESSAGE = 'Close the project backend or desktop before building or cleaning.'

function portsFile() {
  const configured = path.join(workspaceRoot, 'backend/config/ports.json')
  return existsSync(configured)
    ? configured
    : path.join(workspaceRoot, 'backend/config/ports.example.json')
}

export function readDefaultPorts() {
  return JSON.parse(readFileSync(portsFile(), 'utf8'))
}

export function readSessionPorts() {
  try {
    const session = JSON.parse(
      readFileSync(path.join(workspaceRoot, 'backend/logs/dev-session.json'), 'utf8'),
    )
    if (session.workspace !== workspaceRoot || !session.ports) return []
    return DEFAULT_PORTS.map((key) => Number(session.ports[key])).filter(isPort)
  } catch {
    return []
  }
}

function isPort(value) {
  return Number.isInteger(value) && value > 0 && value <= 65535
}

function normalizePorts(values) {
  const ports = values.map(Number)
  if (ports.some((port) => !isPort(port)) || new Set(ports).size !== ports.length)
    throw new Error('端口必须是 1 到 65535 的不同整数。')
  return ports
}

/** 依次在 preferred 到 preferred+100 之间寻找可绑定的回环端口。 */
export async function selectPorts(preferred) {
  const requested = normalizePorts(preferred)
  const selected = []
  const reservations = []
  try {
    for (const port of requested) {
      let found = false
      for (let candidate = port; candidate <= Math.min(65535, port + 100); candidate++) {
        if (selected.includes(candidate)) continue
        const server = net.createServer()
        try {
          await new Promise((resolve, reject) => {
            server.once('error', reject)
            server.listen(candidate, '127.0.0.1', resolve)
          })
          reservations.push(server)
          selected.push(candidate)
          found = true
          break
        } catch {
          server.close()
        }
      }
      if (!found) throw new Error(`端口 ${port} 附近没有可用端口，请调整 ports.json 或环境变量。`)
    }
    return selected
  } finally {
    await Promise.all(reservations.map((server) => new Promise((resolve) => server.close(resolve))))
  }
}

/** lsof 的 -Fpct 输出里每个监听进程以 p<pid> 开头。 */
export function parseLsofPids(output) {
  return [
    ...new Set(
      String(output)
        .split(/\r?\n/)
        .filter((line) => line.startsWith('p'))
        .map((line) => Number(line.slice(1)))
        .filter((pid) => Number.isInteger(pid) && pid > 0),
    ),
  ]
}

/**
 * 只有命令同时命中本工程路径和已知入口时才认领进程，避免误杀同名的其他 Java/Vite。
 * macOS 的 ps 命令不保证路径分隔符统一，先统一成 / 再比较。
 */
export function classifyOwner(commandLine, workspace = workspaceRoot) {
  if (!commandLine) return null
  const command = String(commandLine).replaceAll('\\', '/').toLowerCase()
  const root = String(workspace).replaceAll('\\', '/').toLowerCase()
  const backendRoot = `${root}/backend/`
  const frontendRoot = `${root}/frontend-react/`
  const packagedRoot = `${root}/electron/dist/`
  if (
    (command.includes(backendRoot) || command.includes(packagedRoot)) &&
    (command.includes('xuya-backend.jar') ||
      command.includes('com.xuya.island.xuyaislandapplication') ||
      command.includes('spring-boot:run') ||
      command.includes('/backend/target/classes') ||
      command.includes('backend-task.mjs'))
  )
    return 'backend'
  if (command.includes(frontendRoot) && command.includes('vite/bin/vite.js')) return 'frontend'
  return null
}

const POWERSHELL_HEADER = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); '

function powershell(script) {
  return execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `${POWERSHELL_HEADER}${script}`],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true },
  )
}

/** 解析 PowerShell ConvertTo-Json 输出的进程行。 */
export function parseWindowsRows(output) {
  const text = String(output || '').trim()
  if (!text) return []
  const value = JSON.parse(text)
  return (Array.isArray(value) ? value : [value]).filter(
    (row) => row && Number.isInteger(Number(row.pid)) && Number(row.pid) > 0,
  )
}

/** Spring Boot 可能把 classpath 放进 @argfile；读取后才有足够的归属证据。 */
async function expandCommand(command) {
  const text = String(command || '')
  if (!text.includes('@')) return text
  let result = text
  for (const match of text.matchAll(/@(?:"([^"]+)"|([^\s"]+))/g)) {
    const file = match[1] || match[2]
    try {
      const info = await stat(file)
      if (!info.isFile() || info.size > 1024 * 1024) continue
      result += ` ${await readFile(file, 'utf8')}`
    } catch {
      /* 参数文件不可读时不作为归属证据。 */
    }
  }
  return result
}

async function windowsListenerRows(ports) {
  const script = [
    `$ports = @(${ports.join(',')})`,
    '$rows = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort } | ForEach-Object {',
    '  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" -ErrorAction SilentlyContinue',
    '  [pscustomobject]@{ port = [int]$_.LocalPort; pid = [int]$_.OwningProcess; command = $processInfo.CommandLine }',
    '}',
    '$json = ConvertTo-Json -InputObject @($rows) -Compress -Depth 3',
    "if (-not $json) { $json = '[]' }",
    'Write-Output $json',
  ].join('\n')
  const { stdout } = await powershell(script)
  return parseWindowsRows(stdout)
}

async function windowsProcessRows() {
  const script = [
    '$rows = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine } | ForEach-Object {',
    '  [pscustomobject]@{ pid = [int]$_.ProcessId; command = $_.CommandLine }',
    '}',
    '$json = ConvertTo-Json -InputObject @($rows) -Compress -Depth 2',
    "if (-not $json) { $json = '[]' }",
    'Write-Output $json',
  ].join('\n')
  const { stdout } = await powershell(script)
  return parseWindowsRows(stdout)
}

async function readCommand(pid) {
  if (process.platform === 'win32') {
    try {
      const script = `$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(pid)}" -ErrorAction SilentlyContinue; if ($processInfo) { $processInfo.CommandLine }`
      const { stdout } = await powershell(script)
      return expandCommand(stdout.trim())
    } catch {
      return ''
    }
  }
  try {
    const { stdout } = await execFileAsync('ps', ['-ww', '-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
    })
    return stdout.trim()
  } catch {
    return ''
  }
}

/** 解析 `ps -axww -o pid=,command=` 的整表输出，只保留本工程进程。 */
export function parseProcessList(output, workspace = workspaceRoot) {
  const result = []
  for (const line of String(output).split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line)
    if (!match) continue
    const kind = classifyOwner(match[2], workspace)
    if (kind) result.push({ pid: Number(match[1]), kind, command: match[2] })
  }
  return result
}

async function ownedProcesses() {
  if (process.platform === 'win32') {
    const rows = await windowsProcessRows()
    const result = []
    for (const row of rows) {
      const command = await expandCommand(row.command)
      const kind = classifyOwner(command)
      if (kind) result.push({ pid: Number(row.pid), kind, command })
    }
    return result
  }
  const { stdout } = await execFileAsync('ps', ['-axww', '-o', 'pid=,command='], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  return parseProcessList(stdout)
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function listeningPids(port) {
  try {
    const { stdout } = await execFileAsync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpct'],
      { encoding: 'utf8' },
    )
    return parseLsofPids(stdout)
  } catch (error) {
    if (error.code === 'ENOENT')
      throw new Error('未找到 lsof，无法检查端口归属；macOS 自带 lsof，请确认 PATH 完整。')
    // lsof 在端口没有监听时返回 1，属于正常情况。
    return []
  }
}

export async function inspectOwners(ports) {
  const normalized = normalizePorts(ports)
  const owners = []
  if (process.platform === 'win32') {
    for (const row of await windowsListenerRows(normalized)) {
      const command = await expandCommand(row.command)
      const kind = classifyOwner(command)
      owners.push({ port: Number(row.port), pid: Number(row.pid), owned: Boolean(kind), kind })
    }
    return owners
  }
  for (const port of normalized) {
    for (const pid of await listeningPids(port)) {
      const command = await readCommand(pid)
      const kind = classifyOwner(command)
      owners.push({ port, pid, owned: Boolean(kind), kind })
    }
  }
  return owners
}

async function releaseOwned(owner) {
  const command = await readCommand(owner.pid)
  if (classifyOwner(command) !== owner.kind) return false
  try {
    process.kill(owner.pid, 'SIGTERM')
  } catch {
    return false
  }
  await delay(700)
  if (alive(owner.pid) && classifyOwner(await readCommand(owner.pid)) === owner.kind) {
    try {
      process.kill(owner.pid, 'SIGKILL')
    } catch {
      /* 进程已退出或权限变化，保持原状。 */
    }
  }
  return true
}

function scanPorts(requested) {
  const defaults = readDefaultPorts()
  return normalizePorts(
    [
      ...requested,
      ...DEFAULT_PORTS.map((key) => Number(defaults[key])).filter(isPort),
      ...readSessionPorts(),
    ].filter((value, index, values) => values.indexOf(value) === index),
  )
}

export async function runPorts(mode, requested = []) {
  switch (String(mode).toLowerCase()) {
    case 'guard': {
      // 扫描全部进程，能发现使用自动端口启动、没有会话文件的遗留后端。
      const owned = await ownedProcesses()
      if (owned.some((owner) => owner.kind === 'backend')) throw new Error(GUARD_MESSAGE)
      return { activeBackend: false }
    }
    case 'inspect':
      return { owners: await inspectOwners(scanPorts(requested)) }
    case 'select': {
      const ports = normalizePorts(
        requested.length ? requested : [readDefaultPorts().backend, readDefaultPorts().runner],
      )
      const owners = await inspectOwners(scanPorts(ports))
      const released = []
      for (const owner of owners.filter((item) => item.owned).sort((a, b) => a.pid - b.pid)) {
        if (await releaseOwned(owner)) released.push(owner)
      }
      if (released.length) await delay(300)
      return {
        ports: await selectPorts(ports),
        released,
        retained: owners.filter((item) => !item.owned),
      }
    }
    default:
      throw new Error(`未知端口模式：${mode}`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] || 'Inspect'
  const ports = process.argv[3] ? process.argv[3].split(',').map(Number) : []
  try {
    const result = await runPorts(mode, ports)
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
