// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useCodexStore } from './store'
import CodexView from '../views/CodexView'
import App from '../App'
import { FamilyContext } from '../account/AuthGate'
import McpPanel from './components/McpPanel'
import InteractionCard from './components/InteractionCard'
import SettingsPanel from './components/SettingsPanel'
import type { Conversation } from './types'

const mocks = vi.hoisted(() => ({ api: vi.fn(), classroom: vi.fn(async () => {}) }))
vi.mock('./api', () => ({
  api: mocks.api,
  readCapabilities: vi.fn(),
  requestId: () => 'ui-test-request',
  streamEvents: vi.fn(),
  uploadAttachment: vi.fn(),
}))
vi.mock('../stores/classroom', () => ({
  useClassroomStore: (
    select: (state: { savedCount: number; initialize: () => Promise<void> }) => unknown,
  ) => select({ savedCount: 0, initialize: mocks.classroom }),
}))

const original = useCodexStore.getState()
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  mocks.api.mockReset().mockResolvedValue([])
  mocks.classroom.mockClear()
  useCodexStore.setState({
    ...original,
    initialized: true,
    loading: false,
    busy: false,
    projects: [],
    conversations: [],
    workspaces: [],
    selectedProjectId: '',
    selectedWorkspaceId: '',
    conversation: undefined,
    messages: [],
    runs: [],
    interactions: [],
    draft: '',
    error: '',
    notice: '',
    artifacts: [],
    sources: [],
    subagents: [],
    plan: undefined,
    goals: [],
    plugins: [],
    skills: [],
    initialize: vi.fn(async () => {}),
    connect: vi.fn(),
    disconnect: vi.fn(),
    loadSection: vi.fn(async () => {}),
  })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  Element.prototype.scrollTo = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useCodexStore.setState(original)
})

