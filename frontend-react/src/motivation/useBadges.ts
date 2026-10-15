import { useEffect, useMemo, useRef } from 'react'
import { accountStorage } from '../account/session'
import { useClassroomStore } from '../stores/classroom'
import { useGameProgress } from '../games/progress'
import { computeBadges, earnedBadges, type Badge, type BadgeInput } from './badges'
import { celebrate } from './celebrate'

const seenKey = 'xuya:motivation:seen-badges:v1'

/** 徽章计算所需的真实记录，全部来自已有状态，不发额外请求。 */
export function useBadgeInput(): BadgeInput {
  const lessons = useClassroomStore((state) => state.lessons)
  const progress = useClassroomStore((state) => state.progress)
  const savedCount = useClassroomStore((state) => state.savedCount)
  const records = useGameProgress((state) => state.records)
  const drafts = useGameProgress((state) => state.drafts)
  return useMemo(
    () => ({ lessons, progress, savedCount, records, drafts }),
    [lessons, progress, savedCount, records, drafts],
  )
}

export function useBadges(): Badge[] {
  const input = useBadgeInput()
  return useMemo(() => computeBadges(input), [input])
}

function readSeen(): Set<string> | undefined {
  try {
    const raw: unknown = JSON.parse(accountStorage.getItem(seenKey) ?? 'null')
    if (!raw || typeof raw !== 'object') return undefined
    const value = raw as { version?: unknown; earned?: unknown }
    if (value.version !== 1 || !Array.isArray(value.earned)) return undefined
    return new Set(value.earned.filter((item): item is string => typeof item === 'string'))
  } catch {
    return undefined
  }
}

function writeSeen(ids: string[]) {
  try {
    accountStorage.setItem(seenKey, JSON.stringify({ version: 1, earned: ids }))
  } catch {
    // 浏览器不能保存时只会重复庆祝一次，不影响学习记录与进度。
  }
}

/**
 * 徽章解锁监听：启用后的第一次静默记录当前收获，之后只在新增徽章时庆祝。
 * 必须等学习数据加载完成后再启用，否则空数据会算出假的“新徽章”。
 */
export function useBadgeWatch(enabled: boolean) {
  const badges = useBadges()
  const earned = useMemo(() => earnedBadges(badges), [badges])
  const seen = useRef<Set<string> | undefined>(undefined)
  useEffect(() => {
    if (!enabled) return
    if (!seen.current) {
      const stored = readSeen()
      if (!stored) {
        seen.current = new Set(earned.map((item) => item.id))
        writeSeen([...seen.current])
        return
      }
      seen.current = stored
    }
    const fresh = earned.filter((item) => !seen.current!.has(item.id))
    if (!fresh.length) return
    for (const item of fresh) seen.current.add(item.id)
    writeSeen([...seen.current])
    for (const item of fresh)
      celebrate({
        kind: 'badge',
        title: `解锁徽章 · ${item.title}`,
        detail: item.description,
      })
  }, [enabled, earned])
}
