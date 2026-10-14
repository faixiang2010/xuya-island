import { spawn } from 'node:child_process'
import path from 'node:path'
import {
  checkNode,
  defaultPorts,
  readDevSession,
  requireFile,
  root,
  stopProcessTree,
  waitForExit,
} from '../../backend/scripts/process-utils.mjs'

checkNode()
await import('./build-main.mjs')
const session = readDevSession()
const backendPort = Number(process.env.XUYA_PORT || session?.ports.backend || defaultPorts.backend)
const frontendPort = Number(
  process.env.XUYA_FRONTEND_PORT || session?.ports.frontend || defaultPorts.frontend,
)
const backendOrigin = `http://127.0.0.1:${backendPort}`
try {
  const health = await fetch(`${backendOrigin}/api/health`, { signal: AbortSignal.timeout(1500) })
  const data = await health.json()
  const web = await fetch(`http://127.0.0.1:${frontendPort}/@vite/client`, {
    signal: AbortSignal.timeout(1500),
  })
  if (!health.ok || data.application !== 'xuya-island' || !web.ok) throw new Error('not ready')
} catch {
  throw new Error(
    '请先在另一个终端执行 node backend/scripts/dev.mjs，等待前后端就绪后再启动桌面开发。',
  )
}
const binary = path.join(root, 'electron/node_modules/electron/dist/electron.exe')
requireFile(
  binary,
  '请先执行 npm.cmd --prefix electron ci；下载失败时按 electron/README.md 配置镜像。',
)
const child = spawn(binary, ['.', ...process.argv.slice(2)], {
  cwd: path.join(root, 'electron'),
  env: {
    ...process.env,
    XUYA_DESKTOP_DEV: '1',
    XUYA_PORT: String(backendPort),
    XUYA_FRONTEND_PORT: String(frontendPort),
  },
  stdio: 'inherit',
  windowsHide: true,
})
process.once('SIGINT', () => {
  void stopProcessTree(child)
})
process.once('SIGTERM', () => {
  void stopProcessTree(child)
})
await waitForExit(child)
