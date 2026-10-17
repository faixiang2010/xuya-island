import { newId } from '../shared/id'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import CodeEditor from '../components/CodeEditor'
import StoryPreview from '../components/StoryPreview'
import LearningAtmosphere from '../components/LearningAtmosphere'
import LearningMedia from '../components/LearningMedia'
import SuccessBurst from '../components/SuccessBurst'
import Xiaoqi from '../motivation/Xiaoqi'
import { request } from '../api/client'
import { useFamily } from '../account/AuthGate'
import { useClassroomStore } from '../stores/classroom'
import { usePythonRunner } from '../runner/usePythonRunner'
import type { Progress, TutorStatus, VirtualFile } from '../types'
import { LearningRecorder, type LearningReceipt } from '../growth/outbox'

export default function ClassroomView() {
  const { lessonId } = useParams()
  const [searchParams] = useSearchParams()
  const family = useFamily()
  // 只有能进家庭管理的人才给直达入口；孩子的账户点进去只会被拒。
  const canManageRuntime =
    family.user?.permissions.some(
      (permission) => permission === '*' || permission === 'system:manage',
    ) ?? false
  const lesson = useClassroomStore((s) => s.lesson)
  const draft = useClassroomStore((s) => s.draft)
  const progress = useClassroomStore((s) => s.progress)
  const lessons = useClassroomStore((s) => s.lessons)
  const loading = useClassroomStore((s) => s.loading)
  const saving = useClassroomStore((s) => s.saving)
  const message = useClassroomStore((s) => s.message)
  const conflict = useClassroomStore((s) => s.conflict)
  const cacheAvailable = useClassroomStore((s) => s.cacheAvailable)
  const selectLesson = useClassroomStore((s) => s.selectLesson)
  const editCode = useClassroomStore((s) => s.editCode)
  const editTitle = useClassroomStore((s) => s.editTitle)
  const save = useClassroomStore((s) => s.save)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [hintIndex, setHintIndex] = useState(-1)
  const [hintOpen, setHintOpen] = useState(false)
  const [burst, setBurst] = useState(0)
  const [lessonDone, setLessonDone] = useState(false)
  const [referenceViewed, setReferenceViewed] = useState(false)
  const [inputMode, setInputMode] = useState<'live' | 'preset'>('live')
  const [presetText, setPresetText] = useState('')
  const [inputText, setInputText] = useState('')
  const [inputSending, setInputSending] = useState(false)
  const [importedFiles, setImportedFiles] = useState<VirtualFile[]>([])
  const [checking, setChecking] = useState(false)
  const [checkMessage, setCheckMessage] = useState('')
  const [learningMessage, setLearningMessage] = useState('')
  const [checks, setChecks] = useState<
    { name: string; input: string[]; output: string; error: string; passed: boolean }[]
  >([])
  const cancelCheckRef = useRef(false)
  const aliveRef = useRef(true)
  const [theme, setTheme] = useState('forest')
  const [resetConfirm, setResetConfirm] = useState(false)
  const [executionNote, setExecutionNote] = useState('')
  const [executedCode, setExecutedCode] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [asking, setAsking] = useState(false)
  const [tutor, setTutor] = useState<TutorStatus>()
  const [sessionId] = useState(() => newId())
  const learningRecorder = useRef<LearningRecorder | undefined>(undefined)
  const [growthMessage, setGrowthMessage] = useState('')
  const [growthReceipt, setGrowthReceipt] = useState<LearningReceipt>()
  // 与 Vue setup 中的可变变量对应；openHint/viewReference 需要在同一调用内读到最新值。
  const hintIndexRef = useRef(hintIndex)
  hintIndexRef.current = hintIndex
  const referenceViewedRef = useRef(referenceViewed)
  referenceViewedRef.current = referenceViewed
  const executedLessonIdRef = useRef(String(lessonId))
  const executedVersionRef = useRef('')
  const runner = usePythonRunner(frameRef, async (result, code) => {
    setExecutedCode(code)
    if (result.status === 'success') setBurst((value) => value + 1)
    try {
      await request('/attempts', {
        method: 'POST',
        body: JSON.stringify({
          runId: result.runId,
          lessonId: executedLessonIdRef.current,
          code,
          output: result.output,
          error: result.error,
          status: result.status,
          durationMs: result.durationMs,
          lessonVersion: executedVersionRef.current,
          exerciseId: checking ? 'practice' : null,
          input: result.inputs ?? [],
        }),
      })
      setExecutionNote('运行快照已记录')
    } catch {
      setExecutionNote('运行成功返回；本次记录未能保存，可以继续创作。')
    }
  })
  const { state, result, failure, preparation, frameUrl, liveOutput, needsSetup } = runner
  const busy = useMemo(() => state === 'running' || state === 'waiting', [state])
  const consoleVisible = Boolean(
    result || liveOutput || state === 'waiting' || executionNote || checks.length || checkMessage,
  )
  const currentProgress = useMemo(
    () =>
      progress.find(
        (item) => item.lessonId === lesson?.id && item.lessonVersion === lesson?.version,
      ),
    [progress, lesson],
  )
  const prerequisites = useMemo(
    () =>
      (lesson?.prerequisites ?? []).map((id) => ({
        id,
        title: lessons.find((item) => item.id === id)?.title ?? id,
      })),
    [lesson, lessons],
  )
  const nextLesson = useMemo(
    () =>
      lesson?.number
        ? lessons.find((item) => item.number === lesson.number + 1 && item.track === 'core')
        : undefined,
    [lesson, lessons],
  )
  const errorHint = useMemo(() => {
    const detail = result?.error ?? ''
    if (detail.includes('IndentationError'))
      return '这一行站的位置不太对。看看它前面的空格，和相邻行有什么不同？'
    if (detail.includes('SyntaxError'))
      return '有个符号让 Python 读不懂了。先看看引号、括号或冒号，我们一次找一处。'
    if (detail.includes('NameError'))
      return 'Python 还不认识这个名字。它有没有先放进变量盒子？名字是不是少了一个字母？'
    return '发现一个小问题也没关系。先看最后一行提示，或者请小奇给一点线索。'
  }, [result])

  async function load() {
    try {
      await selectLesson(String(lessonId), searchParams.get('work') ?? undefined)
      const store = useClassroomStore.getState()
      const current = store.progress.find(
        (item) =>
          item.lessonId === store.lesson?.id && item.lessonVersion === store.lesson?.version,
      )
      setHintIndex((current?.hintLevel ?? 0) - 1)
      setReferenceViewed(current?.referenceViewed ?? false)
      setLessonDone(current?.status === 'completed')
      setPresetText(store.lesson?.exampleInput.join('\n') ?? '')
    } catch (error) {
      useClassroomStore.setState({
        message: error instanceof Error ? error.message : '课程暂时没有打开。',
      })
    }
  }
  function run() {
    executedLessonIdRef.current = lesson!.id
    executedVersionRef.current = lesson!.version
    setExecutionNote('')
    void runner
      .run(draft.code, {
        inputMode,
        presetInput: presetText === '' ? [] : presetText.split('\n'),
        files: importedFiles,
      })
      .catch((error) => {
        setExecutionNote(error.message)
      })
  }
  function answerInput(eof = false) {
    setInputSending(true)
    runner.submitInput(inputText, eof)
  }
  // 连续input可能被React批处理成waiting→waiting，用请求ID识别新问题并解除发送锁。
  useEffect(() => {
    if (state === 'waiting') {
      setInputText('')
      setInputSending(false)
    }
  }, [state, runner.inputRequestId])
  async function saveProgress(values?: {
    status: Progress['status']
    reflection: string
    parentObservation: string
  }) {
    if (!lesson) return
    const current = lesson
    try {
      const saved = await request<Progress>('/progress/' + current.id, {
        method: 'PUT',
        body: JSON.stringify({
          lessonVersion: current.version,
          status: currentProgress?.status ?? 'in-progress',
          reflection: currentProgress?.reflection ?? '',
          parentObservation: currentProgress?.parentObservation ?? '',
          ...values,
          hintLevel: hintIndexRef.current + 1,
          referenceViewed: referenceViewedRef.current,
        }),
      })
      const store = useClassroomStore.getState()
      useClassroomStore.setState({
        progress: [
          saved,
          ...store.progress.filter(
            (item) =>
              item.lessonId !== saved.lessonId || item.lessonVersion !== saved.lessonVersion,
          ),
        ],
      })
      if (aliveRef.current) setLearningMessage('学习记录已保存')
      return true
    } catch (error) {
      if (aliveRef.current)
        setLearningMessage(error instanceof Error ? error.message : '学习记录未保存')
      return false
    }
  }
  function openHint() {
    learningRecorder.current?.event('help', { source: 'hint' })
    hintIndexRef.current = hintIndexRef.current + 1
    setHintIndex(hintIndexRef.current)
    void saveProgress()
  }
  function showHint() {
    setHintOpen(true)
    if (hintIndexRef.current < 0) openHint()
  }
  async function completeLesson() {
    if (lessonDone || !lesson) return
    const saved = await saveProgress({
      status: 'completed',
      reflection: currentProgress?.reflection ?? '',
      parentObservation: currentProgress?.parentObservation ?? '',
    })
    if (saved) {
      setLessonDone(true)
      setBurst((value) => value + 1)
    }
  }
  function viewReference() {
    learningRecorder.current?.event('help', { source: 'reference' })
    referenceViewedRef.current = true
    setReferenceViewed(true)
    void saveProgress()
  }
  async function checkExercise() {
    if (!lesson || checking || state !== 'ready') return
    const currentLesson = lesson
    const exercise = currentLesson.exercises[0]
    const code = draft.code
    const hintLevel = hintIndex + 1
    const viewed = referenceViewed
    setGrowthMessage('')
    if (!learningRecorder.current || growthReceipt) {
      learningRecorder.current?.close()
      learningRecorder.current = new LearningRecorder(
        {
          module: 'classroom',
          activityId: currentLesson.id,
          version: currentLesson.version,
          mode: 'practice',
          start: 0,
          count: exercise.tests.length,
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
    if (viewed) learningRecorder.current.event('help', { source: 'reference' })
    if (answer) learningRecorder.current.event('help', { source: 'ai' })
    setChecking(true)
    cancelCheckRef.current = false
    setChecks([])
    setCheckMessage('按用例逐个运行，每次使用新的 Python 环境…')
    executedLessonIdRef.current = currentLesson.id
    executedVersionRef.current = currentLesson.version
    const records: {
      runId: string
      name: string
      input: string[]
      output: string
      error: string
      passed: boolean
    }[] = []
    try {
      for (const item of exercise.tests) {
        await runner.waitReady()
        if (cancelCheckRef.current || !aliveRef.current) break
        const run = await runner.run(code, { inputMode: 'preset', presetInput: item.input })
        learningRecorder.current?.event('code-run', {
          index: exercise.tests.indexOf(item),
          runId: run.runId,
        })
        let cursor = 0
        const ordered = item.outputContains.every((text) => {
          const index = run.output.indexOf(text, cursor)
          if (index < 0) return false
          cursor = index + text.length
          return true
        })
        const passed =
          run.status === 'success' &&
          ordered &&
          run.drawings.length >= item.minDrawings &&
          item.expectedFiles.every((name) => run.files?.some((file) => file.name === name))
        records.push({
          runId: run.runId,
          name: item.name,
          input: item.input,
          output: run.output,
          error: run.error,
          passed,
        })
        setChecks([...records])
        if (run.status === 'stopped' || !aliveRef.current) {
          cancelCheckRef.current = true
          break
        }
      }
      if (cancelCheckRef.current || !aliveRef.current) {
        setCheckMessage('检查已停止，代码仍保留着。')
        return
      }
      const passed = records.every((item) => item.passed)
      if (passed) {
        learningRecorder.current?.finish()
        setBurst((value) => value + 1)
      }
      setCheckMessage(
        passed
          ? '检查通过！再试自己的输入，并解释你的方法。'
          : '有用例需要再看看，可以对照输入、期待结果和实际输出。',
      )
      await request('/exercise-attempts', {
        method: 'POST',
        body: JSON.stringify({
          id: newId(),
          lessonId: currentLesson.id,
          lessonVersion: currentLesson.version,
          exerciseId: exercise.id,
          code,
          status: passed ? 'passed' : 'needs-review',
          hintLevel,
          referenceViewed: viewed,
          cases: records,
        }),
      })
    } catch (error) {
      if (aliveRef.current) setCheckMessage(error instanceof Error ? error.message : '检查未完成')
    } finally {
      setChecking(false)
    }
  }
  function stop() {
    cancelCheckRef.current = true
    runner.stop()
  }
  function refreshPage() {
    if (cacheAvailable) location.reload()
  }
  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from((event.target as HTMLInputElement).files ?? [])
    try {
      const files = [...importedFiles]
      for (const file of selected) {
        if (
          !/^[\w\u4e00-\u9fff. -]{1,80}$/.test(file.name) ||
          file.name.includes('..') ||
          file.size > 65536
        )
          throw new Error('请选择名称有效、大小不超过 64 KiB 的 UTF-8 文本文件。')
        const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
        const index = files.findIndex((item) => item.name === file.name)
        if (index >= 0) files[index] = { name: file.name, content }
        else files.push({ name: file.name, content })
      }
      if (
        files.length > 32 ||
        files.reduce((total, file) => total + new TextEncoder().encode(file.content).length, 0) >
          524288
      )
        throw new Error('最多导入 32 个文件，总计不超过 512 KiB。')
      setImportedFiles(files)
      setExecutionNote('文件将在下次普通运行时导入；练习检查使用空白文件系统。')
    } catch (error) {
      setExecutionNote(error instanceof Error ? error.message : '导入没有完成')
    }
    ;(event.target as HTMLInputElement).value = ''
  }
  function exportFile(file: VirtualFile) {
    const url = URL.createObjectURL(new Blob([file.content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  useEffect(() => {
    aliveRef.current = true
    cancelCheckRef.current = false
    return () => {
      aliveRef.current = false
      learningRecorder.current?.event('pause', {})
      learningRecorder.current?.close()
      cancelCheckRef.current = true
    }
  }, [])
  function reset() {
    editCode(lesson!.starterCode)
    runner.clearResult()
    setExecutedCode('')
    setResetConfirm(false)
  }
  async function ask() {
    if (!question.trim() || asking || !lesson) return
    setAsking(true)
    setAnswer('')
    try {
      const reply = await request<{ answer: string }>('/tutor/ask', {
        method: 'POST',
        signal: AbortSignal.timeout(95000),
        body: JSON.stringify({
          sessionId,
          lessonId: lesson.id,
          question: question,
          currentCode: draft.code,
          executedCode: executedCode,
          output: result?.output ?? '',
          error: result?.error ?? '',
          lessonVersion: lesson.version,
          exerciseId: lesson.exercises[0].id,
          hintLevel: hintIndex + 1,
          referenceViewed: referenceViewed,
          input: result?.inputs ?? [],
        }),
      })
      setAnswer(reply.answer)
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : '小奇暂时没有回应。')
    } finally {
      setAsking(false)
    }
  }
  // watch(() => classroom.draft.code, ...)：代码变化时清空上一条回答。
  useEffect(() => {
    setAnswer('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.code])
  useEffect(() => {
    void runner.initialize()
    void request<TutorStatus>('/tutor/status')
      .then((value) => {
        setTutor(value)
      })
      .catch(() => {})
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="page classroom-page">
      {frameUrl && (
        <iframe
          ref={frameRef}
          src={frameUrl}
          className="runner-frame"
          title="隔离 Python 运行环境"
          sandbox="allow-scripts allow-same-origin"
          allow="cross-origin-isolated"
          referrerPolicy="no-referrer"
          onLoad={runner.onFrameLoad}
        />
      )}
      {loading ? (
        <div className="loading-card">正在打开课程与草稿…</div>
      ) : lesson ? (
        <>
          <div className="classroom-heading">
            <div>
              <Link to="/classroom" className="back-link">
                ← 返回编程课堂
              </Link>
              <h1>{lesson.title}</h1>
              <p>{lesson.subtitle}</p>
            </div>
            <div className="heading-tools">
              <span className="pill">
                {lesson.number ? `活动 ${String(lesson.number).padStart(2, '0')}` : '自由探索'} ·
                按自己的节奏来
              </span>
              <LearningAtmosphere />
            </div>
          </div>
          <section className="lesson-task">
            <div>
              <span>今天的任务</span>
              <p>{lesson.mission}</p>
            </div>
            {lessonDone && <Xiaoqi mood="cheer" size={52} />}
            <button
              className="button secondary"
              disabled={lessonDone || busy || checking || saving}
              onClick={() => void completeLesson()}
            >
              {lessonDone ? '已完成 ✓' : '完成这一课'}
            </button>
          </section>
          {lesson.number === 1 && (
            <p className="lesson-first-link">
              第一次写代码？<Link to="/games">先去游戏中心练 3 分钟 →</Link>
            </p>
          )}
          <div className="classroom-grid">
            <section className="editor-panel panel" id="classroom-editor">
              <div className="panel-heading">
                <span>
                  <i className="file-dot"></i> 我的作品.py
                </span>
                <span className="muted">Python</span>
              </div>
              <CodeEditor modelValue={draft.code} onUpdateModelValue={editCode} />
              <div className="editor-toolbar">
                <div className="toolbar-main">
                  <button
                    className="button primary"
                    disabled={state !== 'ready' || checking}
                    onClick={run}
                  >
                    <span>▶</span>{' '}
                    {state === 'loading'
                      ? '准备 Python…'
                      : state === 'failed'
                        ? needsSetup
                          ? '等大人准备'
                          : '暂不可运行'
                        : busy
                          ? '运行中…'
                          : '运行'}
                  </button>
                  {(busy || checking) && (
                    <button className="button danger" onClick={stop}>
                      ■ 停止
                    </button>
                  )}
                  <button
                    className="button secondary"
                    disabled={state !== 'ready' || checking}
                    onClick={() => void checkExercise()}
                  >
                    {checking ? '检查中…' : '检查'}
                  </button>
                  <button className="button ghost" disabled={busy || checking} onClick={showHint}>
                    提示
                  </button>
                  {state === 'failed' && !needsSetup && (
                    <button className="button" onClick={() => runner.retry()}>
                      重新准备
                    </button>
                  )}
                  {state === 'failed' && !needsSetup && (
                    <button className="button" disabled={!cacheAvailable} onClick={refreshPage}>
                      刷新页面
                    </button>
                  )}
                </div>
              </div>
              {state === 'loading' && (
                <p className="inline-notice" role="status">
                  {preparation}
                </p>
              )}
              {needsSetup ? (
                <div className="runtime-setup">
                  <strong>先请大人来准备小岛</strong>
                  <p>{failure}</p>
                  <p>你的代码已经留在这里了，准备好之后就能马上运行。</p>
                  <div className="runtime-setup-actions">
                    {canManageRuntime && (
                      <Link className="button secondary" to="/admin?section=running">
                        现在去准备 →
                      </Link>
                    )}
                    <button className="text-button" onClick={() => void runner.retry()}>
                      再试一次
                    </button>
                  </div>
                </div>
              ) : (
                failure && (
                  <div className="inline-notice" role="alert">
                    {failure}
                    {!cacheAvailable && <p>浏览器草稿缓存不可用，请先保存作品或复制代码再刷新。</p>}
                  </div>
                )
              )}
              {resetConfirm && (
                <div className="inline-notice">
                  用课程示例替换当前草稿？已保存的作品版本仍会保留。
                  <button className="text-button" onClick={reset}>
                    替换草稿
                  </button>
                  <button className="text-button" onClick={() => setResetConfirm(false)}>
                    保留我的代码
                  </button>
                </div>
              )}
              {hintOpen && (
                <div className="lesson-hint">
                  <div className="lesson-hint-head">
                    <strong>提示</strong>
                    <button
                      className="text-button"
                      disabled={hintIndex >= lesson.hints.length - 1}
                      onClick={openHint}
                    >
                      {hintIndex < lesson.hints.length - 1 ? '再给一点' : '没有更多了'}
                    </button>
                    <button className="text-button" onClick={() => setHintOpen(false)}>
                      收起
                    </button>
                  </div>
                  {lesson.hints.slice(0, hintIndex + 1).map((hint, index) => (
                    <p key={index}>
                      <span>线索 {index + 1}</span>
                      {hint}
                    </p>
                  ))}
                  <details
                    className="lesson-ai"
                    onToggle={(event) => {
                      if ((event.target as HTMLDetailsElement).open) viewReference()
                    }}
                  >
                    <summary>看参考实现</summary>
                    {lesson.exercises.map((exercise) => (
                      <pre key={exercise.id} className="reference-code">
                        {exercise.referenceCode}
                      </pre>
                    ))}
                  </details>
                  <details className="lesson-ai">
                    <summary>问问小奇</summary>
                    {!tutor?.configured ? (
                      <p className="muted">让家长配置模型后，就能向小奇提问。</p>
                    ) : (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault()
                          void ask()
                        }}
                      >
                        <textarea
                          value={question}
                          onChange={(event) => setQuestion(event.target.value)}
                          aria-label="问问小奇"
                          maxLength={2000}
                          rows={2}
                          placeholder="为什么文字要放在引号里？"
                        />
                        <button className="button secondary" disabled={asking || !question.trim()}>
                          {asking ? '小奇正在想…' : '问问小奇'}
                        </button>
                      </form>
                    )}
                    {answer && (
                      <p className="ai-answer" role="status">
                        {answer}
                      </p>
                    )}
                  </details>
                </div>
              )}
              {consoleVisible && (
                <div className="console">
                  <div className="console-heading">
                    <strong>代码说了什么</strong>
                    <span>
                      {result
                        ? {
                            success: '运行完成',
                            error: '发现一个小问题',
                            stopped: '已停止',
                            timeout: '已超时',
                          }[result.status]
                        : '等你点击运行'}
                    </span>
                  </div>
                  {liveOutput ? (
                    <pre data-testid="console-output">{liveOutput}</pre>
                  ) : (
                    !result && <p className="muted">先猜一猜：屏幕上会出现什么？</p>
                  )}
                  {executionNote && !result && (
                    <p className="inline-notice" role="alert">
                      {executionNote}
                    </p>
                  )}
                  {result?.error && result.status === 'error' ? (
                    <>
                      <p className="error-output">{errorHint}</p>
                      <details className="error-details">
                        <summary>查看 Python 的完整提示</summary>
                        <pre className="error-output" data-testid="console-error">
                          {result.error}
                        </pre>
                      </details>
                    </>
                  ) : (
                    result?.error && (
                      <pre className="error-output" data-testid="console-error">
                        {result.error}
                      </pre>
                    )
                  )}
                  {result?.outputTruncated && (
                    <p className="muted">输出较多，只显示前 20,000 个字符。</p>
                  )}
                  {result && (
                    <small>
                      {result.durationMs} ms · {executionNote}
                    </small>
                  )}
                  {state === 'waiting' && (
                    <form
                      className="input-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        answerInput()
                      }}
                    >
                      <label>
                        程序正在等待回答
                        <input
                          value={inputText}
                          onChange={(event) => setInputText(event.target.value)}
                          aria-label="回答程序"
                          maxLength={4096}
                          disabled={inputSending}
                          autoFocus
                        />
                      </label>
                      <button className="button primary" disabled={inputSending}>
                        发送回答
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        disabled={inputSending}
                        onClick={() => answerInput(true)}
                      >
                        结束输入（EOF）
                      </button>
                      <small>可以发送空回答；等待输入时暂停执行计时。</small>
                    </form>
                  )}
                  <p role="status">{checkMessage}</p>
                  {runner.notice && (
                    <p className="inline-notice" role="status">
                      {runner.notice}
                    </p>
                  )}
                  {growthMessage && <p role="status">{growthMessage}</p>}
                  {growthReceipt && (
                    <p>
                      这次检查留下了 {growthReceipt.summary.completed} 个用例证据，成长积分 +
                      {growthReceipt.awarded}。
                    </p>
                  )}
                  {checks.map((item) => (
                    <details key={item.name}>
                      <summary>
                        {item.name} · {item.passed ? '通过' : '需要再看'}
                      </summary>
                      <pre>
                        {item.output}
                        {item.error}
                      </pre>
                    </details>
                  ))}
                </div>
              )}
              <details className="lesson-more">
                <summary>更多工具</summary>
                <div className="lesson-more-body">
                  <details className="input-settings">
                    <summary>调试：输入方式与预设回答</summary>
                    <label>
                      输入方式
                      <select
                        value={inputMode}
                        onChange={(event) => setInputMode(event.target.value as 'live' | 'preset')}
                        aria-label="输入方式"
                        disabled={busy || checking}
                      >
                        <option value="live">实时问答</option>
                        <option value="preset">预设输入</option>
                      </select>
                    </label>
                    {inputMode === 'preset' && (
                      <label>
                        预设输入（每行一次回答）
                        <textarea
                          value={presetText}
                          onChange={(event) => setPresetText(event.target.value)}
                          aria-label="预设输入"
                          rows={3}
                          placeholder="例如第一行填笔名，第二行填章节数。"
                          disabled={busy || checking}
                        />
                        <small>填写后点击“运行”。每行一次回答。</small>
                      </label>
                    )}
                  </details>
                  <details className="virtual-files">
                    <summary>课堂文件：导入与导出</summary>
                    <p>仅使用 Python 虚拟工作目录。每次运行重建；需要保留文件时，请主动导出。</p>
                    <input
                      type="file"
                      aria-label="导入课堂文件"
                      multiple
                      accept=".json,.txt,.csv,.md"
                      disabled={busy || checking}
                      onChange={importFiles}
                    />
                    {importedFiles.map((file) => (
                      <p key={file.name}>
                        下次导入：{file.name}{' '}
                        <button
                          className="text-button"
                          onClick={() =>
                            setImportedFiles(
                              importedFiles.filter((item) => item.name !== file.name),
                            )
                          }
                        >
                          移除
                        </button>
                      </p>
                    ))}
                    {result?.files?.map((file) => (
                      <button key={file.name} className="button" onClick={() => exportFile(file)}>
                        导出 {file.name}
                      </button>
                    ))}
                  </details>
                  <button
                    className="text-button"
                    disabled={busy || checking}
                    onClick={() => setResetConfirm((value) => !value)}
                  >
                    重新看示例
                  </button>
                  {prerequisites.length > 0 && (
                    <p className="muted">
                      可以先回顾{' '}
                      {prerequisites.map((item) => (
                        <Link key={item.id} to={`/classroom/${item.id}`}>
                          {item.title}
                        </Link>
                      ))}
                      。
                    </p>
                  )}
                  {lesson.number === 1 && <LearningMedia kind="program" />}
                </div>
              </details>
            </section>
            <section className="creation-panel panel">
              <div className="panel-heading">
                <span>✦ 作品预览</span>
                <span className="muted">运行后看看变化</span>
              </div>
              <div className="preview-wrap">
                <SuccessBurst burstKey={burst} />
                <StoryPreview result={result} type={lesson.previewType} theme={theme} />
              </div>
              {lesson.previewType === 'cover' && (
                <div className="theme-picker" aria-label="封面主题">
                  <span>预览主题</span>
                  {[
                    { id: 'forest', name: '森林' },
                    { id: 'sky', name: '天空' },
                    { id: 'sea', name: '海洋' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      className={theme === item.id ? 'selected' : undefined}
                      onClick={() => setTheme(item.id)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="save-form">
                <label htmlFor="work-title">给作品起个名字</label>
                <input
                  id="work-title"
                  maxLength={80}
                  value={draft.title}
                  onChange={(event) => editTitle((event.target as HTMLInputElement).value)}
                />
                <button
                  className="button secondary full-width"
                  disabled={saving || !draft.code.trim()}
                  onClick={() => void save()}
                >
                  {saving ? '正在保存…' : '保存到我的作品'}
                </button>
                {conflict && (
                  <button className="button full-width" onClick={() => void save(true)}>
                    保留双方内容 · 另存为新作品
                  </button>
                )}
                <p className={conflict ? 'save-state warning' : 'save-state'} role="status">
                  {message ||
                    (draft.dirty
                      ? '草稿仅在这个浏览器里，记得保存作品。'
                      : '运行之后，别忘了保存你的创作。')}
                </p>
                {!cacheAvailable && (
                  <p className="error-output">浏览器缓存不可用，请及时保存或复制代码。</p>
                )}
                {lessonDone && (
                  <p className="lesson-done" role="status">
                    这一课完成了！
                    {nextLesson ? (
                      <Link to={`/classroom/${nextLesson.id}`}>下一课：{nextLesson.title} →</Link>
                    ) : (
                      <Link to="/studio">去创作室 →</Link>
                    )}
                  </p>
                )}
              </div>
            </section>
          </div>
          <p className="lesson-status" role="status">
            {learningMessage}
          </p>
        </>
      ) : (
        <div className="loading-card">
          <p>{message || '课程没有打开。'}</p>
          <button className="button" onClick={() => void load()}>
            重新打开
          </button>
        </div>
      )}
    </main>
  )
}
