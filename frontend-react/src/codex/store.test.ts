import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccess } from './api'
import { useCodexStore } from './store'
import type { Conversation } from './types'
const conversation: Conversation = {
  id: 'chat',
  projectId: 'project',
  workspaceId: 'workspace',
  title: '测试会话',
  modelId: 'test',
  reasoningEffort: 'high',
  permissionMode: 'auto',
  planMode: false,
  maxTokens: 10000,
  maxActiveMs: 60000,
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-11T00:00:00Z',
  archived: false,
  pinned: false,
}
beforeEach(() => {
  // Zustand 是全局单例，等价于原来每个用例新建 Pinia 实例。
  useCodexStore.getState().disconnect()
  useCodexStore.setState({
    initialized: false,
    loading: false,
    busy: false,
    error: '',
    notice: '',
    capabilities: undefined,
    projects: [],
    workspaces: [],
    conversations: [],
    selectedProjectId: '',
    selectedWorkspaceId: '',
    conversation: undefined,
    messages: [],
    runs: [],
    interactions: [],
    activities: [],
    eventLog: [],
    cursor: '',
    usage: { tokens: 0, activeMs: 0 },
    goals: [],
    plan: undefined,
    artifacts: [],
    sources: [],
    subagents: [],
    plugins: [],
    skills: [],
    memories: [],
    automations: [],
    attachments: [],
    draft: '',
    newSettings: { permissionMode: 'auto', planMode: false },
    connection: 'offline',
  })
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
})
afterEach(() => {
  useCodexStore.getState().disconnect()
  clearAccess()
  vi.unstubAllGlobals()
})
function responses(onRun?: (body: Record<string, unknown>) => Response) {
  return vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path.endsWith('/bootstrap'))
      return Response.json({
        token: 'local-test',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      })
    if (path.endsWith('/runs'))
      return (
        onRun?.(JSON.parse(String(init.body))) ??
        Response.json({ executionId: 'execution', status: 'queued' })
      )
    if (path.includes('/events?'))
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })
    if (path.endsWith('/snapshot'))
      return Response.json({
        conversation,
        cursor: 'saved-cursor',
        messages: [],
        runs: [],
        pendingInteractions: [],
        usage: { tokens: 0, activeMs: 0 },
        goals: [],
      })
    if (path.endsWith('/workspaces'))
      return Response.json([
        {
          id: 'workspace',
          projectId: 'project',
          path: 'test-only',
          mode: 'worktree',
          environment: 'host',
        },
      ])
    if (path === '/api/v1/conversations' && init.method === 'POST')
      return Response.json(conversation)
    return Response.json({})
  })
}
describe('Codex durable UI state', () => {
  it('starts and restores an independent chat without querying a user project', async () => {
    const independent = { ...conversation, projectId: '', workspaceId: 'scratch' }
    const requests: string[] = []
    let createBody: Record<string, unknown> = {}
    const transport = responses()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init: RequestInit = {}) => {
        requests.push(path)
        if (path === '/api/v1/conversations' && init.method === 'POST') {
          createBody = JSON.parse(String(init.body))
          return Response.json(independent)
        }
        if (path.endsWith('/snapshot'))
          return Response.json({
            conversation: independent,
            cursor: 'saved-cursor',
            messages: [],
            runs: [],
            pendingInteractions: [],
            usage: { tokens: 0, activeMs: 0 },
            goals: [],
          })
        if (path.endsWith('/workspaces/scratch'))
          return Response.json({
            id: 'scratch',
            projectId: '',
            mode: 'scratch',
            environment: 'host',
            path: 'private-directory',
          })
        return transport(path, init)
      }),
    )
    await useCodexStore.getState().newConversation()
    expect(createBody.projectId).toBeUndefined()
    expect(createBody.workspaceId).toBeUndefined()
    expect(useCodexStore.getState().selectedProjectId).toBe('')
    expect(useCodexStore.getState().selectedWorkspaceId).toBe('scratch')
    expect(requests.some((path) => path.includes('/projects/'))).toBe(false)
    await useCodexStore.getState().selectConversation(independent.id)
    expect(useCodexStore.getState().workspaces[0]?.id).toBe('scratch')
  })

  it('creates a durable conversation before uploading attachments and preserves the existing draft', async () => {
    const transport = responses()
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init: RequestInit = {}) => {
        calls.push(path)
        if (path.endsWith('/attachments')) {
          expect((init.body as FormData).get('conversationId')).toBe('chat')
          return Response.json({ id: 'file', name: 'context.txt', mimeType: 'text/plain' })
        }
        return transport(path, init)
      }),
    )
    useCodexStore.setState({
      selectedProjectId: 'project',
      selectedWorkspaceId: 'workspace',
      draft: '先保留我的要求',
    })
    const store = useCodexStore.getState()
    await store.attach([new File(['测试内容'], 'context.txt', { type: 'text/plain' })])
    const state = useCodexStore.getState()
    expect(state.draft).toBe('先保留我的要求')
    expect(state.attachments[0]?.id).toBe('file')
    expect(calls.indexOf('/api/v1/conversations')).toBeLessThan(
      calls.indexOf('/api/v1/codex/attachments'),
    )
  })
  it('supplies an explicit context request for attachment-only messages', async () => {
    let command: Record<string, unknown> = {}
    vi.stubGlobal(
      'fetch',
      responses((body) => {
        command = body
        return Response.json({ executionId: 'execution', status: 'queued' })
      }),
    )
    useCodexStore.setState({
      conversation,
      attachments: [{ id: 'file', name: 'context.txt', mimeType: 'text/plain' }],
    })
    await useCodexStore.getState().send()
    expect(String(command.text)).toContain('查看这些附件')
  })
  it('keeps a draft and attachments when the first send creates a conversation', async () => {
    let command: Record<string, unknown> = {}
    vi.stubGlobal(
      'fetch',
      responses((body) => {
        command = body
        return Response.json({ executionId: 'execution', status: 'queued' })
      }),
    )
    useCodexStore.setState({
      selectedProjectId: 'project',
      selectedWorkspaceId: 'workspace',
      draft: '保留这段首条消息',
      attachments: [{ id: 'image', name: '截图.png', mimeType: 'image/png' }],
    })
    await useCodexStore.getState().send()
    expect(command.text).toBe('保留这段首条消息')
    expect(command.attachments).toEqual([{ id: 'image', name: '截图.png', mimeType: 'image/png' }])
    const state = useCodexStore.getState()
    expect(state.draft).toBe('')
    expect(state.attachments).toEqual([])
  })
  it('reuses a clientRequestId after uncertain submission failure', async () => {
    const ids: unknown[] = []
    vi.stubGlobal(
      'fetch',
      responses((body) => {
        ids.push(body.clientRequestId)
        if (ids.length === 1) throw new TypeError('Network interrupted')
        return Response.json({ executionId: 'execution', status: 'queued' })
      }),
    )
    useCodexStore.setState({ conversation, draft: '同一个任务' })
    await expect(useCodexStore.getState().send()).rejects.toThrow('Network interrupted')
    await useCodexStore.getState().send()
    expect(ids[0]).toBe(ids[1])
  })
  it('restores by snapshot and event cursor without starting another execution', async () => {
    const fetch = responses()
    vi.stubGlobal('fetch', fetch)
    await useCodexStore.getState().selectConversation('chat')
    await Promise.resolve()
    expect(fetch.mock.calls.some(([path]) => path.includes('/events?after=saved-cursor'))).toBe(
      true,
    )
    expect(fetch.mock.calls.some(([path]) => path.endsWith('/runs'))).toBe(false)
  })
  it('applies wrapped AG-UI interaction, plan and status events without conflating approval and plan', () => {
    useCodexStore.setState({
      conversation: { ...conversation },
      runs: [{ executionId: 'run', status: 'running' }],
    })
    const store = useCodexStore.getState()
    store.acceptEvent({
      id: '1',
      data: {
        type: 'CUSTOM',
        name: 'codex.interaction',
        value: {
          version: 1,
          interaction: {
            id: 'approve',
            kind: 'approval',
            toolName: 'shell',
            arguments: { command: 'test' },
          },
        },
      },
    })
    store.acceptEvent({
      id: '2',
      data: {
        type: 'CUSTOM',
        name: 'codex.plan',
        value: {
          version: 1,
          plan: { title: '真实计划', steps: [{ id: 'step', title: '验证', status: 'pending' }] },
        },
      },
    })
    store.acceptEvent({
      id: '3',
      data: {
        type: 'CUSTOM',
        name: 'codex.status',
        value: { version: 1, status: 'waiting', executionId: 'run' },
      },
    })
    const state = useCodexStore.getState()
    expect(state.interactions[0]?.id).toBe('approve')
    expect(state.plan?.title).toBe('真实计划')
    expect(state.runs.at(-1)?.status).toBe('waiting')
    expect(state.conversation?.permissionMode).toBe('auto')
    expect(state.conversation?.planMode).toBe(false)
  })
  it('uses native token totals and keeps a persistent goal active when a task segment ends', () => {
    useCodexStore.setState({
      goals: [{ id: 'goal', conversationId: 'chat', title: '持续目标', status: 'active' }],
    })
    useCodexStore.getState().acceptEvent({
      id: 'usage',
      data: {
        type: 'CUSTOM',
        name: 'token_usage',
        value: { cumulative: { totalTokens: 42 }, delta: { totalTokens: 7 } },
      },
    })
    const state = useCodexStore.getState()
    expect(state.usage.tokens).toBe(42)
    expect(state.goals[0]?.status).toBe('active')
  })
  it('does not use an AG-UI segment id as a durable execution id or mark suspended turns completed', () => {
    useCodexStore.setState({ runs: [{ executionId: 'durable-execution', status: 'running' }] })
    useCodexStore
      .getState()
      .acceptEvent({ id: 'started', data: { type: 'RUN_STARTED', runId: 'ui-segment' } })
    expect(useCodexStore.getState().runs).toHaveLength(1)
    expect(useCodexStore.getState().runs[0]?.executionId).toBe('durable-execution')
    useCodexStore.setState({ runs: [{ executionId: 'durable-execution', status: 'suspended' }] })
    useCodexStore
      .getState()
      .acceptEvent({ id: 'ended', data: { type: 'RUN_FINISHED', runId: 'ui-segment' } })
    expect(useCodexStore.getState().runs[0]?.status).toBe('suspended')
  })
})
