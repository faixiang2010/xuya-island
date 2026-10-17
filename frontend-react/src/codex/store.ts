import { accountStorage } from '../account/session'
import { create } from 'zustand'
import { api, readCapabilities, requestId, streamEvents, uploadAttachment } from './api'
import type {
  Attachment,
  Automation,
  Capabilities,
  Conversation,
  Execution,
  Goal,
  Interaction,
  Message,
  Plan,
  Project,
  ResourceRecord,
  Snapshot,
  StreamEvent,
  ToolActivity,
  Workspace,
  AgentSchemas,
  CodexSchemas,
  WorkspaceCreateRequest,
} from './types'

const adult = '/codex'
const asText = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2)
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

export type CodexConnection = 'offline' | 'connecting' | 'live' | 'retrying'

export interface CodexState {
  initialized: boolean
  loading: boolean
  switching: boolean
  busy: boolean
  error: string
  notice: string
  capabilities?: Capabilities
  projects: Project[]
  workspaces: Workspace[]
  conversations: Conversation[]
  selectedProjectId: string
  selectedWorkspaceId: string
  conversation?: Conversation
  messages: Message[]
  runs: Execution[]
  interactions: Interaction[]
  activities: ToolActivity[]
  eventLog: StreamEvent[]
  cursor: string
  usage: { tokens: number; activeMs: number }
  goals: Goal[]
  plan?: Plan
  artifacts: ResourceRecord[]
  sources: ResourceRecord[]
  subagents: ResourceRecord[]
  plugins: ResourceRecord[]
  skills: ResourceRecord[]
  memories: ResourceRecord[]
  automations: Automation[]
  attachments: Attachment[]
  draft: string
  newSettings: Partial<Conversation>
  connection: CodexConnection
  perform: <T>(task: () => Promise<T>) => Promise<T | undefined>
  initialize: () => Promise<void>
  refreshProjects: () => Promise<void>
  selectProject: (id: string) => Promise<void>
  selectWorkspace: (id: string) => void
  clearConversation: () => void
  registerProject: (name: string, path: string, mode: string) => Promise<Project>
  createWorkspace: (settings: {
    mode: string
    baseRef?: string
    environment: string
    dockerImage?: string
  }) => Promise<Workspace>
  newConversation: (title?: string) => Promise<Conversation>
  selectConversation: (id: string) => Promise<void>
  refreshSnapshot: () => Promise<void>
  updateConversation: (
    id: string,
    changes: AgentSchemas['ConversationPatch'],
  ) => Promise<Conversation>
  deleteConversation: (id: string) => Promise<void>
  disconnect: () => void
  connect: (id?: string) => void
  acceptEvent: (event: StreamEvent) => void
  configure: (settings: Partial<Conversation>) => Promise<void>
  send: () => Promise<void>
  action: (action: 'steer' | 'interrupt' | 'cancel' | 'resume', text?: string) => Promise<void>
  respond: (interaction: Interaction, payload: Record<string, unknown>) => Promise<void>
  attach: (files: File[]) => Promise<void>
  savePlan: (nextPlan: Plan) => Promise<void>
  createGoal: (title: string, maxTokens: number, maxActiveMs: number) => Promise<void>
  updateGoal: (
    id: string,
    status: string,
    limits?: { maxTokens: number; maxActiveMs: number },
  ) => Promise<void>
  loadSection: (section: string) => Promise<void>
  setDraft: (draft: string) => void
  setNewSettings: (settings: Partial<Conversation>) => void
}

