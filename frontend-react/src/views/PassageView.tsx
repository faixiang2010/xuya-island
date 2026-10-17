import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, CheckCircle2, Gauge, RotateCcw, Sparkles } from 'lucide-react'
import { passageById, orderedPassages, splitPassageText } from '../games/passages'
import { typingGames } from '../games/content'
import { useGameProgress } from '../games/progress'
import { useLearningPreferences } from '../learning/preferences'
import { playLearningNote } from '../learning/audio'
import { celebrate } from '../motivation/celebrate'
import { accountStorage } from '../account/session'
import LearningAtmosphere from '../components/LearningAtmosphere'
import styles from './PassageView.module.css'

const customKey = 'xuya:passage-custom:v1'

interface CustomPassage {
  title: string
  text: string
}

function readCustom(): CustomPassage | undefined {
  try {
    const value = JSON.parse(accountStorage.getItem(customKey) ?? 'null')
    if (value && typeof value.text === 'string' && value.text.trim())
      return {
        title: typeof value.title === 'string' && value.title.trim() ? value.title : '自定义文章',
        text: value.text,
      }
  } catch {
    /* 自定义文章损坏时回到内置课文，不影响练习。 */
  }
  return undefined
}

const emptyStats = { correct: 0, mistakes: 0, backspaces: 0 }