function workspace(path = '/codex') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/codex" element={<CodexView />} />
        <Route path="/codex/:section" element={<CodexView />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Codex 桌面工作台', () => {
  it('恢复工作区期间终端入口与快捷键不创建新会话', async () => {
    const newConversation = vi.fn(async () => {
      throw new Error('不应创建会话')
    })
    useCodexStore.setState({ loading: true, initialized: false, newConversation })
    workspace()
    expect((screen.getByRole('button', { name: '打开终端' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    fireEvent.keyDown(document, { ctrlKey: true, code: 'Backquote', key: '`' })
    expect(newConversation).not.toHaveBeenCalled()
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it('置顶聊天归档后可恢复，保持原标识和工作区', async () => {
    const chat: Conversation = {
      id: 'organize-chat',
      projectId: '',
      workspaceId: 'scratch',
      title: '可恢复任务',
      permissionMode: 'auto',
      planMode: false,
      maxTokens: 10000,
      maxActiveMs: 60000,
      archived: false,
      pinned: false,
      createdAt: '2026-10-12T00:00:00Z',
      updatedAt: '2026-10-12T00:00:00Z',
    }
    useCodexStore.setState({ conversations: [chat], conversation: chat })
    mocks.api.mockImplementation(
      async (path: string, method: string, changes: Partial<Conversation>) => {
        if (path === '/conversations/organize-chat' && method === 'PATCH') {
          Object.assign(chat, changes)
          return { ...chat }
        }
        return []
      },
    )
    workspace()
    const actions = screen.getByLabelText('操作聊天 可恢复任务')
    fireEvent.click(actions)
    fireEvent.click(within(actions.parentElement!).getByRole('button', { name: '置顶聊天' }))
    await screen.findByText('置顶')
    fireEvent.click(screen.getByRole('button', { name: '已归档聊天' }))
    expect(screen.getByRole('dialog', { name: '已归档聊天' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭工具面板' }))
    fireEvent.click(screen.getByLabelText('操作聊天 可恢复任务'))
    fireEvent.click(
      within(screen.getByLabelText('操作聊天 可恢复任务').parentElement!).getByRole('button', {
        name: '归档聊天',
      }),
    )
    await waitFor(() => expect(useCodexStore.getState().conversation).toBeUndefined())
    expect(useCodexStore.getState().conversations[0].archived).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '已归档聊天' }))
    fireEvent.click(await screen.findByRole('button', { name: '恢复聊天 可恢复任务' }))
    await waitFor(() => expect(useCodexStore.getState().conversations[0].archived).toBe(false))
    expect(useCodexStore.getState().conversations[0]).toMatchObject({
      id: chat.id,
      workspaceId: 'scratch',
      pinned: true,
    })
    expect(mocks.api.mock.calls.filter(([, method]) => method === 'POST')).toEqual([])
  })

  it('工作区开始聊天保留明确选择的项目', async () => {
    useCodexStore.setState({
      projects: [{ id: 'project', name: '当前项目', path: 'D:/project', mode: 'isolated-copy' }],
      workspaces: [
        {
          id: 'work',
          projectId: 'project',
          path: 'D:/work',
          mode: 'isolated-copy',
          environment: 'host',
        },
      ],
      selectedProjectId: 'project',
      selectedWorkspaceId: 'work',
      draft: '旧草稿',
    })
    workspace('/codex?panel=projects')
    fireEvent.click(screen.getByRole('button', { name: '开始聊天' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '项目与工作区' })).toBeNull())
    expect(useCodexStore.getState().selectedProjectId).toBe('project')
    expect(useCodexStore.getState().selectedWorkspaceId).toBe('work')
    expect(useCodexStore.getState().draft).toBe('')
  })

  it('全局新聊天清除项目上下文并保留在聊天界面', async () => {
    useCodexStore.setState({
      selectedProjectId: 'previous-project',
      selectedWorkspaceId: 'previous-workspace',
      draft: '上次工程的要求',
      attachments: [{ id: 'old-file', name: 'old.txt', mimeType: 'text/plain' }],
    })
    workspace('/codex')
    fireEvent.click(
      within(screen.getByRole('complementary', { name: 'Codex 项目与聊天' })).getByRole('button', {
        name: '新聊天',
      }),
    )
    await waitFor(() => expect(useCodexStore.getState().selectedProjectId).toBe(''))
    expect(useCodexStore.getState().selectedWorkspaceId).toBe('')
    expect(useCodexStore.getState().draft).toBe('')
    expect(useCodexStore.getState().attachments).toEqual([])
    expect(screen.queryByRole('dialog', { name: '项目与工作区' })).toBeNull()
    expect(screen.getByText('独立聊天 · 可直接开始，也可选择项目')).toBeTruthy()
  })

  it('岛上仅有单个 codex 入口，直接打开工作台不依赖课堂初始化', async () => {
    const family = {
      initialized: true,
      localSetup: false,
      localHost: true,
      captchaMode: 'always',
      csrf: '',
      user: {
        id: 'admin',
        username: 'admin',
        nickname: '管理员',
        enabled: true,
        changePassword: false,
        roles: ['super-admin'],
        permissions: ['*'],
      },
      menus: [
        '/',
        '/games',
        '/classroom',
        '/adventure/town-cup-order',
        '/studio',
        '/works',
        '/codex',
      ].map((path, index) => ({
        id: String(index),
        parentId: null,
        title: path === '/codex' ? 'codex' : path,
        path,
        permission: '',
        kind: 'menu',
        sortOrder: index,
        enabled: true,
      })),
    }
    const island = render(
      <MemoryRouter>
        <FamilyContext.Provider value={family}>
          <App />
        </FamilyContext.Provider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(mocks.classroom).toHaveBeenCalledTimes(1))
    const nav = screen.getByRole('navigation', { name: '主导航' })
    expect(nav.querySelectorAll('a')).toHaveLength(7)
    expect(screen.getByRole('link', { name: 'codex' }).getAttribute('href')).toBe('/codex')
    expect(screen.queryByRole('button', { name: /二级菜单/ })).toBeNull()
    island.unmount()
    mocks.classroom.mockClear()
    render(
      <MemoryRouter initialEntries={['/codex']}>
        <FamilyContext.Provider value={family}>
          <Routes>
            <Route element={<App />}>
              <Route path="/codex" element={<CodexView />} />
            </Route>
          </Routes>
        </FamilyContext.Provider>
      </MemoryRouter>,
    )
    await screen.findByTestId('codex-workbench')
    expect(mocks.classroom).not.toHaveBeenCalled()
  })

  it('工具以抽屉打开，聊天草稿常驻，关闭与深色主题可操作', async () => {
    workspace()
    const composer = screen.getByTestId('codex-composer')
    fireEvent.change(composer, { target: { value: '保持草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '工作台工具' }))
    expect(
      screen.getByRole('menu', { name: '工作台工具菜单' }).querySelectorAll('[role=menuitem]'),
    ).toHaveLength(11)
    fireEvent.click(screen.getByRole('menuitem', { name: '任务与目标' }))
    expect(screen.getByRole('dialog', { name: '任务与目标' })).toBeTruthy()
    expect(screen.getByTestId('codex-composer')).toBe(composer)
    expect((composer as HTMLTextAreaElement).value).toBe('保持草稿')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '任务与目标' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: '切换深色主题' }))
    expect(screen.getByTestId('codex-workbench').getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('xuya.codex.theme')).toBe('dark')
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('兼容历史功能链接，但主画面仍是同一聊天工作台', async () => {
    workspace('/codex/memory')
    expect(screen.getByRole('dialog', { name: '记忆与上下文' })).toBeTruthy()
    expect(screen.getByTestId('codex-composer')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'codex 二级菜单' })).toBeNull()
  })
})

describe('MCP 实际配置', () => {
  it('新增连接默认禁用且空白名单，不保存或发送未修改密钥', async () => {
    render(<McpPanel />)
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('/codex/mcp/servers'))
    fireEvent.click(screen.getByRole('button', { name: '添加 MCP' }))
    fireEvent.change(screen.getByLabelText('连接标识'), { target: { value: 'local-tools' } })
    fireEvent.change(screen.getByLabelText('连接名称'), { target: { value: '本机工具' } })
    fireEvent.change(screen.getByLabelText('可执行文件绝对路径'), {
      target: { value: 'D:\\tools\\mcp.exe' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存 MCP' }))
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        '/codex/mcp/servers/local-tools',
        'PUT',
        expect.objectContaining({
          enabled: false,
          allowedTools: [],
          headers: undefined,
          environment: undefined,
        }),
      ),
    )
    expect(localStorage.length).toBe(0)
  })
})

describe('原生提问与改参审批', () => {
  it('单问题选项返回具体 answer，继续原交互而不另建运行', async () => {
    const respond = vi.fn(async () => {})
    useCodexStore.setState({ respond })
    const interaction = {
      id: 'question-1',
      kind: 'question',
      arguments: {
        question: '使用哪种存储？',
        options: [{ label: 'SQLite', description: '保留在本机' }, '其他'],
      },
    }
    render(<InteractionCard interaction={interaction} />)
    fireEvent.click(screen.getByRole('radio', { name: 'SQLite 保留在本机' }))
    fireEvent.click(screen.getByRole('button', { name: '提交回答并继续' }))
    await waitFor(() =>
      expect(respond).toHaveBeenCalledWith(interaction, {
        answer: 'SQLite',
        answers: { answer: 'SQLite' },
      }),
    )
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it('confirm 审批能编辑真实参数，非法 JSON 不会提交', async () => {
    const respond = vi.fn(async () => {})
    useCodexStore.setState({ respond })
    const interaction = {
      id: 'approval-1',
      kind: 'confirm',
      toolName: 'write_file',
      arguments: { path: 'README.md', content: 'original' },
    }
    render(<InteractionCard interaction={interaction} />)
    fireEvent.click(screen.getByLabelText('修改工具参数后批准'))
    fireEvent.change(screen.getByLabelText('修改工具参数'), { target: { value: 'invalid-json' } })
    fireEvent.click(screen.getByRole('button', { name: '批准并继续' }))
    expect(respond).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('不是有效 JSON')
    fireEvent.change(screen.getByLabelText('修改工具参数'), {
      target: { value: '{"path":"README.md","content":"reviewed"}' },
    })
    fireEvent.click(screen.getByRole('button', { name: '批准并继续' }))
    await waitFor(() =>
      expect(respond).toHaveBeenCalledWith(interaction, {
        approved: true,
        editedArgs: { path: 'README.md', content: 'reviewed' },
      }),
    )
  })
})

describe('会话资源与可选服务', () => {
  it('右栏点击具体产物直接读取真实产物预览接口', async () => {
    useCodexStore.setState({
      artifacts: [{ id: 'artifact-1', name: '实现记录.md', mediaType: 'text/markdown' }],
    })
    mocks.api.mockImplementation(async (path: string) =>
      path.endsWith('/preview')
        ? { type: 'text', text: '已保存的实现记录', mediaType: 'text/markdown' }
        : [],
    )
    workspace()
    fireEvent.click(screen.getByRole('button', { name: '实现记录.md text/markdown' }))
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/codex/artifacts/artifact-1/preview'),
    )
    expect(screen.getByRole('dialog', { name: '输出与来源' })).toBeTruthy()
    expect(await screen.findByText('已保存的实现记录')).toBeTruthy()
  })

  it('JEV 开关仅保存配置并刷新状态，不在前端探测或调用外部服务', async () => {
    let enabled = false
    mocks.api.mockImplementation(
      async (path: string, method: string, body: { enabled?: boolean }) => {
        if (path === '/codex/settings/jev' && method === 'PUT') {
          enabled = Boolean(body.enabled)
          return { saved: true }
        }
        if (path === '/codex/settings')
          return {
            model: {
              provider: 'openai',
              baseUrl: '',
              name: '',
              configured: false,
              supportsImages: false,
              reasoningEfforts: [],
            },
            jev: { enabled, state: 'not-checked' },
            studio: { enabled: false },
            swaggerUrl: '/swagger-ui.html',
          }
        return {}
      },
    )
    render(<SettingsPanel />)
    const switcher = await screen.findByRole('switch', { name: '启用 JEV' })
    await waitFor(() => expect((switcher as HTMLInputElement).disabled).toBe(false))
    fireEvent.click(switcher)
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/codex/settings/jev', 'PUT', { enabled: true }),
    )
    await waitFor(() => expect((switcher as HTMLInputElement).checked).toBe(true))
    expect(mocks.api.mock.calls.every(([path]) => String(path).startsWith('/codex/'))).toBe(true)
  })
})
