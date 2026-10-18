import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  backendRoot,
  prepareEnvironment,
  readDefaultPorts,
  resolveJavaExecutable,
} from './runtime.mjs'
import { selectPorts } from './ports.mjs'

/** 所有平台统一的 JAR 启动入口。 */

async function main() {
  const jar = path.join(backendRoot, 'dist/xuya-backend.jar')
  if (!existsSync(jar)) throw new Error('请先构建：node backend/scripts/build.mjs')
  const env = prepareEnvironment('run')
  if (env.XUYA_PORTS_PREPARED !== '1') {
    const defaults = readDefaultPorts()
    const preferred = [
      Number(env.XUYA_PORT || defaults.backend),
      Number(env.XUYA_RUNNER_PORT || defaults.runner),
    ]
    const [backendPort, runnerPort] = await selectPorts(preferred)
    if (backendPort !== preferred[0])
      console.log(`端口 ${preferred[0]} 被其他程序占用或不可用，改用 ${backendPort}。`)
    if (runnerPort !== preferred[1])
      console.log(`端口 ${preferred[1]} 被其他程序占用或不可用，改用 ${runnerPort}。`)
    env.XUYA_PORT = String(backendPort)
    env.XUYA_RUNNER_PORT = String(runnerPort)
    console.log(
      `Browser: http://127.0.0.1:${backendPort} ; Python resources: http://127.0.0.1:${runnerPort}`,
    )
  }
  const java = resolveJavaExecutable(env)
  const child = spawn(java, ['-Dfile.encoding=UTF-8', '-jar', jar], {
    cwd: backendRoot,
    env,
    stdio: 'inherit',
  })
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      if (child.exitCode === null) child.kill(signal)
    })
  child.once('error', (error) => {
    console.error(`无法启动 Java：${error.message}`)
    process.exitCode = 1
  })
  child.once('exit', (code) => {
    process.exitCode = code ?? 1
  })
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
