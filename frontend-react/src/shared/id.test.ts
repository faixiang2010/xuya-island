import { afterEach, expect, it, vi } from 'vitest'
import { newId } from './id'
afterEach(() => vi.unstubAllGlobals())
it('没有安全上下文的randomUUID时仍使用浏览器随机源生成UUID', () => {
  const random = vi.fn((value: Uint8Array) => {
    value.fill(27)
    return value
  })
  vi.stubGlobal('crypto', { getRandomValues: random })
  expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(random).toHaveBeenCalledTimes(1)
})
