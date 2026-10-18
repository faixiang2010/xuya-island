import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, Pause, Play, RotateCcw, Shield, Zap } from 'lucide-react'
import { fallingDifficulty } from '../games/fallingWords'
import { typingGames } from '../games/content'
import { useGameProgress } from '../games/progress'
import { useLearningPreferences } from '../learning/preferences'
import { playLearningNote } from '../learning/audio'
import { celebrate } from '../motivation/celebrate'
import FingerKeyboard from '../components/FingerKeyboard'
import LearningAtmosphere from '../components/LearningAtmosphere'
import styles from './FallingGameView.module.css'

interface FallingWord {
  id: number
  word: string
  x: number
  y: number
}

interface FallingStats {
  kills: number
  mistakes: number
  keystrokes: number
  correct: number
  combo: number
  maxCombo: number
}

const emptyStats: FallingStats = {
  kills: 0,
  mistakes: 0,
  keystrokes: 0,
  correct: 0,
  combo: 0,
  maxCombo: 0,
}

export default function FallingGameView({
  levelId,
  onLevel,
}: {
  levelId: string
  onLevel: (id: string) => void
}) {
  const game = typingGames.falling
  const difficulty = fallingDifficulty(levelId)
  const complete = useGameProgress((state) => state.complete)
  const sound = useLearningPreferences((state) => state.sound)
  const [status, setStatus] = useState<'ready' | 'playing' | 'paused' | 'finished'>('ready')
  const [words, setWords] = useState<FallingWord[]>([])
  const [typed, setTyped] = useState('')
  const [activeId, setActiveId] = useState<number | undefined>(undefined)
  const [lives, setLives] = useState(3)
  const [stats, setStats] = useState<FallingStats>(emptyStats)
  const [remaining, setRemaining] = useState(difficulty.durationSeconds)
  const [speed, setSpeed] = useState(1)
  const [result, setResult] = useState('')

  const wordsRef = useRef<FallingWord[]>([])
  const typedRef = useRef('')
  const activeRef = useRef<number | undefined>(undefined)
  const statusRef = useRef(status)
  const livesRef = useRef(3)
  const statsRef = useRef<FallingStats>({ ...emptyStats })
  const speedRef = useRef(1)
  const counter = useRef(0)
  const spawnAccumulator = useRef(0)
  const elapsed = useRef(0)
  const finished = useRef(false)

  statusRef.current = status

  function updateWords(next: FallingWord[]) {
    wordsRef.current = next
    setWords(next)
  }
  function updateTyped(next: string) {
    typedRef.current = next
    setTyped(next)
  }
  function updateActive(next: number | undefined) {
    activeRef.current = next
    setActiveId(next)
  }
  function updateStats(next: FallingStats) {
    statsRef.current = next
    setStats(next)
  }

  const finish = useCallback(
    (reason: string) => {
      if (finished.current) return
      finished.current = true
      setStatus('finished')
      setResult(reason)
      complete('falling', difficulty.id, 1)
      celebrate({
        kind: 'level',
        title: '这一局结束啦！',
        detail: `${difficulty.title} · 击落 ${statsRef.current.kills} 个词。`,
        id: `falling-${difficulty.id}`,
      })
    },
    [complete, difficulty.id, difficulty.title],
  )

  function spawn() {
    counter.current += 1
    const word = difficulty.words[Math.floor(Math.random() * difficulty.words.length)]
    const wide = word.length > 12
    const next = [
      ...wordsRef.current,
      {
        id: counter.current,
        word,
        x: (wide ? 30 : 22) + Math.random() * (wide ? 40 : 56),
        y: -8,
      },
    ]
    updateWords(next)
  }

  function miss(count: number) {
    if (!count) return
    const nextLives = Math.max(0, livesRef.current - count)
    livesRef.current = nextLives
    setLives(nextLives)
    updateTyped('')
    updateActive(undefined)
    if (nextLives === 0) finish('护盾用完了，休息一下再来。')
  }

  function kill(word: string) {
    const current = statsRef.current
    const next: FallingStats = {
      ...current,
      kills: current.kills + 1,
      combo: current.combo + 1,
      maxCombo: Math.max(current.maxCombo, current.combo + 1),
    }
    updateStats(next)
    const accuracy = next.keystrokes ? next.correct / next.keystrokes : 1
    if (next.kills % 3 === 0 && accuracy > 0.95)
      speedRef.current = Math.min(1.4, speedRef.current + 0.04)
    else if (accuracy < 0.85) speedRef.current = Math.max(0.8, speedRef.current - 0.04)
    setSpeed(speedRef.current)
    updateTyped('')
    updateActive(undefined)
    playLearningNote(sound, next.kills, false)
    if (next.kills >= difficulty.target) finish('目标完成，击落了所有目标词！')
  }

  useEffect(() => {
    if (status !== 'playing') return
    let frame = 0
    let last = performance.now()
    const fallPerSecond = 100 / difficulty.fallSeconds
    const tick = (now: number) => {
      if (statusRef.current !== 'playing') return
      const delta = Math.min(0.05, (now - last) / 1000)
      last = now
      elapsed.current += delta
      setRemaining(Math.max(0, Math.ceil(difficulty.durationSeconds - elapsed.current)))
      spawnAccumulator.current += delta * 1000 * speedRef.current
      if (spawnAccumulator.current >= difficulty.spawnMs) {
        spawnAccumulator.current = 0
        spawn()
      }
      const moved = wordsRef.current.map((item) => ({
        ...item,
        y: item.y + fallPerSecond * speedRef.current * delta,
      }))
      const missed = moved.filter((item) => item.y > 104)
      if (missed.length) {
        updateWords(moved.filter((item) => item.y <= 104))
        miss(missed.length)
      } else updateWords(moved)
      if (elapsed.current >= difficulty.durationSeconds) finish('时间到，看看这一局的成绩。')
      else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [status, difficulty, finish])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') {
        if (statusRef.current === 'playing') setStatus('paused')
        else if (statusRef.current === 'paused') setStatus('playing')
        return
      }
      if (statusRef.current !== 'playing') return
      if (event.key === 'Backspace') {
        event.preventDefault()
        const next = typedRef.current.slice(0, -1)
        updateTyped(next)
        const active = wordsRef.current.find((item) => item.id === activeRef.current)
        if (!next) updateActive(undefined)
        else if (!active?.word.toLowerCase().startsWith(next)) updateActive(undefined)
        return
      }
      if (!/^[a-z. -]$/i.test(event.key)) return
      event.preventDefault()
      const key = event.key.toLowerCase()
      const current = statsRef.current
      const typedNow = typedRef.current
      const candidate = typedNow + key
      const active = wordsRef.current.find((item) => item.id === activeRef.current)
      const canContinue = active?.word.toLowerCase().startsWith(candidate)
      let target = canContinue ? active : undefined
      if (!target) {
        const matches = wordsRef.current
          .filter((item) => item.word.toLowerCase().startsWith(candidate))
          .sort((a, b) => b.y - a.y)
        target = matches[0]
      }
      if (!target) {
        updateStats({
          ...current,
          keystrokes: current.keystrokes + 1,
          mistakes: current.mistakes + 1,
          combo: 0,
        })
        updateTyped('')
        updateActive(undefined)
        return
      }
      updateStats({
        ...current,
        keystrokes: current.keystrokes + 1,
        correct: current.correct + 1,
      })
      updateActive(target.id)
      updateTyped(candidate)
      if (target.word.toLowerCase() === candidate) {
        updateWords(wordsRef.current.filter((item) => item.id !== target.id))
        kill(target.word)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sound])

  function start() {
    finished.current = false
    wordsRef.current = []
    typedRef.current = ''
    activeRef.current = undefined
    statsRef.current = { ...emptyStats }
    speedRef.current = 1
    counter.current = 0
    spawnAccumulator.current = 0
    elapsed.current = 0
    livesRef.current = 3
    setWords([])
    setTyped('')
    setActiveId(undefined)
    setStats({ ...emptyStats })
    setLives(3)
    setSpeed(1)
    setRemaining(difficulty.durationSeconds)
    setResult('')
    setStatus('playing')
  }

  const active = words.find((item) => item.id === activeId)
  const hintWord =
    active ??
    words.reduce<FallingWord | undefined>(
      (lowest, item) => (!lowest || item.y > lowest.y ? item : lowest),
      undefined,
    )
  const nextKey = hintWord ? hintWord.word[typed.length] : undefined
  const levelIndex = game.levels.findIndex((item) => item.id === difficulty.id)
  const nextDifficulty = game.levels[(levelIndex + 1) % game.levels.length]
  const accuracy = stats.keystrokes ? Math.round((stats.correct / stats.keystrokes) * 100) : 100
  const cpm = elapsed.current
    ? Math.round(stats.correct / Math.max(1 / 60, elapsed.current / 60))
    : 0
  const progress = Math.min(1, stats.kills / difficulty.target)

  return (
    <main className={'page ' + styles.page}>
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/games">
            ← 返回游戏中心
          </Link>
          <span className="eyebrow">掉落挑战 · 先准确 · 再加速</span>
          <h1>{game.title}</h1>
          <p>{game.instruction}</p>
        </div>
        <LearningAtmosphere />
      </div>
      <div className={styles.levels} role="group" aria-label="选择难度">
        {game.levels.map((item) => (
          <button
            key={item.id}
            className={'button ' + (item.id === difficulty.id ? 'primary' : 'secondary')}
            aria-pressed={item.id === difficulty.id}
            onClick={() => onLevel(item.id)}
          >
            {item.title}
          </button>
        ))}
      </div>
      <section className={styles.round} aria-label="字母雨游戏">
        <div className={styles.hud}>
          <span className={styles.lives} aria-label={`护盾 ${lives} 格`}>
            {[0, 1, 2].map((item) => (
              <Shield key={item} size={16} data-empty={item >= lives ? 'true' : undefined} />
            ))}
          </span>
          <span>
            <Zap size={16} aria-hidden="true" /> 连击 {stats.combo} · 最高 {stats.maxCombo}
          </span>
          <span>
            <CheckCircle2 size={16} aria-hidden="true" /> 击落 {stats.kills} / {difficulty.target}
          </span>
          <span>
            <Clock size={16} aria-hidden="true" /> {remaining} 秒
          </span>
          <span>准确率 {accuracy}%</span>
        </div>
        <progress value={progress} max={1} aria-label="击落进度" />
        <div className={styles.arena} data-status={status}>
          <div className={styles.ground} aria-hidden="true" />
          {words.map((item) => {
            const isActive = item.id === activeId
            return (
              <span
                key={item.id}
                data-testid="falling-word"
                className={
                  styles.word +
                  (item.word.length > 12 ? ' ' + styles.wordLong : '') +
                  (isActive ? ' ' + styles.wordActive : '')
                }
                style={{ left: `${item.x}%`, top: `${item.y}%` }}
              >
                {[...item.word].map((letter, position) => (
                  <b
                    key={position}
                    data-done={isActive && position < typed.length ? 'true' : undefined}
                    data-next={isActive && position === typed.length ? 'true' : undefined}
                  >
                    {letter}
                  </b>
                ))}
              </span>
            )
          })}
          {status === 'ready' && (
            <div className={styles.overlay}>
              <Play size={34} aria-hidden="true" />
              <h2>{difficulty.title}</h2>
              <p>{difficulty.goal}</p>
              <p className={styles.tip}>
                输入落得最低的词或短语，打对自动击落；漏词会扣护盾。按 Esc 可以暂停。
              </p>
              <button className="button primary" onClick={start}>
                开始这一局 →
              </button>
            </div>
          )}
          {status === 'paused' && (
            <div className={styles.overlay}>
              <Pause size={34} aria-hidden="true" />
              <h2>歇一会，词先停在空中</h2>
              <p>按 Esc 或点下面的按钮继续。</p>
              <button className="button primary" onClick={() => setStatus('playing')}>
                继续 →
              </button>
            </div>
          )}
          {status === 'finished' && (
            <div className={styles.overlay}>
              <CheckCircle2 size={40} aria-hidden="true" />
              <h2>这一局结束啦</h2>
              <p>{result}</p>
              <dl className={styles.summary}>
                <div>
                  <dt>击落</dt>
                  <dd>{stats.kills}</dd>
                </div>
                <div>
                  <dt>准确率</dt>
                  <dd>{accuracy}%</dd>
                </div>
                <div>
                  <dt>最高连击</dt>
                  <dd>{stats.maxCombo}</dd>
                </div>
                <div>
                  <dt>字符/分钟</dt>
                  <dd>{cpm}</dd>
                </div>
                <div>
                  <dt>速度倍率</dt>
                  <dd>{speed.toFixed(2)}×</dd>
                </div>
              </dl>
              <div className={styles.actions}>
                <button className="button primary" onClick={start}>
                  再来一局
                </button>
                <button className="button secondary" onClick={() => onLevel(nextDifficulty.id)}>
                  换个难度 · {nextDifficulty.title}
                </button>
                <Link className="button secondary" to="/games">
                  回到游戏中心 →
                </Link>
              </div>
            </div>
          )}
        </div>
        <div className={styles.typing} aria-live="polite">
          <span>正在输入</span>
          <strong>{typed || '—'}</strong>
          <small>
            {status === 'playing'
              ? active
                ? '锁定：' + active.word
                : '敲下任意单词的首字母开始锁定'
              : '开始后直接敲键盘，不用点输入框'}
          </small>
        </div>
        <div className={styles.guide}>
          <FingerKeyboard compact nextKey={nextKey} ariaLabel="字母雨指法键盘" />
        </div>
        <div className={styles.tools}>
          {status === 'playing' && (
            <button className="button secondary" onClick={() => setStatus('paused')}>
              暂停
            </button>
          )}
          <button className="button secondary" onClick={start}>
            <RotateCcw size={16} aria-hidden="true" /> 重新开始
          </button>
        </div>
        <p className={styles.help}>{difficulty.discovery}</p>
      </section>
    </main>
  )
}
