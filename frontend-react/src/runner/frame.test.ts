import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

it('执行中 Worker 发生未捕获错误后会重建运行环境', () => {
  const workers: FakeWorker[] = []
  const emitted: { type: string; status?: string }[] = []
  const parent = { postMessage: (message: { type: string }) => emitted.push(message) }
  let receive!: (event: unknown) => void
  class FakeWorker {
    onmessage!: (event: { data: { type: string } }) => void
    onerror!: () => void
    constructor() {
      workers.push(this)
    }
    terminate() {}
    postMessage() {}
  }
  vi.useFakeTimers()
  try {
    runInNewContext(readFileSync(new URL('../../runner/frame.js', import.meta.url), 'utf8'), {
      parent,
      location: { search: '?parent=http%3A%2F%2F127.0.0.1%3A43171' },
      URLSearchParams,
      Worker: FakeWorker,
      crossOriginIsolated: true,
      SharedArrayBuffer,
      TextEncoder,
      Atomics,
      performance,
      setTimeout,
      clearTimeout,
      addEventListener: (_name: string, handler: typeof receive) => {
        receive = handler
      },
    })
    receive({
      source: parent,
      origin: 'http://127.0.0.1:43171',
      data: { type: 'init', channel: 'channel-1' },
    })
    workers[0].onmessage({ data: { type: 'ready' } })
    receive({
      source: parent,
      origin: 'http://127.0.0.1:43171',
      data: { type: 'run', channel: 'channel-1', runId: 'run-1', code: 'print(1)' },
    })
    workers[0].onerror()
    expect(emitted.some((message) => message.type === 'result' && message.status === 'error')).toBe(
      true,
    )
    expect(workers.length).toBe(2)
    workers[1].onmessage({ data: { type: 'ready' } })
    expect(emitted.at(-1)?.type).toBe('ready')
  } finally {
    vi.useRealTimers()
  }
})

it('等待输入暂停执行预算，达到五分钟后保留输出并终止旧 Worker', () => {
  let now = 0
  let receive!: (event: unknown) => void
  const emitted: { type: string; status?: string; output?: string }[] = []
  const workers: FakeWorker[] = []
  const parent = { postMessage: (message: { type: string }) => emitted.push(message) }
  class FakeWorker {
    onmessage!: (event: { data: Record<string, unknown> }) => void
    terminated = false
    constructor() {
      workers.push(this)
    }
    terminate() {
      this.terminated = true
    }
    postMessage() {}
  }
  vi.useFakeTimers()
  try {
    runInNewContext(readFileSync(new URL('../../runner/frame.js', import.meta.url), 'utf8'), {
      parent,
      location: { search: '?parent=http%3A%2F%2F127.0.0.1%3A43171' },
      URLSearchParams,
      Worker: FakeWorker,
      crossOriginIsolated: true,
      SharedArrayBuffer,
      TextEncoder,
      Atomics,
      performance: { now: () => now },
      setTimeout,
      clearTimeout,
      addEventListener: (_name: string, handler: typeof receive) => {
        receive = handler
      },
    })
    const send = (data: Record<string, unknown>) =>
      receive({
        source: parent,
        origin: 'http://127.0.0.1:43171',
        data: { channel: 'test-input', ...data },
      })
    send({ type: 'init' })
    workers[0].onmessage({ data: { type: 'ready' } })
    send({ type: 'run', runId: 'waiting-run', code: 'input("回答：")' })
    now = 4000
    vi.advanceTimersByTime(4000)
    workers[0].onmessage({
      data: { type: 'stream', runId: 'waiting-run', output: '回答：', error: '' },
    })
    workers[0].onmessage({ data: { type: 'input-needed', runId: 'waiting-run', inputId: 1 } })
    vi.advanceTimersByTime(299999)
    expect(emitted.filter((event) => event.type === 'result')).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(emitted.find((event) => event.type === 'result')).toMatchObject({
      status: 'timeout',
      output: '回答：',
    })
    expect(workers[0].terminated).toBe(true)
    expect(workers).toHaveLength(2)
    // 旧 Worker 在终止后迟到的结果必须被忽略。
    workers[0].onmessage({
      data: { type: 'result', runId: 'waiting-run', status: 'success', output: '迟到' },
    })
    expect(emitted.filter((event) => event.type === 'result')).toHaveLength(1)
  } finally {
    vi.useRealTimers()
  }
})
