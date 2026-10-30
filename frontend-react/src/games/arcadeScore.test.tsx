// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useArcadeScore } from './arcadeScore'
import { useGameProgress } from './progress'

vi.mock('./leaderboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./leaderboard')>()
  return {
    ...actual,
    submitGameScore: vi.fn().mockResolvedValue({ saved: true }),
    queueGameScore: vi.fn(),
  }
})

beforeEach(() => {
  localStorage.clear()
  useGameProgress.setState({ records: [], drafts: [], cacheAvailable: true })
})

describe('小游戏成绩上报', () => {
  it('通关后立即记为已练完，不依赖重新登录同步', async () => {
    const { rerender } = renderHook(
      ({ won }: { won: boolean }) => useArcadeScore('tetris', 'calm', 1, won, () => 120),
      { initialProps: { won: false } },
    )
    expect(useGameProgress.getState().records).toHaveLength(0)
    await act(async () => {
      rerender({ won: true })
    })
    const records = useGameProgress.getState().records
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ gameId: 'tetris', levelId: 'calm', levelVersion: 1 })
  })
})
