import { useEffect, useRef, useState } from 'react'
import { Bomb, Flag } from 'lucide-react'
import ArcadeFrame from '../components/ArcadeFrame'
import styles from '../components/ArcadeGames.module.css'
import { typingGames } from '../games/content'
import { useGameProgress } from '../games/progress'
import { useArcadeScore } from '../games/arcadeScore'
import { formatDuration } from '../games/leaderboard'
import {
  createMinesweeper,
  minesweeperLevel,
  remainingMines,
  revealCell,
  toggleFlag,
  type MinesweeperState,
} from '../games/minesweeper'

const NUMBER_COLORS = [
  '',
  '#3d6b9e',
  '#3f8a5f',
  '#b4673d',
  '#8a4f9e',
  '#a33d3d',
  '#3d8a8a',
  '#5c5c5c',
]

export default function MinesweeperGameView({
  levelId,
  onLevel,
}: {
  levelId: string
  onLevel: (id: string) => void
}) {
  const level = minesweeperLevel(levelId)
  const [state, setState] = useState<MinesweeperState>(() => createMinesweeper(levelId))
  const [seconds, setSeconds] = useState(0)
  const recorded = useRef(false)
  const complete = useGameProgress((store) => store.complete)
  const levels = typingGames.minesweeper.levels
  const nextLevel = levels[levels.findIndex((item) => item.id === levelId) + 1]
  const levelInfo = levels.find((item) => item.id === levelId)
  const baseScore = level.width * 100 + level.mines * 10
  const { start, reset, result } = useArcadeScore(
    'minesweeper',
    levelId,
    levelInfo?.version ?? 1,
    state.status === 'won',
    (durationMs) => Math.max(100, baseScore - Math.round(durationMs / 1000) * 5),
  )

  useEffect(() => {
    setState(createMinesweeper(levelId))
    setSeconds(0)
    recorded.current = false
  }, [levelId])

  useEffect(() => {
    if (state.status !== 'playing') return
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [state.status])

  useEffect(() => {
    if (state.status !== 'won' || recorded.current) return
    recorded.current = true
    complete('minesweeper', levelId, 1)
  }, [complete, levelId, state.status])

  function restart() {
    setState(createMinesweeper(levelId))
    setSeconds(0)
    recorded.current = false
    reset()
  }

  function reveal(x: number, y: number) {
    start()
    setState((current) => revealCell(current, x, y))
  }

  return (
    <ArcadeFrame gameId="minesweeper" levelId={levelId} onLevel={onLevel}>
      <section className={styles.stage}>
        <div className={styles.stageHead}>
          <div className={styles.hud}>
            <span>
              <strong>{remainingMines(state)}</strong>
              剩余地雷
            </span>
            <span>
              <strong>{seconds}s</strong>
              用时
            </span>
            <span>
              <strong>
                {state.width}×{state.height}
              </strong>
              棋盘
            </span>
          </div>
          <button type="button" className="button secondary" onClick={restart}>
            重开本关
          </button>
        </div>
        <div
          className={styles.grid}
          style={{ gridTemplateColumns: `repeat(${state.width}, minmax(0, 1fr))` }}
          role="grid"
          aria-label="扫雷棋盘"
        >
          {state.board.map((row, y) =>
            row.map((cell, x) => {
              const label = cell.open
                ? cell.mine
                  ? '地雷'
                  : cell.adjacent || ''
                : cell.flag
                  ? '旗子'
                  : '未翻开'
              return (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  role="gridcell"
                  aria-label={`第 ${y + 1} 行第 ${x + 1} 列，${label}`}
                  className={
                    styles.cell +
                    (cell.open ? ' ' + styles.cellOpen : '') +
                    (cell.open && cell.mine ? ' ' + styles.cellMine : '') +
                    (!cell.open && cell.flag ? ' ' + styles.cellFlag : '')
                  }
                  style={{
                    color:
                      cell.open && !cell.mine && cell.adjacent
                        ? NUMBER_COLORS[cell.adjacent]
                        : undefined,
                    fontSize: level.width > 12 ? 11 : 14,
                  }}
                  disabled={state.status === 'won' || state.status === 'lost'}
                  onClick={() => reveal(x, y)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setState((current) => toggleFlag(current, x, y))
                  }}
                >
                  {cell.open && cell.mine ? (
                    <Bomb size={level.width > 12 ? 12 : 16} aria-hidden="true" />
                  ) : !cell.open && cell.flag ? (
                    <Flag size={level.width > 12 ? 12 : 16} aria-hidden="true" />
                  ) : cell.open ? (
                    cell.adjacent || ''
                  ) : (
                    ''
                  )}
                </button>
              )
            }),
          )}
        </div>
        <p className={styles.muted}>左键翻开 · 右键插旗 · 第一次点击一定安全</p>
        {state.status === 'won' && (
          <div className={styles.banner} role="status">
            <strong>地雷全部找到，通关啦！</strong>
            <span className={styles.muted}>
              得分 {result?.score ?? baseScore}
              {result ? ` · 用时 ${formatDuration(result.durationMs)}` : ` · 用时 ${seconds} 秒`}。
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
              <button type="button" className="button secondary" onClick={restart}>
                再玩本关
              </button>
            </div>
          </div>
        )}
        {state.status === 'lost' && (
          <div className={styles.banner + ' ' + styles.bannerLose} role="alert">
            <strong>踩到地雷了</strong>
            <span className={styles.muted}>看看数字和旗子，再试一次。</span>
            <div className={styles.actions}>
              <button type="button" className="button primary" onClick={restart}>
                重新开始
              </button>
            </div>
          </div>
        )}
      </section>
    </ArcadeFrame>
  )
}
