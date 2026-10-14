import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkTyping, typingGames, nextRequiredCharacter } from './content'
import { gameFinished, gameStorageKey, readGameProgress, useGameProgress } from './progress'
const stamp = new Date().toISOString()
describe('入门打字练习', () => {
  beforeEach(() => {
    useGameProgress.setState({ records: [], drafts: [], cacheAvailable: true })
    vi.unstubAllGlobals()
  })
  it('覆盖大小写、数字与切换，题目只有字母数字', () => {
    expect(typingGames.keyboard.levels).toHaveLength(5)
    for (const [id, expected] of [
      ['letters', 'abcdefghijklmnopqrstuvwxyz'],
      ['uppercase', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
    ] as const)
      expect(
        typingGames.keyboard.levels
          .find((level) => level.id === id)!
          .tasks.map((task) => task.target)
          .sort()
          .join(''),
      ).toBe(expected)
    expect(
      new Set(
        typingGames.keyboard.levels
          .find((level) => level.id === 'numbers')!
          .tasks.map((task) => task.target),
      ).size,
    ).toBe(10)
    for (const level of typingGames.keyboard.levels)
      for (const task of level.tasks) expect(task.target).toMatch(/^[a-z0-9]+$/i)
  })
  it('严格匹配大小写，错误给出修正方法，正确前缀等待继续', () => {
    expect(checkTyping('keyboard', 'A1', 'A1').correct).toBe(true)
    expect(checkTyping('keyboard', 'A1', 'a1').state).toBe('case')
    expect(checkTyping('keyboard', 'A1', 'a1').message).toContain('Shift')
    expect(checkTyping('keyboard', 'a', 'A').message).toContain('Caps Lock')
    expect(checkTyping('keyboard', 'Ab3', 'Ab').state).toBe('partial')
    expect(checkTyping('keyboard', 'a', ' a ').state).toBe('invalid')
    expect(checkTyping('keyboard', 'a', '啊').message).toContain('英文')
    expect(checkTyping('pinyin', '山', 'shan').message).toContain('选出汉字')
    expect(checkTyping('pinyin', '你好', '你').state).toBe('partial')
    expect(checkTyping('pinyin', '山', ' 山 ').correct).toBe(true)
    expect(nextRequiredCharacter('Ab3', 'ab')).toBe('A')
    expect(nextRequiredCharacter('Ab3', 'A')).toBe('b')
  })
  it('损坏、未知版本与伪完成记录不能点亮地图', () => {
    const storage = (value: string) => ({ getItem: () => value })
    expect(readGameProgress(storage('{broken'))).toEqual([])
    expect(readGameProgress(storage(JSON.stringify({ version: 9, records: [] })))).toEqual([])
    expect(
      readGameProgress(
        storage(
          JSON.stringify({
            version: 2,
            records: [
              {
                gameId: 'keyboard',
                levelId: 'letters',
                levelVersion: 1,
                attempts: 1,
                completedAt: stamp,
              },
              { gameId: 'unknown' },
            ],
          }),
        ),
      ),
    ).toEqual([])
  })
  it('整级完成才保存完成记录，草稿游标可恢复，重玩保留完成记录', () => {
    const cache = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => cache.set(key, value),
    })
    useGameProgress.getState().complete('keyboard', 'letters', 2)
    expect(useGameProgress.getState().records).toHaveLength(0)
    useGameProgress.getState().saveDraft('keyboard', 'letters', 6, 6)
    useGameProgress.setState({ drafts: [] })
    useGameProgress.getState().hydrate()
    expect(useGameProgress.getState().drafts[0].nextIndex).toBe(6)
    for (const level of typingGames.keyboard.levels)
      useGameProgress.getState().complete('keyboard', level.id, level.tasks.length)
    useGameProgress.getState().clearDraft('keyboard', 'letters')
    expect(useGameProgress.getState().records).toHaveLength(5)
    expect(gameFinished('keyboard', useGameProgress.getState().records)).toBe(true)
    useGameProgress.setState({ records: [], drafts: [] })
    useGameProgress.getState().hydrate()
    expect(useGameProgress.getState().records).toHaveLength(5)
  })
  it('只迁移内容兼容的旧记录，新大小写关卡仍需练习且原记录不删除', () => {
    const old = JSON.stringify({
      version: 1,
      records: [
        { gameId: 'keyboard', levelId: 'letters', attempts: 26, completedAt: stamp },
        { gameId: 'keyboard', levelId: 'numbers', attempts: 10, completedAt: stamp },
        { gameId: 'keyboard', levelId: 'mixed', attempts: 8, completedAt: stamp },
        { gameId: 'pinyin', levelId: 'words', attempts: 8, completedAt: stamp },
      ],
    })
    const cache = new Map([['xuya:typing-progress:v1', old]])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => cache.set(key, value),
    })
    useGameProgress.getState().hydrate()
    expect(useGameProgress.getState().records.map((item) => item.levelId)).toEqual([
      'letters',
      'numbers',
      'words',
    ])
    expect(gameFinished('keyboard', useGameProgress.getState().records)).toBe(false)
    useGameProgress.getState().saveDraft('keyboard', 'uppercase', 1, 1)
    expect(cache.get('xuya:typing-progress:v1')).toBe(old)
    expect(JSON.parse(cache.get(gameStorageKey)!).version).toBe(2)
  })
  it('缓存失败保留当前会话进度，无法读写时明确报告', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
    })
    useGameProgress.getState().hydrate()
    expect(useGameProgress.getState().cacheAvailable).toBe(false)
    useGameProgress.getState().saveDraft('pinyin', 'characters', 2, 2)
    expect(useGameProgress.getState().drafts[0].nextIndex).toBe(2)
    useGameProgress.getState().complete('pinyin', 'characters', 8)
    expect(useGameProgress.getState().records).toHaveLength(1)
    expect(useGameProgress.getState().cacheAvailable).toBe(false)
  })
})
