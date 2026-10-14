import { newId } from '../shared/id'
import type { Capabilities, ModelProfile, StreamEvent } from './types'
import { csrfHeaders, sessionExpired } from '../account/session'

export class ApiError extends Error {
  constructor(
    public status: number,
    public problem: Record<string, unknown>,
  ) {
    super(String(problem.detail || problem.message || problem.title || `请求失败 (${status})`))
    this.name = 'ApiError'
  }
}
let access: { token: string; expiresAt: string } | undefined
let bootstrap: Promise<string> | undefined
const prefix = '/api/v1'
export function requestId() {
  return newId()
}
export function clearAccess() {
  access = undefined
  bootstrap = undefined
}
export async function accessToken(): Promise<string> {
  if (access && Date.parse(access.expiresAt) > Date.now() + 15_000) return access.token
  if (!bootstrap)
    bootstrap = (async () => {
      const response = await fetch(`${prefix}/codex/access/bootstrap`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: '{}',
      })
      if (!response.ok) throw await failure(response)
      access = await response.json()
      if (!access?.token) throw new Error('本机访问凭证没有返回，请检查受信来源配置。')
      return access.token
    })().finally(() => {
      bootstrap = undefined
    })
  return bootstrap
}
async function failure(response: Response) {
  let problem: Record<string, unknown> = {}
  try {
    problem = await response.json()
  } catch {
    problem = { detail: response.statusText }
  }
  return new ApiError(response.status, problem)
}
export async function authorizedFetch(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const token = await accessToken()
  const headers = csrfHeaders(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(path.startsWith('/api/') ? path : `${prefix}${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
  })
  if (response.status === 401 && retry) {
    clearAccess()
    return authorizedFetch(path, init, false)
  }
  if (!response.ok) throw await failure(response)
  return response
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await authorizedFetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (response.status === 204) return undefined as T
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}
export async function readCapabilities(): Promise<Capabilities> {
  let raw: Record<string, unknown>
  try {
    raw = await api('/capabilities')
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error
    raw = await api('/agents/capabilities')
  }
  const models = ((raw.models ?? []) as Record<string, unknown>[]).map(
    (model) =>
      ({
        id: String(model.id || model.name),
        name: String(model.name || model.id),
        provider: String(model.provider || ''),
        reasoningEfforts: Array.isArray(model.reasoningEfforts)
          ? model.reasoningEfforts.map(String)
          : [],
        vision: Boolean(model.vision ?? model.supportsImages),
        audio: Boolean(model.audio),
        configured: Boolean(model.configured),
      }) satisfies ModelProfile,
  )
  return {
    agentId: String(raw.agentId || 'codex'),
    configured: Boolean(raw.configured ?? models.some((model) => model.configured)),
    models,
    features: (raw.features || raw) as Capabilities['features'],
    defaults: (raw.defaults as Capabilities['defaults']) || {
      permissionMode: 'auto',
      maxTokens: 100000,
      maxActiveMs: 1800000,
    },
    protocols: Array.isArray(raw.protocols) ? raw.protocols.map(String) : [],
  }
}
export async function uploadAttachment(file: File, conversationId?: string) {
  const data = new FormData()
  data.append('file', file)
  if (conversationId) data.append('conversationId', conversationId)
  const response = await authorizedFetch('/codex/attachments', { method: 'POST', body: data })
  return response.json()
}
export async function download(path: string, name: string) {
  const response = await authorizedFetch(path)
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
/** 网络分块不等于事件边界：缓存半条事件，兼容 CRLF、多行 data 和 SSE 注释。 */
export function createSseDecoder(onEvent: (event: StreamEvent) => void) {
  let buffer = ''
  return (chunk: string, flush = false) => {
    buffer += chunk
    buffer = buffer.replace(/\r\n/g, '\n')
    let boundary: number
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      let id: string | undefined
      let event: string | undefined
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue
        const colon = line.indexOf(':')
        const field = colon < 0 ? line : line.slice(0, colon)
        const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
        if (field === 'id') id = value
        if (field === 'event') event = value
        if (field === 'data') data.push(value)
      }
      if (data.length) {
        try {
          onEvent({ id, event, data: JSON.parse(data.join('\n')) })
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error
        }
      }
    }
    if (flush && buffer.trim()) {
      const pending = buffer
      buffer = ''
      return pending
    }
  }
}
export async function streamEvents(
  path: string,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
) {
  const response = await authorizedFetch(path, { signal, headers: { Accept: 'text/event-stream' } })
  if (!response.body) throw new Error('浏览器没有提供事件流。')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const accept = createSseDecoder(onEvent)
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) {
        accept(decoder.decode(), true)
        break
      }
      accept(decoder.decode(value, { stream: true }))
    }
  } finally {
    reader.releaseLock()
  }
}
