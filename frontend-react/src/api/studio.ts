import { ApiError } from './client'
import { csrfHeaders, sessionExpired } from '../account/session'
import { validFiles } from '../studio/project'
import type {
  StudioProject,
  StudioSnapshot,
  RunExecution,
  StudioCandidate,
  StudySession,
  StudioTask,
  ProjectVersion,
} from '../studio-types'

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const strings = (v: Record<string, unknown>, keys: string[]) =>
  keys.every((key) => typeof v[key] === 'string')
export function validProject(v: unknown): v is StudioProject {
  return (
    object(v) &&
    strings(v, ['id', 'title', 'createdAt', 'updatedAt']) &&
    ['milk-tea', 'free'].includes(String(v.scene)) &&
    Number.isSafeInteger(v.revision) &&
    Number(v.revision) > 0 &&
    validFiles(v.files) &&
    object(v.preferences) &&
    Array.isArray(v.preferences.favoriteThemes) &&
    v.preferences.favoriteThemes.every((i) => typeof i === 'string') &&
    typeof v.preferences.humor === 'string'
  )
}
export function validCandidate(v: unknown): v is StudioCandidate {
  return (
    object(v) &&
    strings(v, ['id', 'projectId', 'explanation', 'createdAt']) &&
    Number.isSafeInteger(v.baseRevision) &&
    validFiles(v.files) &&
    ['pending', 'applied', 'rejected'].includes(String(v.status))
  )
}
export function validSession(v: unknown): v is StudySession {
  return (
    object(v) &&
    strings(v, ['id', 'projectId', 'createdAt']) &&
    ['milk-tea', 'free'].includes(String(v.scene)) &&
    ['lesson', 'studio'].includes(String(v.mode))
  )
}
export function validTask(v: unknown): v is StudioTask {
  return (
    object(v) &&
    strings(v, ['commandId', 'turnId', 'status']) &&
    [
      'queued',
      'starting',
      'running',
      'completed',
      'suspended',
      'interrupted',
      'failed',
      'cancelled',
    ].includes(String(v.status))
  )
}
export function validSnapshot(v: unknown): v is StudioSnapshot {
  return (
    object(v) &&
    validSession(v.session) &&
    Number.isSafeInteger(v.cursor) &&
    Number(v.cursor) >= 0 &&
    Array.isArray(v.messages) &&
    v.messages.every(
      (m) =>
        object(m) && strings(m, ['id', 'text']) && ['user', 'assistant'].includes(String(m.role)),
    ) &&
    Array.isArray(v.tasks) &&
    v.tasks.every(validTask) &&
    Array.isArray(v.candidates) &&
    v.candidates.every(validCandidate) &&
    Array.isArray(v.pendingRuns) &&
    v.pendingRuns.every(
      (r) =>
        object(r) &&
        strings(r, ['requestId', 'toolCallId', 'candidateId']) &&
        validFiles(r.files) &&
        ['waiting-runner', 'running', 'completed', 'unknown'].includes(String(r.status)),
    ) &&
    object(v.budget) &&
    [
      'modelCalls',
      'activeMs',
      'repairAttempts',
      'limitCalls',
      'limitActiveMs',
      'limitRepairs',
    ].every((key) => typeof (v.budget as Record<string, unknown>)[key] === 'number')
  )
}
export function validExecution(v: unknown): v is RunExecution {
  return (
    object(v) &&
    strings(v, ['id', 'requestId', 'candidateId']) &&
    ['running', 'completed', 'unknown'].includes(String(v.status)) &&
    validFiles(v.files)
  )
}
export async function studioRequest<T>(
  url: string,
  options: RequestInit = {},
  validate: (v: unknown) => boolean = object,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${url}`, {
      signal: AbortSignal.timeout(20000),
      ...options,
      credentials: 'same-origin',
      headers: csrfHeaders({ 'Content-Type': 'application/json', ...options.headers }),
    })
  } catch {
    throw new ApiError(0, 'OFFLINE', '小镇服务暂时没接上。草稿还在，接上后可以重试。')
  }
  if (!response.ok) {
    if (response.status === 401) sessionExpired()
    const detail = await response.json().catch(() => ({}))
    throw new ApiError(
      response.status,
      detail.code ?? 'REQUEST_FAILED',
      detail.message ?? '这次操作没有完成，请重试。',
    )
  }
  const value: unknown = await response.json().catch(() => undefined)
  if (!validate(value))
    throw new ApiError(502, 'INVALID_RESPONSE', '服务返回的数据不完整，草稿已保留。请重新连接。')
  return value as T
}
export const studioPost = <T>(
  path: string,
  body: unknown = {},
  validate?: (v: unknown) => boolean,
) => studioRequest<T>(path, { method: 'POST', body: JSON.stringify(body) }, validate)
export const projectList = () =>
  studioRequest<StudioProject[]>('/projects', {}, (v) => Array.isArray(v) && v.every(validProject))
export const getProject = (id: string) =>
  studioRequest<StudioProject>(`/projects/${encodeURIComponent(id)}`, {}, validProject)
export const versions = (id: string) =>
  studioRequest<ProjectVersion[]>(
    `/projects/${encodeURIComponent(id)}/versions`,
    {},
    (v) =>
      Array.isArray(v) &&
      v.every(
        (i) =>
          object(i) &&
          typeof i.title === 'string' &&
          Number.isSafeInteger(i.revision) &&
          validFiles(i.files),
      ),
  )

/** 原生 EventSource 保留持续会话；只消费完整快照，不重发用户命令。 */
export function connectStudioEvents(
  sessionId: string,
  cursor: number,
  onSnapshot: (s: StudioSnapshot) => void,
  onConnection: (connected: boolean) => void,
) {
  const source = new EventSource(
    `/api/study-sessions/${encodeURIComponent(sessionId)}/events?cursor=${cursor}`,
  )
  source.onopen = () => onConnection(true)
  source.onerror = () => onConnection(false)
  let latest = cursor
  let lastSnapshot = ''
  source.addEventListener('snapshot', (event) => {
    try {
      const value: unknown = JSON.parse((event as MessageEvent).data)
      if (
        validSnapshot(value) &&
        value.session.id === sessionId &&
        value.cursor >= latest &&
        (event as MessageEvent).data !== lastSnapshot
      ) {
        latest = value.cursor
        lastSnapshot = (event as MessageEvent).data
        onSnapshot(value)
      }
    } catch {
      onConnection(false)
    }
  })
  return () => source.close()
}
