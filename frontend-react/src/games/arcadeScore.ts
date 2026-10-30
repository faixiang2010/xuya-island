import { useCallback, useEffect, useRef, useState } from 'react'
import { typingGames, type GameId } from './content'
import { queueGameScore, submitGameScore } from './leaderboard'
import { useGameProgress } from './progress'

export interface ArcadeScoreResult {
  durationMs: number
  score: number
}

/**
 * 小游戏统一的计时与上报：第一次有效操作开始计时，通关时把用时和得分写入家庭榜单。
 * 重开同一关需要调用 reset()，否则会沿用上一局的开始时间。
 */
export function useArcadeScore(
  gameId: GameId,
  levelId: string,
  levelVersion: number,
  won: boolean,
  scorer: (durationMs: number) => number,
) {
  const started = useRef<number | undefined>(undefined)
  const [result, setResult] = useState<ArcadeScoreResult>()
  const scorerRef = useRef(scorer)
  scorerRef.current = scorer

  useEffect(() => {
    started.current = undefined
    setResult(undefined)
  }, [gameId, levelId, levelVersion])

  const start = useCallback(() => {
    if (started.current === undefined) started.current = Date.now()
  }, [])

  const reset = useCallback(() => {
    started.current = undefined
    setResult(undefined)
  }, [])

  useEffect(() => {
    if (!won || result) return
    const durationMs = Math.max(1, started.current ? Date.now() - started.current : 1000)
    const score = Math.max(1, Math.round(scorerRef.current(durationMs)))
    setResult({ durationMs, score })
    // 先落本地通关记录：游戏中心、学习地图和“接着玩”不用等下次登录同步才更新。
    const tasks = typingGames[gameId].levels.find((item) => item.id === levelId)?.tasks.length ?? 0
    useGameProgress.getState().complete(gameId, levelId, Math.max(1, tasks))
    const input = { gameId, levelId, levelVersion, durationMs, score }
    void submitGameScore(input).catch(() => queueGameScore(input))
  }, [gameId, levelId, levelVersion, result, won])

  return { start, reset, result }
}
