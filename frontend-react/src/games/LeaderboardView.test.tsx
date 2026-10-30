// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LeaderboardView from '../views/LeaderboardView'

const { readLeaderboard } = vi.hoisted(() => ({ readLeaderboard: vi.fn() }))

vi.mock('../games/leaderboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../games/leaderboard')>()
  return { ...actual, readLeaderboard }
})

afterEach(cleanup)

describe('排行榜页面', () => {
  it('显示家庭共享的成绩和当前玩家标记', async () => {
    readLeaderboard.mockResolvedValue({
      gameId: 'tetris',
      levelId: 'calm',
      levelVersion: 1,
      total: 2,
      entries: [
        {
          rank: 1,
          nickname: '小芽',
          score: 320,
          durationMs: 12_300,
          achievedAt: '2026-10-29T10:20:00Z',
          self: false,
        },
        {
          rank: 2,
          nickname: '弟弟',
          score: 260,
          durationMs: 21_000,
          achievedAt: '2026-10-29T10:30:00Z',
          self: true,
        },
      ],
      mine: {
        rank: 2,
        nickname: '弟弟',
        score: 260,
        durationMs: 21_000,
        achievedAt: '2026-10-29T10:30:00Z',
        self: true,
      },
    })
    render(
      <MemoryRouter initialEntries={['/games/leaderboard?game=tetris&level=calm']}>
        <LeaderboardView />
      </MemoryRouter>,
    )
    expect(await screen.findByText('小芽')).toBeTruthy()
    expect(screen.getByText('弟弟')).toBeTruthy()
    expect(screen.getByText('12.3 秒')).toBeTruthy()
    expect(screen.getByText('共有 2 位家人完成过这一关')).toBeTruthy()
    expect(screen.getByText('我')).toBeTruthy()
  })

  it('没有成绩时提示可以留下第一条记录', async () => {
    readLeaderboard.mockResolvedValue({
      gameId: 'tetris',
      levelId: 'calm',
      levelVersion: 1,
      total: 0,
      entries: [],
      mine: null,
    })
    render(
      <MemoryRouter initialEntries={['/games/leaderboard?game=tetris&level=calm']}>
        <LeaderboardView />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/还没有人完成/)).toBeTruthy()
  })
})
