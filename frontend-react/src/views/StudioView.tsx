import { newId } from '../shared/id'
import { accountStorage, accountSessionStorage } from '../account/session'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Coffee, Sparkles, Trash2, WandSparkles } from 'lucide-react'
import { Modal } from 'antd'
import CodeEditor from '../components/CodeEditor'
import StagePreview from '../components/StagePreview'
import StoryPreview from '../components/StoryPreview'
import SuccessBurst from '../components/SuccessBurst'
import { usePythonRunner } from '../runner/usePythonRunner'
import { request, ApiError } from '../api/client'
import { stripCodeComments } from '../api/adventure'
import {
  connectStudioEvents,
  deleteProject,
  getProject,
  projectList,
  studioPost,
  studioRequest,
  validCandidate,
  validProject,
  validSession,
  validSnapshot,
  validTask,
  versions,
} from '../api/studio'
import {
  candidateDiff,
  copyFiles,
  readStudioDraft,
  sameFiles,
  studioResult,
  validFiles,
  writeStudioDraft,
} from '../studio/project'
import { StudioExecutionBroker } from '../studio/execution'
import type {
  PendingRun,
  ProjectFile,
  ProjectVersion,
  StudioCandidate,
  StudioIntent,
  StudioProject,
  StudioSnapshot,
  StudioTask,
  StudySession,
  StudioDraft,
} from '../studio-types'
import type { Lesson, TutorStatus, Work } from '../types'
import type { StudioRunResult } from '../studio-types'
import '../styles-studio.css'

/** 项目里记录的是课堂 lessonId 或故事剧集 id，两者初始代码走同一个字段。 */
async function teachingStarter(lessonId: string): Promise<string | undefined> {
  try {
    const lesson = await request<Lesson>(
      lessonId.startsWith('town-')
        ? `/adventure/episodes/${encodeURIComponent(lessonId)}`
        : `/lessons/${encodeURIComponent(lessonId)}`,
    )
    return lesson.starterCode
  } catch {
    return undefined
  }
}

// 对应 Vue ref 的读写语义：状态驱动渲染，ref 镜像供异步流程随时读取最新值。
function useRefState<S>(initial: S) {
  const [value, setValue] = useState<S>(initial)
  const ref = useRef<S>(initial)
  const assign = useCallback((next: S) => {
    ref.current = next
    setValue(next)
  }, [])
  return [value, assign, ref] as const
}

