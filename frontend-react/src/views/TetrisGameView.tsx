import { useEffect, useRef, useState } from 'react'
import ArcadeFrame from '../components/ArcadeFrame'
import styles from '../components/ArcadeGames.module.css'
import { typingGames } from '../games/content'
import { useGameProgress } from '../games/progress'
import { useArcadeScore } from '../games/arcadeScore'
import { formatDuration } from '../games/leaderboard'
import {
  createTetris,
  hardDrop,
  movePiece,
  rotatePiece,
  tetrisLevel,
  tick,
  TETRIS_COLORS,
  TETRIS_HEIGHT,
  TETRIS_WIDTH,
  type TetrisState,
} from '../games/tetris'

const CELL = 24

export default function TetrisGameView({
  levelId,
  onLevel,
}: {
  levelId: string
  onLevel: (id: string) => void
}) {
  const config = tetrisLevel(levelId)
  const level = typingGames.tetris.levels.find((item) => item.id === levelId)
  const [state, setState] = useState<TetrisState>(() => createTetris(config.targetLines))
  const [paused, setPaused] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const recorded = useRef(false)
  const complete = useGameProgress((store) => store.complete)
  const levels = typingGames.tetris.levels
  const nextLevel = levels[levels.findIndex((item) => item.id === levelId) + 1]
  const { start, reset, result } = useArcadeScore(
    'tetris',
    levelId,
    level?.version ?? 1,
    state.status === 'won',
    () => state.score,
  )

  useEffect(() => {
    setState(createTetris(config.targetLines))
    setPaused(false)
    recorded.current = false
  }, [levelId, config.targetLines])

  useEffect(() => {
    if (state.status !== 'won' || recorded.current) return
    recorded.current = true
    complete('tetris', levelId, 1)
  }, [complete, levelId, state.status])

  useEffect(() => {
    if (paused || state.status !== 'playing') return
    const timer = window.setInterval(() => setState((current) => tick(current)), config.dropMs)
    return () => window.clearInterval(timer)
  }, [config.dropMs, paused, state.status])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'p' || event.key === 'P') {
        setPaused((value) => !value)
        return
      }
      if (paused || state.status !== 'playing') return
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(event.key)) {
        event.preventDefault()
        start()
      }
      if (event.key === 'ArrowLeft') setState((current) => movePiece(current, -1, 0))
      else if (event.key === 'ArrowRight') setState((current) => movePiece(current, 1, 0))
      else if (event.key === 'ArrowDown') setState((current) => movePiece(current, 0, 1))
      else if (event.key === 'ArrowUp') setState((current) => rotatePiece(current))
      else if (event.key === ' ') setState((current) => hardDrop(current))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paused, start, state.status])

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return
    context.fillStyle = '#1f2430'
    context.fillRect(0, 0, element.width, element.height)
    for (let y = 0; y < TETRIS_HEIGHT; y += 1)
      for (let x = 0; x < TETRIS_WIDTH; x += 1) {
        const value = state.board[y][x]
        context.fillStyle = value ? TETRIS_COLORS[value - 1] : '#2a3040'
        context.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2)
      }
    for (let row = 0; row < state.piece.shape.length; row += 1)
      for (let column = 0; column < state.piece.shape[row].length; column += 1) {
        if (!state.piece.shape[row][column]) continue
        const y = state.piece.y + row
        if (y < 0) continue
        context.fillStyle = TETRIS_COLORS[state.piece.type]
        context.fillRect((state.piece.x + column) * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2)
      }
  }, [state])

  function restart() {
    setState(createTetris(config.targetLines))
    setPaused(false)
    recorded.current = false
    reset()
  }

  return (
    <ArcadeFrame gameId="tetris" levelId={levelId} onLevel={onLevel}>
      <section className={styles.stage}>
        <div className={styles.stageHead}>
          <div className={styles.hud}>
            <span>
              <strong>
                {state.lines} / {state.targetLines}
              </strong>
              已消行
            </span>
            <span>
              <strong>{state.score}</strong>
              得分
            </span>
            <span>
              <strong style={{ color: TETRIS_COLORS[state.next] }}>●</strong>
              下一块
            </span>
          </div>
          <div className={styles.actions}>
            <button type="button" className="button secondary" onClick={() => setPaused(!paused)}>
              {paused ? '继续' : '暂停'}
            </button>
            <button type="button" className="button secondary" onClick={restart}>
              重开本关
            </button>
          </div>
        </div>
        <canvas
          ref={canvas}
          className={styles.canvas}
          width={TETRIS_WIDTH * CELL}
          height={TETRIS_HEIGHT * CELL}
          aria-label="俄罗斯方块棋盘"
        />
        <p className={styles.muted}>← → 移动 · ↑ 旋转 · ↓ 加速 · 空格直接落下 · P 暂停</p>
        {state.status === 'won' && (
          <div className={styles.banner} role="status">
            <strong>消掉 {state.targetLines} 行，通关啦！</strong>
            <span className={styles.muted}>
              得分 {result?.score ?? state.score}
              {result ? ` · 用时 ${formatDuration(result.durationMs)}` : ''}，可以继续挑战下一关。
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
        {state.status === 'over' && (
          <div className={styles.banner + ' ' + styles.bannerLose} role="alert">
            <strong>方块堆到顶端了</strong>
            <span className={styles.muted}>试着给下一块留出平整的位置，再来一次。</span>
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
