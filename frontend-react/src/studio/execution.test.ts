import { afterEach, expect, it, vi } from 'vitest'
import { StudioExecutionBroker } from './execution'
import type { PendingRun, RunExecution, StudioRunResult } from '../studio-types'

const pending: PendingRun = {
  requestId: 'request',
  toolCallId: 'tool',
  candidateId: 'candidate',
  executionId: null,
  status: 'waiting-runner',
  files: [{ path: 'main.py', content: 'print(1)' }],
}
const result: StudioRunResult = {
  runId: 'python-run',
  status: 'success',
  output: '1\n',
  error: '',
  durationMs: 10,
  drawings: [],
  files: [],
  inputs: [],
  stageEvents: [],
  stageState: {},
}
const execution: RunExecution = {
  id: 'execution',
  requestId: pending.requestId,
  candidateId: pending.candidateId,
  status: 'running',
  files: pending.files,
  result: null,
}
function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}
afterEach(() => vi.useRealTimers())

it('回执响应丢失后只幂等补交同一结果，不再次运行 Python', async () => {
  const cache = storage()
  const run = vi.fn().mockResolvedValue(result)
  let lost = true
  const api = vi.fn(async (path: string) => {
    if (path.endsWith('/result')) {
      if (lost) {
        lost = false
        throw new Error('response lost')
      }
      return { ...execution, status: 'completed' as const, result }
    }
    return execution
  })
  const first = new StudioExecutionBroker('session', cache, run, api)
  await expect(first.process(pending)).rejects.toThrow('response lost')
  expect(first.hasReceipt('request')).toBe(true)
  const recovered = new StudioExecutionBroker('session', cache, run, api)
  await recovered.process({ ...pending, status: 'running', executionId: execution.id })
  expect(run).toHaveBeenCalledTimes(1)
  expect(api.mock.calls.filter(([path]) => path.endsWith('/result'))).toHaveLength(2)
  expect(recovered.hasReceipt('request')).toBe(false)
})
it('刷新后的本页未完成执行只标记 unknown，明确 retry 才重新试演', async () => {
  const cache = storage()
  cache.setItem(
    'xuya:studio:execution:session:request',
    JSON.stringify({ clientExecutionId: 'old-client', executionId: 'execution', phase: 'running' }),
  )
  const run = vi.fn().mockResolvedValue(result)
  const api = vi.fn(async (path: string) =>
    path.endsWith('/abandon') ? { ...execution, status: 'unknown' as const } : execution,
  )
  const broker = new StudioExecutionBroker('session', cache, run, api)
  await broker.process({ ...pending, status: 'running' })
  expect(run).not.toHaveBeenCalled()
  expect(api.mock.calls[0][0]).toContain('/abandon')
  await broker.process({ ...pending, status: 'unknown' })
  expect(run).not.toHaveBeenCalled()
  await broker.process({ ...pending, status: 'unknown' }, true)
  expect(run).toHaveBeenCalledTimes(1)
  expect(api.mock.calls.some(([path]) => path.endsWith('/retry'))).toBe(true)
})
it('完整快照重放与并发消费只领取、运行一次', async () => {
  const cache = storage()
  let finish!: (value: StudioRunResult) => void
  const run = vi.fn(
    () =>
      new Promise<StudioRunResult>((resolve) => {
        finish = resolve
      }),
  )
  const api = vi.fn(async (_path: string, _body: unknown) => execution)
  const broker = new StudioExecutionBroker('session', cache, run, api)
  const first = broker.process(pending)
  await Promise.resolve()
  await broker.process(pending)
  finish(result)
  await first
  await broker.process(pending)
  expect(run).toHaveBeenCalledTimes(1)
  expect(api.mock.calls).toHaveLength(2)
})
it('其他标签页拥有的 running 或未知执行不会自动重跑', async () => {
  const run = vi.fn().mockResolvedValue(result)
  const api = vi.fn(async (_path: string, _body: unknown) => execution)
  const broker = new StudioExecutionBroker('session', storage(), run, api)
  await broker.process({ ...pending, status: 'running' })
  await broker.process({ ...pending, status: 'unknown' })
  expect(run).not.toHaveBeenCalled()
  expect(api).not.toHaveBeenCalled()
})
it('实时输入等待期间延长领取租约，停止消费后释放本页执行', async () => {
  vi.useFakeTimers()
  let finish!: (value: StudioRunResult) => void
  const api = vi.fn(async (_path: string, _body: unknown) => execution)
  const broker = new StudioExecutionBroker(
    'session',
    storage(),
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
    api,
  )
  const work = broker.process(pending)
  await vi.advanceTimersByTimeAsync(21000)
  expect(api.mock.calls.filter(([path]) => path.endsWith('/heartbeat'))).toHaveLength(2)
  broker.dispose()
  finish(result)
  await work
  expect(api.mock.calls.some(([path]) => path.endsWith('/abandon'))).toBe(true)
  expect(api.mock.calls.some(([path]) => path.endsWith('/result'))).toBe(false)
})
it('执行日志无法保存时不会运行或领取，避免刷新后重复执行', async () => {
  const cache = storage()
  cache.setItem = () => {
    throw new Error('quota')
  }
  const run = vi.fn().mockResolvedValue(result)
  const api = vi.fn(async (_path: string, _body: unknown) => execution)
  const broker = new StudioExecutionBroker('session', cache, run, api)
  await expect(broker.process(pending)).rejects.toThrow('quota')
  expect(run).not.toHaveBeenCalled()
  expect(api).not.toHaveBeenCalled()
})
