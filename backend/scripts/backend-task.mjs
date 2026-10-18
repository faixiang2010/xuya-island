import path from 'node:path'
import {
  prepareEnvironment,
  readDefaultPorts,
  resolveJavaExecutable,
  resolveMavenExecutable,
  runNodeScript,
  spawnMaven,
  workspaceRoot,
} from './runtime.mjs'
import { selectPorts } from './ports.mjs'

/** 所有平台统一的后端入口：run / test / build / clean。 */

const TASKS = new Set(['run', 'test', 'build', 'clean'])
const task = process.argv[2] || 'run'

async function applyPorts(env) {
  if (env.XUYA_PORTS_PREPARED === '1') return
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
    `Backend: http://127.0.0.1:${backendPort} ; Python resources: http://127.0.0.1:${runnerPort}`,
  )
}

async function main() {
  if (!TASKS.has(task)) throw new Error(`未知后端任务：${task}`)
  const env = prepareEnvironment(task)
  // 在启动 Maven 前完成工具链检查，配置缺失时直接给出明确指引。
  resolveJavaExecutable(env)
  resolveMavenExecutable(env)
  if (task === 'run') await applyPorts(env)
  if (task !== 'clean') {
    runNodeScript(
      path.join(workspaceRoot, 'frontend-react/scripts/prepare-learning-catalog.mjs'),
      env,
      ['--experimental-strip-types'],
    )
    runNodeScript(path.join(workspaceRoot, 'frontend-react/scripts/prepare-runtime.mjs'), env)
  }
  const child = spawnMaven(task, env)
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      if (child.exitCode === null) child.kill(signal)
    })
  child.once('exit', (code) => {
    process.exitCode = code ?? 1
  })
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
