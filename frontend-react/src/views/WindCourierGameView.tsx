import { useEffect, useRef, useState } from 'react'
import ArcadeFrame from '../components/ArcadeFrame'
import styles from '../components/ArcadeGames.module.css'
import { typingGames } from '../games/content'
import { useGameProgress } from '../games/progress'
import { useArcadeScore } from '../games/arcadeScore'
import { formatDuration } from '../games/leaderboard'
import {
  clearWind,
  createWind,
  cycleArrow,
  runWind,
  windLevel,
  type WindState,
} from '../games/windCourier'

const ARROWS = ['→', '↓', '←', '↑']

export default function WindCourierGameView({
  levelId,
  onLevel,
}: {
  levelId: string
  onLevel: (id: string) => void
}) {
  const level = windLevel(levelId)
  const [state, setState] = useState<WindState>(() => createWind(levelId))
  const recorded = useRef(false)
  const complete = useGameProgress((store) => store.complete)
  const levels = typingGames.wind.levels
  const nextLevel = levels[levels.findIndex((item) => item.id === levelId) + 1]
  const levelInfo = levels.find((item) => item.id === levelId)
  const path = new Set(state.path.map((point) => `${point.x},${point.y}`))
  const { start, reset, result } = useArcadeScore(
    'wind',
    levelId,
    levelInfo?.version ?? 1,
    state.status === 'won',
    () => Math.max(100, (level.budget - state.placed) * 100 + 500),
  )

  useEffect(() => {
    setState(createWind(levelId))
    recorded.current = false
  }, [levelId])

  useEffect(() => {
    if (state.status !== 'won' || recorded.current) return
    recorded.current = true
    complete('wind', levelId, 1)
  }, [complete, levelId, state.status])

  function cellClass(x: number, y: number) {
    const wall = level.walls.some((item) => item.x === x && item.y === y)
    const letter = level.letters.some((item) => item.x === x && item.y === y)
    const start = level.start.x === x && level.start.y === y
    const goal = level.goal.x === x && level.goal.y === y
    const leaf = state.leaf.x === x && state.leaf.y === y
    const arrow = state.arrows[y][x]
    return (
      styles.cell +
      ' ' +
      (wall
        ? styles.windWall
        : leaf && state.status !== 'editing'
          ? styles.windLeaf
          : goal
            ? styles.windGoal
            : start
              ? styles.windStart
              : letter
                ? styles.windLetter
                : arrow !== null
                  ? styles.windArrow
                  : '') +
      (path.has(`${x},${y}`) ? ' ' + styles.windPath : '')
    )
  }

  function label(x: number, y: number) {
    const wall = level.walls.some((item) => item.x === x && item.y === y)
    const letter = level.letters.some((item) => item.x === x && item.y === y)
    const start = level.start.x === x && level.start.y === y
    const goal = level.goal.x === x && level.goal.y === y
    const leaf = state.leaf.x === x && state.leaf.y === y
    if (wall) return '礁'
    if (leaf && state.status !== 'editing') return '叶'
    if (goal) return '邮'
    if (start) return '起→'
    const arrow = state.arrows[y][x]
    if (arrow !== null) return letter ? ARROWS[arrow] + '信' : ARROWS[arrow]
    if (letter) return '信'
    return ''
  }

  return (
    <ArcadeFrame gameId="wind" levelId={levelId} onLevel={onLevel}>
      <section className={styles.stage}>
        <div className={styles.stageHead}>
          <div className={styles.hud}>
            <span>
              <strong>
                {state.placed} / {level.budget}
              </strong>
              已放风向
            </span>
            <span>
              <strong>
                {state.collected} / {level.letters.length}
              </strong>
              已收信件
            </span>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className="button primary"
              onClick={() => setState((current) => runWind(current, levelId))}
            >
              放叶子
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                reset()
                setState(clearWind(levelId))
              }}
            >
              清空风向
            </button>
          </div>
        </div>
        <div
          className={styles.grid}
          style={{ gridTemplateColumns: `repeat(${level.size}, minmax(0, 1fr))` }}
          role="grid"
          aria-label="风向邮差棋盘"
        >
          {Array.from({ length: level.size }, (_, y) =>
            Array.from({ length: level.size }, (_, x) => (
              <button
                key={`${x}-${y}`}
                type="button"
                role="gridcell"
                aria-label={`第 ${y + 1} 行第 ${x + 1} 列`}
                className={cellClass(x, y)}
                style={{ fontSize: level.size > 8 ? 12 : 14 }}
                onClick={() => {
                  start()
                  setState((current) => cycleArrow(current, levelId, x, y))
                }}
              >
                {label(x, y)}
              </button>
            )),
          )}
        </div>
        <div className={styles.legend}>
          <span>点空格子切换风向</span>
          <span>起点自带向右出发</span>
          <span>邮 = 邮筒 · 信 = 信件</span>
        </div>
        {state.status === 'won' && (
          <div className={styles.banner} role="status">
            <strong>信送到啦！</strong>
            <span className={styles.muted}>
              得分 {result?.score ?? (level.budget - state.placed) * 100 + 500}
              {result ? ` · 用时 ${formatDuration(result.durationMs)}` : ''}，用了 {state.placed}{' '}
              个风向。
            </span>
            <div className={styles.actions}>
              {nextLevel ? (
                <button
                  type="button"
                  className="button primary"
                  onClick={() => onLevel(nextLevel.id)}
                >
                  下一关
                </button>
              ) : (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => onLevel(levels[0].id)}
                >
                  从头再玩
                </button>
              )}
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  reset()
                  setState(createWind(levelId))
                }}
              >
                再玩本关
              </button>
            </div>
          </div>
        )}
        {state.status === 'lost' && (
          <div className={styles.banner + ' ' + styles.bannerLose} role="alert">
            <strong>这次没送到</strong>
            <span className={styles.muted}>{state.message}</span>
            <div className={styles.actions}>
              <button
                type="button"
                className="button primary"
                onClick={() => setState({ ...state, status: 'editing', message: '' })}
              >
                继续调整
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  reset()
                  setState(createWind(levelId))
                }}
              >
                全部重来
              </button>
            </div>
          </div>
        )}
      </section>
    </ArcadeFrame>
  )
}
