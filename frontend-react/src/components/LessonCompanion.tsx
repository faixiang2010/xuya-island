import { newId } from '../shared/id'
import { accountStorage } from '../account/session'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot } from 'lucide-react'
import { request } from '../api/client'
import {
  connectStudioEvents,
  getProject,
  studioPost,
  studioRequest,
  validProject,
  validSession,
  validSnapshot,
  validTask,
} from '../api/studio'
import type { StudioProject, StudioSnapshot, StudySession } from '../studio-types'
import type { RunResult, TutorStatus } from '../types'
import { studioResult } from '../studio/project'
import styles from './LessonCompanion.module.css'

interface Props {
  episodeId: string
  title: string
  code: string
  executedCode: string
  result?: RunResult
  onDemonstration: (projectId: string) => void
}

interface CompanionCommand {
  clientRequestId: string
  question: string
  intent: 'think'
  explicitBuild: false
}

export default function LessonCompanion({
  episodeId,
  title,
  code,
  executedCode,
  result,
  onDemonstration,
}: Props) {
  const [tutor, setTutor] = useState<TutorStatus>()
  const [question, setQuestion] = useState('')
  const [failure, setFailure] = useState('')
  const [sending, setSending] = useState(false)
  const [snapshot, setSnapshot] = useState<StudioSnapshot>()
  const projectRef = useRef<StudioProject | undefined>(undefined)
  const sessionRef = useRef<StudySession | undefined>(undefined)
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined)
  const aliveRef = useRef(true)
  const commandRef = useRef<CompanionCommand | undefined>(undefined)
  const commandKey = `xuya:adventure:companion-command:${episodeId}`
  const task = snapshot?.tasks.at(-1)
  const thinking = sending || ['queued', 'starting', 'running'].includes(task?.status ?? '')

  async function prepare() {
    const key = `xuya:adventure:companion:${episodeId}`
    let project = projectRef.current
    const saved = accountStorage.getItem(key)
    if (!project && saved) {
      try {
        project = await getProject(saved)
      } catch (error) {
        if (!(error instanceof Error) || !('status' in error) || error.status !== 404) throw error
      }
    }
    if (!project) {
      project = await studioPost<StudioProject>(
        '/projects',
        {
          title: `${title} · 小奇示范副本`,
          scene: 'milk-tea',
          lessonId: episodeId,
          files: [{ path: 'main.py', content: code }],
        },
        validProject,
      )
      accountStorage.setItem(key, project.id)
    } else if (project.files[0]?.content !== code) {
      project = await studioRequest<StudioProject>(
        `/projects/${project.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            title: project.title,
            revision: project.revision,
            files: [{ path: 'main.py', content: code }],
            preferences: project.preferences,
          }),
        },
        validProject,
      )
    }
    let session = sessionRef.current
    if (!session) {
      const sessions = await studioRequest<StudySession[]>(
        `/study-sessions?projectId=${encodeURIComponent(project.id)}`,
        {},
        (v) => Array.isArray(v) && v.every(validSession),
      )
      session =
        sessions.find((value) => value.mode === 'lesson') ??
        (await studioPost<StudySession>(
          '/study-sessions',
          { projectId: project.id, scene: 'milk-tea', lessonId: episodeId, mode: 'lesson' },
          validSession,
        ))
      const current = await studioRequest<StudioSnapshot>(
        `/study-sessions/${session.id}/snapshot`,
        {},
        validSnapshot,
      )
      if (aliveRef.current) {
        setSnapshot(current)
        unsubscribeRef.current = connectStudioEvents(
          session.id,
          current.cursor,
          (next) => {
            if (aliveRef.current) setSnapshot(next)
          },
          () => {},
        )
      }
    }
    projectRef.current = project
    sessionRef.current = session
    return { project, session }
  }

  async function ask(retry = false) {
    if (!tutor?.configured || thinking || (!retry && !question.trim())) return
    setSending(true)
    setFailure('')
    try {
      if (!retry)
        commandRef.current = {
          clientRequestId: newId(),
          question: question.trim(),
          intent: 'think',
          explicitBuild: false,
        }
      const context = await prepare()
      accountStorage.setItem(commandKey, JSON.stringify(commandRef.current))
      if (result && executedCode && !retry) {
        await studioPost(`/projects/${context.project.id}/runs`, {
          files: [{ path: 'main.py', content: executedCode }],
          result: studioResult(result),
        })
      }
      await studioPost(
        `/study-sessions/${context.session.id}/messages`,
        commandRef.current,
        validTask,
      )
      accountStorage.removeItem(commandKey)
      commandRef.current = undefined
      setQuestion('')
      if (aliveRef.current)
        setSnapshot(
          await studioRequest(`/study-sessions/${context.session.id}/snapshot`, {}, validSnapshot),
        )
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '小奇这次没有连上，固定线索仍然可以用。')
    } finally {
      setSending(false)
    }
  }

  async function demonstration() {
    setSending(true)
    try {
      onDemonstration((await prepare()).project.id)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '示范副本没有打开，草稿还在。')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    void request<TutorStatus>('/tutor/status')
      .then((value) => {
        if (aliveRef.current) setTutor(value)
      })
      .catch(() => {})
    void (async () => {
      try {
        const saved = accountStorage.getItem(`xuya:adventure:companion:${episodeId}`)
        if (!saved) return
        const value = await getProject(saved)
        const sessions = await studioRequest<StudySession[]>(
          `/study-sessions?projectId=${encodeURIComponent(value.id)}`,
          {},
          (v) => Array.isArray(v) && v.every(validSession),
        )
        const existing = sessions.find((item) => item.mode === 'lesson')
        if (!aliveRef.current || !existing) return
        projectRef.current = value
        sessionRef.current = existing
        const current = await studioRequest<StudioSnapshot>(
          `/study-sessions/${existing.id}/snapshot`,
          {},
          validSnapshot,
        )
        if (!aliveRef.current) return
        setSnapshot(current)
        unsubscribeRef.current = connectStudioEvents(
          existing.id,
          current.cursor,
          (next) => {
            if (aliveRef.current) setSnapshot(next)
          },
          () => {},
        )
        const pending = JSON.parse(accountStorage.getItem(commandKey) ?? 'null')
        if (
          pending &&
          typeof pending.clientRequestId === 'string' &&
          typeof pending.question === 'string' &&
          pending.intent === 'think' &&
          pending.explicitBuild === false
        ) {
          commandRef.current = pending
          setFailure('找回了尚未确认收据的问题；可以重试同一个问题。')
        }
      } catch {
        /* 读取历史失败不发命令，不妨碍故事和固定提示。 */
      }
    })()
    return () => {
      aliveRef.current = false
      unsubscribeRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void ask()
  }

  return (
    <div className={styles['lesson-companion']}>
      <h3>
        <Bot size={22} aria-hidden="true" />
        想让小奇一起调查？
      </h3>
      {!tutor?.configured && (
        <p className="muted">小奇暂时没接上模型。上面的三层线索、故事和运行照常可用。</p>
      )}
      {tutor?.configured && (
        <>
          <p>小奇会看这份代码和真实运行记录，先陪你找线索。</p>
          {(snapshot?.messages ?? []).map((message) => (
            <div key={message.id} className={styles['adventure-hint']}>
              <strong>{message.role === 'user' ? '我' : '小奇'}：</strong> {message.text}
            </div>
          ))}
          {thinking && <p role="status">小奇正在看代码、找线索…</p>}
          <form onSubmit={submit}>
            <label>
              告诉小奇你发现了什么
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                aria-label="问课堂小奇"
                maxLength={1500}
                rows={2}
                placeholder="我换了顺序，为什么还是漏奶？"
              />
            </label>
            <button className="button secondary" disabled={thinking || !question.trim()}>
              陪我找线索
            </button>
          </form>
        </>
      )}
      {failure && <p role="alert">{failure}</p>}
      {commandRef.current && failure && (
        <button className="button secondary" disabled={thinking} onClick={() => void ask(true)}>
          重试同一个问题
        </button>
      )}
      <button className="button ghost" disabled={thinking} onClick={() => void demonstration()}>
        打开小奇的独立示范副本 →
      </button>
      <p className="muted">副本在创作室中试演，你的课堂代码继续留在这里。</p>
    </div>
  )
}
