import { useEffect, useMemo, useRef, useState } from 'react'
import ArcadeFrame from '../components/ArcadeFrame'
import styles from '../components/ArcadeGames.module.css'
import { typingGames } from '../games/content'
import { useGameProgress } from '../games/progress'
import { useArcadeScore } from '../games/arcadeScore'
import { formatDuration } from '../games/leaderboard'
import {
  comparePainting,
  emptyPainting,
  memoryLevel,
  paintingMatches,
  PIXEL_COLORS,
} from '../games/pixelArt'

export default function MemoryGalleryGameView({
  levelId,
  onLevel,
}: {
  levelId: string
  onLevel: (id: string) => void
}) {
  const level = useMemo(() => memoryLevel(levelId), [levelId])
  const [painted, setPainted] = useState<string[][]>(() => emptyPainting(level.size))
  const [color, setColor] = useState(level.palette[0])
  const [phase, setPhase] = useState<'ready' | 'showing' | 'painting'>('ready')
  const [remaining, setRemaining] = useState(level.revealSeconds)
  const [feedback, setFeedback] = useState('')
  const [checks, setChecks] = useState(0)
  const recorded = useRef(false)
  const complete = useGameProgress((store) => store.complete)
  const levels = typingGames.memory.levels
  const nextLevel = levels[levels.findIndex((item) => item.id === levelId) + 1]
  const levelInfo = levels.find((item) => item.id === levelId)
  const won = phase === 'painting' && paintingMatches(painted, level.target)
  const { start, reset, result } = useArcadeScore(
    'memory',
    levelId,
    levelInfo?.version ?? 1,
    won,
    (durationMs) => Math.max(100, 1000 - checks * 50 - Math.round(durationMs / 1000) * 2),
  )

  useEffect(() => {
    setPainted(emptyPainting(level.size))
    setColor(level.palette[0])
    setPhase('ready')
    setRemaining(level.revealSeconds)
    setFeedback('')
    setChecks(0)
    recorded.current = false
  }, [level])

  useEffect(() => {
    if (phase !== 'showing') return
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000)
    const done = window.setTimeout(() => setPhase('painting'), level.revealSeconds * 1000)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(done)
    }
  }, [level.revealSeconds, phase])

  useEffect(() => {
    if (!won || recorded.current) return
    recorded.current = true
    complete('memory', levelId, 1)
  }, [complete, levelId, won])

  function startLooking() {
    reset()
    setChecks(0)
    setPainted(emptyPainting(level.size))
    setFeedback('')
    setRemaining(level.revealSeconds)
    setPhase('showing')
    start()
  }

  function paint(x: number, y: number) {
    if (phase !== 'painting' || won) return
    const next = painted.map((row) => [...row])
    next[y][x] = color
    setPainted(next)
    setFeedback('')
  }

  const visible = phase === 'showing' ? level.target : painted

  return (
    <ArcadeFrame gameId="memory" levelId={levelId} onLevel={onLevel}>
      <section className={styles.stage}>
        <div className={styles.stageHead}>
          {phase === 'painting' ? (
            <div className={styles.palette} role="group" aria-label="选择颜色">
              {level.palette.map((letter) => (
                <button
                  key={letter}
                  type="button"
                  aria-label={`颜色 ${letter}`}
                  aria-pressed={color === letter}
                  className={styles.swatch + (color === letter ? ' ' + styles.swatchActive : '')}
                  style={{ background: PIXEL_COLORS[letter] }}
                  onClick={() => setColor(letter)}
                />
              ))}
              <button
                type="button"
                className={'button secondary' + (color === '' ? ' primary' : '')}
                onClick={() => setColor('')}
              >
                橡皮
              </button>
            </div>
          ) : (
            <p className={styles.muted}>
              {phase === 'ready'
                ? '准备好就看几秒小岛的画。'
                : `还剩 ${remaining} 秒，记住颜色和位置。`}
            </p>
          )}
          <div className={styles.actions}>
            {phase === 'ready' && (
              <button type="button" className="button primary" onClick={startLooking}>
                看画
              </button>
            )}
            {phase === 'painting' && (
              <>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    setChecks((value) => value + 1)
                    const result = comparePainting(painted, level.target)
                    setFeedback(
                      result.wrong === 0
                        ? '完全正确，记忆真好！'
                        : `还有 ${result.wrong} 格和原画不一样。`,
                    )
                  }}
                >
                  检查
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    reset()
                    setChecks(0)
                    setPainted(emptyPainting(level.size))
                  }}
                >
                  画布清空
                </button>
                <button type="button" className="button secondary" onClick={startLooking}>
                  再看一次
                </button>
              </>
            )}
          </div>
        </div>
        <div
          className={styles.grid}
          style={{ gridTemplateColumns: `repeat(${level.size}, minmax(0, 1fr))` }}
          role="grid"
          aria-label={phase === 'showing' ? '要记住的画' : '记忆画布'}
        >
          {visible.map((row, y) =>
            row.map((cell, x) => (
              <button
                key={`${x}-${y}`}
                type="button"
                role="gridcell"
                aria-label={`第 ${y + 1} 行第 ${x + 1} 列`}
                className={styles.cell}
                style={{ background: cell ? PIXEL_COLORS[cell] : undefined }}
                disabled={phase !== 'painting' || won}
                onClick={() => paint(x, y)}
              />
            )),
          )}
        </div>
        <p className={styles.muted}>
          {phase === 'showing'
            ? '画马上就藏起来，先记住大色块。'
            : phase === 'painting'
              ? '用调色板重画刚才看到的画，然后点“检查”。'
              : `共 ${level.palette.length} 种颜色，点击“看画”开始。`}
        </p>
        {feedback && (
          <p className={styles.muted} role="status">
            {feedback}
          </p>
        )}
        {won && (
          <div className={styles.banner} role="status">
            <strong>记忆还原成功！</strong>
            <span className={styles.muted}>
              得分 {result?.score ?? Math.max(100, 1000 - checks * 50)}
              {result ? ` · 用时 ${formatDuration(result.durationMs)}` : ''}。
            </span>
            {nextLevel ? (
              <div className={styles.actions}>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => onLevel(nextLevel.id)}
                >
                  下一关
                </button>
                <button type="button" className="button secondary" onClick={startLooking}>
                  再画一次
                </button>
              </div>
            ) : (
              <div className={styles.actions}>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => onLevel(levels[0].id)}
                >
                  从头再玩
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </ArcadeFrame>
  )
}
