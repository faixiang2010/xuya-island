import { useEffect, useRef, useState } from 'react'
import ArcadeFrame from '../components/ArcadeFrame'
import styles from '../components/ArcadeGames.module.css'
import { typingGames } from '../games/content'
import { useGameProgress } from '../games/progress'
import { useArcadeScore } from '../games/arcadeScore'
import { formatDuration } from '../games/leaderboard'
import { createEcho, moveEcho, ping, type EchoState } from '../games/echoMaze'

export default function EchoMazeGameView({
  levelId,
  onLevel,
}: {
  levelId: string
  onLevel: (id: string) => void
}) {
  const [state, setState] = useState<EchoState>(() => createEcho(levelId))
  const recorded = useRef(false)
  const complete = useGameProgress((store) => store.complete)
  const levels = typingGames.echo.levels
  const nextLevel = levels[levels.findIndex((item) => item.id === levelId) + 1]
  const levelInfo = levels.find((item) => item.id === levelId)
  const { start, reset, result } = useArcadeScore(
    'echo',
    levelId,
    levelInfo?.version ?? 1,
    state.status === 'won',
    () => state.pings * 100 + 200,
  )

  useEffect(() => {
    setState(createEcho(levelId))
    recorded.current = false
  }, [levelId])

  useEffect(() => {
    if (state.status !== 'won' || recorded.current) return
    recorded.current = true
    complete('echo', levelId, 1)
  }, [complete, levelId, state.status])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (state.status !== 'playing') return
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) {
        event.preventDefault()
        start()
      }
      if (event.key === 'ArrowLeft') setState((current) => moveEcho(current, -1, 0))
      else if (event.key === 'ArrowRight') setState((current) => moveEcho(current, 1, 0))
      else if (event.key === 'ArrowUp') setState((current) => moveEcho(current, 0, -1))
      else if (event.key === 'ArrowDown') setState((current) => moveEcho(current, 0, 1))
      else if (event.key === ' ') setState((current) => ping(current))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [start, state.status])

  function restart() {
    setState(createEcho(levelId))
    recorded.current = false
    reset()
  }

  return (
    <ArcadeFrame gameId="echo" levelId={levelId} onLevel={onLevel}>
      <section className={styles.stage}>
        <div className={styles.stageHead}>
          <div className={styles.hud}>
            <span>
              <strong>{state.pings}</strong>
              声波剩余
            </span>
            <span>
              <strong>
                {state.maze.length}×{state.maze.length}
              </strong>
              迷宫
            </span>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className="button primary"
              disabled={state.pings <= 0 || state.status !== 'playing'}
              onClick={() => {
                start()
                setState((current) => ping(current))
              }}
            >
              发声波
            </button>
            <button type="button" className="button secondary" onClick={restart}>
              重开本关
            </button>
          </div>
        </div>
        <div
          className={styles.grid}
          style={{ gridTemplateColumns: `repeat(${state.maze.length}, minmax(0, 1fr))` }}
          role="grid"
          aria-label="回声迷宫"
        >
          {state.maze.map((row, y) =>
            row.map((wall, x) => {
              const seen = state.revealed[y][x]
              const player = state.player.x === x && state.player.y === y
              const exit = state.exit.x === x && state.exit.y === y
              const className =
                styles.cell +
                ' ' +
                (player
                  ? styles.echoPlayer
                  : exit
                    ? styles.echoExit
                    : !seen
                      ? styles.echoUnknown
                      : wall
                        ? styles.echoWall
                        : styles.echoOpen)
              return (
                <div
                  key={`${x}-${y}`}
                  role="gridcell"
                  aria-label={`第 ${y + 1} 行第 ${x + 1} 列${player ? '，你在这里' : exit ? '，出口' : ''}`}
                  className={className}
                  style={{ fontSize: state.maze.length > 11 ? 9 : 11 }}
                >
                  {exit && !player ? '出口' : ''}
                </div>
              )
            }),
          )}
        </div>
        <div className={styles.legend}>
          <span>方向键移动</span>
          <span>空格发声波</span>
          <span>声波会照亮附近两格</span>
        </div>
        {state.status === 'won' && (
          <div className={styles.banner} role="status">
            <strong>找到出口啦！</strong>
            <span className={styles.muted}>
              得分 {result?.score ?? state.pings * 100 + 200}
              {result ? ` · 用时 ${formatDuration(result.durationMs)}` : ''}，还剩 {state.pings}{' '}
              次声波。
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
      </section>
    </ArcadeFrame>
  )
}
