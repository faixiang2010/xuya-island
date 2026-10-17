import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Languages, ScanSearch, Palette, Music2, Send, Pause } from 'lucide-react'
import {
  checkChoice,
  checkTyping,
  missionSize,
  nextRequiredCharacter,
  typingGames,
  type GameId,
} from '../games/content'
import { useGameProgress } from '../games/progress'
import { learningThemes, useLearningPreferences } from '../learning/preferences'
import {
  prepareLearningAudio,
  playLearningNote,
  playLearningPhrase,
  melodyNames,
} from '../learning/audio'
import LearningAtmosphere from '../components/LearningAtmosphere'
import LearningMedia from '../components/LearningMedia'
import styles from './TypingGameView.module.css'
import { LearningRecorder, type LearningReceipt } from '../growth/outbox'
import { newId } from '../shared/id'
import Xiaoqi from '../motivation/Xiaoqi'
import { celebrate } from '../motivation/celebrate'
const keyRows = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const themeIcons = { detective: ScanSearch, painting: Palette, piano: Music2 }
export default function TypingGameView() {
  const { gameId } = useParams()
  const [search, setSearch] = useSearchParams()
  if (!gameId || !(gameId in typingGames)) return <Navigate to="/games" replace />
  const id = gameId as GameId
  const game = typingGames[id]
  const level = game.levels.find((item) => item.id === search.get('level')) ?? game.levels[0]
  return (
    <TypingRound
      key={id + ':' + level.id + ':' + search.get('review')}
      gameId={id}
      levelId={level.id}
      review={search.get('review') === '1'}
      onLevel={(next) => setSearch({ level: next })}
    />
  )
}
function TypingRound({
  gameId,
  levelId,
  review,
  onLevel,
}: {
  gameId: GameId
  levelId: string
  review: boolean
  onLevel: (id: string) => void
}) {
  const game = typingGames[gameId]
  const publishedLevel = game.levels.find((item) => item.id === levelId)!
  const level = review
    ? { ...publishedLevel, tasks: publishedLevel.tasks.slice(0, missionSize).reverse() }
    : publishedLevel
  const saved = useRef(
    review
      ? undefined
      : useGameProgress
          .getState()
          .drafts.find(
            (item) =>
              item.gameId === gameId &&
              item.levelId === levelId &&
              item.levelVersion === level.version,
          ),
  )
  const [index, setIndex] = useState(saved.current?.nextIndex ?? 0)
  const [attempts, setAttempts] = useState(saved.current?.attempts ?? 0)
  const [answer, setAnswer] = useState('')
  const [composing, setComposing] = useState(false)
  const [paused, setPaused] = useState(false)
  const [capsLock, setCapsLock] = useState<boolean>()
  const [delivered, setDelivered] = useState('')
  const [replayError, setReplayError] = useState(false)
  const [missionStart, setMissionStart] = useState(
    saved.current?.growth?.start ?? saved.current?.nextIndex ?? 0,
  )
  const [missionEnd, setMissionEnd] = useState(
    saved.current?.growth?.end ??
      Math.min((saved.current?.nextIndex ?? 0) + missionSize, level.tasks.length),
  )
  const [growthId, setGrowthId] = useState(saved.current?.growth?.sessionId ?? newId())
  const [growthMessage, setGrowthMessage] = useState('')
  const [receipt, setReceipt] = useState<LearningReceipt>()
  const recorder = useRef<LearningRecorder | undefined>(undefined)
  const wrongAnswers = useRef(new Set<string>())
  const composition = useRef(false)
  const acceptedIndex = useRef(-1)
  const latestAnswer = useRef('')
  const input = useRef<HTMLInputElement>(null)
  const { complete, saveDraft, clearDraft, records, cacheAvailable } = useGameProgress()
  const { theme, motion } = useLearningPreferences()
  const world = learningThemes[theme]
  const SceneIcon = themeIcons[theme]
  const done = index === level.tasks.length
  const checkpoint = !done && index === missionEnd
  const task = level.tasks[Math.min(index, level.tasks.length - 1)]
  const isChoice = game.kind === 'choice'
  const evaluation = isChoice
    ? checkChoice(task.target, answer)
    : checkTyping(gameId, task.target, answer)
  const nextKey = isChoice
    ? ''
    : game.input === 'keyboard'
      ? nextRequiredCharacter(task.target, answer)
      : ''
  const needsShift = /^[A-Z]$/.test(nextKey)

  useEffect(() => {
    const value = new LearningRecorder(
      {
        module: 'typing',
        activityId: `${gameId}:${levelId}`,
        version: String(level.version),
        mode: review ? 'review' : 'practice',
        start: missionStart,
        count: missionEnd - missionStart,
      },
      (message, received) => {
        setGrowthMessage(message)
        if (received) setReceipt(received)
      },
      growthId,
    )
    recorder.current = value
    value.event('resume', {})
    if (index === missionEnd) value.finish()
    const heartbeat = () => value.event('heartbeat', { active: !document.hidden })
    const timer = window.setInterval(heartbeat, 10000)
    document.addEventListener('visibilitychange', heartbeat)
    return () => {
      value.event('pause', {})
      value.close()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', heartbeat)
    }
  }, [gameId, levelId, level.version, missionStart, missionEnd, growthId, review])
  useEffect(() => {
    if (
      composing ||
      composition.current ||
      paused ||
      checkpoint ||
      done ||
      !answer ||
      answer.length < task.target.length ||
      ['empty', 'partial', 'correct', 'invalid'].includes(evaluation.state)
    )
      return
    const key = index + ':' + answer
    if (!wrongAnswers.current.has(key)) {
      wrongAnswers.current.add(key)
      recorder.current?.event('card', { index: index - missionStart, answer: answer.slice(0, 200) })
    }
  }, [
    answer,
    composing,
    paused,
    checkpoint,
    done,
    index,
    missionStart,
    task.target,
    evaluation.state,
  ])
  useEffect(() => {
    recorder.current?.event(paused ? 'pause' : 'resume', {})
  }, [paused])

  useEffect(() => {
    if (!evaluation.correct || composing || paused || checkpoint || done) return
    const ticket = index
    const timer = window.setTimeout(() => {
      if (
        composition.current ||
        acceptedIndex.current === ticket ||
        latestAnswer.current !== answer
      )
        return
      acceptedIndex.current = ticket
      recorder.current?.event('card', { index: ticket - missionStart, answer })
      const next = ticket + 1
      const count = attempts + 1
      latestAnswer.current = ''
      setAnswer('')
      setIndex(next)
      setAttempts(count)
      setDelivered(world.delivery)
      if (!review) {
        if (next === level.tasks.length) complete(gameId, levelId, count)
        else
          saveDraft(gameId, levelId, next, count, {
            sessionId: growthId,
            start: missionStart,
            end: missionEnd,
          })
      }
      if (next === missionEnd || next === level.tasks.length) recorder.current?.finish()
      playLearningNote(
        useLearningPreferences.getState().sound,
        ticket,
        next === missionEnd || next === level.tasks.length,
      )
    }, 180)
    return () => window.clearTimeout(timer)
  }, [
    answer,
    evaluation.correct,
    composing,
    paused,
    checkpoint,
    done,
    index,
    attempts,
    missionEnd,
    missionStart,
    growthId,
    gameId,
    levelId,
    level.tasks.length,
    review,
    complete,
    saveDraft,
    world.delivery,
  ])

  // 练完一个级别时给一次看得见的庆祝；复习轮与中途休息不打扰。
  useEffect(() => {
    if (!done || review) return
    celebrate({
      kind: 'level',
      title: '这个级别练完啦！',
      detail: `${game.title} · ${publishedLevel.title.replace(/^\d+\s*·\s*/, '')} 全部送达。`,
      id: `level-${gameId}-${levelId}`,
    })
  }, [done, review, gameId, levelId, game.title, publishedLevel.title])

  useEffect(() => {
    if (!done && !checkpoint && !paused) input.current?.focus({ preventScroll: true })
  }, [index, done, checkpoint, paused])
  function edit(value: string) {
    latestAnswer.current = value
    setAnswer(value)
    setDelivered('')
    void prepareLearningAudio(useLearningPreferences.getState().sound)
  }
  function select(option: string) {
    if (composing || paused || checkpoint || done) return
    latestAnswer.current = option
    setAnswer(option)
    setDelivered('')
    void prepareLearningAudio(useLearningPreferences.getState().sound)
  }
  function restart() {
    acceptedIndex.current = -1
    latestAnswer.current = ''
    composition.current = false
    if (!review) clearDraft(gameId, levelId)
    setIndex(0)
    setAttempts(0)
    setAnswer('')
    setComposing(false)
    setPaused(false)
    setDelivered('')
    setMissionStart(0)
    setMissionEnd(Math.min(missionSize, level.tasks.length))
    setGrowthId(newId())
    setReceipt(undefined)
    setGrowthMessage('')
    wrongAnswers.current.clear()
  }
  function continueMission() {
    setMissionStart(index)
    setMissionEnd(Math.min(index + missionSize, level.tasks.length))
    setDelivered('')
    setGrowthId(newId())
    setReceipt(undefined)
    setGrowthMessage('')
    wrongAnswers.current.clear()
  }
  const feedback = composing ? '正在选字，慢慢选，程序会等你。' : delivered || evaluation.message
  return (
    <main className={'page ' + styles.page}>
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/games">
            ← 返回游戏中心
          </Link>
          <span className="eyebrow">短冒险 · 自动送达 · 按自己的节奏</span>
          <h1>
            {game.title}
            {review ? ' · 到期复习' : ''}
          </h1>
          <p>{game.instruction}</p>
        </div>
        <LearningAtmosphere />
      </div>
      <div className={styles.configuration} role="region" aria-label="练习设置">
        <label className={styles.levelSelect}>
          选择练习级别
          <select
            aria-label="选择练习级别"
            value={levelId}
            onChange={(event) => onLevel(event.target.value)}
          >
            {game.levels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.levels} role="group" aria-label="练习级别">
          {game.levels.map((item) => (
            <button
              key={item.id}
              className={'button ' + (item.id === levelId ? 'primary' : 'secondary')}
              aria-pressed={item.id === levelId}
              onClick={() => onLevel(item.id)}
            >
              {item.title}
              {records.some((record) => record.gameId === gameId && record.levelId === item.id) && (
                <CheckCircle2 size={16} aria-label="已练完" />
              )}
            </button>
          ))}
        </div>
      </div>
      <section className={styles.round} aria-label="打字练习">
        <div className={styles.scene}>
          <SceneIcon size={28} aria-hidden="true" />
          <div>
            <strong>
              {world.title} · {world.mission}
            </strong>
            <p>{level.goal}</p>
          </div>
          <span className={styles.auto}>打对自动送达</span>
        </div>
        <div className={styles.stats}>
          <span>
            本级已送达 {index} / {level.tasks.length} 张
          </span>
          <span>这次先送 {missionEnd - missionStart} 张 · 不计时</span>
        </div>
        <progress value={index} max={level.tasks.length} aria-label="本级练习进度" />
        <div className={styles.route} aria-label="本次冒险进度">
          {Array.from({ length: missionEnd - missionStart }, (_, position) => (
            <span key={position} className={index - missionStart > position ? styles.revealed : ''}>
              <SceneIcon size={18} aria-hidden="true" />
              <small>
                {theme === 'piano'
                  ? melodyNames[(missionStart + position) % melodyNames.length]
                  : theme === 'painting'
                    ? `灵感 ${position + 1}`
                    : `线索 ${position + 1}`}
              </small>
            </span>
          ))}
        </div>
        {done || checkpoint ? (
          <div className={styles.finish} data-testid="mission-result">
            <Xiaoqi
              mood={done ? 'cheer' : 'hello'}
              size={96}
              message={done ? '这一级全部送达，真棒！' : '你送出了一组线索。'}
            />
            <CheckCircle2 className={motion ? styles.reveal : ''} size={48} aria-hidden="true" />
            <h2>{done ? '这一轮卡片都送到了！' : world.achievement}</h2>
            <p>
              这次送达 {index - missionStart} 张。
              {done ? '这个级别已经练完。' : '进度已保留，可以继续，也可以先休息。'}
            </p>
            {receipt && (
              <p>
                首次完整正确 {receipt.summary.firstCorrect} / {receipt.summary.total} · 本次准确分{' '}
                {receipt.summary.accuracy} · 成长积分 +{receipt.awarded}
              </p>
            )}
            {growthMessage && <p role="status">{growthMessage}</p>}
            {!receipt && growthMessage && (
              <button className="button secondary" onClick={() => void recorder.current?.flush()}>
                同步这次学习记录
              </button>
            )}
            <div className={styles.discovery}>
              <strong>我的新发现</strong>
              <p>{level.discovery}</p>
              <small>{world.prompt}</small>
            </div>
            <div className={styles.actions}>
              {theme === 'piano' && (
                <button
                  className="button secondary"
                  onClick={async () => {
                    const played = await playLearningPhrase(
                      true,
                      missionStart,
                      index - missionStart,
                    )
                    useLearningPreferences.getState().update({ sound: played })
                    setReplayError(!played)
                  }}
                >
                  重听这段旋律
                </button>
              )}
              {checkpoint && (
                <button className="button primary" onClick={continueMission}>
                  再送一组 →
                </button>
              )}
              {done && (
                <button className="button secondary" onClick={restart}>
                  再玩一次
                </button>
              )}
              {done && game.levels[game.levels.indexOf(level) + 1] && (
                <button
                  className="button primary"
                  onClick={() => onLevel(game.levels[game.levels.indexOf(level) + 1].id)}
                >
                  试试下一级 →
                </button>
              )}
              <Link className="button secondary" to="/">
                回到学习地图 →
              </Link>
            </div>
            {replayError && <small>琴音暂时无法播放，音符和学习进度仍然保留。</small>}
          </div>
        ) : paused ? (
          <div className={styles.finish}>
            <Pause size={36} aria-hidden="true" />
            <h2>歇一会，线索留在这里</h2>
            <p>已经送达的卡片会保留。放松一下手指，回来继续。</p>
            <button className="button primary" onClick={() => setPaused(false)}>
              继续这次冒险 →
            </button>
            <Link className="button secondary" to="/">
              回到学习地图 →
            </Link>
          </div>
        ) : (
          <div className={styles.play}>
            <div className={styles.inputPane}>
              {isChoice ? (
                <>
                  <div className={styles.target} data-correct={evaluation.correct && !composing}>
                    <span>请选出正确的答案</span>
                    <strong data-testid="typing-target" className={styles.prompt}>
                      {task.prompt}
                    </strong>
                    {evaluation.correct && !composing && (
                      <Send
                        className={motion ? styles.delivery : ''}
                        size={24}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className={styles.options} role="group" aria-label="选项">
                    {(task.options ?? []).map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={'button ' + (option === answer ? 'primary' : 'secondary')}
                        onClick={() => select(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <p id="typing-feedback" className={styles.feedback} role="status">
                    {feedback}
                  </p>
                  <div className={styles.actions}>
                    <button className="button secondary" onClick={() => setPaused(true)}>
                      歇一会
                    </button>
                    <button className="button secondary" onClick={restart}>
                      重新练这一轮
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.target} data-correct={evaluation.correct && !composing}>
                    <span>请打出这条线索</span>
                    <strong data-testid="typing-target">
                      {[...task.target].map((character, position) => (
                        <span
                          key={position}
                          className={
                            !composing && answer[position] === character ? styles.matched : ''
                          }
                        >
                          {character}
                        </span>
                      ))}
                    </strong>
                    {task.pinyin && (
                      <p>
                        键入拼音：<b lang="en">{task.pinyin}</b>
                      </p>
                    )}
                    {game.input === 'keyboard' && (
                      <small>
                        {needsShift
                          ? '这是大写字母：按住 Shift 再按字母键。'
                          : /[a-z]/.test(nextKey)
                            ? '这是小写字母：松开 Shift，注意 Caps Lock。'
                            : '数字直接按，不需要 Shift。'}
                      </small>
                    )}
                    {evaluation.correct && !composing && (
                      <Send
                        className={motion ? styles.delivery : ''}
                        size={24}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className={styles.form}>
                    <label htmlFor="typing-answer">
                      {game.input === 'keyboard' ? '输入字母或数字' : '用拼音输入法输入汉字'}
                    </label>
                    <input
                      id="typing-answer"
                      ref={input}
                      value={answer}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      maxLength={80}
                      readOnly={evaluation.correct && !composing}
                      aria-describedby="typing-feedback typing-help"
                      onChange={(event) => edit(event.target.value)}
                      onCompositionStart={() => {
                        composition.current = true
                        setComposing(true)
                      }}
                      onCompositionEnd={(event) => {
                        composition.current = false
                        edit(event.currentTarget.value)
                        setComposing(false)
                      }}
                      onKeyDown={(event) => {
                        setCapsLock(event.getModifierState('CapsLock'))
                        if (
                          event.key === 'Enter' &&
                          !composition.current &&
                          !event.nativeEvent.isComposing
                        )
                          event.preventDefault()
                      }}
                      onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                    />
                  </div>
                  <p id="typing-feedback" className={styles.feedback} role="status">
                    {feedback}
                  </p>
                  <p id="typing-help" className={styles.help}>
                    {game.input === 'pinyin'
                      ? '拼音候选没有出来？请先切换到中文拼音输入法；选好汉字后会自动送达。短句可以分几次选字，不必按 Enter 提交。'
                      : '不用点确认，也不用按 Enter。前半段打对会等你继续，打错的内容会保留，方便退格修改。'}
                  </p>
                  <div className={styles.actions}>
                    <button className="button secondary" onClick={() => setPaused(true)}>
                      歇一会
                    </button>
                    <button className="button secondary" onClick={restart}>
                      重新练这一轮
                    </button>
                  </div>
                </>
              )}
            </div>
            <aside className={styles.hints}>
              {isChoice ? (
                <section className={styles.inputSteps} aria-label="怎么玩">
                  <ScanSearch size={28} aria-hidden="true" />
                  <h2>怎么玩</h2>
                  <p>{level.discovery}</p>
                </section>
              ) : (
                <>
                  {game.input === 'keyboard' && (
                    <div className={styles.keyboard} aria-label={'键位提示：下一位 ' + nextKey}>
                      {keyRows.map((row) => (
                        <div
                          key={row}
                          className={styles.keyRow}
                          style={{
                            gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
                            width: `${row.length * 10}%`,
                          }}
                        >
                          {[...row].map((key) => (
                            <kbd
                              key={key}
                              className={key === nextKey.toLowerCase() ? styles.highlight : ''}
                            >
                              {key.toUpperCase()}
                            </kbd>
                          ))}
                        </div>
                      ))}
                      <div className={styles.modifiers}>
                        <kbd className={needsShift ? styles.highlight : ''}>Shift</kbd>
                        <span>{needsShift ? '按住 Shift + 亮起的字母键' : '不用按住 Shift'}</span>
                        <kbd className={capsLock ? styles.highlight : ''}>Caps Lock</kbd>
                      </div>
                      <small>
                        {capsLock === true
                          ? 'Caps Lock 已打开，输入小写时记得关掉。'
                          : capsLock === false
                            ? 'Caps Lock 已关闭。'
                            : '亮起的是目标键。键盘印着大写，目标大小写仍要看清楚。'}
                      </small>
                    </div>
                  )}
                  {game.input === 'pinyin' && (
                    <section className={styles.inputSteps} aria-label="拼音输入步骤">
                      <Languages size={28} aria-hidden="true" />
                      <h2>三个小步骤</h2>
                      <ol>
                        <li>切到中文拼音输入法</li>
                        <li>输入拼音，选好汉字</li>
                        <li>正确内容会自动送达</li>
                      </ol>
                      <p>系统候选框里可以按空格或数字选字。这里会等你，不催促。</p>
                    </section>
                  )}
                  <LearningMedia kind={game.input} />
                </>
              )}
            </aside>
          </div>
        )}
        {!cacheAvailable && (
          <p className="inline-notice" role="alert">
            当前浏览器不能保存练习记录，仍可继续玩；关闭页面后本次进度可能丢失。
          </p>
        )}
      </section>
    </main>
  )
}
