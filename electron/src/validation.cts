import { app, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { DesktopConfiguration } from './configuration.cjs'

interface SmokeReport {
  origin: string
  nodeExposed: boolean
  bridgeExposed: boolean
  ready: boolean
  packaged: boolean
}

/** 仅供构建验证的隐藏窗口入口，不参与正常课堂流程。 */
export async function runSmoke(
  window: BrowserWindow,
  config: DesktopConfiguration,
): Promise<boolean> {
  if (config.packaged && !process.env.XUYA_SMOKE_DIR)
    throw new Error('安装包冒烟测试需要指定 XUYA_SMOKE_DIR。')
  const directory =
    process.env.XUYA_SMOKE_DIR || path.join(config.workspaceRoot, 'electron/.tmp/smoke')
  fs.mkdirSync(directory, { recursive: true })
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (
      await window.webContents.executeJavaScript(
        "document.body.innerText.includes('先请大人准备小岛') || document.body.innerText.includes('欢迎回到你的小岛')",
      )
    )
      break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  const report: SmokeReport = await window.webContents.executeJavaScript(`({
    origin: location.origin, nodeExposed: typeof process !== 'undefined',
    bridgeExposed: typeof window.electronBridge !== 'undefined',
    ready: document.body.innerText.includes('先请大人准备小岛') || document.body.innerText.includes('欢迎回到你的小岛')
  })`)
  report.packaged = app.isPackaged
  fs.writeFileSync(path.join(directory, 'desktop-smoke.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(
    path.join(directory, 'desktop-smoke.png'),
    (await window.webContents.capturePage()).toPNG(),
  )
  return report.ready && !report.nodeExposed && !report.bridgeExposed
}
