import net from 'node:net'
import type { RuntimeAddress } from './configuration.cjs'

/** 只探测并保留候选端口，不结束其他程序。启动 Java 前统一释放保留。 */
export async function selectRuntimePorts(preferred: RuntimeAddress): Promise<RuntimeAddress> {
  const reservations: net.Server[] = []
  const selected: number[] = []
  try {
    for (const port of [preferred.backendPort, preferred.runnerPort]) {
      let found = false
      for (let candidate = port; candidate <= Math.min(65535, port + 100); candidate++) {
        if (selected.includes(candidate)) continue
        const server = net.createServer()
        const available = await new Promise<boolean>((resolve) => {
          server.once('error', () => resolve(false))
          server.listen(candidate, '127.0.0.1', () => resolve(true))
        })
        if (!available) continue
        reservations.push(server)
        selected.push(candidate)
        found = true
        break
      }
      if (!found) throw new Error('没有找到可用端口，请调整 XUYA_PORT 或 XUYA_RUNNER_PORT。')
    }
  } finally {
    await Promise.all(
      reservations.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    )
  }
  const backendPort = selected[0]!,
    runnerPort = selected[1]!
  const origin = `http://127.0.0.1:${backendPort}`
  return { backendPort, runnerPort, backendOrigin: origin, frontendOrigin: origin }
}
