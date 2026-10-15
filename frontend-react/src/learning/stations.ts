import type { Lesson, Progress } from '../types'
import { typingGames, type GameId } from '../games/content'
import { gameFinished, type GameRecord } from '../games/progress'
import { lessonStatus } from './path'

/** 首页学习地图的八个站点；进度口径在这里统一，地图与总进度共用同一份判断。 */
export const stationIds = [
  'keyboard',
  'pinyin',
  'story',
  'interactive',
  'art',
  'game',
  'detective',
  'studio',
] as const
export type StationId = (typeof stationIds)[number]

/** 可选探索站点：完成不作为主线要求，但仍计入总进度与徽章。 */
export const optionalStationIds: readonly StationId[] = ['detective', 'studio']

export interface StationContext {
  lessons: Lesson[]
  progress: Progress[]
  records: GameRecord[]
}

export function isOptionalStation(id: StationId) {
  return optionalStationIds.includes(id)
}

/** 一个站点下、按主线或可选口径应统计的活动。 */
export function stationActivities(lessons: Lesson[], id: StationId) {
  const optional = isOptionalStation(id)
  return lessons
    .filter(
      (lesson) =>
        lesson.phaseId === id && lesson.number > 0 && (optional || lesson.track === 'core'),
    )
    .sort((a, b) => a.number - b.number)
}

export function stationCompletedCount(lessons: Lesson[], progress: Progress[], id: StationId) {
  const activities = stationActivities(lessons, id)
  return activities.filter((lesson) => lessonStatus(lesson, progress) === 'completed').length
}

export function stationHasReview(lessons: Lesson[], progress: Progress[], id: StationId) {
  return stationActivities(lessons, id).some(
    (lesson) => lessonStatus(lesson, progress) === 'needs-review',
  )
}

/** 站点是否已完成：打字站按级别全通，编程站按活动全部完成。 */
export function stationDone(id: StationId, context: StationContext): boolean {
  if (id === 'keyboard' || id === 'pinyin') return gameFinished(id as GameId, context.records)
  const activities = stationActivities(context.lessons, id)
  return (
    activities.length > 0 &&
    stationCompletedCount(context.lessons, context.progress, id) === activities.length
  )
}

/** 八站总进度。 */
export function stationSummary(context: StationContext) {
  const done = stationIds.filter((id) => stationDone(id, context)).length
  return { done, total: stationIds.length }
}

/** 打字游戏已完成级别数。 */
export function typedLevelsDone(gameId: GameId, records: GameRecord[]) {
  return typingGames[gameId].levels.filter((level) =>
    records.some(
      (record) =>
        record.gameId === gameId &&
        record.levelId === level.id &&
        record.levelVersion === level.version,
    ),
  ).length
}
