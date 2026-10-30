import { useEffect, useMemo, useRef, useState } from 'react'
import ArcadeFrame from '../components/ArcadeFrame'
import styles from '../components/ArcadeGames.module.css'
import { typingGames } from '../games/content'
import { useGameProgress } from '../games/progress'
import { useArcadeScore } from '../games/arcadeScore'
import { formatDuration } from '../games/leaderboard'
import {
  comparePainting,
  mirrorLevel,
  mirrorStart,
  paintingMatches,
  PIXEL_COLORS,
} from '../games/pixelArt'

export default function MirrorPaintingGameView({
  levelId,
  onLevel,
}: {
  levelId: string
  onLevel: (id: string) => void
}) {
  const level = useMemo(() => mirrorLevel(levelId), [levelId])
  const [painted, setPainted] = useState<string[][]>(() => mirrorStart(level.target))
  const [color, setColor] = useState(level.palette[0])
  const [feedback, setFeedback] = useState('')
  const [checks, setChecks] = useState(0)
  const recorded = useRef(false)
  const complete = useGameProgress((store) => store.complete)
  const levels = typingGames.mirror.levels
  const nextLevel = levels[levels.findIndex((item) => item.id === levelId) + 1]
  const levelInfo = levels.find((item) => item.id === levelId)
  const won = paintingMatches(painted, level.target)
  const { start, reset, result } = useArcadeScore(
    'mirror',
    levelId,
    levelInfo?.version ?? 1,
    won,
    (durationMs) => Math.max(100, 1000 - checks * 50 - Math.round(durationMs / 1000) * 2),
  )

  useEffect(() => {
    setPainted(mirrorStart(level.target))
    setColor(level.palette[0])
    setFeedback('')
    setChecks(0)
    recorded.current = false
  }, [level])

  useEffect(() => {
    if (!won || recorded.current) return
    recorded.current = true
    complete('mirror', levelId, 1)
  }, [complete, levelId, won])

  function paint(x: number, y: number) {
    if (x < level.size / 2 || won) return
    start()
    const next = painted.map((row) => [...row])
    next[y][x] = color
    setPainted(next)
    setFeedback('')
  }

  return (
    <ArcadeFrame gameId="mirror" levelId={levelId} onLevel={onLevel}>
      <section className={styles.stage}>
        <div className={styles.stageHead}>
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
          <div className={styles.actions}>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                setChecks((value) => value + 1)
                const result = comparePainting(painted, level.target)
                setFeedback(
                  result.wrong === 0
                    ? '完全对称，画得真好！'
                    : `还有 ${result.wrong} 格和左边不一样。`,
                )
              }}
            >
              检查画作
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                reset()
                setChecks(0)
                setPainted(mirrorStart(level.target))
                setFeedback('')
              }}
            >
              重画右半边
            </button>
          </div>
        </div>
        <div
          className={styles.grid}
          style={{ gridTemplateColumns: `repeat(${level.size}, minmax(0, 1fr))` }}
          role="grid"
          aria-label="镜像画布"
        >
          {painted.map((row, y) =>
            row.map((cell, x) => {
              const value = x < level.size / 2 ? level.target[y][x] : cell
              return (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  role="gridcell"
                  aria-label={`第 ${y + 1} 行第 ${x + 1} 列${x < level.size / 2 ? '，已画好' : ''}`}
                  className={styles.cell}
                  style={{ background: value ? PIXEL_COLORS[value] : undefined }}
                  disabled={x < level.size / 2 || won}
                  onClick={() => paint(x, y)}
                />
              )
            }),
          )}
        </div>
        <p className={styles.muted}>左半边是参考图，点右半边补上对称的颜色；点“橡皮”可以擦掉。</p>
        {feedback && (
          <p className={styles.muted} role="status">
            {feedback}
          </p>
        )}
        {won && (
          <div className={styles.banner} role="status">
            <strong>左右对称，画作完成！</strong>
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
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    reset()
                    setChecks(0)
                    setPainted(mirrorStart(level.target))
                  }}
                >
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
