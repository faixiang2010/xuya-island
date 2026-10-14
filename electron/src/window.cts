import { BrowserWindow, shell } from 'electron'
import type { RuntimeAddress } from './configuration.cjs'

/** 渲染进程只使用 HTTP API，保持 Node 隔离与独立 Python 执行域。 */
export async function createWindow(address: RuntimeAddress): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 860,
    minHeight: 650,
    show: process.env.XUYA_DESKTOP_SMOKE !== '1' && process.env.XUYA_DESKTOP_HIDDEN !== '1',
    title: '叙芽岛 · 让故事，在代码里长大',
    backgroundColor: '#f8f7f3',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${address.frontendOrigin}/`)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== address.frontendOrigin) event.preventDefault()
    } catch {
      event.preventDefault()
    }
  })
  await window.loadURL(address.frontendOrigin)
  return window
}
