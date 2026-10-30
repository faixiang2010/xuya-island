import { familyApi } from '../account/api'
import { accountStorage } from '../account/session'
import { typingGames, type GameId, type GameKind } from './content'

/** 游戏中心全部游戏都参与家庭排行榜；练习类游戏记准确率，街机类游戏记得分。 */
export const leaderboardGameIds = Object.keys(typingGames) as GameId[]

const scoredKinds: GameKind[] = [
  'tetris',
  'minesweeper',
  'echo',
  'wind',
  'melody',
  'piano',
  'mirror',
  'memory',
]

/** 排行榜指标：计分小游戏看得分，练习小游戏看准确率。 */
export function rankingMetric(gameId: GameId): 'score' | 'accuracy' {
  return scoredKinds.includes(typingGames[gameId].kind) ? 'score' : 'accuracy'
}

export interface GameScoreEntry {
  rank: number
  nickname: string
  score: number
  durationMs: number
  achievedAt: string
  self: boolean
}

export interface GameLeaderboard {
  gameId: string
  levelId: string
  levelVersion: number
  total: number
  entries: GameScoreEntry[]
  mine?: GameScoreEntry | null
}

export interface GameScoreInput {
  gameId: string
  levelId: string
  levelVersion: number
  durationMs: number
  score: number
}

export interface MyGameScore {
  gameId: string
  levelId: string
  levelVersion: number
  score: number
  durationMs: number
  achievedAt: string
}

export interface LegacyCompletion {
  gameId: string
  levelId: string
  levelVersion: number
}

const pendingKey = 'xuya:game-scores:pending:v1'

function scoreKey(value: { gameId: string; levelId: string; levelVersion: number }) {
  return `${value.gameId}:${value.levelId}:${value.levelVersion}`
}

export function pendingGameScores() {
  try {
    const raw: unknown = JSON.parse(accountStorage.getItem(pendingKey) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (item): item is GameScoreInput =>
        Boolean(item) &&
        typeof item.gameId === 'string' &&
        typeof item.levelId === 'string' &&
        Number.isInteger(item.levelVersion) &&
        Number.isFinite(item.durationMs) &&
        Number.isFinite(item.score),
    )
  } catch {
    return []
  }
}

function writePending(items: GameScoreInput[]) {
  try {
    accountStorage.setItem(pendingKey, JSON.stringify(items))
  } catch {
    /* 浏览器存储不可用时只影响离线重试，不阻断游戏。 */
  }
}

/** 成绩上传失败时先留在本机，下次登录同步时再补交。 */
export function queueGameScore(input: GameScoreInput) {
  const items = pendingGameScores()
  const index = items.findIndex((item) => scoreKey(item) === scoreKey(input))
  if (index < 0) items.push(input)
  else if (
    input.score > items[index].score ||
    (input.score === items[index].score && input.durationMs < items[index].durationMs)
  )
    items[index] = input
  writePending(items)
}

export async function flushGameScores() {
  for (const item of [...pendingGameScores()]) {
    try {
      await submitGameScore(item)
      writePending(pendingGameScores().filter((pending) => scoreKey(pending) !== scoreKey(item)))
    } catch {
      // 仍然离线时保留队列，等下一次登录继续尝试。
      break
    }
  }
}

export function pendingScoreCount() {
  return pendingGameScores().length
}

export function submitGameScore(input: GameScoreInput) {
  return familyApi<{ saved: boolean; best?: GameScoreEntry | null }>(
    '/learning/game-scores',
    'POST',
    input,
  )
}

export function readLeaderboard(gameId: string, levelId: string, version: number) {
  const query = new URLSearchParams({
    gameId,
    levelId,
    version: String(version),
    limit: '20',
  })
  return familyApi<GameLeaderboard>(`/learning/leaderboard?${query}`)
}

/** 当前账户在服务端的全部最佳成绩，用于登录后恢复已通关状态。 */
export function readMyGameScores() {
  return familyApi<MyGameScore[]>('/learning/game-scores')
}

/** 旧版浏览器只留下通关状态、没有成绩的关卡，补交为不进排行榜的完成记录。 */
export function submitLegacyCompletions(items: LegacyCompletion[]) {
  return familyApi<{ saved: number }>('/learning/game-completions', 'POST', items)
}

/** 练习类游戏通关后上报准确率（1–100 分）与用时，同准确率再比用时。 */
export function reportPracticeScore(input: {
  gameId: GameId
  levelId: string
  levelVersion: number
  accuracy: number
  durationMs: number
}) {
  const payload: GameScoreInput = {
    gameId: input.gameId,
    levelId: input.levelId,
    levelVersion: input.levelVersion,
    score: Math.max(1, Math.min(100, Math.round(input.accuracy))),
    durationMs: Math.max(1, Math.round(input.durationMs)),
  }
  return submitGameScore(payload).catch(() => queueGameScore(payload))
}

export function formatDuration(durationMs: number) {
  const seconds = Math.max(0, durationMs) / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes} 分 ${rest} 秒`
}

export function formatAchievedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
