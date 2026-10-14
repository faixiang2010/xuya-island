import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})
it('静音与不支持音频时不创建声音，也不阻止学习', async () => {
  vi.stubGlobal('window', {})
  const audio = await import('./audio')
  expect(audio.prepareLearningAudio(false)).toBe(false)
  expect(audio.prepareLearningAudio(true)).toBe(false)
  expect(audio.playLearningNote(true, 0)).toBe(false)
  expect(await audio.playLearningPhrase(true, 0, 6)).toBe(false)
})
it('琴音由本地短音组成，关闭会立即停止已排入的声音', async () => {
  const oscillators: {
    stop: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    frequency: { value: number }
  }[] = []
  const suspend = vi.fn(async () => {})
  class FakeContext {
    state = 'running'
    currentTime = 1
    destination = {}
    resume = vi.fn(async () => {})
    suspend = suspend
    createOscillator() {
      const node = {
        type: '',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      }
      oscillators.push(node)
      return node
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }
    }
  }
  vi.stubGlobal('window', { AudioContext: FakeContext })
  const audio = await import('./audio')
  expect(audio.prepareLearningAudio(true)).toBe(true)
  audio.playLearningNote(false, 0)
  expect(oscillators).toHaveLength(0)
  audio.playLearningNote(true, 0)
  expect(oscillators.length).toBeGreaterThan(0)
  const baseFrequency = oscillators[0].frequency.value
  audio.playLearningNote(true, 1)
  expect(oscillators.some((node) => node.frequency.value !== baseFrequency)).toBe(true)
  audio.silenceLearningAudio()
  expect(suspend).toHaveBeenCalled()
  expect(oscillators.every((node) => node.disconnect.mock.calls.length > 0)).toBe(true)
})