export const useCodexStore = create<CodexState>((set, get) => {
  let streamAbort: AbortController | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let switchGeneration = 0
  let pendingSend: { fingerprint: string; id: string } | undefined

  function upsert<T extends { id?: string }>(items: T[], value: Record<string, unknown>): T[] {
    if (!value.id) return items
    const index = items.findIndex((i) => i.id === value.id)
    if (index >= 0) {
      const next = [...items]
      next[index] = value as T
      return next
    }
    return [...items, value as T]
  }

  async function perform<T>(task: () => Promise<T>): Promise<T | undefined> {
    set({ error: '', busy: true })
    try {
      return await task()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '操作失败，请重试。' })
      return undefined
    } finally {
      set({ busy: false })
    }
  }

  async function initialize() {
    if (get().initialized || get().loading) return
    set({ loading: true, error: '' })
    try {
      const [caps, registered, chats] = await Promise.all([
        readCapabilities(),
        api<Project[]>(`${adult}/projects`),
        api<Conversation[]>('/conversations'),
      ])
      set({ capabilities: caps, projects: registered, conversations: chats, initialized: true })
      const last = accountStorage.getItem('xuya.codex.conversation')
      const active =
        last === ''
          ? undefined
          : (chats.find((c) => c.id === last && !c.archived) ?? chats.find((c) => !c.archived))
      if (active) await selectConversation(active.id)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '码穹本机服务没有连接。' })
    } finally {
      set({ loading: false })
    }
  }

  async function refreshProjects() {
    set({ projects: await api<Project[]>(`${adult}/projects`) })
  }

  async function selectProject(id: string) {
    const current = get().conversation
    if (current && current.projectId !== id) clearConversation()
    set({ selectedProjectId: id, selectedWorkspaceId: '' })
    if (!id) {
      set({ workspaces: [] })
      return
    }
    const workspaces = await api<Workspace[]>(
      `${adult}/projects/${encodeURIComponent(id)}/workspaces`,
    )
    if (get().selectedProjectId !== id) return
    const stored = accountStorage.getItem(`xuya.codex.workspace.${id}`)
    set({
      workspaces,
      selectedWorkspaceId: workspaces.find((w) => w.id === stored)?.id ?? workspaces[0]?.id ?? '',
    })
  }

  function selectWorkspace(id: string) {
    const { conversation, selectedProjectId } = get()
    if (conversation && conversation.workspaceId !== id) clearConversation()
    set({ selectedWorkspaceId: id })
    if (selectedProjectId) accountStorage.setItem(`xuya.codex.workspace.${selectedProjectId}`, id)
  }

  function clearConversation() {
    ++switchGeneration
    disconnect()
    set({
      conversation: undefined,
      messages: [],
      runs: [],
      interactions: [],
      activities: [],
      goals: [],
      plan: undefined,
      artifacts: [],
      sources: [],
      subagents: [],
      cursor: '',
    })
  }

  async function registerProject(name: string, path: string, mode: string) {
    const created = await api<Project>(`${adult}/projects`, 'POST', {
      name,
      path,
      mode,
    } satisfies CodexSchemas['CodexProjectRegister'])
    await refreshProjects()
    await selectProject(created.id)
    return created
  }

  async function createWorkspace(settings: {
    mode: string
    baseRef?: string
    environment: string
    dockerImage?: string
  }) {
    if (!get().selectedProjectId) throw new Error('请先注册一个项目。')
    const created = await api<Workspace>(
      `${adult}/projects/${get().selectedProjectId}/workspaces`,
      'POST',
      settings satisfies WorkspaceCreateRequest,
    )
    set((state) => ({ workspaces: [...state.workspaces, created] }))
    selectWorkspace(created.id)
    return created
  }

  async function newConversation(title?: string) {
    const { selectedProjectId, selectedWorkspaceId, capabilities, newSettings } = get()
    if (selectedProjectId && !selectedWorkspaceId) throw new Error('请先选择项目并创建隔离工作区。')
    const defaults = capabilities?.defaults
    const configured = capabilities?.models.find((m) => m.configured)
    const created = await api<Conversation>('/conversations', 'POST', {
      projectId: selectedProjectId || undefined,
      workspaceId: selectedProjectId ? selectedWorkspaceId : undefined,
      title,
      modelId: newSettings.modelId || configured?.id,
      reasoningEffort: newSettings.reasoningEffort || configured?.reasoningEfforts[0],
      permissionMode: newSettings.permissionMode ?? defaults?.permissionMode ?? 'auto',
      planMode: newSettings.planMode ?? false,
      maxTokens: defaults?.maxTokens ?? 100000,
      maxActiveMs: defaults?.maxActiveMs ?? 1800000,
    } satisfies AgentSchemas['CreateConversation'])
    set((state) => ({ conversations: [created, ...state.conversations] }))
    await selectConversation(created.id)
    return created
  }

  function applySnapshot(snapshot: Snapshot) {
    // 消息与游标必须来自同一服务端快照；刷新只恢复观察，不重新提交执行请求。
    const state = get()
    const conversations = [...state.conversations]
    const index = conversations.findIndex((c) => c.id === snapshot.conversation.id)
    if (index >= 0) conversations[index] = snapshot.conversation
    set({
      conversation: snapshot.conversation,
      messages: snapshot.messages ?? [],
      runs: snapshot.runs ?? [],
      interactions: snapshot.pendingInteractions ?? [],
      cursor: String(snapshot.cursor ?? ''),
      usage: snapshot.usage ?? { tokens: 0, activeMs: 0 },
      goals: snapshot.goals ?? [],
      plan: snapshot.plan,
      artifacts: snapshot.artifacts ?? state.artifacts,
      sources: snapshot.sources ?? state.sources,
      subagents: snapshot.subagents ?? state.subagents,
      conversations,
    })
  }

  async function selectConversation(id: string) {
    const generation = ++switchGeneration
    disconnect()
    set({
      switching: true,
      attachments: [],
      draft: '',
      activities: [],
      eventLog: [],
      artifacts: [],
      sources: [],
      subagents: [],
      // 立即清空聊天内容，避免切换慢时仍显示上一会话的消息。
      messages: [],
      runs: [],
      interactions: [],
    })
    try {
      const snapshot = await api<Snapshot>(`/conversations/${encodeURIComponent(id)}/snapshot`)
      if (generation !== switchGeneration) return
      applySnapshot(snapshot)
      accountStorage.setItem('xuya.codex.conversation', id)
      await selectProject(snapshot.conversation.projectId)
      if (generation !== switchGeneration) return
      if (!snapshot.conversation.projectId) {
        const workspace = await api<Workspace>(
          `${adult}/workspaces/${snapshot.conversation.workspaceId}`,
        )
        if (generation !== switchGeneration) return
        set({ workspaces: [workspace] })
      }
      selectWorkspace(snapshot.conversation.workspaceId)
      connect(id)
      await refreshResources()
    } finally {
      if (generation === switchGeneration) set({ switching: false })
    }
  }

  async function refreshSnapshot() {
    const current = get().conversation
    if (!current) return
    applySnapshot(await api<Snapshot>(`/conversations/${current.id}/snapshot`))
    await refreshResources()
  }

  async function updateConversation(id: string, changes: AgentSchemas['ConversationPatch']) {
    const updated = await api<Conversation>(
      `/conversations/${encodeURIComponent(id)}`,
      'PATCH',
      changes,
    )
    set((state) => ({
      conversations: state.conversations.map((chat) => (chat.id === id ? updated : chat)),
      conversation: state.conversation?.id === id ? updated : state.conversation,
    }))
    return updated
  }

  async function deleteConversation(id: string) {
    await api<void>(`/conversations/${encodeURIComponent(id)}`, 'DELETE')
    set((state) => ({
      conversations: state.conversations.filter((chat) => chat.id !== id),
    }))
    if (get().conversation?.id === id) {
      clearConversation()
      accountStorage.setItem('xuya.codex.conversation', '')
    }
  }

  async function refreshResources() {
    const id = get().conversation?.id
    if (!id) return
    const results = await Promise.allSettled([
      api<{ artifacts: ResourceRecord[]; sources: ResourceRecord[] }>(
        `${adult}/conversations/${id}/resources`,
      ),
      api<ResourceRecord[]>(`${adult}/conversations/${id}/agents`),
    ])
    if (get().conversation?.id !== id) return
    const resources = results[0]
    const agents = results[1]
    if (resources.status === 'fulfilled') {
      set({
        artifacts: resources.value.artifacts ?? [],
        sources: resources.value.sources ?? [],
      })
    }
    if (agents.status === 'fulfilled' && Array.isArray(agents.value))
      set({ subagents: agents.value })
  }

  function disconnect() {
    streamAbort?.abort()
    streamAbort = undefined
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = undefined
    set({ connection: 'offline' })
  }

  function connect(id = get().conversation?.id) {
    if (!id) return
    disconnect()
    const abort = new AbortController()
    streamAbort = abort
    let attempts = 0
    set({ connection: 'connecting' })
    const runStream = async () => {
      try {
        set({ connection: 'live' })
        await streamEvents(
          // 游标还没到位时传 0，别拼出空值的 after 参数触发服务端参数校验失败。
          `/conversations/${id}/events?after=${encodeURIComponent(get().cursor || '0')}`,
          abort.signal,
          acceptEvent,
        )
        attempts = 0
        if (!abort.signal.aborted) schedule(2000)
      } catch {
        if (abort.signal.aborted) return
        attempts += 1
        // 服务端一直拒绝时不要每两秒重试一次：指数退避，连续失败后停下等用户再来。
        if (attempts >= 5) {
          set({
            connection: 'offline',
            notice: '事件流多次中断，已停止自动重连；重新打开这个聊天可以再试。',
          })
          return
        }
        set({ notice: '事件流暂时中断，正在从已保存的位置恢复。' })
        schedule(2000 * 2 ** (attempts - 1))
      }
    }
    const schedule = (delay: number) => {
      set({ connection: 'retrying' })
      reconnectTimer = setTimeout(() => {
        if (!abort.signal.aborted) void runStream()
      }, delay)
    }
    void runStream()
  }

  function acceptEvent(event: StreamEvent) {
    const state = get()
    if (event.id && event.id === state.cursor) return
    const eventLog = [...state.eventLog, event]
    if (eventLog.length > 250) eventLog.shift()
    set({ cursor: event.id || state.cursor, eventLog })
    const e = event.data
    const type = String(e.type || event.event || '')
    if (type === 'TEXT_MESSAGE_START') {
      const id = String(e.messageId)
      if (!get().messages.some((m) => m.id === id))
        set((s) => ({
          messages: [...s.messages, { id, role: String(e.role || 'assistant'), content: '' }],
        }))
    } else if (type === 'TEXT_MESSAGE_CONTENT') {
      const id = String(e.messageId)
      set((s) => {
        const index = s.messages.findIndex((m) => m.id === id)
        if (index < 0)
          return {
            messages: [...s.messages, { id, role: 'assistant', content: String(e.delta ?? '') }],
          }
        const messages = [...s.messages]
        messages[index] = {
          ...messages[index],
          content: messages[index].content + String(e.delta ?? ''),
        }
        return { messages }
      })
    } else if (type === 'TOOL_CALL_START') {
      set((s) => ({
        activities: [
          ...s.activities,
          {
            id: String(e.toolCallId),
            name: String(e.toolCallName || e.toolName || '工具'),
            arguments: '',
            output: '',
            status: 'running',
          },
        ],
      }))
    } else if (type === 'TOOL_CALL_ARGS') {
      set((s) => ({
        activities: s.activities.map((t) =>
          t.id === String(e.toolCallId)
            ? { ...t, arguments: t.arguments + String(e.delta ?? '') }
            : t,
        ),
      }))
    } else if (type === 'TOOL_CALL_RESULT') {
      set((s) => ({
        activities: s.activities.map((t) =>
          t.id === String(e.toolCallId)
            ? { ...t, output: asText(e.content ?? e.result ?? ''), status: 'completed' }
            : t,
        ),
      }))
      void refreshResources()
    } else if (type === 'TOOL_CALL_END') {
      set((s) => ({
        activities: s.activities.map((t) =>
          t.id === String(e.toolCallId) && t.status !== 'completed'
            ? { ...t, status: 'executing' }
            : t,
        ),
      }))
    } else if (type === 'RUN_STARTED') {
      set((s) => {
        const currentRun = s.runs.at(-1)
        const executionId = String(e.executionId || currentRun?.executionId || '')
        const found = s.runs.find((r) => r.executionId === executionId)
        if (found)
          return {
            runs: s.runs.map((r) =>
              r.executionId === executionId ? { ...r, status: 'running' } : r,
            ),
          }
        return executionId ? { runs: [...s.runs, { executionId, status: 'running' }] } : {}
      })
    } else if (['RUN_FINISHED', 'RUN_ERROR'].includes(type)) {
      const currentRun = get().runs.at(-1)
      if (currentRun && (type === 'RUN_ERROR' || e.status)) {
        set((s) => ({
          runs: s.runs.map((r) =>
            r === currentRun
              ? { ...r, status: type === 'RUN_ERROR' ? 'failed' : String(e.status) }
              : r,
          ),
        }))
      }
      if (type === 'RUN_ERROR') set({ error: String(e.message || '本次运行失败。') })
      void refreshSnapshot().catch(() => {})
    } else if (type === 'MESSAGES_SNAPSHOT' && Array.isArray(e.messages)) {
      set({ messages: e.messages as unknown as Message[] })
    } else if (type === 'STATE_SNAPSHOT') {
      const snapshotState = object(e.snapshot)
      if (Array.isArray(snapshotState.pendingInteractions))
        set({ interactions: snapshotState.pendingInteractions as Interaction[] })
      if (snapshotState.plan) set({ plan: snapshotState.plan as unknown as Plan })
    } else if (type === 'CUSTOM') {
      const name = String(e.name || '')
      const value = object(e.value)
      if (name.includes('interaction')) {
        const interaction = object(value.interaction || value)
        if (name.includes('resolved'))
          set((s) => ({
            interactions: s.interactions.filter(
              (i) => i.id !== String(value.id || value.interactionId),
            ),
          }))
        else if (interaction.id) {
          set((s) => ({
            interactions: [
              ...s.interactions.filter((i) => i.id !== String(interaction.id)),
              interaction as unknown as Interaction,
            ],
          }))
          if (get().runs.at(-1))
            set((s) => ({
              runs: s.runs.map((r, index) =>
                index === s.runs.length - 1 ? { ...r, status: 'waiting' } : r,
              ),
            }))
        } else void refreshSnapshot().catch(() => {})
      } else if (name.includes('artifact')) set((s) => ({ artifacts: upsert(s.artifacts, value) }))
      else if (name.includes('source')) set((s) => ({ sources: upsert(s.sources, value) }))
      else if (name.includes('subagent') || name.includes('agent_activity')) {
        const source = object(value.source)
        set((s) => ({
          subagents: upsert(s.subagents, {
            ...source,
            ...value,
            id:
              value.id ||
              source.id ||
              source.agentId ||
              value.agentId ||
              (typeof value.source === 'string' ? value.source : undefined),
          }),
        }))
      } else if (name.includes('plan'))
        set({ plan: object(value.plan || value) as unknown as Plan })
      else if (name === 'codex.status') {
        set((s) => {
          const currentRun = s.runs.at(-1)
          const run = s.runs.find((r) => r.executionId === value.executionId) ?? currentRun
          if (!run) return {}
          return {
            runs: s.runs.map((r) => (r === run ? { ...r, status: String(value.status) } : r)),
          }
        })
      } else if (name === 'codex.goal')
        set((s) => ({ goals: upsert(s.goals, object(value.goal || value)) }))
      else if (name === 'token_usage')
        set((s) => ({
          usage: {
            ...s.usage,
            tokens: Number(
              object(value.cumulative).totalTokens ??
                value.cumulative ??
                s.usage.tokens + Number(object(value.delta).totalTokens ?? value.delta ?? 0),
            ),
          },
        }))
      else if (name.includes('usage'))
        set((s) => ({
          usage: {
            tokens: Number(value.tokens ?? s.usage.tokens),
            activeMs: Number(value.activeMs ?? s.usage.activeMs),
          },
        }))
    }
  }

  async function configure(settings: Partial<Conversation>) {
    const current = get().conversation
    if (!current) {
      set((s) => ({ newSettings: { ...s.newSettings, ...settings } }))
      return
    }
    await api(`/conversations/${current.id}/actions`, 'POST', {
      clientRequestId: requestId(),
      action: 'configure',
      settings: { ...settings },
    } satisfies AgentSchemas['Action'])
    await refreshSnapshot()
  }

  async function send() {
    const state = get()
    if (!state.draft.trim() && !state.attachments.length) return
    const text = state.draft.trim() || '请查看这些附件，为当前任务提供上下文。'
    const files = state.attachments.map(({ previewUrl: _preview, ...attachment }) => attachment)
    const pendingAttachments = [...state.attachments]
    if (!state.conversation) await newConversation()
    set({ draft: text, attachments: pendingAttachments })
    const fingerprint = JSON.stringify([get().conversation!.id, text, files.map((f) => f.id)])
    if (pendingSend?.fingerprint !== fingerprint) pendingSend = { fingerprint, id: requestId() }
    const result = await api<AgentSchemas['RunReceipt']>(
      `/conversations/${get().conversation!.id}/runs`,
      'POST',
      {
        clientRequestId: pendingSend.id,
        text,
        attachments: files,
      } satisfies AgentSchemas['SubmitRun'],
    )
    if (!result.executionId || !result.status)
      throw new Error('任务回执缺少执行标识，请刷新会话确认状态。')
    const executionId = result.executionId
    const status = result.status
    pendingSend = undefined
    for (const file of pendingAttachments) if (file.previewUrl) URL.revokeObjectURL(file.previewUrl)
    set({ draft: '', attachments: [] })
    await refreshSnapshot()
    if (!get().runs.some((r) => r.executionId === executionId))
      set((s) => ({
        runs: [...s.runs, { executionId, status }],
      }))
  }

  async function action(kind: 'steer' | 'interrupt' | 'cancel' | 'resume', text?: string) {
    const current = get().conversation
    if (!current) return
    await api(`/conversations/${current.id}/actions`, 'POST', {
      clientRequestId: requestId(),
      action: kind,
      executionId: get().runs.at(-1)?.executionId,
      text,
    } satisfies AgentSchemas['Action'])
    await refreshSnapshot()
  }

  async function respond(interaction: Interaction, payload: Record<string, unknown>) {
    await api(
      `/conversations/${get().conversation!.id}/interactions/${interaction.id}/responses`,
      'POST',
      { clientRequestId: requestId(), payload } satisfies AgentSchemas['Respond'],
    )
    await refreshSnapshot()
  }

  async function attach(files: File[]) {
    if (!files.length) return
    if (!get().conversation) {
      const text = get().draft
      const pending = [...get().attachments]
      await newConversation()
      set({ draft: text, attachments: pending })
    }
    for (const file of files) {
      const uploaded = (await uploadAttachment(file, get().conversation?.id)) as Attachment
      set((s) => ({
        attachments: [
          ...s.attachments,
          {
            ...uploaded,
            name: uploaded.name || file.name,
            mimeType: uploaded.mimeType || file.type,
            relativePath: file.webkitRelativePath || undefined,
            previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          },
        ],
      }))
    }
  }

  async function savePlan(nextPlan: Plan) {
    const current = get().conversation
    if (!current) throw new Error('请先创建会话。')
    const saved = await api<Plan>(`${adult}/conversations/${current.id}/plan`, 'PUT', nextPlan)
    set({ plan: saved ?? nextPlan })
  }

  async function createGoal(title: string, maxTokens: number, maxActiveMs: number) {
    const current = get().conversation
    if (!current) throw new Error('请先创建会话。')
    await api(`${adult}/goals`, 'POST', {
      conversationId: current.id,
      title,
      maxTokens,
      maxActiveMs,
    })
    set({ goals: await api<Goal[]>(`${adult}/goals?conversationId=${current.id}`) })
  }

  async function updateGoal(
    id: string,
    status: string,
    limits?: { maxTokens: number; maxActiveMs: number },
  ) {
    await api(`${adult}/goals/${id}`, 'PUT', { status, ...limits })
    await refreshSnapshot()
  }

  async function loadSection(section: string) {
    const current = get().conversation
    if (section === 'plugins') {
      const [pluginList, skillList] = await Promise.all([
        api<ResourceRecord[]>(`${adult}/plugins`),
        api<ResourceRecord[]>(`${adult}/skills`),
      ])
      set({ plugins: pluginList, skills: skillList })
    }
    if (section === 'memory' && current)
      set({
        memories: await api<ResourceRecord[]>(`${adult}/conversations/${current.id}/memory`),
      })
    if (section === 'automations')
      set({ automations: await api<Automation[]>(`${adult}/automations`) })
    if (section === 'settings') set({ capabilities: await readCapabilities() })
    if (section === 'projects') await refreshProjects()
    if (section === 'outputs' && current) {
      const result = await api<{ artifacts: ResourceRecord[]; sources: ResourceRecord[] }>(
        `${adult}/conversations/${current.id}/resources`,
      )
      set({ artifacts: result.artifacts, sources: result.sources })
    }
    if (section === 'agents' && current)
      set({
        subagents: await api<ResourceRecord[]>(`${adult}/conversations/${current.id}/agents`),
      })
  }

  return {
    initialized: false,
    loading: false,
    switching: false,
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
    perform,
    initialize,
    refreshProjects,
    selectProject,
    selectWorkspace,
    clearConversation,
    registerProject,
    createWorkspace,
    newConversation,
    selectConversation,
    refreshSnapshot,
    updateConversation,
    deleteConversation,
    disconnect,
    connect,
    acceptEvent,
    configure,
    send,
    action,
    respond,
    attach,
    savePlan,
    createGoal,
    updateGoal,
    loadSection,
    setDraft: (draft) => set({ draft }),
    setNewSettings: (settings) => set((s) => ({ newSettings: { ...s.newSettings, ...settings } })),
  }
})

export const selectProject = (s: CodexState) => s.projects.find((p) => p.id === s.selectedProjectId)
export const selectWorkspace = (s: CodexState) =>
  s.workspaces.find((w) => w.id === s.selectedWorkspaceId)
export const selectCurrentRun = (s: CodexState) => s.runs.at(-1)
export const selectRunning = (s: CodexState) =>
  ['queued', 'running'].includes(s.runs.at(-1)?.status ?? '')
export const selectActiveExecution = (s: CodexState) =>
  ['queued', 'running', 'suspended', 'waiting'].includes(s.runs.at(-1)?.status ?? '')
export const selectModel = (s: CodexState) =>
  s.capabilities?.models.find((m) => m.id === (s.conversation?.modelId || s.newSettings.modelId)) ??
  s.capabilities?.models.find((m) => m.configured)
