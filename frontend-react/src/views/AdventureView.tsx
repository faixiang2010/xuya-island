import { accountStorage } from '../account/session'
import { LearningRecorder, type LearningReceipt } from '../growth/outbox'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ScanSearch, FlaskConical, NotebookPen, Lightbulb, Sparkles } from 'lucide-react'
import CodeEditor from '../components/CodeEditor'
import StagePreview from '../components/StagePreview'
import LessonCompanion from '../components/LessonCompanion'
import LearningAtmosphere from '../components/LearningAtmosphere'
import LearningQuest from '../components/LearningQuest'
import { request } from '../api/client'
import {
  getAdventure,
  getEpisode,
  matchesScene,
  readAdventureDraft,
  type AdventureEpisode,
} from '../api/adventure'
import { usePythonRunner } from '../runner/usePythonRunner'
import styles from './AdventureView.module.css'

export default function AdventureView() {
  const { episodeId } = useParams()
  const navigate = useNavigate()
  const [episode, setEpisode] = useState<AdventureEpisode>()
  const [nextEpisode, setNextEpisode] = useState<AdventureEpisode>()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [draftNote, setDraftNote] = useState('')
  const [hintLevel, setHintLevel] = useState(0)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [copying, setCopying] = useState(false)
  const [inputMode, setInputMode] = useState<'live' | 'preset'>('live')
  const [preset, setPreset] = useState('')
  const [input, setInput] = useState('')
  const [observations, setObservations] = useState('')
  const [executedCode, setExecutedCode] = useState('')
  const [checkedCode, setCheckedCode] = useState('')
  const [checks, setChecks] = useState<{ name: string; passed: boolean; actual: string }[]>([])
  const learningRecorder = useRef<LearningRecorder | undefined>(undefined)
  const [growthMessage, setGrowthMessage] = useState('')
  const [growthReceipt, setGrowthReceipt] = useState<LearningReceipt>()
  const aliveRef = useRef(true)
  const cancelChecksRef = useRef(false)
  const runner = usePythonRunner(frameRef, (_result, snapshot) => {
    setExecutedCode(snapshot)
  })
  const { state, frameUrl, preparation, failure, result, liveOutput, liveError, stageEvents } =
    runner
  const busy = useMemo(
    () => state === 'running' || state === 'waiting' || checking,
    [state, checking],
  )
  const dialogue = useMemo(() => episode?.dialogue.slice(0, 3) ?? [], [episode])
  const allPassed = useMemo(
    () =>
      !checking &&
      checks.length === episode?.checks.length &&
      checkedCode === code &&
      checks.every((check) => check.passed),
    [checking, checks, episode, checkedCode, code],
  )

  function edit(value: string) {
    setCode(value)
    setChecks([])
    if (checking) {
      cancelChecksRef.current = true
      runner.stop()
    }
    persistDraft(value, observations, hintLevel)
  }
  function persistDraft(codeValue = code, reflection = observations, hintLevelValue = hintLevel) {
    if (!episode) return
    try {
      accountStorage.setItem(
        `xuya:adventure:absurd-town-1.0:${episode.id}`,
        JSON.stringify({
          code: codeValue,
          reflection,
          hintLevel: hintLevelValue,
        }),
      )
      setDraftNote('草稿已保存在本机浏览器；带进创作室后保存为作品。')
    } catch {
      setDraftNote('浏览器草稿没有保存，请把作品带进创作室保存。')
    }
  }
  async function load() {
    try {
      const [current, directory] = await Promise.all([
        getEpisode(String(episodeId)),
        getAdventure(),
      ])
      if (!aliveRef.current) return
      setEpisode(current)
      setNextEpisode(directory.episodes.find((item) => item.number === current.number + 1))
      setCode(readAdventureDraft(accountStorage, current.id) ?? current.starterCode)
      try {
        const saved = JSON.parse(
          accountStorage.getItem(`xuya:adventure:absurd-town-1.0:${current.id}`) ?? '{}',
        )
        setObservations(typeof saved.reflection === 'string' ? saved.reflection : '')
        setHintLevel(
          Number.isInteger(saved.hintLevel) && saved.hintLevel >= 0 && saved.hintLevel <= 3
            ? saved.hintLevel
            : 0,
        )
      } catch {
        /* 损坏的本机记录不影响打开故事。 */
      }
      setPreset(current.exampleInput.join('\n'))
      setDraftNote('修改会保存为本机草稿；不覆盖旧课堂作品。')
      void runner.initialize()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '故事暂时没有打开。')
    }
  }
  async function run() {
    setMessage('')
    setChecks([])
    try {
      await runner.run(code, {
        inputMode,
        presetInput: preset === '' ? [] : preset.split('\n'),
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '这次运行没有完成。')
    }
  }
  async function checkScene() {
    if (!episode || busy || state !== 'ready') return
    const current = episode
    const snapshot = code
    if (!learningRecorder.current || growthReceipt) {
      learningRecorder.current?.close()
      learningRecorder.current = new LearningRecorder(
        {
          module: 'adventure',
          activityId: current.id,
          version: 'absurd-town-1.0',
          mode: 'practice',
          start: 0,
          count: current.checks.length,
        },
        (message, receipt) => {
          if (aliveRef.current) {
            setGrowthMessage(message)
            if (receipt) setGrowthReceipt(receipt)
          }
        },
      )
      setGrowthReceipt(undefined)
    }
    if (hintLevel > 0) learningRecorder.current.event('help', { source: 'hint' })
    if (referenceOpen) learningRecorder.current.event('help', { source: 'reference' })
    setCheckedCode(snapshot)
    setChecking(true)
    cancelChecksRef.current = false
    setChecks([])
    setMessage('正在使用几组顾客订单检查场景，每组从新的舞台开始。')
    const records: { name: string; passed: boolean; actual: string }[] = []
    try {
      for (const check of current.checks) {
        await runner.waitReady()
        if (!aliveRef.current || cancelChecksRef.current) break
        const runResult = await runner.run(snapshot, {
          inputMode: 'preset',
          presetInput: check.input,
        })
        if (!aliveRef.current || cancelChecksRef.current) break
        const passed = matchesScene(runResult.status, runResult.stageState, check.expectedState)
        learningRecorder.current?.event('code-run', {
          index: current.checks.indexOf(check),
          runId: runResult.runId,
        })
        records.push({
          name: check.name,
          passed,
          actual: runResult.error || JSON.stringify(runResult.stageState ?? {}),
        })
        setChecks([...records])
      }
      if (aliveRef.current)
        setMessage(
          cancelChecksRef.current
            ? '检查停下了，代码还在。'
            : records.length === current.checks.length && records.every((check) => check.passed)
              ? '这些订单的场景检查通过了！再试自己的规则，并说说它为什么有效。'
              : '场景里还有线索。比较实际状态与任务目标，再换一种办法。',
        )
      if (
        !cancelChecksRef.current &&
        records.length === current.checks.length &&
        records.every((check) => check.passed)
      )
        learningRecorder.current?.finish()
    } catch (error) {
      if (aliveRef.current) setMessage(error instanceof Error ? error.message : '场景检查未完成。')
    } finally {
      setChecking(false)
    }
  }
  function stop() {
    cancelChecksRef.current = true
    runner.stop()
  }
  function answerInput(eof = false) {
    runner.submitInput(input, eof)
    setInput('')
  }
  function reset() {
    edit(episode!.starterCode)
    runner.clearResult()
    setResetOpen(false)
  }
  async function openStudio() {
    if (!episode || copying) return
    setCopying(true)
    try {
      const project = await request<{ id: string }>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: `${episode.title} · 我的版本`,
          scene: episode.scene,
          lessonId: episode.id,
          files: [{ path: 'main.py', content: code }],
        }),
      })
      await navigate(`/studio/${encodeURIComponent(project.id)}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '没有完成复制，课堂草稿仍然保留。')
    } finally {
      setCopying(false)
    }
  }
  useEffect(() => {
    aliveRef.current = true
    cancelChecksRef.current = false
    void load()
    return () => {
      aliveRef.current = false
      learningRecorder.current?.event('pause', {})
      learningRecorder.current?.close()
      cancelChecksRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // watch([observations, hintLevel], persistDraft)
  useEffect(() => {
    persistDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observations, hintLevel])

  return (
    <main className="page adventure-page">
      {message && (
        <p role="status" className={`inline-notice ${styles['adventure-message']}`}>
          {message}
        </p>
      )}
      {episode ? (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                离谱事务所 · 第一章 · 第 {episode.number} 集 · 约 {episode.minutes} 分钟
              </span>
              <h1>{episode.title}</h1>
              <p>{episode.subtitle}</p>
            </div>
            <Link to="/" className="button secondary">
              回小镇
            </Link>
          </div>
          <LearningAtmosphere compact />
          <div className={styles['adventure-intro']}>
            <LearningQuest
              prediction={episode.prediction}
              change="先换一个动作或数字，再运行，看舞台发生了什么变化。一次只改一处，线索更容易发现。"
              creation={episode.remixes[0]?.description ?? '给小镇设计一种自己的玩法。'}
              editorId="adventure-editor"
            />
            <section className={styles['adventure-story']} aria-label="案发现场">
              <span className="pill">案发现场</span>
              <h2>{episode.hook}</h2>
              <div className={styles['adventure-dialogue']}>
                {dialogue.map((line, index) => (
                  <p key={index}>
                    <strong>{line.speaker}</strong> {line.text}
                  </p>
                ))}
              </div>
            </section>
          </div>
          <div className={styles['adventure-workbench']}>
            <section
              className={`panel ${styles.panel} ${styles['adventure-code']}`}
              id="adventure-editor"
            >
              <div className={`panel-heading ${styles['panel-heading']}`}>
                <h2>改变小镇的代码</h2>
                <span>main.py</span>
              </div>
              <p className={styles['adventure-mission']}>{episode.mission}</p>
              <p className="muted">
                第一行是舞台工具箱，先保留它。每次只改一个地方，再运行看看变化。
              </p>
              <div className={styles['adventure-actions']}>
                <button
                  className="button primary"
                  disabled={state !== 'ready' || checking}
                  onClick={() => void run()}
                >
                  ▶ 运行故事
                </button>
                {busy && (
                  <button className="button secondary" onClick={stop}>
                    ■ 停止
                  </button>
                )}
                <button
                  className="button secondary"
                  disabled={state !== 'ready' || checking}
                  onClick={() => void checkScene()}
                >
                  检查场景
                </button>
                <button className="button ghost" disabled={busy} onClick={() => setResetOpen(true)}>
                  重新开始
                </button>
              </div>
              <CodeEditor modelValue={code} onUpdateModelValue={edit} />
              <small className={styles['adventure-draft']}>{draftNote}</small>
              {resetOpen && (
                <div className="inline-notice" role="alert">
                  恢复开场代码会替换本集草稿。可以先带进创作室保留现在的版本。
                  <button className="button secondary" onClick={reset}>
                    确认恢复开场
                  </button>
                  <button className="button ghost" onClick={() => setResetOpen(false)}>
                    保留草稿
                  </button>
                </div>
              )}
              <details className={styles['adventure-debug']}>
                <summary>调试：顾客预设回答</summary>
                <label>
                  输入方式
                  <select
                    value={inputMode}
                    onChange={(event) => setInputMode(event.target.value as 'live' | 'preset')}
                    aria-label="冒险输入方式"
                  >
                    <option value="live">边运行边回答</option>
                    <option value="preset">用预设回答</option>
                  </select>
                </label>
                <label>
                  每行一个回答
                  <textarea
                    value={preset}
                    onChange={(event) => setPreset(event.target.value)}
                    aria-label="冒险预设回答"
                    rows={3}
                  />
                </label>
              </details>
            </section>
            <section className={`adventure-stage panel ${styles.panel}`} aria-label="故事舞台">
              <div className={`panel-heading ${styles['panel-heading']}`}>
                <h2>奶茶店，营业中？</h2>
                <span>代码决定现场</span>
              </div>
              <StagePreview events={stageEvents} scene={episode.scene} />
              {result && executedCode !== code && (
                <p className="inline-notice">
                  舞台来自上一次运行。代码已经改动，运行后看看新规则。
                </p>
              )}
              {state === 'loading' && <p className="muted">{preparation}</p>}
              {runner.notice && (
                <p className="inline-notice" role="status">
                  {runner.notice}
                </p>
              )}
              {state === 'failed' && (
                <div className="inline-notice" role="alert">
                  {failure}
                  <button className="button secondary" onClick={() => runner.retry()}>
                    重新准备 Python
                  </button>
                </div>
              )}
              {state === 'waiting' && (
                <form
                  className={styles['adventure-input']}
                  onSubmit={(event) => {
                    event.preventDefault()
                    answerInput()
                  }}
                >
                  <label>
                    回答程序
                    <input
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      aria-label="回答冒险程序"
                      autoComplete="off"
                    />
                  </label>
                  <button className="button primary" type="submit">
                    发送回答
                  </button>
                  <button className="button ghost" type="button" onClick={() => answerInput(true)}>
                    结束输入
                  </button>
                </form>
              )}
              <details
                className={styles['adventure-console']}
                open={!!liveError || state === 'waiting'}
              >
                <summary>程序说了什么</summary>
                <pre data-testid="adventure-output">
                  {liveOutput || '先运行，听听机器人说什么。'}
                </pre>
                {liveError && (
                  <pre className="console-error" data-testid="adventure-error">
                    {liveError}
                  </pre>
                )}
              </details>
              {growthMessage && <p role="status">{growthMessage}</p>}
              {growthReceipt && (
                <p>
                  这次留下了 {growthReceipt.summary.completed} 条场景证据，成长积分 +
                  {growthReceipt.awarded}。
                </p>
              )}
              {checks.length > 0 && (
                <p className="muted">检查记录按最终执行状态判断；舞台正在逐步重播这些动作。</p>
              )}
              {checks.length > 0 && (
                <ul className={styles['adventure-checks']}>
                  {checks.map((check) => (
                    <li
                      key={check.name}
                      data-testid={
                        check.passed ? 'adventure-check-passed' : 'adventure-check-failed'
                      }
                      className={check.passed ? styles.passed : undefined}
                    >
                      <strong>
                        {check.passed ? '✓' : '再调查'} {check.name}
                      </strong>
                      {!check.passed && (
                        <details>
                          <summary>查看实际运行状态</summary>
                          <pre>{check.actual}</pre>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {allPassed && (
                <p className={styles['adventure-clue']}>
                  <strong>{episode.dialogue[3]?.speaker}</strong>：{episode.dialogue[3]?.text}
                </p>
              )}
            </section>
          </div>
          <div data-testid="adventure-investigation" className={styles['adventure-investigation']}>
            <section
              className={`panel ${styles.panel} ${styles['investigation-lab']}`}
              aria-labelledby="investigation-title"
            >
              <div className={styles['lab-heading']}>
                <span className={styles['lab-icon']}>
                  <ScanSearch size={25} aria-hidden="true" />
                </span>
                <div>
                  <span className="eyebrow">01 / 小奇陪你找线索</span>
                  <h2 id="investigation-title">换一种办法试试</h2>
                </div>
                <span className={styles['lab-tag']}>线索实验</span>
              </div>
              <div className={styles['prediction-note']}>
                <Lightbulb size={20} aria-hidden="true" />
                <p>{episode.prediction}</p>
              </div>
              <div className={styles['clue-meter']} aria-label="线索进度">
                <span>已发现 {hintLevel} / 3 条线索</span>
                <div aria-hidden="true">
                  {[1, 2, 3].map((step) => (
                    <i key={step} className={hintLevel >= step ? styles.found : undefined}></i>
                  ))}
                </div>
              </div>
              {episode.hints.slice(0, hintLevel).map((hint, index) => (
                <p key={index} className={styles['adventure-hint']}>
                  线索 {index + 1}：{hint}
                </p>
              ))}
              <button
                className="button secondary"
                disabled={hintLevel >= 3}
                onClick={() => setHintLevel((value) => value + 1)}
              >
                {hintLevel ? '再给一点线索' : '给我一点线索'}
              </button>
              <details
                className={styles['adventure-reference']}
                onToggle={(event) => setReferenceOpen((event.target as HTMLDetailsElement).open)}
              >
                <summary>看一个独立示范</summary>
                <p>这是参考作品；看完在自己的代码里尝试，不会替换你的草稿。</p>
                {referenceOpen && <pre>{episode.referenceCode}</pre>}
              </details>
              <p className="muted">{episode.concept}</p>
              <LessonCompanion
                episodeId={episode.id}
                title={episode.title}
                code={code}
                executedCode={executedCode}
                result={result ?? undefined}
                onDemonstration={(projectId) => navigate('/studio/' + projectId)}
              />
            </section>
            <section
              className={`panel ${styles.panel} ${styles['remix-lab']}`}
              aria-labelledby="remix-title"
            >
              <div className={styles['lab-heading']}>
                <span className={styles['lab-icon']}>
                  <FlaskConical size={25} aria-hidden="true" />
                </span>
                <div>
                  <span className="eyebrow">02 / 你来当店主</span>
                  <h2 id="remix-title">把现场变成你的版本</h2>
                </div>
                <span className={styles['lab-tag']}>创作挑战</span>
              </div>
              <p className={styles['remix-intro']}>选一个挑战，或者发明你的第三种玩法。</p>
              {episode.remixes.map((remix, index) => (
                <article key={remix.title} className={styles['adventure-remix']}>
                  <span className={styles['remix-number']}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{remix.title}</h3>
                    <p>{remix.description}</p>
                  </div>
                </article>
              ))}
              <p className={styles['remix-rule']}>
                也可以提出第三种玩法。自由改造可能改变原任务的检查条件，保留你的点子，再解释新规则。
              </p>
              <div className={styles['remix-launch']}>
                <Sparkles size={23} aria-hidden="true" />
                <p>想让小奇看代码、做候选和试运行，就带着这个版本去创作室。</p>
                <button
                  className="button primary"
                  disabled={copying || busy}
                  onClick={() => void openStudio()}
                >
                  {copying ? '正在保留作品…' : '带进小奇创作室 →'}
                </button>
              </div>
            </section>
          </div>
          <section
            data-testid="adventure-reflection"
            className={styles['adventure-reflection']}
            aria-labelledby="reflection-title"
          >
            <div className={styles['reflection-main']}>
              <div className={styles['lab-heading']}>
                <span className={styles['lab-icon']}>
                  <NotebookPen size={25} aria-hidden="true" />
                </span>
                <div>
                  <span className="eyebrow">03 / 记录你的发现</span>
                  <h2 id="reflection-title">换个场景，你还会吗？</h2>
                </div>
              </div>
              <p>{episode.transfer}</p>
              <label>
                说说你发现了什么
                <textarea
                  value={observations}
                  onChange={(event) => setObservations(event.target.value)}
                  aria-label="我的发现"
                  placeholder="我改了……所以……；下次我还想试……"
                  rows={3}
                />
              </label>
              <small>这段发现是自由表达，不按字数或关键词给分。</small>
            </div>
            <div className={styles['reflection-next']}>
              <span className="eyebrow">探索继续</span>
              <h3>{nextEpisode ? '下一件怪事，等你调查' : '接下来，由你出题'}</h3>
              <p>带上刚刚发现的新规则，再试一次。</p>
              {nextEpisode ? (
                <Link to={'/adventure/' + nextEpisode.id}>下一集：{nextEpisode.subtitle} →</Link>
              ) : (
                <Link to="/studio">继续自由创作 →</Link>
              )}
            </div>
          </section>
          {frameUrl && (
            <iframe
              ref={frameRef}
              src={frameUrl}
              className="runner-frame"
              title="隔离 Python 运行环境"
              allow="cross-origin-isolated"
              sandbox="allow-scripts allow-same-origin"
              onLoad={runner.onFrameLoad}
            />
          )}
        </>
      ) : (
        !message && <p>正在打开案发现场…</p>
      )}
    </main>
  )
}
