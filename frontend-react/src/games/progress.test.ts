// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { missingCompletions, mergeGameScores, useGameProgress } from './progress'

beforeEach(() => {
  localStorage.clear()
  useGameProgress.setState({ records: [], drafts: [], cacheAvailable: true })
})

describe('服务端成绩恢复通关状态', () => {
  it('把最佳成绩补成对应关卡的通关记录', () => {
    const records = mergeGameScores(
      [],
      [
        {
          gameId: 'wind',
          levelId: 'breeze',
          levelVersion: 1,
          score: 600,
          durationMs: 1200,
          achievedAt: '2026-10-29T10:20:00Z',
        },
      ],
    )
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      gameId: 'wind',
      levelId: 'breeze',
      levelVersion: 1,
      attempts: 1,
    })
  })

  it('不重复添加已有记录，也忽略未知关卡', () => {
    const existing = [
      {
        gameId: 'tetris' as const,
        levelId: 'calm',
        levelVersion: 1,
        attempts: 1,
        completedAt: '2026-10-29T09:00:00Z',
      },
    ]
    const records = mergeGameScores(existing, [
      {
        gameId: 'tetris',
        levelId: 'calm',
        levelVersion: 1,
        score: 300,
        durationMs: 900,
        achievedAt: '2026-10-29T10:20:00Z',
      },
      {
        gameId: 'tetris',
        levelId: 'missing',
        levelVersion: 1,
        score: 300,
        durationMs: 900,
        achievedAt: '2026-10-29T10:20:00Z',
      },
    ])
    expect(records).toHaveLength(1)
    expect(records[0].completedAt).toBe('2026-10-29T09:00:00Z')
  })

  it('找出浏览器里有、服务端还没有的通关记录', () => {
    const missing = missingCompletions(
      [
        {
          gameId: 'wind',
          levelId: 'breeze',
          levelVersion: 1,
          attempts: 1,
          completedAt: '2026-10-29T09:00:00Z',
        },
        {
          gameId: 'tetris',
          levelId: 'calm',
          levelVersion: 1,
          attempts: 1,
          completedAt: '2026-10-29T09:10:00Z',
        },
        {
          gameId: 'keyboard',
          levelId: 'letters',
          levelVersion: 1,
          attempts: 26,
          completedAt: '2026-10-29T09:20:00Z',
        },
      ],
      [
        {
          gameId: 'tetris',
          levelId: 'calm',
          levelVersion: 1,
          score: 300,
          durationMs: 900,
          achievedAt: '2026-10-29T09:10:00Z',
        },
      ],
    )
    expect(missing).toEqual([{ gameId: 'wind', levelId: 'breeze', levelVersion: 1 }])
  })

  it('练习成绩只用于排名，不替代学习进度恢复通关', () => {
    const records = mergeGameScores(
      [],
      [
        {
          gameId: 'keyboard',
          levelId: 'letters',
          levelVersion: 1,
          score: 99,
          durationMs: 60_000,
          achievedAt: '2026-10-29T10:20:00Z',
        },
      ],
    )
    expect(records).toHaveLength(0)
  })

  it('保存检查点时累计准确率与用时，续练后不丢', () => {
    const performance = { correct: 10, mistakes: 2, elapsedMs: 30_000 }
    useGameProgress.getState().saveDraft('keyboard', 'letters', 2, 2, undefined, performance)
    expect(useGameProgress.getState().drafts[0].performance).toEqual(performance)
    useGameProgress.setState({ records: [], drafts: [], cacheAvailable: true })
    useGameProgress.getState().hydrate()
    expect(useGameProgress.getState().drafts[0].performance).toEqual(performance)
  })
})
