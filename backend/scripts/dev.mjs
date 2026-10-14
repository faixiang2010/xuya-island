import {
  backend,
  checkFrontend,
  defaultPorts,
  managePorts,
  npm,
  root,
  stopProcessTree,
  waitForExit,
  waitForReady,
} from './process-utils.mjs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

checkFrontend()
const preferred = [
  Number(process.env.XUYA_PORT || defaultPorts.backend),
  Number(process.env.XUYA_RUNNER_PORT || defaultPorts.runner),
  Number(process.env.XUYA_FRONTEND_PORT || defaultPorts.frontend),
]
const selection = await managePorts('Select', preferred)
const [backendPort, runnerPort, frontendPort] = selection.ports
for (const owner of selection.released)
  console.log(`已关闭本项目遗留的 ${owner.kind} 进程 ${owner.pid}，释放端口 ${owner.port}。`)
for (let i = 0; i < preferred.length; i++)
  if (preferred[i] !== selection.ports[i])
    console.log(`端口 ${preferred[i]} 被其他程序占用或不可用，改用 ${selection.ports[i]}。`)
const childEnvironment = {
  ...process.env,
  XUYA_PORT: String(backendPort),
  XUYA_RUNNER_PORT: String(runnerPort),
  XUYA_FRONTEND_PORT: String(frontendPort),
  XUYA_PORTS_PREPARED: '1',
}
const sessionFile = path.join(root, 'backend/logs/dev-session.json')

let requestStop
const stopRequested = new Promise((resolve) => {
  requestStop = resolve
})
function stop() {
  requestStop('interrupt')
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const children = []
try {
  const server = backend('run', { env: childEnvironment })
  children.push(server)
  const serverExit = waitForExit(server).then(() => {
    throw new Error('后端提前结束，请检查上方输出。')
  })
  console.log('正在准备后端；就绪后再启动前端页面，避免课程请求提前到达。')
  const startup = await Promise.race([
    waitForReady(`http://127.0.0.1:${backendPort}/api/health`, 180000),
    serverExit,
    stopRequested,
  ])
  if (startup !== 'interrupt') {
    const web = npm(['run', 'dev'], { env: childEnvironment })
    children.push(web)
    const webExit = waitForExit(web).then(() => {
      throw new Error('前端提前结束，请检查上方输出。')
    })
    const ready = waitForReady(`http://127.0.0.1:${frontendPort}/api/health`).then(async () => {
      await mkdir(path.dirname(sessionFile), { recursive: true })
      await writeFile(
        sessionFile,
        JSON.stringify(
          {
            workspace: root,
            pid: process.pid,
            ready: true,
            ports: { backend: backendPort, runner: runnerPort, frontend: frontendPort },
          },
          null,
          2,
        ),
        { encoding: 'utf8', flush: true },
      )
      console.log(
        `\n叙芽岛开发页面：http://127.0.0.1:${frontendPort}\n后端：http://127.0.0.1:${backendPort}\nPython 执行资源：http://127.0.0.1:${runnerPort}\n当前先打磨网页产品，Electron 打包放到最后。\n按 Ctrl+C 关闭本次启动的前后端。\n`,
      )
      return stopRequested
    })
    await Promise.race([ready, serverExit, webExit, stopRequested])
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await Promise.all(children.map(stopProcessTree))
  try {
    const session = JSON.parse(await readFile(sessionFile, 'utf8'))
    if (session.pid === process.pid) await rm(sessionFile, { force: true })
  } catch {
    /* An earlier launcher must not remove a newer session. */
  }
  // 关闭尚在重试的启动检测；不会留下 Maven 或 Vite 子进程。
  process.exit(process.exitCode || 0)
}
