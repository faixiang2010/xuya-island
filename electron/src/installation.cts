import { existsSync } from 'node:fs'
import type { DesktopConfiguration } from './configuration.cjs'

export interface InstallationReport {
  /** 缺少即无法启动的资源（后端 JAR、Java 运行时）。 */
  fatal: string[]
}

/**
 * 安装版启动自检：核对随包分发的核心资源是否齐全。
 * asar:false 下资源以展开文件分发，被杀软误删或非正常覆盖后能据此引导重装，
 * 而不是抛出难以理解的启动失败。内置 Python 不含在此列——缺失时后端会回退到
 * 主机自定义解释器，应用仍可启动。开发模式不检查。
 */
export function inspectInstallation(config: DesktopConfiguration): InstallationReport {
  const fatal: string[] = []
  if (!config.packaged) return { fatal }
  if (!existsSync(config.jar)) fatal.push('后端程序（backend/xuya-backend.jar）')
  if (!existsSync(config.java)) fatal.push('Java 运行时（runtime/）')
  return { fatal }
}
