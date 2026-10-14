import { app, dialog, type BrowserWindow, type MessageBoxOptions } from 'electron'
import { autoUpdater } from 'electron-updater'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { DesktopConfiguration } from './configuration.cjs'

/** 带父窗口时对话框更贴近主界面，否则退回独立对话框。 */
function showMessage(
  window: BrowserWindow | undefined,
  options: MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
  return window && !window.isDestroyed()
    ? dialog.showMessageBox(window, options)
    : dialog.showMessageBox(options)
}

/** 比较 x.y.z 版本号；返回 a 是否比 b 更新。 */
function isNewer(a: string, b: string): boolean {
  const left = a.split('.').map((value) => Number.parseInt(value, 10) || 0)
  const right = b.split('.').map((value) => Number.parseInt(value, 10) || 0)
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return false
}

/**
 * 静默升级：手动检查 + 启动提示，不强制自动更新。
 * 安装前先停掉本程序创建的 Java/Python 子进程（否则会占用即将被覆盖的
 * JAR、Java runtime 与内置 Python 文件），再显示无边框过渡窗，最后交给
 * electron-updater 静默覆盖安装并自动重启。
 */
export class UpdateService {
  private busy = false

  constructor(
    private readonly configuration: DesktopConfiguration,
    private readonly onBeforeInstall: () => Promise<void> = async () => {},
  ) {}

  /** 仅在安装版启用；开发与冒烟验证不触碰更新通道。 */
  get supported(): boolean {
    return (
      this.configuration.packaged &&
      process.env.XUYA_DESKTOP_SMOKE !== '1' &&
      process.env.XUYA_DESKTOP_TEST !== '1'
    )
  }

  configure(): void {
    if (!this.supported) return
    autoUpdater.autoDownload = false
    // 交给显式流程安装，避免用户在普通退出时被动重启。
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false
    const override = process.env.XUYA_UPDATE_URL
    if (override) autoUpdater.setFeedURL({ provider: 'generic', url: override })
  }

  /** 启动后延迟检查：只有存在新版本时才提示，不打扰日常使用。 */
  async checkOnStartup(window: BrowserWindow | undefined): Promise<void> {
    if (!this.supported) return
    await new Promise((resolve) => setTimeout(resolve, 8000))
    await this.check(window, false)
  }

  /** 托盘手动检查：无论是否有新版本都给出反馈。 */
  async checkNow(window: BrowserWindow | undefined): Promise<void> {
    if (!this.supported) {
      await showMessage(window, {
        type: 'info',
        message: '开发模式下不会检查更新。',
        detail: '请使用安装后的版本体验自动升级。',
      })
      return
    }
    await this.check(window, true)
  }

  private async check(window: BrowserWindow | undefined, interactive: boolean): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const result = await autoUpdater.checkForUpdates()
      const version = result?.updateInfo?.version
      if (!version || !isNewer(version, app.getVersion())) {
        if (interactive)
          await showMessage(window, {
            type: 'info',
            message: '已经是最新版本。',
            detail: `当前版本 ${app.getVersion()}。`,
          })
        return
      }
      await this.promptAndInstall(window, version)
    } catch (error) {
      if (interactive)
        await showMessage(window, {
          type: 'error',
          message: '检查更新没有完成。',
          detail: error instanceof Error ? error.message : '请稍后再试。',
        })
    } finally {
      this.busy = false
    }
  }

  private async promptAndInstall(
    window: BrowserWindow | undefined,
    version: string,
  ): Promise<void> {
    const choice = await showMessage(window, {
      type: 'info',
      buttons: ['稍后', '下载并安装'],
      defaultId: 1,
      cancelId: 0,
      message: `发现新版本 ${version}`,
      detail: '下载完成后会短暂显示“正在更新”，随后叙芽岛自动重新打开。',
    })
    if (choice.response !== 1) return
    let installer: string | undefined
    try {
      window?.setProgressBar(2, { mode: 'indeterminate' })
      const files = await autoUpdater.downloadUpdate()
      installer = files[0]
    } catch (error) {
      await showMessage(window, {
        type: 'error',
        message: '更新下载失败。',
        detail: error instanceof Error ? error.message : '请检查网络后重试。',
      })
      return
    } finally {
      window?.setProgressBar(-1)
    }
    const restart = await showMessage(window, {
      type: 'info',
      buttons: ['下次启动时安装', '立即重启安装'],
      defaultId: 1,
      cancelId: 0,
      message: '更新已经下载完成。',
      detail: '立即重启会短暂显示“正在更新”，完成后自动打开。',
    })
    if (restart.response !== 1) return
    await this.install(installer)
  }

  /** 先停后端，再拉起过渡窗，最后让 electron-updater 静默覆盖安装并重启。 */
  private async install(installer: string | undefined): Promise<void> {
    try {
      await this.onBeforeInstall()
    } catch {
      /* 停止旧进程失败不阻断升级；安装器会在覆盖前等待进程退出。 */
    }
    this.launchTransitionWindow(installer)
    // isSilent=true：向导式（oneClick:false）安装器也支持 /S 静默覆盖，避免与过渡窗同时弹出安装向导；
    // isForceRunAfter=true：安装完成后自动重新打开应用。
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 400)
  }

  private launchTransitionWindow(installer: string | undefined): void {
    if (process.platform !== 'win32') return
    const scripts = path.join(process.resourcesPath, 'scripts')
    const vbs = path.join(scripts, 'launch-update-progress.vbs')
    const ps1 = path.join(scripts, 'update-progress.ps1')
    if (!existsSync(vbs) || !existsSync(ps1)) return
    const args = [
      vbs,
      ps1,
      '-InstallerPath',
      installer ?? '',
      '-AppProcessName',
      path.basename(process.execPath, '.exe'),
      '-OldAppProcessId',
      String(process.pid),
      '-Title',
      '正在更新叙芽岛',
      '-Message',
      '更新即将完成，叙芽岛会自动重新打开……',
      '-Caption',
      '正在安装…',
    ]
    try {
      spawn('wscript.exe', args, { windowsHide: true, detached: true, stdio: 'ignore' }).unref()
    } catch {
      /* 过渡窗只是体验增强，失败不影响静默安装。 */
    }
  }
}
