// @vitest-environment jsdom
import { act } from 'react'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { familyApi } from '../account/api'
import { usePythonRunner } from './usePythonRunner'
vi.mock('../account/api', () => ({ familyApi: vi.fn() }))
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.mocked(familyApi).mockReset().mockResolvedValue({ configured: true })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('局域网HTTP无需隔离能力，也能连接主机Python', async () => {
  vi.stubGlobal('crossOriginIsolated', false)
  vi.stubGlobal('SharedArrayBuffer', undefined)
  const { result } = renderHook(() => usePythonRunner({ current: null }, vi.fn()))
  await act(async () => {
    await result.current.initialize()
  })
  expect(result.current.state).toBe('ready')
  expect(result.current.frameUrl).toBe('')
})
it('尚未选择Python时明确指向管理员环境设置', async () => {
  vi.mocked(familyApi).mockResolvedValueOnce({ configured: false })
  const { result } = renderHook(() => usePythonRunner({ current: null }, vi.fn()))
  await act(async () => {
    await result.current.initialize()
  })
  expect(result.current.state).toBe('failed')
  expect(result.current.failure).toContain('家庭管理')
})
it('切换课程后忽略迟到的环境响应', async () => {
  let resolve!: (value: unknown) => void
  vi.mocked(familyApi).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const { result, unmount } = renderHook(() => usePythonRunner({ current: null }, vi.fn()))
  const pending = result.current.initialize()
  unmount()
  resolve({ configured: true })
  await act(async () => {
    await pending
  })
  expect(result.current.state).toBe('loading')
  expect(vi.getTimerCount()).toBe(0)
})
it('重新准备后迟到失败不能覆盖新环境', async () => {
  let resolve!: (value: unknown) => void
  vi.mocked(familyApi)
    .mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    .mockResolvedValueOnce({ configured: true })
  const { result } = renderHook(() => usePythonRunner({ current: null }, vi.fn()))
  let old!: Promise<void>
  await act(async () => {
    old = result.current.initialize()
    await result.current.retry()
  })
  resolve({ configured: false })
  await act(async () => {
    await old
  })
  expect(result.current.state).toBe('ready')
  expect(result.current.failure).toBe('')
})
