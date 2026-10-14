import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface RuntimeAddress {
  backendPort: number
  runnerPort: number
  backendOrigin: string
  frontendOrigin: string
}

export interface DesktopConfiguration {
  packaged: boolean
  development: boolean
  workspaceRoot: string
  preferred: RuntimeAddress
  jar: string
  java: string
  bundledPython: string
  dataDirectory: string
  configDirectory: string
  logDirectory: string
}

/** 共享设置由主机管理员通过后端保存；启动时应用，默认仅回环。 */
export function lanEnabled(config: DesktopConfiguration): boolean {
  const file = path.join(config.configDirectory, 'network.json')
  if (!fs.existsSync(file)) return false
  const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as { enabled?: unknown }).enabled !== 'boolean'
  )
    throw new Error('家庭共享配置无效，请检查 network.json。')
  return (value as { enabled: boolean }).enabled
}

export function validPort(value: unknown, name: string): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`${name} 必须是 1 到 65535 之间的端口。`)
  return port
}

/** 只读取公开端口配置；模型配置由 Java 后端独立加载。 */
export function loadConfiguration(): DesktopConfiguration {
  const packaged = app.isPackaged
  const workspaceRoot = packaged ? process.resourcesPath : path.resolve(app.getAppPath(), '..')
  const localPorts = path.join(workspaceRoot, 'backend/config/ports.json')
  const portsFile = packaged
    ? path.join(process.resourcesPath, 'backend/ports.json')
    : fs.existsSync(localPorts)
      ? localPorts
      : path.join(workspaceRoot, 'backend/config/ports.example.json')
  const parsed: unknown = JSON.parse(fs.readFileSync(portsFile, 'utf8'))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('端口配置需要是 JSON 对象。')
  const defaults = parsed as Record<string, unknown>
  const backendPort = validPort(process.env.XUYA_PORT || defaults.backend, 'XUYA_PORT')
  const runnerPort = validPort(process.env.XUYA_RUNNER_PORT || defaults.runner, 'XUYA_RUNNER_PORT')
  if (backendPort === runnerPort) throw new Error('业务与 Python 执行资源端口必须不同。')
  const development = !packaged && process.env.XUYA_DESKTOP_DEV === '1'
  const frontendPort = validPort(
    process.env.XUYA_FRONTEND_PORT || defaults.frontend,
    'XUYA_FRONTEND_PORT',
  )
  const backendOrigin = `http://127.0.0.1:${backendPort}`
  const dataDirectory = path.resolve(
    process.env.XUYA_DATA_DIR ||
      (packaged
        ? path.join(
            process.env.LOCALAPPDATA || path.resolve(app.getPath('appData'), '../Local'),
            'XuyaIsland',
          )
        : path.join(workspaceRoot, 'backend/data')),
  )
  const bundledCandidate = packaged
    ? path.join(process.resourcesPath, 'python/python.exe')
    : path.join(workspaceRoot, 'electron/build/python/python.exe')
  // 内置 Python 随安装包分发；未准备时留空，由管理员改用主机自定义解释器。
  const bundledPython =
    process.env.XUYA_BUNDLED_PYTHON ?? (fs.existsSync(bundledCandidate) ? bundledCandidate : '')
  return {
    packaged,
    development,
    workspaceRoot,
    preferred: {
      backendPort,
      runnerPort,
      backendOrigin,
      frontendOrigin: development ? `http://127.0.0.1:${frontendPort}` : backendOrigin,
    },
    jar: packaged
      ? path.join(process.resourcesPath, 'backend/xuya-backend.jar')
      : path.join(workspaceRoot, 'backend/dist/xuya-backend.jar'),
    java: packaged
      ? path.join(process.resourcesPath, 'runtime/bin/java.exe')
      : path.join(process.env.XUYA_JAVA_HOME || 'D:\\GreenSoft\\java\\jdk-17.0.14', 'bin/java.exe'),
    bundledPython,
    dataDirectory,
    configDirectory: path.resolve(
      process.env.XUYA_CONFIG_DIR ||
        (packaged
          ? path.join(dataDirectory, 'config')
          : path.join(workspaceRoot, 'backend/config')),
    ),
    logDirectory: packaged
      ? path.join(dataDirectory, 'logs')
      : path.join(workspaceRoot, 'backend/logs'),
  }
}
