import { accountStorage } from '../account/session'
import { familyApi } from '../account/api'
import { restoreLearningSession } from '../growth/outbox'
import { create } from 'zustand'
import { typingGames, type GameId } from './content'
export const gameStorageKey = 'xuya:typing-progress:v2'
const legacyKey = 'xuya:typing-progress:v1'
export interface GameRecord {
  gameId: GameId
  levelId: string
  levelVersion: number
  completedAt: string
  attempts: number
}
export interface GameDraft {
  gameId: GameId
  levelId: string
  levelVersion: number
  nextIndex: number
  attempts: number
  growth?: { sessionId: string; start: number; end: number }
}
interface SavedProgress {
  records: GameRecord[]
  drafts: GameDraft[]
}
function knownLevel(record: Record<string, unknown>) {
  const gameId = record.gameId
  if (typeof gameId !== 'string' || !(gameId in typingGames)) return
  return typingGames[gameId as GameId].levels.find(
    (level) => level.id === record.levelId && level.version === record.levelVersion,
  )
}
export function readSaved(storage: Pick<Storage, 'getItem'>): SavedProgress {
  const saved: SavedProgress = { records: [], drafts: [] }
  try {
    const raw = JSON.parse(storage.getItem(gameStorageKey) ?? 'null')
    if (raw?.version === 2) {
      for (const record of Array.isArray(raw.records) ? raw.records : []) {
        if (!record || typeof record !== 'object') continue
        const level = knownLevel(record)
        if (
          !level ||
          !Number.isInteger(record.attempts) ||
          record.attempts < level.tasks.length ||
          typeof record.completedAt !== 'string' ||
          !Number.isFinite(Date.parse(record.completedAt))
        )
          continue
        if (
          !saved.records.some(
            (item) => item.gameId === record.gameId && item.levelId === record.levelId,
          )
        )
          saved.records.push({
            gameId: record.gameId,
            levelId: level.id,
            levelVersion: level.version,
            attempts: record.attempts,
            completedAt: record.completedAt,
          })
      }
      for (const draft of Array.isArray(raw.drafts) ? raw.drafts : []) {
        if (!draft || typeof draft !== 'object') continue
        const level = knownLevel(draft)
        if (
          !level ||
          !Number.isInteger(draft.nextIndex) ||
          draft.nextIndex <= 0 ||
          draft.nextIndex >= level.tasks.length ||
          !Number.isInteger(draft.attempts) ||
          draft.attempts < draft.nextIndex
        )
          continue
        if (
          !saved.drafts.some(
            (item) => item.gameId === draft.gameId && item.levelId === draft.levelId,
          )
        )
          saved.drafts.push({
            gameId: draft.gameId,
            levelId: level.id,
            levelVersion: level.version,
            nextIndex: draft.nextIndex,
            attempts: draft.attempts,
            growth:
              draft.growth &&
              /^[a-zA-Z0-9-]{1,100}$/.test(draft.growth.sessionId) &&
              Number.isInteger(draft.growth.start) &&
              Number.isInteger(draft.growth.end) &&
              draft.growth.start >= 0 &&
              draft.growth.end <= level.tasks.length &&
              draft.growth.end - draft.growth.start <= 6 &&
              draft.growth.start <= draft.nextIndex &&
              draft.growth.end >= draft.nextIndex
                ? draft.growth
                : undefined,
          })
      }
    }
  } catch {
    /* A damaged payload cannot mark a skill completed. */
  }
  try {
    const legacy = JSON.parse(storage.getItem(legacyKey) ?? 'null')
    if (legacy?.version === 1 && Array.isArray(legacy.records))
      for (const record of legacy.records) {
        if (!record || typeof record !== 'object') continue
        const level = knownLevel({ ...record, levelVersion: 1 })
        // Only unchanged v1 levels migrate. Preserve the original payload under its old key.
        if (
          !level ||
          !Number.isInteger(record.attempts) ||
          record.attempts < level.tasks.length ||
          typeof record.completedAt !== 'string' ||
          !Number.isFinite(Date.parse(record.completedAt))
        )
          continue
        if (
          !saved.records.some((item) => item.gameId === record.gameId && item.levelId === level.id)
        )
          saved.records.push({
            gameId: record.gameId,
            levelId: level.id,
            levelVersion: 1,
            attempts: record.attempts,
            completedAt: record.completedAt,
          })
      }
  } catch {
    /* Legacy damage must not discard valid current records. */
  }
  return saved
}
export function readGameProgress(storage: Pick<Storage, 'getItem'>) {
  return readSaved(storage).records
}
function persist(saved: SavedProgress) {
  try {
    accountStorage.setItem(gameStorageKey, JSON.stringify({ version: 2, ...saved }))
    return true
  } catch {
    return false
  }
}
interface GameProgressState extends SavedProgress {
  cacheAvailable: boolean
  hydrate: () => void
  saveDraft: (
    gameId: GameId,
    levelId: string,
    nextIndex: number,
    attempts: number,
    growth?: GameDraft['growth'],
  ) => void
  clearDraft: (gameId: GameId, levelId: string) => void
  complete: (gameId: GameId, levelId: string, attempts: number) => void
}
export const useGameProgress = create<GameProgressState>((set, get) => ({
  records: [],
  drafts: [],
  cacheAvailable: true,
  hydrate: () => {
    try {
      accountStorage.getItem(gameStorageKey)
      set({ ...readSaved(accountStorage), cacheAvailable: true })
    } catch {
      set({ cacheAvailable: false })
    }
  },
  saveDraft: (gameId, levelId, nextIndex, attempts, growth) => {
    const level = typingGames[gameId].levels.find((item) => item.id === levelId)
    if (
      !level ||
      !Number.isInteger(nextIndex) ||
      nextIndex <= 0 ||
      nextIndex >= level.tasks.length ||
      !Number.isInteger(attempts) ||
      attempts < nextIndex
    )
      return
    const drafts = get().drafts.filter((item) => item.gameId !== gameId || item.levelId !== levelId)
    drafts.push({
      gameId,
      levelId,
      levelVersion: level.version,
      nextIndex,
      attempts,
      ...(growth ? { growth } : {}),
    })
    set({ drafts, cacheAvailable: persist({ records: get().records, drafts }) })
  },
  clearDraft: (gameId, levelId) => {
    const drafts = get().drafts.filter((item) => item.gameId !== gameId || item.levelId !== levelId)
    set({ drafts, cacheAvailable: persist({ records: get().records, drafts }) })
  },
  complete: (gameId, levelId, attempts) => {
    const level = typingGames[gameId].levels.find((item) => item.id === levelId)
    if (!level || !Number.isInteger(attempts) || attempts < level.tasks.length) return
    const records = get().records.filter(
      (record) => record.gameId !== gameId || record.levelId !== levelId,
    )
    records.push({
      gameId,
      levelId,
      levelVersion: level.version,
      attempts,
      completedAt: new Date().toISOString(),
    })
    const drafts = get().drafts.filter(
      (draft) => draft.gameId !== gameId || draft.levelId !== levelId,
    )
    set({ records, drafts, cacheAvailable: persist({ records, drafts }) })
  },
}))
export function gameFinished(gameId: GameId, records: GameRecord[]) {
  return typingGames[gameId].levels.every((level) =>
    records.some(
      (record) =>
        record.gameId === gameId &&
        record.levelId === level.id &&
        record.levelVersion === level.version,
    ),
  )
}

export async function synchronizeGameProgress() {
  const remote = await familyApi<SavedProgress & { version: number }>('/learning/typing-progress')
  const validated = readSaved({
    getItem: (key) => (key === gameStorageKey ? JSON.stringify(remote) : null),
  })
  for (const draft of validated.drafts)
    if (draft.growth) await restoreLearningSession(draft.growth.sessionId)
  const local = useGameProgress.getState()
  const records = [...local.records]
  for (const item of validated.records)
    if (
      !records.some(
        (previous) =>
          previous.gameId === item.gameId &&
          previous.levelId === item.levelId &&
          previous.levelVersion === item.levelVersion,
      )
    )
      records.push(item)
  const drafts = [...local.drafts]
  for (const item of validated.drafts) {
    const index = drafts.findIndex(
      (previous) =>
        previous.gameId === item.gameId &&
        previous.levelId === item.levelId &&
        previous.levelVersion === item.levelVersion,
    )
    if (index < 0) drafts.push(item)
    else if (drafts[index].nextIndex < item.nextIndex) drafts[index] = item
  }
  useGameProgress.setState({ records, drafts, cacheAvailable: persist({ records, drafts }) })
}
