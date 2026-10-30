// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bindSession } from '../account/session'
import {
  formatAchievedAt,
  formatDuration,
  pendingGameScores,
  queueGameScore,
  rankingMetric,
  reportPracticeScore,
} from './leaderboard'

const { familyApi } = vi.hoisted(() => ({ familyApi: vi.fn() }))

vi.mock('../account/api', () => ({ familyApi }))

beforeEach(() => {
  localStorage.clear()
  bindSession('pending-test', 'csrf')
  familyApi.mockReset()
})

describe('排行榜显示格式', () => {
  it('用时按秒或分秒展示', () => {
    expect(formatDuration(12_340)).toBe('12.3 秒')
    expect(formatDuration(65_000)).toBe('1 分 5 秒')
    expect(formatDuration(0)).toBe('0.0 秒')
  })

  it('无效时间返回空字符串', () => {
    expect(formatAchievedAt('not-a-date')).toBe('')
    expect(formatAchievedAt('2026-10-29T10:20:00Z')).not.toBe('')
  })

  it('离线成绩只保留同一关更好的一次', () => {
    const base = { gameId: 'tetris', levelId: 'calm', levelVersion: 1 }
    queueGameScore({ ...base, durationMs: 5000, score: 100 })
    queueGameScore({ ...base, durationMs: 1000, score: 80 })
    expect(pendingGameScores()).toHaveLength(1)
    expect(pendingGameScores()[0].score).toBe(100)
    queueGameScore({ ...base, durationMs: 9000, score: 120 })
    expect(pendingGameScores()[0].score).toBe(120)
    queueGameScore({ ...base, durationMs: 4000, score: 120 })
    expect(pendingGameScores()[0].durationMs).toBe(4000)
  })

  it('街机按得分排名，练习按准确率排名', () => {
    expect(rankingMetric('tetris')).toBe('score')
    expect(rankingMetric('keyboard')).toBe('accuracy')
    expect(rankingMetric('passage-en')).toBe('accuracy')
  })

  it('练习成绩把准确率取整并夹在 1–100，离线时进入待补交队列', async () => {
    familyApi.mockRejectedValue(new Error('离线'))
    await reportPracticeScore({
      gameId: 'keyboard',
      levelId: 'letters',
      levelVersion: 1,
      accuracy: 99.6,
      durationMs: 1200,
    })
    const queued = pendingGameScores().find((item) => item.gameId === 'keyboard')
    expect(queued?.score).toBe(100)
    expect(queued?.durationMs).toBe(1200)
  })
})
