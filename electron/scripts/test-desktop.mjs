import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { _electron } from '../../frontend-react/node_modules/playwright-core/index.mjs'
import { expect } from '../../frontend-react/node_modules/@playwright/test/index.mjs'
import { root, stopProcessTree, waitForExit } from '../../backend/scripts/process-utils.mjs'

// 构建当前源码后，在随机测试目录启动打包应用；故意占用两端口验证自动换端口。
// --reuse-pack 仅供本轮已经构建的展开包复测；数据与端口仍全部隔离。
const directory = path.join(root, 'electron/.tmp', `validation-${randomUUID()}`)
const listeners = []
const connections = new Set()
let build, application
async function capture(file) {
  // 隐藏窗口使用 Electron 原生捕获，避免 Chromium 全页截图等待可见帧。
  const png = await application.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }))
      .toPNG()
      .toString('base64')
  })
  await writeFile(file, Buffer.from(png, 'base64'))
}
async function occupy() {
  const server = net.createServer((socket) => {
    connections.add(socket)
    socket.once('close', () => connections.delete(socket))
    socket.end(
      'HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
      () => socket.destroy(),
    )
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  listeners.push(server)
  return server.address().port
}
try {
  if (!process.argv.includes('--reuse-pack')) {
    build = spawn(
      process.execPath,
      [path.join(root, 'electron/scripts/build-desktop.mjs'), 'pack', '--validation'],
      {
        cwd: root,
        windowsHide: true,
        stdio: 'inherit',
      },
    )
    await waitForExit(build)
  }
  await mkdir(directory, { recursive: true })
  await mkdir(path.join(directory, 'desktop-profile'), { recursive: true })
  const backendPort = await occupy(),
    runnerPort = await occupy()
  application = await _electron.launch({
    executablePath: path.join(root, 'electron/dist/family-validation/win-unpacked/叙芽岛.exe'),
    timeout: 90000,
    env: {
      ...process.env,
      XUYA_DESKTOP_SMOKE: '0',
      XUYA_DESKTOP_TEST: '1',
      XUYA_DESKTOP_HIDDEN: '1',
      XUYA_PORT: String(backendPort),
      XUYA_RUNNER_PORT: String(runnerPort),
      XUYA_DATA_DIR: directory,
      XUYA_CONFIG_DIR: path.join(directory, 'config'),
      XUYA_MODEL_API_KEY: '',
      PATH: [
        process.env.SystemRoot,
        path.join(process.env.SystemRoot, 'System32'),
        path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0'),
      ].join(path.delimiter),
      JAVA_HOME: '',
    },
  })
  const page = await application.firstWindow({ timeout: 90000 })
  page.setDefaultTimeout(30000)
  await page.getByRole('heading', { name: '先请大人准备小岛', exact: true }).waitFor()
  await page.getByLabel('账号', { exact: true }).fill('desktopadmin')
  await page.getByLabel('管理员昵称').fill('桌面家庭管理员')
  await page.getByLabel('密码', { exact: true }).fill('desktop-password')
  await page.getByRole('button', { name: '准备好我的小岛', exact: true }).click()
  await expect(page.locator('.sidebar-bottom')).toContainText('桌面家庭管理员')
  const evidence = path.join(root, '.agent/evidence/previews')
  await mkdir(evidence, { recursive: true })
  await capture(path.join(evidence, 'family-desktop-home.png'))
  const origin = new URL(page.url()).origin
  const health = await (await fetch(`${origin}/api/health`)).json()
  assert.notEqual(new URL(origin).port, String(backendPort))
  assert.equal(health.runnerOrigin, '')
  assert.ok(listeners.every((server) => server.listening))
  assert.equal(health.modelConfigured, false)
  const environment = await (
    await page.request.get(`${origin}/api/v1/execution/environment`)
  ).json()
  assert.equal(environment.source, 'bundled')
  assert.equal(environment.configured, true)
  const initialState = await (await page.request.get(`${origin}/api/v1/auth/state`)).json()
  const adminHeaders = { Origin: origin, 'X-Xuya-CSRF': initialState.csrf }
  const customPython =
    process.env.XUYA_TEST_PYTHON ||
    'C:\\Users\\101202303018\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe'
  const selected = await page.request.put(`${origin}/api/v1/system/python`, {
    headers: adminHeaders,
    data: { executable: customPython },
  })
  assert.equal(selected.status(), 200)
  assert.equal(
    (await (await page.request.get(`${origin}/api/v1/execution/environment`)).json()).source,
    'custom',
  )
  const restored = await page.request.put(`${origin}/api/v1/system/python`, {
    headers: adminHeaders,
    data: { executable: 'bundled' },
  })
  assert.equal(restored.status(), 200)
  assert.equal(
    (await (await page.request.get(`${origin}/api/v1/execution/environment`)).json()).source,
    'bundled',
  )
  const isolation = await page.evaluate(() => ({
    nodeExposed: typeof window.process !== 'undefined',
    bridgeExposed: typeof window.electronBridge !== 'undefined',
  }))
  assert.equal(isolation.nodeExposed, false)
  assert.equal(isolation.bridgeExposed, false)
  await page.goto(`${origin}/#/classroom/author-interview`)
  const run = page.getByRole('button', { name: '▶ 运行', exact: true })
  await expect(run).toBeEnabled({ timeout: 120000 })
  await run.click()
  await page.getByLabel('回答程序').waitFor()
  await page.getByLabel('回答程序').fill('桌面小画家')
  await page.getByRole('button', { name: '发送回答', exact: true }).click()
  await expect(page.getByTestId('console-output')).toContainText('准备写几章：')
  await page.getByLabel('回答程序').fill('3')
  await page.getByRole('button', { name: '发送回答', exact: true }).click()
  await expect(page.getByTestId('console-output')).toContainText('桌面小画家的计划：3章')
  await page.getByRole('button', { name: '保存到我的作品', exact: true }).click()
  await expect(page.locator('.save-state')).toContainText('已保存到作品集')
  await page.reload()
  await expect(page.locator('.save-state')).toContainText('已打开作品')
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort()
  })
  await page.goto(`${origin}/#/classroom/drawing-lab`)
  await expect(run).toBeEnabled({ timeout: 120000 })
  await run.click()
  await expect(page.getByTestId('console-output')).toContainText('我的第一枚岛屿徽章')
  await page.getByRole('button', { name: '保存到我的作品', exact: true }).click()
  await expect(page.locator('.save-state')).toContainText('已保存到作品集')
  await page.reload()
  await expect(page.locator('.save-state')).toContainText('已打开作品')
  await expect(run).toBeEnabled({ timeout: 120000 })
  await run.click()
  await expect(page.getByTestId('console-output')).toContainText('我的第一枚岛屿徽章')
  const pixel = await page
    .locator('canvas[aria-label="Python 画笔作品"]')
    .evaluate((element) => Array.from(element.getContext('2d').getImageData(160, 130, 1, 1).data))
  assert.deepEqual(pixel, [199, 187, 255, 255])
  // 隐藏窗口的合成截图可能晚于Canvas更新；同时保留实际画布位图作为绘图证据。
  const drawing = await page
    .locator('canvas[aria-label="Python 画笔作品"]')
    .evaluate((element) => element.toDataURL('image/png').split(',')[1])
  await writeFile(path.join(evidence, 'family-desktop-canvas.png'), Buffer.from(drawing, 'base64'))
  await capture(path.join(evidence, 'family-desktop-python.png'))
  const state = await (await page.request.get(`${origin}/api/v1/auth/state`)).json()
  const network = await page.request.put(`${origin}/api/v1/system/network`, {
    headers: { Origin: origin, 'X-Xuya-CSRF': state.csrf },
    data: { enabled: true },
  })
  assert.equal(network.status(), 200)
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  assert.equal(
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    false,
  )
  assert.equal((await fetch(`${origin}/api/health`)).status, 200)
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show())
  assert.equal(
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    true,
  )
  const started = await page.request.post(`${origin}/api/v1/execution/runs`, {
    headers: { Origin: origin, 'X-Xuya-CSRF': state.csrf },
    data: {
      clientId: randomUUID(),
      code: 'import os\nprint(os.getpid(), flush=True)\ninput("等待退出回收：")',
      files: [],
      inputMode: 'live',
      presetInput: [],
    },
  })
  assert.equal(started.ok(), true)
  const task = await started.json()
  let pythonPid
  await expect
    .poll(async () => {
      const snapshot = await (
        await page.request.get(`${origin}/api/v1/execution/runs/${task.id}`)
      ).json()
      pythonPid = Number.parseInt(snapshot.result.output, 10)
      return snapshot.state
    })
    .toBe('waiting')
  assert.ok(Number.isInteger(pythonPid) && pythonPid > 0)
  const report = {
    version: health.version,
    packaged: await application.evaluate(({ app }) => app.isPackaged),
    origin,
    runnerOrigin: health.runnerOrigin,
    pythonSource: environment.source,
    customPythonAndRestore: true,
    developmentToolsExcludedFromPath: true,
    portsChanged: true,
    isolation,
    liveInput: true,
    savedAndRestored: true,
    blockedInternetDrawing: true,
    blockedInternetSaving: true,
    realModelCalled: false,
    closeHidesAndKeepsService: true,
  }
  await application.close()
  application = undefined
  await expect
    .poll(async () => {
      try {
        return (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) })).ok
      } catch {
        return false
      }
    })
    .toBe(false)
  assert.ok(listeners.every((server) => server.listening))
  report.explicitExitStopsOwnedService = true
  await expect
    .poll(() => {
      try {
        process.kill(pythonPid, 0)
        return true
      } catch (error) {
        if (error.code === 'ESRCH') return false
        throw error
      }
    })
    .toBe(false)
  report.explicitExitReclaimsWaitingPython = true
  await writeFile(
    path.join(root, '.agent/evidence/family-desktop-smoke.json'),
    JSON.stringify(report, null, 2),
  )
  console.log(JSON.stringify(report, null, 2))
} finally {
  await application?.close()
  await stopProcessTree(build)
  for (const socket of connections) socket.destroy()
  await Promise.all(listeners.map((server) => new Promise((resolve) => server.close(resolve))))
  if (path.dirname(directory) !== path.join(root, 'electron/.tmp')) throw new Error('测试目录越界')
  await rm(directory, { recursive: true, force: true })
}
