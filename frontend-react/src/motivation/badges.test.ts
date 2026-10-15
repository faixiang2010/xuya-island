import { describe, expect, it } from 'vitest'
import type { Lesson, Progress } from '../types'
import type { GameRecord } from '../games/progress'
import { typingGames } from '../games/content'
import { computeBadges, type BadgeInput } from './badges'

function emptyInput(overrides: Partial<BadgeInput> = {}): BadgeInput {
  return {
    lessons: [],
    progress: [],
    records: [],
    drafts: [],
    savedCount: 0,
    ...overrides,
  }
}

function lesson(id: string, phaseId: string, number: number, track: 'core' | 'extension' = 'core') {
  return { id, phaseId, number, track, version: 'v1' } as Lesson
}

function completed(lessonId: string, updatedAt = '2026-10-14T02:00:00Z'): Progress {
  return {
    lessonId,
    lessonVersion: 'v1',
    status: 'completed',
    hintLevel: 0,
    referenceViewed: false,
    reflection: '',
    parentObservation: '',
    updatedAt,
  }
}

function record(
  gameId: 'keyboard' | 'pinyin',
  levelId: string,
  levelVersion = 1,
  completedAt = '2026-10-14T02:00:00Z',
): GameRecord {
  return { gameId, levelId, levelVersion, completedAt, attempts: 6 }
}

function badge(input: BadgeInput, id: string) {
  return computeBadges(input).find((item) => item.id === id)!
}

describe('徽章只由真实记录派生', () => {
  it('全新账户没有任何徽章，且进度都是 0', () => {
    const badges = computeBadges(emptyInput())
    expect(badges).toHaveLength(10)
    expect(badges.every((item) => !item.earned && item.current === 0)).toBe(true)
    expect(badge(emptyInput(), 'keyboard-pro').total).toBe(typingGames.keyboard.levels.length)
  })

  it('送出第一张卡即解锁起步徽章，进行中的草稿也算', () => {
    const input = emptyInput({
      drafts: [
        { gameId: 'keyboard', levelId: 'letters', levelVersion: 1, nextIndex: 2, attempts: 2 },
      ],
    })
    expect(badge(input, 'first-card').earned).toBe(true)
    expect(badge(input, 'keyboard-pro').earned).toBe(false)
    expect(badge(input, 'keyboard-pro').current).toBe(0)
  })

  it('练完键盘全部级别才解锁键盘徽章', () => {
    const levels = typingGames.keyboard.levels
    const almost = emptyInput({
      records: levels.slice(0, -1).map((level) => record('keyboard', level.id, level.version)),
    })
    expect(badge(almost, 'keyboard-pro').earned).toBe(false)
    expect(badge(almost, 'keyboard-pro').current).toBe(levels.length - 1)
    const all = emptyInput({
      records: levels.map((level) => record('keyboard', level.id, level.version)),
    })
    expect(badge(all, 'keyboard-pro').earned).toBe(true)
  })

  it('完成故事站全部主线活动才解锁故事达人，扩展活动不计入', () => {
    const input = emptyInput({
      lessons: [
        lesson('a', 'story', 1),
        lesson('b', 'story', 2),
        lesson('c', 'story', 3, 'extension'),
      ],
      progress: [completed('a'), completed('b')],
    })
    expect(badge(input, 'storyteller')).toMatchObject({ current: 2, total: 2, earned: true })
    expect(badge(input, 'first-activity').earned).toBe(true)
  })

  it('只统计本地的不同学习日，重复记录不重复计数', () => {
    const input = emptyInput({
      progress: [completed('a', '2026-10-12T10:00:00Z'), completed('b', '2026-10-12T20:00:00Z')],
      records: [
        record('keyboard', 'letters', 1, '2026-10-13T01:00:00Z'),
        record('keyboard', 'uppercase', 1, '2026-10-13T02:00:00Z'),
      ],
    })
    expect(badge(input, 'three-days').current).toBe(2)
    expect(badge(input, 'three-days').earned).toBe(false)
    const third = computeBadges({
      ...input,
      progress: [...input.progress, completed('c', '2026-10-14T03:00:00Z')],
    })
    expect(third.find((item) => item.id === 'three-days')).toMatchObject({
      current: 3,
      earned: true,
    })
  })

  it('作品集有作品才解锁小小创作者', () => {
    expect(badge(emptyInput({ savedCount: 0 }), 'young-creator').earned).toBe(false)
    expect(badge(emptyInput({ savedCount: 1 }), 'young-creator').earned).toBe(true)
  })
})
