import { newId } from '../shared/id'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import CodeEditor from '../components/CodeEditor'
import StoryPreview from '../components/StoryPreview'
import LessonActivity from '../components/LessonActivity'
import LearningQuest from '../components/LearningQuest'
import LearningAtmosphere from '../components/LearningAtmosphere'
import LearningMedia from '../components/LearningMedia'
import { request } from '../api/client'
import { useClassroomStore } from '../stores/classroom'
import { usePythonRunner } from '../runner/usePythonRunner'
import type { Progress, TutorStatus, VirtualFile } from '../types'
import { LearningRecorder, type LearningReceipt } from '../growth/outbox'

export default function ClassroomView() {
  const { lessonId } = useParams()
  const [searchParams] = useSearchParams()
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
  const { state, result, failure, preparation, frameUrl, liveOutput } = runner
  const busy = useMemo(() => state === 'running' || state === 'waiting', [state])
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
    } catch (error) {
      if (aliveRef.current)
        setLearningMessage(error instanceof Error ? error.message : '学习记录未保存')
    }
  }
  function openHint() {
    learningRecorder.current?.event('help', { source: 'hint' })
    hintIndexRef.current = hintIndexRef.current + 1
    setHintIndex(hintIndexRef.current)
    void saveProgress()
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
      if (passed) learningRecorder.current?.finish()
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
            <span className="pill">
              {lesson.number ? `活动 ${String(lesson.number).padStart(2, '0')}` : '自由探索'} ·
              按自己的节奏来
            </span>
          </div>
          <LearningAtmosphere compact />
          <div className="classroom-intro">
            <section className="mission-card">
              <span>✧</span>
              <div>
                <strong>今天的小任务</strong>
                <p>{lesson.mission}</p>
              </div>
            </section>
            <div className="classroom-quest">
              <LearningQuest
                prediction={lesson.prediction}
                change={lesson.exercises[0]?.instruction ?? lesson.mission}
                creation={lesson.creation}
                firstProgram={lesson.number === 1}
                editorId="classroom-editor"
              />
            </div>
            {lesson.number === 1 && (
              <section className="first-program-guide" aria-label="第一次写程序">
                <p>中文故事写在引号里面；代码的引号和括号用英文输入。打错可以退格修改，没关系。</p>
                <Link className="back-link" to="/games">
                  还不熟悉输入？先去游戏中心练一练 →
                </Link>
              </section>
            )}
          </div>
          {prerequisites.length > 0 && (
            <p className="muted">
              如果需要，可以先回顾{' '}
              {prerequisites.map((item) => (
                <Link key={item.id} to={`/classroom/${item.id}`}>
                  {item.title}
                </Link>
              ))}{' '}
              。这只是建议，课程均可自由选择。
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
                        ? '暂不可运行'
                        : busy
                          ? '运行中…'
                          : '运行'}
                  </button>
                  {(busy || checking) && (
                    <button className="button danger" onClick={stop}>
                      ■ 停止
                    </button>
                  )}
                  {state === 'failed' && (
                    <button className="button" onClick={() => runner.retry()}>
                      重新准备
                    </button>
                  )}
                  {state === 'failed' && (
                    <button className="button" disabled={!cacheAvailable} onClick={refreshPage}>
                      刷新页面
                    </button>
                  )}
                </div>
                <button
                  className="text-button"
                  disabled={busy || checking}
                  onClick={() => setResetConfirm((value) => !value)}
                >
                  重新看示例
                </button>
              </div>
              {state === 'loading' && (
                <p className="inline-notice" role="status">
                  {preparation}
                </p>
              )}
              {failure && (
                <div className="inline-notice" role="alert">
                  {failure}
                  {!cacheAvailable && <p>浏览器草稿缓存不可用，请先保存作品或复制代码再刷新。</p>}
                </div>
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
              <div className="console">
                <details className="input-settings">
                  <summary>调试选项：输入方式与预设回答</summary>
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
                        placeholder="例如第一行填笔名，第二行填章节数；每次 input() 依次读取一行。"
                        disabled={busy || checking}
                      />
                      <small>
                        填写后点击“运行”。每次 input()
                        自动读取一行回答，结果显示在下方“代码说了什么”。 只用 print()
                        的代码不会读取预设回答；回答用完后，再次输入会遇到 EOF。
                      </small>
                      {!lesson.exampleInput.length && (
                        <small>这课示例无需输入；可在第 5 课“程序采访作者”体验预设回答。</small>
                      )}
                    </label>
                  )}
                </details>
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
                <button
                  className="button secondary"
                  disabled={state !== 'ready' || checking}
                  onClick={() => void checkExercise()}
                >
                  {checking ? '正在检查…' : '检查基础练习'}
                </button>
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
                    {growthReceipt.awarded}。通过检查不等于已经掌握，可以再解释自己的方法。
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
                          setImportedFiles(importedFiles.filter((item) => item.name !== file.name))
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
              </div>
            </section>
            <section className="creation-panel panel">
              <div className="panel-heading">
                <span>✦ 我的创作</span>
                <span className="muted">运行后看看变化</span>
              </div>
              <div className="preview-wrap">
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
              </div>
            </section>
            <aside className="guide-panel">
              <div className="guide-header">
                <span className="qi-avatar">✦</span>
                <div>
                  <h2>小奇陪你想</h2>
                  <small>给一点提示，留一点想象</small>
                </div>
              </div>
              <div className="guide-message">
                先看看代码，再猜一猜。
                <br />
                如果卡住了，我们就一起找一个小线索。
              </div>
              <h3>今天认识这些</h3>
              <ul className="goals">
                {lesson.goals.map((goal) => (
                  <li key={goal}>{goal}</li>
                ))}
              </ul>
              <button
                className="button hint-button full-width"
                disabled={hintIndex >= lesson.hints.length - 1}
                onClick={openHint}
              >
                {hintIndex < 0
                  ? '给我一个小提示'
                  : hintIndex < lesson.hints.length - 1
                    ? '再给一点线索'
                    : '线索已经都打开啦'}
              </button>
              {lesson.hints.slice(0, hintIndex + 1).map((hint, index) => (
                <div key={index} className="hint-card">
                  <span>线索 {index + 1}</span>
                  <p>{hint}</p>
                </div>
              ))}
              <div className="ai-section">
                <span className="pill small">
                  {tutor?.configured ? 'AI 已配置' : '内置提示可用'}
                </span>
                {!tutor?.configured ? (
                  <p className="muted">让家长配置模型后，就能向小奇提问。现在也可以完成整节课。</p>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      void ask()
                    }}
                  >
                    <label htmlFor="question">有什么想问小奇的？</label>
                    <textarea
                      id="question"
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      maxLength={2000}
                      rows={3}
                      placeholder="为什么文字要放在引号里？"
                    />
                    <button
                      className="button secondary full-width"
                      disabled={asking || !question.trim()}
                    >
                      {asking ? '小奇正在想…' : '问问小奇'}
                    </button>
                    <small>提问会把当前代码和最近运行结果发给家长配置的模型服务。</small>
                  </form>
                )}
                {answer && (
                  <p className="ai-answer" role="status">
                    {answer}
                  </p>
                )}
              </div>
            </aside>
          </div>
          {lesson.number === 1 && <LearningMedia kind="program" />}
          <LessonActivity
            lesson={lesson}
            current={currentProgress}
            hintLevel={hintIndex + 1}
            referenceViewed={referenceViewed}
            onSave={saveProgress}
            onReference={viewReference}
          />
          <p role="status">{learningMessage}</p>
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