export default function PassageView({
  gameId,
  levelId,
  onLevel,
}: {
  gameId: 'passage' | 'passage-en'
  levelId: string
  onLevel: (id: string) => void
}) {
  const game = typingGames[gameId]
  const base = passageById(levelId)
  const items = orderedPassages().filter((item) =>
    game.levels.some((level) => level.id === item.id),
  )
  const [custom, setCustom] = useState<CustomPassage | undefined>(readCustom)
  const [customMode, setCustomMode] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customText, setCustomText] = useState('')
  const [customError, setCustomError] = useState('')
  const saved = useRef(
    useGameProgress
      .getState()
      .drafts.find((item) => item.gameId === 'passage' && item.levelId === levelId),
  )
  const segments = customMode && custom ? splitPassageText(custom.text) : base.segments
  const [index, setIndex] = useState(Math.min(saved.current?.nextIndex ?? 0, segments.length - 1))
  const [input, setInput] = useState('')
  const [composing, setComposing] = useState(false)
  const [done, setDone] = useState(false)
  const [stats, setStats] = useState(emptyStats)
  const [now, setNow] = useState(Date.now())
  const startedAt = useRef(0)
  const latest = useRef('')
  const composition = useRef(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const sound = useLearningPreferences((state) => state.sound)
  const complete = useGameProgress((state) => state.complete)
  const saveDraft = useGameProgress((state) => state.saveDraft)
  const target = segments[Math.min(index, segments.length - 1)] ?? ''
  const builtIn = !customMode
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0)
  const targetChars = [...target]
  const typedChars = [...input]
  const accuracy =
    stats.correct + stats.mistakes > 0
      ? Math.round((stats.correct / (stats.correct + stats.mistakes)) * 100)
      : 100
  const minutes = Math.max(1 / 60, (now - startedAt.current) / 60000)
  const cpm = startedAt.current ? Math.round(stats.correct / minutes) : 0

  useEffect(() => {
    if (done) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [done])

  useEffect(() => {
    if (!done) textarea.current?.focus({ preventScroll: true })
  }, [index, done, customMode])

  useEffect(() => {
    if (done || composing || !target || input !== target) return
    const ticket = index
    const timer = window.setTimeout(() => {
      if (latest.current !== target || ticket !== index) return
      const next = ticket + 1
      playLearningNote(sound, ticket, next >= segments.length)
      if (next >= segments.length) {
        setDone(true)
        if (builtIn) complete('passage', levelId, segments.length)
        if (builtIn)
          celebrate({
            kind: 'level',
            title: '这篇课文打完啦！',
            detail: `${base.title} · 共 ${segments.length} 段，准确率 ${accuracy}%。`,
            id: `passage-${levelId}`,
          })
      } else {
        if (builtIn) saveDraft('passage', levelId, next, next)
        setIndex(next)
        setInput('')
        latest.current = ''
      }
    }, 220)
    return () => window.clearTimeout(timer)
  }, [
    input,
    target,
    composing,
    done,
    index,
    segments.length,
    builtIn,
    levelId,
    complete,
    saveDraft,
    sound,
    accuracy,
    base.title,
  ])

  function edit(value: string) {
    if (!startedAt.current) startedAt.current = Date.now()
    const previous = latest.current
    if (value.length > previous.length) {
      let correct = 0
      let mistakes = 0
      for (let position = previous.length; position < value.length; position += 1) {
        if (value[position] === target[position]) correct += 1
        else mistakes += 1
      }
      setStats((current) => ({
        ...current,
        correct: current.correct + correct,
        mistakes: current.mistakes + mistakes,
      }))
    } else if (value.length < previous.length) {
      setStats((current) => ({
        ...current,
        backspaces: current.backspaces + previous.length - value.length,
      }))
    }
    latest.current = value
    setInput(value)
  }

  function resetRound(nextCustom = customMode) {
    setCustomMode(nextCustom)
    setIndex(0)
    setInput('')
    setDone(false)
    setStats(emptyStats)
    setComposing(false)
    composition.current = false
    latest.current = ''
    startedAt.current = 0
    setNow(Date.now())
  }

  function restartSegment() {
    setInput('')
    latest.current = ''
    textarea.current?.focus({ preventScroll: true })
  }

  function applyCustom() {
    const chunks = splitPassageText(customText)
    if (!chunks.length) {
      setCustomError('先粘贴或输入一段文字，再开始练习。')
      return
    }
    const value = {
      title: customTitle.trim() || '自定义文章',
      text: customText.trim(),
    }
    try {
      accountStorage.setItem(customKey, JSON.stringify(value))
    } catch {
      setCustomError('本机保存失败，仍然可以这一次直接练习。')
    }
    setCustom(value)
    setCustomError('')
    resetRound(true)
  }

  const nextArticle =
    game.levels[game.levels.indexOf(game.levels.find((item) => item.id === levelId)!) + 1]

  return (
    <main className={'page ' + styles.page}>
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/games">
            ← 返回游戏中心
          </Link>
          <span className="eyebrow">整段输入 · 六年级课文 · 可分次继续</span>
          <h1>{game.title}</h1>
          <p>{game.instruction}</p>
        </div>
        <LearningAtmosphere />
      </div>
      <div className={styles.configuration}>
        <label className={styles.select}>
          选择课文
          <select
            aria-label="选择课文"
            value={customMode ? 'custom' : levelId}
            onChange={(event) => {
              if (event.target.value === 'custom') {
                resetRound(true)
                return
              }
              resetRound(false)
              onLevel(event.target.value)
            }}
          >
            {[
              { label: '六年级上册', grade: '六年级上' as const },
              { label: '六年级下册', grade: '六年级下' as const },
            ].map((group) => {
              const groupItems = items.filter((item) => item.grade === group.grade)
              if (!groupItems.length) return null
              return (
                <optgroup
                  key={group.label}
                  label={`${gameId === 'passage-en' ? '英语' : '语文'} · ${group.label}`}
                >
                  {groupItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} · {item.grade}
                    </option>
                  ))}
                </optgroup>
              )
            })}
            {custom && (
              <optgroup label="本机">
                <option value="custom">{custom.title}</option>
              </optgroup>
            )}
          </select>
        </label>
        <div className={styles.meta}>
          <BookOpen size={18} aria-hidden="true" />
          {customMode && custom ? (
            <span>本机自定义文章 · 不计入成长积分</span>
          ) : (
            <span>
              {base.grade} · {base.unit} · {base.source}
            </span>
          )}
        </div>
      </div>
      <section className={styles.round} aria-label="课文打字练习">
        <div className={styles.hud}>
          <span>
            第 {Math.min(index + 1, segments.length)} / {segments.length} 段
          </span>
          <span>
            全篇约 {totalLength} {base.language === 'zh' || customMode ? '字' : '字符'}
          </span>
          <span>
            <Gauge size={16} aria-hidden="true" /> {cpm} 字/分钟
          </span>
          <span>准确率 {accuracy}%</span>
          <span>退格 {stats.backspaces} 次</span>
        </div>
        <progress value={index} max={segments.length} aria-label="课文段落进度" />
        {done ? (
          <div className={styles.done}>
            <CheckCircle2 size={44} aria-hidden="true" />
            <h2>这篇课文打完啦</h2>
            <p>
              共 {segments.length} 段 · 输入 {stats.correct} 个正确字符 · 准确率 {accuracy}% · 平均{' '}
              {cpm} 字/分钟
            </p>
            <div className={styles.actions}>
              <button className="button primary" onClick={() => resetRound(customMode)}>
                <RotateCcw size={16} aria-hidden="true" /> 再打一遍
              </button>
              {builtIn && nextArticle && (
                <button className="button secondary" onClick={() => onLevel(nextArticle.id)}>
                  下一篇：{nextArticle.title} →
                </button>
              )}
              <Link className="button secondary" to="/games">
                回到游戏中心 →
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.target} aria-label="本段原文">
              {targetChars.map((character, position) => {
                const state =
                  position < typedChars.length
                    ? typedChars[position] === character
                      ? 'correct'
                      : 'wrong'
                    : position === typedChars.length
                      ? 'current'
                      : 'pending'
                return (
                  <span key={position} data-state={state}>
                    {character === ' ' ? '\u00a0' : character}
                  </span>
                )
              })}
            </div>
            <div className={styles.form}>
              <label htmlFor="passage-answer">
                {base.language === 'zh' || customMode
                  ? '用拼音输入法照着输入这一段'
                  : '照着输入这一段英文'}
              </label>
              <textarea
                id="passage-answer"
                ref={textarea}
                value={input}
                rows={3}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                onChange={(event) => {
                  if (composition.current || (event.nativeEvent as InputEvent).isComposing) {
                    setInput(event.target.value)
                    return
                  }
                  edit(event.target.value)
                }}
                onPaste={(event) => event.preventDefault()}
                onCompositionStart={() => {
                  composition.current = true
                  setComposing(true)
                }}
                onCompositionEnd={(event) => {
                  composition.current = false
                  edit(event.currentTarget.value)
                  setComposing(false)
                }}
              />
            </div>
            <p className={styles.feedback} role="status">
              {composing
                ? '正在选字，慢慢选，程序会等你。'
                : typedChars.length === 0
                  ? '开始输入后，正确的字会变绿，错了会标红。'
                  : '打完整段会自动进入下一段；打错可以退格修改。'}
            </p>
            <div className={styles.actions}>
              <button className="button secondary" onClick={restartSegment}>
                重练本段
              </button>
              <button className="button secondary" onClick={() => resetRound(customMode)}>
                从头开始
              </button>
            </div>
          </>
        )}
      </section>
      <details className={styles.custom}>
        <summary>
          <Sparkles size={16} aria-hidden="true" /> 家长：粘贴一篇文章
        </summary>
        <div className={styles.customBody}>
          <label>
            标题
            <input
              value={customTitle}
              onChange={(event) => setCustomTitle(event.target.value)}
              placeholder="例如：本周英语小短文"
            />
          </label>
          <label>
            正文
            <textarea
              value={customText}
              rows={5}
              onChange={(event) => setCustomText(event.target.value)}
              placeholder="把要练的文章粘贴到这里，每行一段或直接粘贴整段都可以。"
            />
          </label>
          <div className={styles.actions}>
            <button className="button primary" onClick={applyCustom}>
              用这篇文章练习
            </button>
            {custom && (
              <button className="button secondary" onClick={() => resetRound(true)}>
                继续上次的自定义文章
              </button>
            )}
          </div>
          <small>自定义文章只保存在本机当前账户，不计入成长积分，也不会同步到其他设备。</small>
          {customError && <p role="alert">{customError}</p>}
        </div>
      </details>
    </main>
  )
}
