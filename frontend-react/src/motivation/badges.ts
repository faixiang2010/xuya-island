import type { Progress } from '../types'
import { typingGames, type GameId } from '../games/content'
import type { GameDraft, GameRecord } from '../games/progress'
import { lessonStatus } from '../learning/path'
import {
  stationActivities,
  stationCompletedCount,
  typedLevelsDone,
  type StationContext,
  type StationId,
} from '../learning/stations'

/** 徽章图标键名，由展示组件映射到具体图标，保持本模块是纯函数、便于测试。 */
export type BadgeIcon =
  'keyboard' | 'pinyin' | 'sprout' | 'book' | 'palette' | 'gamepad' | 'search' | 'wand' | 'calendar'

export interface BadgeInput extends StationContext {
  drafts: GameDraft[]
  savedCount: number
}

export interface Badge {
  id: string
  title: string
  description: string
  group: string
  icon: BadgeIcon
  earned: boolean
  current: number
  total: number
}

const dayBadgeGoal = 3

/** 本地自然日，避免用 UTC 切片把深夜的探索算到前一天。 */
function localDay(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function distinctLearningDays(input: BadgeInput) {
  const days = new Set<string>()
  for (const item of input.progress) {
    const day = localDay(item.updatedAt)
    if (day) days.add(day)
  }
  for (const record of input.records) {
    const day = localDay(record.completedAt)
    if (day) days.add(day)
  }
  return days.size
}

/** 送出过至少一张练习卡：完成记录或进行中的草稿都算。 */
function triedAnyCard(input: BadgeInput) {
  return input.records.length > 0 || input.drafts.some((draft) => draft.attempts > 0)
}

function completedActivityCount(input: BadgeInput) {
  return input.lessons.filter(
    (lesson) => lesson.number > 0 && lessonStatus(lesson, input.progress) === 'completed',
  ).length
}

function stationProgress(input: BadgeInput, id: StationId) {
  return {
    completed: stationCompletedCount(input.lessons, input.progress, id),
    total: stationActivities(input.lessons, id).length,
  }
}

function badge(
  base: Omit<Badge, 'earned' | 'current' | 'total'>,
  current: number,
  total: number,
): Badge {
  const safeTotal = Math.max(1, total)
  const clamped = Math.max(0, Math.min(current, safeTotal))
  return { ...base, current: clamped, total: safeTotal, earned: clamped >= safeTotal }
}

/**
 * 由真实记录派生成就徽章：只奖励“练习、尝试、完成”这类可核对的事实，
 * 不用一次通过推断掌握，也不补造任何历史。
 */
export function computeBadges(input: BadgeInput): Badge[] {
  const keyboardTotal = typingGames.keyboard.levels.length
  const pinyinTotal = typingGames.pinyin.levels.length
  const keyboardDone = typedLevelsDone('keyboard' as GameId, input.records)
  const pinyinDone = typedLevelsDone('pinyin' as GameId, input.records)
  const story = stationProgress(input, 'story')
  const art = stationProgress(input, 'art')
  const game = stationProgress(input, 'game')
  const detective = stationProgress(input, 'detective')
  const activities = completedActivityCount(input)
  const days = distinctLearningDays(input)
  return [
    badge(
      {
        id: 'first-card',
        title: '第一张线索卡',
        description: '送出第一张练习卡，开始认识键盘。',
        group: '起步',
        icon: 'keyboard',
      },
      triedAnyCard(input) ? 1 : 0,
      1,
    ),
    badge(
      {
        id: 'keyboard-pro',
        title: '键盘小达人',
        description: `把字母数字小站的 ${keyboardTotal} 个级别都练完。`,
        group: '起步',
        icon: 'keyboard',
      },
      keyboardDone,
      keyboardTotal,
    ),
    badge(
      {
        id: 'pinyin-pro',
        title: '拼音小达人',
        description: `把拼音汉字小站的 ${pinyinTotal} 个级别都练完。`,
        group: '起步',
        icon: 'pinyin',
      },
      pinyinDone,
      pinyinTotal,
    ),
    badge(
      {
        id: 'first-activity',
        title: '第一段程序',
        description: '完成一个编程课堂活动，让程序说出第一句话。',
        group: '编程',
        icon: 'sprout',
      },
      Math.min(activities, 1),
      1,
    ),
    badge(
      {
        id: 'storyteller',
        title: '故事达人',
        description: '完成故事表达站的全部主线活动。',
        group: '编程',
        icon: 'book',
      },
      story.completed,
      story.total,
    ),
    badge(
      {
        id: 'loop-painter',
        title: '循环画家',
        description: '完成数据与生成艺术站的全部主线活动。',
        group: '编程',
        icon: 'palette',
      },
      art.completed,
      art.total,
    ),
    badge(
      {
        id: 'game-designer',
        title: '游戏设计师',
        description: '完成游戏规则站的全部主线活动。',
        group: '编程',
        icon: 'gamepad',
      },
      game.completed,
      game.total,
    ),
    badge(
      {
        id: 'data-detective',
        title: '数据小侦探',
        description: '在数据探索站完成任意一个活动。',
        group: '编程',
        icon: 'search',
      },
      Math.min(detective.completed, 1),
      1,
    ),
    badge(
      {
        id: 'young-creator',
        title: '小小创作者',
        description: '作品集里出现第一件自己的作品。',
        group: '创作',
        icon: 'wand',
      },
      Math.min(input.savedCount, 1),
      1,
    ),
    badge(
      {
        id: 'three-days',
        title: '坚持三天',
        description: `在 ${dayBadgeGoal} 个不同的日子留下探索，慢慢来也算。`,
        group: '坚持',
        icon: 'calendar',
      },
      days,
      dayBadgeGoal,
    ),
  ]
}

export function earnedBadges(badges: Badge[]) {
  return badges.filter((item) => item.earned)
}
