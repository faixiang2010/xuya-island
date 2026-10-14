import { beforeEach, expect, it, vi } from 'vitest'
import { preferenceKey, useLearningPreferences } from './preferences'

beforeEach(() => {
  vi.unstubAllGlobals()
  useLearningPreferences.setState({
    theme: 'detective',
    sound: false,
    motion: true,
    cacheAvailable: true,
  })
})
it('主题、琴音与减少动画会恢复，未知主题不进入界面', () => {
  const cache = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => cache.get(key) ?? null,
    setItem: (key: string, value: string) => cache.set(key, value),
  })
  useLearningPreferences.getState().update({ theme: 'piano', sound: true, motion: false })
  useLearningPreferences.setState({ theme: 'detective', sound: false, motion: true })
  useLearningPreferences.getState().hydrate()
  expect(useLearningPreferences.getState()).toMatchObject({
    theme: 'piano',
    sound: true,
    motion: false,
  })
  cache.set(
    preferenceKey,
    JSON.stringify({ version: 1, theme: 'unknown', sound: 'true', motion: 'off' }),
  )
  useLearningPreferences.getState().hydrate()
  expect(useLearningPreferences.getState()).toMatchObject({
    theme: 'detective',
    sound: false,
    motion: true,
  })
})
it('偏好不能写入时仍能在当前会话选择主题', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error('full')
    },
  })
  useLearningPreferences.getState().update({ theme: 'painting', motion: false })
  expect(useLearningPreferences.getState()).toMatchObject({
    theme: 'painting',
    motion: false,
    cacheAvailable: false,
  })
})
