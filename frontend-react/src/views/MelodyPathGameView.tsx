import { useEffect, useRef, useState } from 'react'
import ArcadeFrame from '../components/ArcadeFrame'
import styles from '../components/ArcadeGames.module.css'
import { typingGames } from '../games/content'
import { useGameProgress } from '../games/progress'
import { useArcadeScore } from '../games/arcadeScore'
import { formatDuration } from '../games/leaderboard'
import {
  createMelody,
  matchedNotes,
  melodyLevel,
  moveMelody,
  undoMelody,
  type MelodyState,
} from '../games/melodyPath'
import { useLearningPreferences } from '../learning/preferences'
import { GAME_NOTE_FREQUENCIES, playLearningTone, prepareLearningAudio } from '../learning/audio'

const NOTE_NAMES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si', '高do']

export default function MelodyPathGameView({
  levelId,
  onLevel,
}: {
  levelId: string
  onLevel: (id: string) => void
}) {
  const level = melodyLevel(levelId)
  const [state, setState] = useState<MelodyState>(() => createMelody(levelId))
  const recorded = useRef(false)
  const lastNotes = useRef(1)
  const complete = useGameProgress((store) => store.complete)
  const sound = useLearningPreferences((store) => store.sound)
  const levels = typingGames.melody.levels
  const nextLevel = levels[levels.findIndex((item) => item.id === levelId) + 1]
  const levelInfo = levels.find((item) => item.id === levelId)
  const matched = matchedNotes(state)
  const { start, reset, result } = useArcadeScore(
    'melody',
    levelId,
    levelInfo?.version ?? 1,
    state.status === 'won',
    (durationMs) => Math.max(100, 1000 - Math.round(durationMs / 1000) * 5),
  )

  useEffect(() => {
    setState(createMelody(levelId))
    recorded.current = false
    lastNotes.current = 1
  }, [levelId])

  useEffect(() => {
    if (state.status !== 'won' || recorded.current) return
    recorded.current = true
    complete('melody', levelId, 1)
  }, [complete, levelId, state.status])

  useEffect(() => {
    const count = state.notes.length
    if (count > lastNotes.current && sound) {
      const note = state.notes[count - 1]
      void prepareLearningAudio(true).then((ready) => {
        if (ready) playLearningTone(true, GAME_NOTE_FREQUENCIES[note])
      })
    }
    lastNotes.current = count
  }, [sound, state.notes])

  function playTarget() {
    if (!sound) return
    void prepareLearningAudio(true).then((ready) => {
      if (!ready) return
      state.melody.forEach((note, index) =>
        playLearningTone(true, GAME_NOTE_FREQUENCIES[note], index * 0.42),
      )
    })
  }

  function move(x: number, y: number) {
    start()
    setState((current) => moveMelody(current, x, y))
  }

  return (
    <ArcadeFrame gameId="melody" levelId={levelId} onLevel={onLevel}>
      <section className={styles.stage}>
        <div className={styles.stageHead}>
          <div className={styles.hud}>
            <span>
              <strong>{state.melody.map((note) => NOTE_NAMES[note]).join(' · ')}</strong>
              目标旋律
            </span>
            <span>
              <strong>
                {state.notes.length} / {state.melody.length}
              </strong>
              已走步数
            </span>
            <span>
              <strong>{matched}</strong>
              正确音符
            </span>
          </div>
          <div className={styles.actions}>
            <button type="button" className="button secondary" onClick={playTarget}>
              听目标旋律
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={state.path.length <= 1 || state.status === 'won'}
              onClick={() => setState((current) => undoMelody(current))}
            >
              撤销一步
            </button>
          </div>
        </div>
        <div
          className={styles.grid}
          style={{ gridTemplateColumns: `repeat(${level.size}, minmax(0, 1fr))` }}
          role="grid"
          aria-label="音符小径棋盘"
        >
          {state.board.map((row, y) =>
            row.map((note, x) => {
              const player = state.player.x === x && state.player.y === y
              const visited = state.visited[y][x]
              const className =
                styles.cell + ' ' + (player ? styles.echoPlayer : visited ? styles.cellSeen : '')
              return (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  role="gridcell"
                  aria-label={`第 ${y + 1} 行第 ${x + 1} 列，音符 ${NOTE_NAMES[note]}${player ? '，当前位置' : ''}`}
                  className={className}
                  style={{
                    color: player ? 'var(--on-brand)' : undefined,
                    fontSize: level.size > 5 ? 11 : 13,
                  }}
                  disabled={state.status === 'won' || player}
                  onClick={() => move(x, y)}
                >
                  {NOTE_NAMES[note]}
                </button>
              )
            }),
          )}
        </div>
        <div className={styles.legend}>
          <span>从当前位置点相邻格子</span>
          <span>同一个格子不能走第二次</span>
          <span>点“听目标旋律”可以找线索</span>
        </div>
        {state.notes.length > 1 && matched < state.notes.length && state.status !== 'won' && (
          <div className={styles.banner} role="status">
            <strong>这一步和旋律不一样</strong>
            <span className={styles.muted}>可以撤销一步，换一个方向再试。</span>
          </div>
        )}
        {state.status === 'won' && (
          <div className={styles.banner} role="status">
            <strong>旋律连起来啦！</strong>
            <span className={styles.muted}>
              得分 {result?.score ?? 1000}
              {result ? ` · 用时 ${formatDuration(result.durationMs)}` : ''}，你走了一条{' '}
              {state.notes.length} 个音的小路。
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
                  setState(createMelody(levelId))
                }}
              >
                再玩本关
              </button>
            </div>
          </div>
        )}
      </section>
    </ArcadeFrame>
  )
}