export default function StudioView() {
  const routeParams = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [projects, setProjects] = useState<StudioProject[]>([])
  const [project, assignProject, projectRef] = useRefState<StudioProject | undefined>(undefined)
  const [files, assignFiles, filesRef] = useRefState<ProjectFile[]>([])
  const [title, assignTitle, titleRef] = useRefState('')
  const [draftRevision, assignDraftRevision, draftRevisionRef] = useRefState(1)
  const [selectedFile, assignSelectedFile, selectedFileRef] = useRefState('main.py')
  const [filename, setFilename] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, assignSaving, savingRef] = useRefState(false)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [cacheWarning, setCacheWarning] = useState('')
  const [history, setHistory] = useState<ProjectVersion[]>([])
  const [historyOpen, assignHistoryOpen, historyOpenRef] = useRefState(false)
  const [backup, assignBackup, backupRef] = useRefState<StudioDraft | undefined>(undefined)
  const [works, setWorks] = useState<Work[]>([])
  const [pendingDelete, setPendingDelete] = useState<StudioProject>()
  const [workId, assignWorkId, workIdRef] = useRefState('')
  const [newTitle, setNewTitle] = useState('离谱奶茶店')
  const [newScene, setNewScene] = useState<'milk-tea' | 'free'>('milk-tea')
  const [tutor, setTutor] = useState<TutorStatus>()
  const [snapshot, assignSnapshot, snapshotRef] = useRefState<StudioSnapshot | undefined>(undefined)
  const [connected, setConnected] = useState(false)
  const [question, setQuestion] = useState('')
  const [intent, setIntent] = useState<StudioIntent>('edit')
  const [sending, assignSending, sendingRef] = useRefState(false)
  const [messageRetry, setMessageRetry] = useState<{
    clientRequestId: string
    question: string
    intent: StudioIntent
    explicitBuild: boolean
  }>()
  const [executionFailure, setExecutionFailure] = useState('')
  const [executionActive, assignExecutionActive, executionActiveRef] = useRefState(false)
  const [executionEpoch, setExecutionEpoch] = useState(0)
  const [runOwner, setRunOwner] = useState<'draft' | 'candidate'>('draft')
  const [candidateResults, setCandidateResults] = useState<Record<string, StudioRunResult>>({})
  const [input, setInput] = useState('')
  const [burst, setBurst] = useState(0)

  const frameRef = useRef<HTMLIFrameElement>(null)
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined)
  const brokerRef = useRef<StudioExecutionBroker | undefined>(undefined)
  const loadTicketRef = useRef(0)
  const aliveRef = useRef(true)
  const pumpActiveRef = useRef(false)

  const runner = usePythonRunner(frameRef, (result) => {
    if (result.status === 'success') setBurst((value) => value + 1)
  })
  const {
    state,
    result,
    liveOutput,
    liveError,
    stageEvents,
    frameUrl,
    preparation,
    failure: runnerFailure,
  } = runner
  const runnerRef = useRef(runner)
  runnerRef.current = runner

  // 提交后等待保存完成期间仍读取最新输入，与 Vue 的 .value 行为一致。
  const questionRef = useRef(question)
  questionRef.current = question
  const intentRef = useRef(intent)
  intentRef.current = intent

  const dirty = useMemo(() => {
    const currentProject = project
    return (
      !!currentProject &&
      (title !== currentProject.title || !sameFiles(files, currentProject.files))
    )
  }, [project, title, files])
  const staleDraft = useMemo(
    () => dirty && draftRevision !== project?.revision,
    [dirty, draftRevision, project],
  )
  const code = files.find((file) => file.path === selectedFile)?.content ?? ''
  function setCode(content: string) {
    assignFiles(
      filesRef.current.map((file) =>
        file.path === selectedFileRef.current ? { ...file, content } : file,
      ),
    )
  }
  const running = state === 'running' || state === 'waiting' || executionActive
  const task = useMemo(() => snapshot?.tasks.at(-1), [snapshot])
  const thinking = useMemo(
    () => !!task && ['queued', 'starting', 'running'].includes(task.status),
    [task],
  )
  const candidates = useMemo(
    () => snapshot?.candidates.filter((candidate) => candidate.status !== 'rejected') ?? [],
    [snapshot],
  )
  const unknownRuns = useMemo(
    () => snapshot?.pendingRuns.filter((pending) => pending.status === 'unknown') ?? [],
    [snapshot],
  )
  const receiptRuns = useMemo(
    () =>
      snapshot?.pendingRuns.filter((pending) => brokerRef.current?.hasReceipt(pending.requestId)) ??
      [],
    [snapshot, executionEpoch],
  )
  const lessonMode = snapshot?.session.mode === 'lesson'

  function isRunning() {
    const current = runnerRef.current
    return current.state === 'running' || current.state === 'waiting' || executionActiveRef.current
  }
  function isDirty() {
    const currentProject = projectRef.current
    return (
      !!currentProject &&
      (titleRef.current !== currentProject.title ||
        !sameFiles(filesRef.current, currentProject.files))
    )
  }

  function answerInput() {
    runner.submitInput(input)
    setInput('')
  }
  const statusLabel = useMemo(() => {
    if (executionActive) return '正在试运行候选作品'
    if (
      task?.status === 'completed' &&
      candidates.some((candidate) => candidate.status === 'pending')
    )
      return '试演结束，等你选择'
    if (!task) return '等你开个脑洞'
    return (
      {
        queued: '已经收到你的想法',
        starting: '准备工具中',
        running: '小奇正在动手',
        completed: '这一轮完成了',
        suspended: '等你一起继续',
        interrupted: '已暂停，作品还在',
        failed: '这轮遇到了一点问题',
        cancelled: '这轮已停止',
      } as const
    )[task.status]
  }, [executionActive, task, candidates])

  function explain(error: unknown) {
    return error instanceof Error ? error.message : '这次操作没有完成，草稿还在。'
  }
  function cache() {
    const currentProject = projectRef.current
    if (!currentProject) return
    if (
      !writeStudioDraft(accountStorage, currentProject.id, {
        title: titleRef.current,
        files: filesRef.current,
        revision: draftRevisionRef.current,
      })
    )
      setCacheWarning('浏览器草稿空间已满，请点击保存。')
  }
  function keepBackup() {
    const currentProject = projectRef.current
    if (!currentProject || !isDirty()) return
    const value = {
      title: titleRef.current,
      files: copyFiles(filesRef.current),
      revision: draftRevisionRef.current,
    }
    // 采用候选前必须确实留住孩子的草稿。
    accountStorage.setItem(`xuya:studio:backup:${currentProject.id}`, JSON.stringify(value))
    assignBackup(value)
  }
  function setProject(value: StudioProject) {
    assignProject(value)
    assignDraftRevision(value.revision)
    assignTitle(value.title)
    assignFiles(copyFiles(value.files))
    if (!filesRef.current.some((file) => file.path === selectedFileRef.current))
      assignSelectedFile('main.py')
    cache()
  }
  function restoreBackup() {
    const currentBackup = backupRef.current
    if (!currentBackup) return
    assignTitle(currentBackup.title)
    assignFiles(copyFiles(currentBackup.files))
    assignSelectedFile('main.py')
    assignDraftRevision(projectRef.current?.revision ?? currentBackup.revision)
    setNotice('找回了采用前的草稿，点击保存就能留下这一版。')
  }
  async function openLatest() {
    const currentProject = projectRef.current
    if (!currentProject) return
    try {
      keepBackup()
      const latest = await getProject(currentProject.id)
      setProject(latest)
      setNotice('已打开最新保存版。先前的草稿留在备份里，可以随时找回。')
      setFailure('')
    } catch (error) {
      setFailure(explain(error))
    }
  }
  function candidateTrial(candidate: StudioCandidate) {
    const actual = candidateResults[candidate.id]
    if (actual) return actual.status === 'success' ? '实际试演通过' : '实际试演发现问题'
    const pending = snapshot?.pendingRuns.find((run) => run.candidateId === candidate.id)
    return pending?.status === 'completed'
      ? '试演已结束'
      : pending?.status === 'unknown'
        ? '上次试演结果未知'
        : pending?.status === 'running'
          ? '正在实际试演'
          : '尚未完成试演'
  }
  function applyLabel(candidate: StudioCandidate) {
    if (dirty) return '保留我的草稿并采用建议'
    return candidateResults[candidate.id]?.status === 'success'
      ? '采用这个建议'
      : '采用尚未验证的建议'
  }
  async function refreshSnapshot() {
    const session = snapshotRef.current?.session
    if (!session) return
    const next = await studioRequest<StudioSnapshot>(
      `/study-sessions/${session.id}/snapshot`,
      {},
      validSnapshot,
    )
    acceptSnapshot(next)
  }
  function acceptSnapshot(next: StudioSnapshot) {
    if (
      !aliveRef.current ||
      next.session.projectId !== projectRef.current?.id ||
      (snapshotRef.current && next.cursor < snapshotRef.current.cursor)
    )
      return
    assignSnapshot(next)
    void pumpRuns()
  }
  async function runFiles(source: ProjectFile[]) {
    await runner.waitReady()
    const main = source.find((file) => file.path === 'main.py')
    if (!main) throw new Error('作品缺少 main.py，暂时无法运行。')
    return studioResult(
      await runner.run(main.content, {
        inputMode: 'live',
        files: source
          .filter((file) => file.path !== 'main.py')
          .map((file) => ({ name: file.path, content: file.content })),
      }),
    )
  }
  async function pumpRuns() {
    const currentBroker = brokerRef.current
    const currentSnapshot = snapshotRef.current
    if (pumpActiveRef.current || isRunning() || !currentBroker || !currentSnapshot) return
    pumpActiveRef.current = true
    const current = currentBroker
    const waiting = currentSnapshot.pendingRuns.filter(
      (pending) =>
        pending.status === 'waiting-runner' ||
        current.hasReceipt(pending.requestId) ||
        pending.status === 'running',
    )
    try {
      for (const pending of waiting) {
        if (!aliveRef.current || brokerRef.current !== current) break
        assignExecutionActive(true)
        setRunOwner('candidate')
        try {
          const executed = await current.process(pending)
          if (executed?.result) {
            const outcome = executed.result
            setCandidateResults((prev) => ({ ...prev, [pending.candidateId]: outcome }))
          }
        } catch (error) {
          setExecutionFailure(explain(error))
          break
        } finally {
          assignExecutionActive(false)
          setExecutionEpoch((value) => value + 1)
        }
      }
    } finally {
      pumpActiveRef.current = false
    }
  }
  async function retryExecution(pending: PendingRun) {
    if (!brokerRef.current || isRunning()) return
    setExecutionFailure('')
    assignExecutionActive(true)
    setRunOwner('candidate')
    try {
      const executed = await brokerRef.current.process(pending, pending.status === 'unknown')
      if (executed?.result) {
        const outcome = executed.result
        setCandidateResults((prev) => ({ ...prev, [pending.candidateId]: outcome }))
      }
      await refreshSnapshot()
    } catch (error) {
      setExecutionFailure(explain(error))
    } finally {
      assignExecutionActive(false)
      setExecutionEpoch((value) => value + 1)
    }
  }
  async function openSession(value: StudioProject, ticket: number) {
    const sessions = await studioRequest<StudySession[]>(
      `/study-sessions?projectId=${encodeURIComponent(value.id)}`,
      {},
      (v) => Array.isArray(v) && v.every(validSession),
    )
    const mode =
      searchParams.get('mode') === 'studio' || !value.lessonId?.startsWith('town-')
        ? 'studio'
        : 'lesson'
    let session = sessions.find((item) => item.mode === mode)
    if (!session)
      session = await studioPost<StudySession>(
        '/study-sessions',
        {
          projectId: value.id,
          scene: value.scene,
          lessonId: mode === 'lesson' ? value.lessonId : null,
          mode,
        },
        validSession,
      )
    if (ticket !== loadTicketRef.current || !aliveRef.current) return
    const current = await studioRequest<StudioSnapshot>(
      `/study-sessions/${session.id}/snapshot`,
      {},
      validSnapshot,
    )
    if (ticket !== loadTicketRef.current || !aliveRef.current) return
    brokerRef.current = new StudioExecutionBroker(session.id, accountSessionStorage, runFiles)
    assignSnapshot(current)
    try {
      const saved = JSON.parse(
        accountStorage.getItem(`xuya:studio:message:${session.id}`) ?? 'null',
      )
      if (
        saved &&
        typeof saved.clientRequestId === 'string' &&
        typeof saved.question === 'string' &&
        ['think', 'edit', 'build'].includes(saved.intent)
      )
        setMessageRetry(saved)
    } catch {
      /* 只忽略损坏的本应用缓存，不重发命令。 */
    }
    unsubscribeRef.current = connectStudioEvents(
      session.id,
      current.cursor,
      acceptSnapshot,
      (value) => {
        setConnected(value)
      },
    )
    void pumpRuns()
  }
  async function load() {
    const ticket = ++loadTicketRef.current
    unsubscribeRef.current?.()
    brokerRef.current?.dispose()
    brokerRef.current = undefined
    runner.stop()
    runner.clearResult()
    assignSnapshot(undefined)
    setMessageRetry(undefined)
    assignExecutionActive(false)
    assignProject(undefined)
    assignBackup(undefined)
    assignHistoryOpen(false)
    setHistory([])
    setCandidateResults({})
    setFailure('')
    setLoading(true)
    try {
      const id = typeof routeParams.projectId === 'string' ? routeParams.projectId : ''
      if (id) {
        let value = await getProject(id)
        if (ticket !== loadTicketRef.current || !aliveRef.current) return
        // 从课堂或故事复制来的项目：只换掉旧版示例代码的注释，不碰孩子改过的内容。
        const starter = value.lessonId ? await teachingStarter(value.lessonId) : undefined
        if (ticket !== loadTicketRef.current || !aliveRef.current) return
        const main = value.files.find((file) => file.path === 'main.py')
        if (starter && main && stripCodeComments(main.content) === stripCodeComments(starter))
          value = {
            ...value,
            files: value.files.map((file) =>
              file.path === 'main.py' ? { ...file, content: starter } : file,
            ),
          }
        const saved = readStudioDraft(accountStorage, value.id)
        const savedMain = saved?.files.find((file) => file.path === 'main.py')?.content
        const savedIsOldSample =
          !!starter &&
          typeof savedMain === 'string' &&
          stripCodeComments(savedMain) === stripCodeComments(starter)
        setProject(value)
        if (
          saved &&
          !savedIsOldSample &&
          (saved.title !== value.title || !sameFiles(saved.files, value.files))
        ) {
          assignTitle(saved.title)
          assignFiles(copyFiles(saved.files))
          assignDraftRevision(saved.revision)
          setNotice('找回了这个浏览器里的草稿。')
        } else setNotice(`已打开第 ${value.revision} 版。`)
        try {
          const raw = JSON.parse(accountStorage.getItem(`xuya:studio:backup:${value.id}`) ?? 'null')
          if (raw && typeof raw.title === 'string' && validFiles(raw.files)) assignBackup(raw)
        } catch {
          /* 无效的草稿备份不覆盖正式作品。 */
        }
        await openSession(value, ticket)
      } else {
        setProjects(await projectList())
        setWorks(await request<Work[]>('/works'))
        if (ticket !== loadTicketRef.current || !aliveRef.current) return
        const queryWorkId = searchParams.get('workId')
        if (queryWorkId !== null) {
          assignWorkId(queryWorkId)
          await copyWork()
          return
        }
        const lessonId = searchParams.get('lessonId') ?? ''
        const episodeId = searchParams.get('episodeId') ?? ''
        if (lessonId || episodeId) {
          const lesson = await request<Lesson>(
            lessonId
              ? `/lessons/${encodeURIComponent(lessonId)}`
              : `/adventure/episodes/${encodeURIComponent(episodeId)}`,
          )
          const made = await studioPost<StudioProject>(
            '/projects',
            {
              title: `${lesson.title} · 我的改编`,
              scene: episodeId ? 'milk-tea' : 'free',
              lessonId: lessonId || episodeId,
              files: [{ path: 'main.py', content: lesson.starterCode }],
            },
            validProject,
          )
          navigate(`/studio/${made.id}`, { replace: true })
        }
      }
    } catch (error) {
      if (ticket === loadTicketRef.current) setFailure(explain(error))
    } finally {
      if (ticket === loadTicketRef.current) setLoading(false)
    }
  }
  async function createProject() {
    if (savingRef.current) return
    assignSaving(true)
    setFailure('')
    try {
      const made = await studioPost<StudioProject>(
        '/projects',
        {
          title: newTitle.trim() || '我的离谱作品',
          scene: newScene,
          files: [
            {
              path: 'main.py',
              content:
                newScene === 'milk-tea'
                  ? milkTeaStarter
                  : 'from xuya.stage import actor, say, size\n\n# 把“害羞怪兽”放到舞台上\nactor("害羞怪兽", "monster")\n# 让害羞怪兽说一句话\nsay("我只是长得很凶……", actor="害羞怪兽")\n# 把害羞怪兽缩放到 0.8 倍\nsize("害羞怪兽", 0.8)\n',
            },
          ],
          preferences: { favoriteThemes: [], humor: '有点离谱，但不拿别人开玩笑' },
        },
        validProject,
      )
      navigate(`/studio/${made.id}`)
    } catch (error) {
      setFailure(explain(error))
    } finally {
      assignSaving(false)
    }
  }
  const milkTeaStarter =
    'from xuya.stage import cup, pour, lid, pearls, drink, say\n\n# 拿出一个空杯子\ncup()\n# 往杯子里倒入 1 份奶\npour(1)\n# 往杯子里放 3 颗珍珠\npearls(3)\n# 把杯盖盖好\nlid()\n# 做出一杯“云朵奶茶”\ndrink("云朵奶茶", 1)\n# 让角色说出欢迎语\nsay("欢迎来到我的怪味奶茶店！")\n'
  async function removeProject(target: StudioProject) {
    if (savingRef.current) return
    assignSaving(true)
    setFailure('')
    try {
      await deleteProject(target.id)
      setProjects(await projectList())
      setNotice(`已删除《${target.title}》。`)
    } catch (error) {
      setFailure(explain(error))
    } finally {
      assignSaving(false)
      setPendingDelete(undefined)
    }
  }
  async function copyWork() {
    if (!workIdRef.current || savingRef.current) return
    assignSaving(true)
    try {
      const made = await studioPost<StudioProject>(
        `/projects/from-work/${encodeURIComponent(workIdRef.current)}`,
        {},
        validProject,
      )
      navigate(`/studio/${made.id}`)
    } catch (error) {
      setFailure(explain(error))
    } finally {
      assignSaving(false)
    }
  }
  async function save() {
    const currentProject = projectRef.current
    if (!currentProject || savingRef.current) return
    if (!validFiles(filesRef.current)) {
      const message = '文件名、数量或内容大小超出范围，请检查后再保存。'
      setFailure(message)
      throw new Error(message)
    }
    assignSaving(true)
    setFailure('')
    const original = currentProject
    const savedTitle = titleRef.current.trim() || '我的作品'
    const savedFiles = copyFiles(filesRef.current)
    try {
      const saved = await studioRequest<StudioProject>(
        `/projects/${original.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            title: savedTitle,
            files: savedFiles,
            preferences: original.preferences,
            revision: draftRevisionRef.current,
          }),
        },
        validProject,
      )
      if (projectRef.current?.id !== original.id) return
      assignProject(saved)
      assignDraftRevision(saved.revision)
      if (sameFiles(filesRef.current, savedFiles) && titleRef.current.trim() === savedTitle)
        setProject(saved)
      setNotice(`已保存第 ${saved.revision} 版。`)
      cache()
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.status === 409
          ? '另一处已经保存了新版本。你的草稿仍保留在浏览器里，请先复制代码，再重新打开作品核对。'
          : explain(error),
      )
      throw error
    } finally {
      assignSaving(false)
    }
  }
  async function saveClick() {
    await save().catch(() => {})
  }
  function addFile() {
    const path = filename.trim()
    if (!validFiles([...filesRef.current, { path, content: '' }])) {
      setFailure('请用安全的相对文件名，例如角色台词.txt；最多 32 个文件，不使用 .. 或绝对路径。')
      return
    }
    assignFiles([...filesRef.current, { path, content: '' }])
    assignSelectedFile(path)
    setFilename('')
    setFailure('')
  }
  function removeFile(path: string) {
    if (path === 'main.py') return
    assignFiles(filesRef.current.filter((file) => file.path !== path))
    assignSelectedFile('main.py')
  }
  async function manualRun() {
    const currentProject = projectRef.current
    if (!currentProject || isRunning()) return
    if (!validFiles(filesRef.current)) {
      setFailure('请检查文件路径和大小后再运行。')
      return
    }
    setExecutionFailure('')
    setRunOwner('draft')
    assignExecutionActive(true)
    const source = copyFiles(filesRef.current)
    const id = currentProject.id
    try {
      const actual = await runFiles(source)
      await studioPost(`/projects/${id}/runs`, { files: source, result: actual })
      setNotice('这一版的真实运行结果已留下，小奇可以一起查看。')
    } catch (error) {
      setExecutionFailure(explain(error))
    } finally {
      assignExecutionActive(false)
      void pumpRuns()
    }
  }
  async function sendMessage(retry = false) {
    const currentProject = projectRef.current
    const currentSnapshot = snapshotRef.current
    if (
      !currentProject ||
      !currentSnapshot ||
      sendingRef.current ||
      savingRef.current ||
      !tutor?.configured
    )
      return
    assignSending(true)
    setFailure('')
    const sessionId = currentSnapshot.session.id
    const selectedProjectId = currentProject.id
    try {
      if (!retry && isDirty()) await save()
      if (
        projectRef.current?.id !== selectedProjectId ||
        snapshotRef.current?.session.id !== sessionId
      )
        return
      const payload = retry
        ? messageRetry
        : {
            clientRequestId: newId(),
            question: questionRef.current.trim(),
            intent: intentRef.current,
            explicitBuild: intentRef.current === 'build',
          }
      if (!payload?.question) return
      if (payload.question.length > 2000) {
        setFailure('先把一个想法说清楚就好，请控制在 2000 字以内。')
        return
      }
      if (payload.intent === 'build' && snapshotRef.current?.session.mode === 'lesson') {
        setFailure('课堂改编先由你动手。新建独立作品后，可以让小奇帮你做出来。')
        return
      }
      const key = `xuya:studio:message:${sessionId}`
      setMessageRetry(payload)
      accountStorage.setItem(key, JSON.stringify(payload))
      await studioPost<StudioTask>(`/study-sessions/${sessionId}/messages`, payload, validTask)
      accountStorage.removeItem(key)
      setMessageRetry(undefined)
      setQuestion('')
      await refreshSnapshot()
    } catch (error) {
      setFailure(explain(error))
    } finally {
      assignSending(false)
    }
  }
  async function taskAction(action: 'interrupt' | 'resume') {
    const currentSnapshot = snapshotRef.current
    const currentTask = currentSnapshot?.tasks.at(-1)
    if (!currentSnapshot || !currentTask) return
    try {
      if (action === 'interrupt') runner.stop()
      await studioPost(
        `/study-sessions/${currentSnapshot.session.id}/${action}`,
        action === 'resume' ? { turnId: currentTask.turnId } : { runId: currentTask.runId },
      )
      await refreshSnapshot()
    } catch (error) {
      setFailure(explain(error))
    }
  }
  async function candidateAction(candidate: StudioCandidate, action: 'apply' | 'reject' | 'undo') {
    const currentProject = projectRef.current
    if (!currentProject || savingRef.current) return
    assignSaving(true)
    setFailure('')
    const projectId = currentProject.id
    try {
      if (action === 'reject')
        await studioPost<StudioCandidate>(`/candidates/${candidate.id}/reject`, {}, validCandidate)
      else {
        if (action === 'apply' && candidate.baseRevision !== currentProject.revision) {
          setFailure('你已经保存了更新的作品。这份建议基于旧版本，请让小奇按当前作品重新改。')
          return
        }
        keepBackup()
        const saved = await studioPost<StudioProject>(
          `/candidates/${candidate.id}/${action}`,
          { revision: currentProject.revision },
          validProject,
        )
        if (projectRef.current?.id !== projectId) return
        setProject(saved)
        setNotice(
          action === 'apply'
            ? `已采用建议，保存为第 ${saved.revision} 版。${backupRef.current ? '你先前的草稿也留住了。' : ''}`
            : '已撤销采用，恢复采用前的作品。',
        )
      }
      await refreshSnapshot()
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.status === 409
          ? '作品已变化，这份建议不能直接覆盖当前版本。草稿仍保留着，请重新共创。'
          : explain(error),
      )
    } finally {
      assignSaving(false)
    }
  }
  async function showHistory() {
    const open = !historyOpenRef.current
    assignHistoryOpen(open)
    if (!open || !projectRef.current) return
    try {
      setHistory(await versions(projectRef.current.id))
    } catch (error) {
      setFailure(explain(error))
    }
  }
  async function restoreVersion(version: ProjectVersion) {
    const currentProject = projectRef.current
    if (!currentProject || savingRef.current) return
    assignSaving(true)
    const projectId = currentProject.id
    try {
      keepBackup()
      const restored = await studioPost<StudioProject>(
        `/projects/${currentProject.id}/restore`,
        { revision: version.revision, expectedRevision: currentProject.revision },
        validProject,
      )
      if (projectRef.current?.id !== projectId) return
      setProject(restored)
      setNotice(`已从第 ${version.revision} 版恢复，另存为第 ${restored.revision} 版。`)
      setHistory(await versions(restored.id))
    } catch (error) {
      setFailure(explain(error))
    } finally {
      assignSaving(false)
    }
  }
  function importOutputFiles() {
    const generated = result?.files ?? []
    const merged = copyFiles(filesRef.current)
    for (const output of generated) {
      const existing = merged.find((file) => file.path === output.name)
      if (existing) existing.content = output.content
      else merged.push({ path: output.name, content: output.content })
    }
    if (!validFiles(merged)) {
      setFailure('运行产生的文件超出作品大小限制，请先精简。')
      return
    }
    keepBackup()
    assignFiles(merged)
    setNotice('运行产生的文本文件已收进草稿，点击保存就能留下。')
  }
  // watch([title, files], cache, { deep: true })
  useEffect(() => {
    cache()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, files])
  // watch(() => route.fullPath)：挂载与路由变化时重新加载。
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search])
  // onMounted + onBeforeUnmount
  useEffect(() => {
    aliveRef.current = true
    void runner.initialize()
    void request<TutorStatus>('/tutor/status')
      .then((value) => {
        setTutor(value)
      })
      .catch(() => {
        setTutor(undefined)
      })
    return () => {
      cache()
      aliveRef.current = false
      loadTicketRef.current += 1
      unsubscribeRef.current?.()
      brokerRef.current?.dispose()
      runner.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="studio-page">
      <header className="studio-heading">
        <div>
          <span className="studio-eyebrow">想法开工，作品登场</span>
          <h1>
            小奇创作室{' '}
            <span>
              <WandSparkles size={26} aria-hidden="true" />
            </span>
          </h1>
          <p>奶茶可以离谱，代码要真的跑得起来。</p>
        </div>
        {project && (
          <Link className="button secondary" to="/studio">
            我的创作室 ←
          </Link>
        )}
      </header>
      {failure && (
        <p className="studio-alert" role="alert">
          {failure}
          <button type="button" onClick={() => setFailure('')}>
            收起
          </button>
        </p>
      )}
      {cacheWarning && (
        <p className="studio-alert" role="alert">
          {cacheWarning}
        </p>
      )}
      {loading && (
        <p className="studio-loading" role="status">
          正在打开你的作品…
        </p>
      )}
      {!project && !loading && (
        <>
          <section className="studio-launch">
            <div className="studio-launch-art" aria-hidden="true">
              <span className="studio-cup">
                <Coffee size={108} strokeWidth={1.2} />
              </span>
              <span className="studio-spark">
                <Sparkles size={44} />
              </span>
              <small>
                今日特调
                <br />
                想象力，多加一点
              </small>
            </div>
            <div className="studio-launch-form">
              <span className="studio-eyebrow">从一个“如果……”开始</span>
              <h2>如果奶茶店突然很离谱？</h2>
              <p>改台词、换规则、做一场小剧。你当导演，小奇陪你动手。</p>
              <label>
                作品名字
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  maxLength={80}
                  aria-label="新作品名字"
                />
              </label>
              <div className="studio-scene-options" aria-label="选择创作场景">
                <button
                  className={newScene === 'milk-tea' ? 'selected' : undefined}
                  onClick={() => setNewScene('milk-tea')}
                >
                  <Coffee size={18} aria-hidden="true" /> 离谱奶茶店
                </button>
                <button
                  className={newScene === 'free' ? 'selected' : undefined}
                  onClick={() => setNewScene('free')}
                >
                  <Sparkles size={18} aria-hidden="true" /> 自由脑洞
                </button>
              </div>
              <button
                className="button primary"
                disabled={saving}
                onClick={() => void createProject()}
              >
                {saving ? '正在开工…' : '新建作品 →'}
              </button>
            </div>
          </section>
          {works.length > 0 && (
            <section className="studio-copy-work">
              <h2>旧作品也能冒出新点子</h2>
              <select
                value={workId}
                onChange={(event) => assignWorkId(event.target.value)}
                aria-label="选择要复制的旧作品"
              >
                <option value="">选一份旧作品</option>
                {works.map((work) => (
                  <option key={work.id} value={work.id}>
                    {work.title}
                  </option>
                ))}
              </select>
              <button
                className="button secondary"
                disabled={!workId || saving}
                onClick={() => void copyWork()}
              >
                复制到创作室
              </button>
              <p>会做一份新副本，原来的作品仍在作品集。</p>
            </section>
          )}
          <section className="studio-project-list">
            <div className="studio-section-title">
              <h2>继续自己的脑洞</h2>
              <span>{projects.length} 件作品</span>
            </div>
            {!projects.length && <p className="muted">第一个作品，还在等你开场。</p>}
            <div className="studio-project-grid">
              {projects.map((item) => {
                const SceneIcon = item.scene === 'milk-tea' ? Coffee : Sparkles
                return (
                  <div key={item.id} className="studio-project-shell">
                    <Link to={`/studio/${item.id}`} className="studio-project-card">
                      <span>
                        <SceneIcon size={32} aria-hidden="true" />
                      </span>
                      <h3>{item.title}</h3>
                      <p>
                        {item.files.length} 个文件 · 第 {item.revision} 版
                      </p>
                      <strong>继续创作 ↗</strong>
                    </Link>
                    <button
                      type="button"
                      className="card-delete"
                      aria-label={`删除作品 ${item.title}`}
                      disabled={saving}
                      onClick={() => setPendingDelete(item)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
      {project && (
        <>
          <div className="studio-work-heading">
            <label className="studio-title-label">
              我的作品
              <input
                value={title}
                onChange={(event) => assignTitle(event.target.value)}
                maxLength={80}
                aria-label="给创作室作品起个名字"
              />
            </label>
            <div className="studio-work-actions">
              <span className="studio-save-state" role="status">
                {dirty ? '浏览器已留住草稿' : `第 ${project.revision} 版`}
              </span>
              <button
                className="button secondary"
                disabled={saving || !dirty}
                onClick={() => void saveClick()}
              >
                保存作品
              </button>
              <button className="studio-text-button" onClick={() => void showHistory()}>
                版本历史
              </button>
            </div>
          </div>
          {notice && (
            <p className="studio-notice" role="status">
              <span>{notice}</span>
              {backup && (
                <button className="studio-text-button" onClick={restoreBackup}>
                  找回先前草稿
                </button>
              )}
            </p>
          )}
          {staleDraft && (
            <p className="studio-alert">
              草稿来自第 {draftRevision} 版，作品已经保存到第 {project.revision} 版。
              <button className="studio-text-button" onClick={() => void openLatest()}>
                保留草稿，打开最新保存版
              </button>
            </p>
          )}
          {historyOpen && (
            <section className="studio-history">
              <h2>每一版，都留着</h2>
              {history.map((version) => (
                <div key={version.revision}>
                  <span>
                    第 {version.revision} 版 · {version.title}
                  </span>
                  <button
                    className="button secondary"
                    disabled={saving || version.revision === project.revision}
                    onClick={() => void restoreVersion(version)}
                  >
                    恢复第 {version.revision} 版
                  </button>
                </div>
              ))}
            </section>
          )}
          <div className="studio-workspace">
            <section className="studio-editor-panel" aria-label="作品编辑区">
              <div className="studio-panel-heading">
                <h2>作品的规则</h2>
                <span>{selectedFile}</span>
              </div>
              <div className="studio-file-bar">
                {files.map((file) => (
                  <button
                    key={file.path}
                    className={selectedFile === file.path ? 'selected' : undefined}
                    onClick={() => assignSelectedFile(file.path)}
                  >
                    {file.path}
                  </button>
                ))}
              </div>
              <div className="studio-editor">
                {selectedFile.endsWith('.py') ? (
                  <CodeEditor key={selectedFile} modelValue={code} onUpdateModelValue={setCode} />
                ) : (
                  <textarea
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    aria-label="文本文件编辑器"
                    spellCheck={false}
                  ></textarea>
                )}
              </div>
              <details className="studio-files-tools">
                <summary>添加与整理文本文件</summary>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    addFile()
                  }}
                >
                  <input
                    value={filename}
                    onChange={(event) => setFilename(event.target.value)}
                    aria-label="新文件名"
                    placeholder="例如：角色台词.txt"
                  />
                  <button className="button secondary" type="submit">
                    添加文件
                  </button>
                </form>
                {selectedFile !== 'main.py' && (
                  <button className="studio-text-button" onClick={() => removeFile(selectedFile)}>
                    从草稿移除 {selectedFile}
                  </button>
                )}
                <p>所有文件只属于这份作品；main.py 是开场入口。</p>
              </details>
              <div className="studio-run-toolbar">
                <button
                  className="button primary"
                  disabled={state !== 'ready' || running}
                  onClick={() => void manualRun()}
                >
                  ▶ 运行我的作品
                </button>
                {running && (
                  <button className="button secondary" onClick={() => runner.stop()}>
                    ■ 停止试运行
                  </button>
                )}
                {state === 'loading' && <span role="status">{preparation}</span>}
                {runner.notice && <p role="status">{runner.notice}</p>}
                {state === 'failed' && (
                  <button className="button secondary" onClick={() => runner.retry()}>
                    重新准备 Python
                  </button>
                )}
              </div>
              {runnerFailure && (
                <p className="studio-alert" role="alert">
                  {runnerFailure}
                </p>
              )}
            </section>
            <section className="studio-preview-panel" aria-label="真实运行预览">
              <div className="studio-panel-heading">
                <h2>作品上场</h2>
                <span>{runOwner === 'candidate' ? '小奇建议的试演' : '我的草稿试演'}</span>
              </div>
              <div className="studio-stage">
                <SuccessBurst burstKey={burst} />
                <StagePreview events={stageEvents} scene={project.scene} />
              </div>
              {result?.drawings.length ? (
                <details open>
                  <summary>Python 画出的作品（{result.drawings.length} 个画笔动作）</summary>
                  <StoryPreview result={result} type="drawing" theme="forest" />
                </details>
              ) : null}
              <div className="studio-console">
                <div className="studio-section-title">
                  <strong>程序真的说了什么</strong>
                  {result && (
                    <span>{result.status === 'success' ? '已实际运行' : '本次运行未完成'}</span>
                  )}
                </div>
                <pre data-testid="studio-output">
                  {liveOutput ||
                    (result
                      ? '程序没有文字输出，舞台的变化在上面。'
                      : '点击运行，让作品开始说话。')}
                </pre>
                {liveError && (
                  <pre className="studio-error" data-testid="studio-error">
                    {liveError}
                  </pre>
                )}
                {state === 'waiting' && (
                  <form
                    className="studio-input"
                    onSubmit={(event) => {
                      event.preventDefault()
                      answerInput()
                    }}
                  >
                    <label>
                      程序在等你回答
                      <input
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        aria-label="回答创作室程序"
                        maxLength={4096}
                        autoFocus
                      />
                    </label>
                    <button className="button primary" type="submit">
                      发送回答
                    </button>
                    <button
                      className="studio-text-button"
                      type="button"
                      onClick={() => runner.submitInput('', true)}
                    >
                      结束输入
                    </button>
                  </form>
                )}
                {!!result?.files?.length && runOwner === 'draft' && (
                  <button className="studio-text-button" onClick={importOutputFiles}>
                    把运行产生的文本文件收进作品
                  </button>
                )}
              </div>
            </section>
            <section className="studio-companion" aria-label="小奇搭档">
              {lessonMode && (
                <Link className="studio-text-button" to={'/studio/' + project.id + '?mode=studio'}>
                  开启自由创作 →
                </Link>
              )}
              <div className="studio-companion-heading">
                <span className="studio-avatar" aria-hidden="true">
                  奇
                </span>
                <div>
                  <h2>小奇，陪你开工</h2>
                  <p role="status">{statusLabel}</p>
                </div>
                <span
                  className={'studio-online' + (connected ? ' connected' : '')}
                  title={connected ? '会话已连接' : '正在重新连接会话'}
                ></span>
              </div>
              {!tutor?.configured && (
                <p className="studio-model-notice">
                  小奇暂时还没连接。你可以先编辑、保存和运行作品，连接后再一起创作。
                </p>
              )}
              {snapshot?.capability === 'text' && (
                <p className="studio-model-notice">
                  这个模型正在使用解释与建议模式。小奇可以一起想办法，你可以手动编辑和运行作品。
                </p>
              )}
              <div className="studio-messages" aria-live="polite">
                {!snapshot?.messages.length && (
                  <div className="studio-welcome">
                    <strong>你来决定，作品怎么离谱。</strong>
                    <p>先运行一次，再告诉小奇你想改哪里。</p>
                  </div>
                )}
                {snapshot?.messages.map((message) => (
                  <article key={message.id} className={'studio-message ' + message.role}>
                    <small>{message.role === 'user' ? '我' : '小奇'}</small>
                    <p>{message.text}</p>
                  </article>
                ))}
              </div>
              {task?.error && (
                <p className="studio-alert" role="alert">
                  {task.error}
                </p>
              )}
              <div className="studio-task-controls">
                {thinking && (
                  <button className="button secondary" onClick={() => void taskAction('interrupt')}>
                    暂停小奇
                  </button>
                )}
                {task &&
                  ['suspended', 'interrupted'].includes(task.status) &&
                  tutor?.configured && (
                    <button className="button secondary" onClick={() => void taskAction('resume')}>
                      继续这一轮
                    </button>
                  )}
              </div>
              <form
                className="studio-message-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void sendMessage()
                }}
              >
                <div className="studio-intent-options" aria-label="选择小奇的帮助方式">
                  <button
                    type="button"
                    className={intent === 'think' ? 'selected' : undefined}
                    onClick={() => setIntent('think')}
                  >
                    陪我想
                  </button>
                  <button
                    type="button"
                    className={intent === 'edit' ? 'selected' : undefined}
                    onClick={() => setIntent('edit')}
                  >
                    陪我改
                  </button>
                  <button
                    type="button"
                    className={intent === 'build' ? 'selected' : undefined}
                    disabled={lessonMode}
                    onClick={() => setIntent('build')}
                  >
                    帮我做出来
                  </button>
                </div>
                {intent === 'build' ? (
                  <p className="studio-intent-note">
                    你选择让小奇写候选代码。先试演、看变化，再由你决定采用。
                  </p>
                ) : intent === 'think' ? (
                  <p className="studio-intent-note">一起想办法、找线索，先不改你的代码。</p>
                ) : (
                  <p className="studio-intent-note">小奇提出可运行的建议，你保留最后的决定。</p>
                )}
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  aria-label="告诉小奇你的想法"
                  placeholder="如果……会怎样？我想让它……"
                  maxLength={2000}
                  rows={3}
                ></textarea>
                <button
                  className="button primary"
                  type="submit"
                  disabled={
                    !question.trim() ||
                    !tutor?.configured ||
                    !snapshot ||
                    saving ||
                    sending ||
                    thinking ||
                    !!messageRetry
                  }
                >
                  {sending ? '正在交给小奇…' : '一起开工 →'}
                </button>
              </form>
              {messageRetry && (
                <p className="studio-alert">
                  这条想法还没有确认收到。{' '}
                  <button
                    className="studio-text-button"
                    disabled={sending}
                    onClick={() => void sendMessage(true)}
                  >
                    重试同一条消息
                  </button>
                </p>
              )}
            </section>
          </div>
          {executionFailure || unknownRuns.length || receiptRuns.length ? (
            <section className="studio-execution-notices">
              {executionFailure && <p role="alert">{executionFailure}</p>}
              {receiptRuns.map((pending) => (
                <div key={`receipt-${pending.requestId}`}>
                  <p>这次已经运行过，结果还没有确认保存。</p>
                  <button
                    className="button secondary"
                    disabled={running}
                    onClick={() => void retryExecution(pending)}
                  >
                    只补交运行结果
                  </button>
                </div>
              ))}
              {unknownRuns
                .filter(
                  (item) => !receiptRuns.some((receipt) => receipt.requestId === item.requestId),
                )
                .map((pending) => (
                  <div key={pending.requestId}>
                    <p>上一场试演中断了，结果还不确定。作品没有被覆盖。</p>
                    <button
                      className="button secondary"
                      disabled={running}
                      onClick={() => void retryExecution(pending)}
                    >
                      重新试演这个建议
                    </button>
                  </div>
                ))}
            </section>
          ) : null}
          {candidates.length > 0 && (
            <section className="studio-candidates">
              <div className="studio-section-title">
                <h2>小奇的建议，你来拍板</h2>
                <span>只改候选副本，采用前原作还在</span>
              </div>
              {candidates.map((candidate) => (
                <article key={candidate.id} className="studio-candidate">
                  <p>{candidate.explanation}</p>
                  <span className="studio-candidate-state">
                    {candidate.status === 'applied' ? '已采用' : '等待你决定'} ·{' '}
                    {candidateTrial(candidate)}
                  </span>
                  {candidateDiff(project, candidate.files).map((diff) => (
                    <div key={diff.path} className="studio-diff">
                      <h3>{diff.path}</h3>
                      <div>
                        <section>
                          <small>当前保存版本</small>
                          <pre>{diff.before || '（新文件）'}</pre>
                        </section>
                        <section>
                          <small>建议版本</small>
                          <pre>{diff.after || '（移除文件）'}</pre>
                        </section>
                      </div>
                    </div>
                  ))}
                  {candidate.baseRevision !== project.revision && candidate.status === 'pending' ? (
                    <p className="studio-alert">建议基于旧版本，需要重新共创。</p>
                  ) : null}
                  <div className="studio-candidate-actions">
                    {candidate.status === 'pending' && (
                      <button
                        className="button primary"
                        disabled={saving || running || candidate.baseRevision !== project.revision}
                        onClick={() => void candidateAction(candidate, 'apply')}
                      >
                        {applyLabel(candidate)}
                      </button>
                    )}
                    {candidate.status === 'pending' && (
                      <button
                        className="button secondary"
                        disabled={saving}
                        onClick={() => void candidateAction(candidate, 'reject')}
                      >
                        保留我的作品，拒绝建议
                      </button>
                    )}
                    {candidate.status === 'applied' && (
                      <button
                        className="button secondary"
                        disabled={saving || candidate.appliedRevision !== project.revision}
                        onClick={() => void candidateAction(candidate, 'undo')}
                      >
                        撤销这次采用
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {frameUrl && (
        <iframe
          ref={frameRef}
          src={frameUrl}
          className="runner-frame"
          sandbox="allow-scripts allow-same-origin"
          allow="cross-origin-isolated"
          title="作品 Python 隔离运行器"
          onLoad={runner.onFrameLoad}
        ></iframe>
      )}
      <Modal
        open={!!pendingDelete}
        title="确定要删除这件作品吗？"
        okText="删除"
        cancelText="先留着"
        okButtonProps={{ danger: true, disabled: saving }}
        cancelButtonProps={{ disabled: saving }}
        confirmLoading={saving}
        onOk={() => pendingDelete && void removeProject(pendingDelete)}
        onCancel={() => setPendingDelete(undefined)}
      >
        <p>《{pendingDelete?.title}》和它的历史版本都会被删掉，删除以后就找不回来了。</p>
      </Modal>
    </main>
  )
}
