import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, openSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { networkInterfaces } from 'node:os'
import {
  checkFrontend,
  requireFile,
  root,
  stopProcessTree,
  waitForExit,
  waitForReady,
} from '../../backend/scripts/process-utils.mjs'

const frontendDirectory = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const frontendModule = path.basename(frontendDirectory)
checkFrontend(frontendDirectory)
const java = path.join(
  process.env.XUYA_JAVA_HOME || 'D:\\GreenSoft\\java\\jdk-17.0.14',
  'bin/java.exe',
)
requireFile(java, '浏览器测试需要 Java 17+，请设置 XUYA_JAVA_HOME。')
const playwright = path.join(frontendDirectory, 'node_modules/@playwright/test/cli.js')
requireFile(playwright, '请先执行 npm.cmd --prefix frontend-react ci。')
const testDirectory = path.join(root, 'backend/target', `e2e-${randomUUID()}`)
const children = []
const reservations = []
const development = process.argv.includes('--dev')
const reuseBuild = process.argv.includes('--reuse-build')
const lan = process.argv.includes('--lan')
const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find(
    (item) =>
      item &&
      item.family === 'IPv4' &&
      !item.internal &&
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address),
  )?.address
if (lan && !lanAddress) throw new Error('本机没有可验证的局域网IPv4地址。')
const testArguments = process.argv
  .slice(2)
  .filter((argument) => !['--dev', '--reuse-build', '--lan'].includes(argument))
let interrupted = false
function stop() {
  interrupted = true
  for (const child of children) void stopProcessTree(child)
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
async function reservePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  reservations.push(server)
  return server.address().port
}
async function releasePorts() {
  await Promise.all(
    reservations.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  )
}
try {
  if (reuseBuild) {
    requireFile(
      path.join(root, 'backend/dist/xuya-backend.jar'),
      '请先完成本轮集成构建，再复用产物复测。',
    )
    console.log('复用已有集成 JAR；本轮源码变更必须已完成构建。临时数据库和端口隔离仍然启用。')
  } else {
    const build = spawn(process.execPath, [path.join(root, 'backend/scripts/build.mjs')], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
      env: { ...process.env, XUYA_FRONTEND_MODULE: frontendModule },
    })
    children.push(build)
    await waitForExit(build)
  }
  if (interrupted) throw new Error('浏览器测试已取消。')
  const port = await reservePort()
  const runnerPort = await reservePort()
  const frontendPort = development ? await reservePort() : undefined
  await mkdir(testDirectory, { recursive: true })
  await mkdir(path.join(root, 'backend/logs'), { recursive: true })
  await releasePorts()
  const log = openSync(path.join(root, 'backend/logs/e2e-backend.log'), 'w')
  // 与开发启动保持一致：仓库里已准备好的内置解释器同样注入，测的就是真实运行环境。
  const bundledPython = path.join(root, 'electron/build/python/python.exe')
  let server
  try {
    server = spawn(
      java,
      ['-Dfile.encoding=UTF-8', '-jar', path.join(root, 'backend/dist/xuya-backend.jar')],
      {
        cwd: root,
        windowsHide: true,
        stdio: ['ignore', log, log],
        env: {
          ...process.env,
          XUYA_PORT: String(port),
          XUYA_BIND_ADDRESS: lan ? '0.0.0.0' : '127.0.0.1',
          XUYA_RUNNER_PORT: String(runnerPort),
          ...(development ? { XUYA_FRONTEND_PORT: String(frontendPort) } : {}),
          XUYA_DATA_DIR: testDirectory,
          XUYA_CONFIG_DIR: path.join(testDirectory, 'config'),
          XUYA_MODEL_API_KEY: '',
          LOGGING_FILE_NAME: '',
          ...(existsSync(bundledPython) ? { XUYA_BUNDLED_PYTHON: bundledPython } : {}),
        },
      },
    )
  } finally {
    closeSync(log)
  }
  children.push(server)
  let origin = `http://127.0.0.1:${port}`
  const serverExit = waitForExit(server).then(() => {
    throw new Error('测试后端提前结束，请查看 backend/logs/e2e-backend.log。')
  })
  await Promise.race([waitForReady(`${origin}/api/health`, 60000), serverExit])
  const status = await (await fetch(`${origin}/api/health`)).json()
  if (status.modelConfigured !== false) throw new Error('测试后端未确认关闭真实模型 Key。')
  if (development) {
    const vite = spawn(
      process.execPath,
      [
        path.join(frontendDirectory, 'node_modules/vite/bin/vite.js'),
        '--host',
        '127.0.0.1',
        '--strictPort',
        '--port',
        String(frontendPort),
      ],
      {
        cwd: frontendDirectory,
        windowsHide: true,
        stdio: 'inherit',
        env: {
          ...process.env,
          XUYA_PORT: String(port),
          XUYA_RUNNER_PORT: String(runnerPort),
          XUYA_FRONTEND_PORT: String(frontendPort),
        },
      },
    )
    children.push(vite)
    origin = `http://127.0.0.1:${frontendPort}`
    await waitForReady(`${origin}/api/health`, 30000)
  }
  console.log(`浏览器测试使用独立端口 ${port}/${runnerPort} 和临时学习库；不会连接正式数据。`)
  const test = spawn(process.execPath, [playwright, 'test', ...testArguments], {
    cwd: frontendDirectory,
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      XUYA_TEST_URL: origin,
      XUYA_E2E_ISOLATED: '1',
      ...(lan ? { XUYA_TEST_LAN_URL: `http://${lanAddress}:${port}` } : {}),
    },
  })
  children.push(test)
  await Promise.race([waitForExit(test), serverExit])
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await releasePorts()
  await Promise.all(children.map(stopProcessTree))
  // 只删除本次创建的随机目录，保留正式数据和必要日志。
  if (path.dirname(testDirectory) !== path.join(root, 'backend/target'))
    throw new Error('测试目录越界。')
  await rm(testDirectory, { recursive: true, force: true })
  process.exit(process.exitCode || 0)
}
