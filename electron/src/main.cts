import { app, dialog, Tray, Menu, nativeImage, clipboard, type BrowserWindow } from 'electron'
import path from 'node:path'
import os from 'node:os'
import { BackendLifecycle } from './backend-lifecycle.cjs'
import { loadConfiguration, lanEnabled } from './configuration.cjs'
import { createWindow } from './window.cjs'
import { runSmoke } from './validation.cjs'
import { inspectInstallation } from './installation.cjs'
import { UpdateService } from './update.cjs'

let backend: BackendLifecycle | undefined
let mainWindow: BrowserWindow | undefined
let shuttingDown = false
let tray: Tray | undefined
let updates: UpdateService | undefined

// 隔离验收使用专属浏览器资料，避免共享真实安装版的Cookie、缓存及单实例锁。
if (process.env.XUYA_DESKTOP_TEST === '1') {
  const testData = process.env.XUYA_DATA_DIR
  if (!testData || !path.isAbsolute(testData)) throw new Error('桌面验证需要独立的绝对数据目录。')
  app.setPath('userData', path.join(testData, 'desktop-profile'))
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
  app.whenReady().then(async () => {
    try {
      const config = loadConfiguration()
      const report = inspectInstallation(config)
      if (report.fatal.length) {
        dialog.showErrorBox(
          '安装文件不完整',
          `缺少：${report.fatal.join('、')}。学习数据保存在用户目录中，请重新安装叙芽岛。`,
        )
        app.quit()
        return
      }
      backend = new BackendLifecycle(config)
      updates = new UpdateService(config, () => backend?.stop() ?? Promise.resolve())
      updates.configure()
      const address = await backend.start()
      mainWindow = await createWindow(address)
      if (process.env.XUYA_DESKTOP_SMOKE !== '1') {
        const imagePath = config.packaged
          ? path.join(process.resourcesPath, 'art/xiaoqi-passport.png')
          : path.join(config.workspaceRoot, 'frontend-react/public/art/login/xiaoqi-passport.png')
        tray = new Tray(nativeImage.createFromPath(imagePath).resize({ width: 32, height: 16 }))
        const show = () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show()
            mainWindow.restore()
            mainWindow.focus()
          }
        }
        tray.setToolTip('叙芽岛 · 家庭学习空间')
        tray.setContextMenu(
          Menu.buildFromTemplate([
            { label: '打开叙芽岛', click: show },
            {
              label: '复制局域网访问地址',
              click: () => {
                const urls = Object.values(os.networkInterfaces())
                  .flat()
                  .filter(
                    (value) =>
                      value &&
                      !value.internal &&
                      value.family === 'IPv4' &&
                      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value.address),
                  )
                  .map((value) => `http://${value!.address}:${address.backendPort}`)
                clipboard.writeText(urls.join('\n'))
              },
            },
            { type: 'separator' },
            {
              label: '检查更新',
              click: () => void updates?.checkNow(mainWindow),
            },
            { type: 'separator' },
            {
              label: '退出叙芽岛并停止家庭服务',
              click: () => {
                shuttingDown = false
                app.quit()
              },
            },
          ]),
        )
        tray.on('double-click', show)
        mainWindow.on('close', (event) => {
          if (!shuttingDown && lanEnabled(config)) {
            event.preventDefault()
            mainWindow?.hide()
          }
        })
      }
      // 安装版在窗口就绪后延迟检查更新；发现新版本才提示，不强制打断使用。
      void updates.checkOnStartup(mainWindow)
      if (process.env.XUYA_DESKTOP_SMOKE === '1') {
        const passed = await runSmoke(mainWindow, config)
        await backend.stop()
        app.exit(passed ? 0 : 1)
      }
    } catch (error) {
      dialog.showErrorBox(
        '叙芽岛暂时没有打开',
        error instanceof Error ? error.message : '启动失败，请检查配置。',
      )
      app.quit()
    }
  })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', (event) => {
    if (!shuttingDown) {
      shuttingDown = true
      if (backend?.ownsRunningProcess) {
        event.preventDefault()
        void backend.stop().finally(() => app.quit())
      }
    }
  })
  app.on('will-quit', () => tray?.destroy())
}
