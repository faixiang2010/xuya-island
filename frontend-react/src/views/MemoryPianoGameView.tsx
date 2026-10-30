import { useCallback, useEffect, useRef, useState } from 'react'
import ArcadeFrame from '../components/ArcadeFrame'
import styles from '../components/ArcadeGames.module.css'
import { typingGames } from '../games/content'
import { useGameProgress } from '../games/progress'
import { useArcadeScore } from '../games/arcadeScore'
import { formatDuration } from '../games/leaderboard'
import { appendPiano, createPiano, PIANO_KEYS, type PianoState } from '../games/memoryPiano'
import { useLearningPreferences } from '../learning/preferences'
import { GAME_NOTE_FREQUENCIES, playLearningTone, prepareLearningAudio } from '../learning/audio'

const KEY_HINTS = ['A', 'S', 'D', 'F', 'G', 'H', 'J']

export default function MemoryPianoGameView({
  levelId,
  onLevel,
}: {
  levelId: string
  onLevel: (id: string) => void
}) {
  const [state, setState] = useState<PianoState>(() => createPiano(levelId))
  const [lit, setLit] = useState<number>()
  const [wrongKey, setWrongKey] = useState<number>()
  const [playing, setPlaying] = useState(false)
  const recorded = useRef(false)
  const timers = useRef<number[]>([])
  const playingRef = useRef(false)
  const complete = useGameProgress((store) => store.complete)
  const sound = useLearningPreferences((store) => store.sound)
  const levels = typingGames.piano.levels
  const nextLevel = levels[levels.findIndex((item) => item.id === levelId) + 1]
  const levelInfo = levels.find((item) => item.id === levelId)
  const { start, reset, result } = useArcadeScore(
    'piano',
    levelId,
    levelInfo?.version ?? 1,
    state.status === 'won',
    (durationMs) => Math.max(100, 1000 - state.mistakes * 50 - Math.round(durationMs / 1000) * 2),
  )

  function clearTimers() {
    for (const timer of timers.current) window.clearTimeout(timer)
    timers.current = []
  }

  const playSequence = useCallback(
    async (sequence: number[]) => {
      if (playingRef.current) return
      start()
      if (sound) await prepareLearningAudio(true)
      clearTimers()
      playingRef.current = true
      setPlaying(true)
      sequence.forEach((note, index) => {
        const timer = window.setTimeout(() => {
          setLit(note)
          if (sound) playLearningTone(true, GAME_NOTE_FREQUENCIES[note])
        }, index * 460)
        timers.current.push(timer)
      })
      const done = window.setTimeout(
        () => {
          setLit(undefined)
          playingRef.current = false
          setPlaying(false)
        },
        sequence.length * 460 + 80,
      )
      timers.current.push(done)
    },
    [sound, start],
  )

  useEffect(() => {
    setState(createPiano(levelId))
    setLit(undefined)
    setWrongKey(undefined)
    setPlaying(false)
    recorded.current = false
    clearTimers()
  }, [levelId])

  useEffect(() => {
    if (state.status !== 'won' || recorded.current) return
    recorded.current = true
    complete('piano', levelId, 1)
  }, [complete, levelId, state.status])

  useEffect(() => {
    if (state.attempt === 0) return
    const timer = window.setTimeout(() => void playSequence(state.sequence), 360)
    timers.current.push(timer)
  }, [playSequence, state.attempt, state.sequence])

  useEffect(() => () => clearTimers(), [])

  function press(note: number) {
    if (playing || state.status === 'won') return
    start()
    const expected = state.sequence[state.input.length]
    if (note !== expected) {
      setWrongKey(note)
      window.setTimeout(() => setWrongKey(undefined), 320)
    }
    void prepareLearningAudio(sound).then((ready) => {
      if (ready) playLearningTone(true, GAME_NOTE_FREQUENCIES[note])
    })
    setState((current) => appendPiano(current, note))
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat) return
      const index = KEY_HINTS.indexOf(event.key.toUpperCase())
      if (index >= 0) {
        event.preventDefault()
        press(index)
      }
      if (event.key === ' ') {
        event.preventDefault()
        void playSequence(state.sequence)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <ArcadeFrame gameId="piano" levelId={levelId} onLevel={onLevel}>
      <section className={styles.stage}>
        <div className={styles.stageHead}>
          <div className={styles.hud}>
            <span>
              <strong>{state.sequence.length}</strong>
              本轮音符
            </span>
            <span>
              <strong>{state.targetLength}</strong>
              通关长度
            </span>
            <span>
              <strong>{state.mistakes}</strong>
              重听次数
            </span>
          </div>
          <button
            type="button"
            className="button primary"
            disabled={playing}
            onClick={() => void playSequence(state.sequence)}
          >
            {playing ? '正在播放…' : '听一遍'}
          </button>
        </div>
        <p className={styles.muted}>
          正在弹第 {Math.min(state.input.length + 1, state.sequence.length)} 个音，共{' '}
          {state.sequence.length} 个。按顺序点琴键，或按键盘 A S D F G H J。
        </p>
        <div className={styles.pianoKeys} role="group" aria-label="钢琴琴键">
          {PIANO_KEYS.map((name, note) => (
            <button
              key={name}
              type="button"
              aria-label={`琴键 ${name}`}
              className={
                styles.pianoKey +
                (lit === note ? ' ' + styles.pianoKeyLit : '') +
                (wrongKey === note ? ' ' + styles.pianoKeyWrong : '')
              }
              disabled={playing || state.status === 'won'}
              onClick={() => press(note)}
            >
              <span>{name}</span>
              <small>{KEY_HINTS[note]}</small>
            </button>
          ))}
        </div>
        {state.status === 'won' && (
          <div className={styles.banner} role="status">
            <strong>完整旋律弹对啦！</strong>
            <span className={styles.muted}>
              得分 {result?.score ?? Math.max(100, 1000 - state.mistakes * 50)}
              {result ? ` · 用时 ${formatDuration(result.durationMs)}` : ''}，重听了{' '}
              {state.mistakes} 次。
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
                  setState(createPiano(levelId))
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
