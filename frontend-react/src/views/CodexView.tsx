import { accountStorage } from '../account/session'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Bell,
  Search,
  SquarePen,
  FolderGit2,
  ChevronDown,
  ChevronRight,
  Code2,
  PanelsTopLeft,
  Target,
  GitCompare,
  Users,
  Puzzle,
  FileText,
  Brain,
  Clock3,
  Settings2,
  ArrowLeft,
  TerminalSquare,
  PanelRightClose,
  Menu,
  X,
  Ellipsis,
  Check,
  RefreshCw,
  Wrench,
  Moon,
  Sun,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Trash2,
} from 'lucide-react'
import {
  useCodexStore,
  selectProject as selectCurrentProject,
  selectWorkspace,
} from '../codex/store'
import { sections } from '../codex/types'
import ConversationTimeline from '../codex/components/ConversationTimeline'
import Composer from '../codex/components/Composer'
import ContextRail from '../codex/components/ContextRail'
import ProjectPanel from '../codex/components/ProjectPanel'
import TasksPanel from '../codex/components/TasksPanel'
import ChangesPanel from '../codex/components/ChangesPanel'
import AgentsPanel from '../codex/components/AgentsPanel'
import IntegrationsPanel from '../codex/components/IntegrationsPanel'
import ResourcesPanel from '../codex/components/ResourcesPanel'
import MemoryPanel from '../codex/components/MemoryPanel'
import AutomationPanel from '../codex/components/AutomationPanel'
import SettingsPanel from '../codex/components/SettingsPanel'
import ChromeDialog from '../codex/components/ChromeDialog'
import WorkbenchDrawer from '../codex/components/WorkbenchDrawer'
import '../codex/codex.css'

const TerminalPane = lazy(() => import('../codex/components/TerminalPane'))

export default function CodexView() {
  const navigate = useNavigate()
  const params = useParams()
  const [query] = useSearchParams()
  const requested = query.get('panel') || params.section
  const section = sections.some((s) => s.id === requested) ? String(requested) : 'workbench'
  const sectionTitle = sections.find((s) => s.id === section)?.label || '编码工作台'
  const conversations = useCodexStore((s) => s.conversations)
  const interactions = useCodexStore((s) => s.interactions)
  const projects = useCodexStore((s) => s.projects)
  const selectedProjectId = useCodexStore((s) => s.selectedProjectId)
  const conversation = useCodexStore((s) => s.conversation)
  const loading = useCodexStore((s) => s.loading)
  const switching = useCodexStore((s) => s.switching)
  const busy = useCodexStore((s) => s.busy)
  const initialized = useCodexStore((s) => s.initialized)
  const connection = useCodexStore((s) => s.connection)
  const error = useCodexStore((s) => s.error)
  const notice = useCodexStore((s) => s.notice)
  const project = useCodexStore(selectCurrentProject)
  const workspace = useCodexStore(selectWorkspace)
  const clearConversation = useCodexStore((s) => s.clearConversation)
  const perform = useCodexStore((s) => s.perform)
  const selectConversation = useCodexStore((s) => s.selectConversation)
  const selectProjectAction = useCodexStore((s) => s.selectProject)
  const refreshSnapshot = useCodexStore((s) => s.refreshSnapshot)
  const updateConversation = useCodexStore((s) => s.updateConversation)
  const deleteConversation = useCodexStore((s) => s.deleteConversation)
  const initialize = useCodexStore((s) => s.initialize)
  const connect = useCodexStore((s) => s.connect)
  const disconnect = useCodexStore((s) => s.disconnect)
  const loadSection = useCodexStore((s) => s.loadSection)
  const [search, setSearch] = useState('')
  const [searchVisible, setSearchVisible] = useState(false)
  const [notifications, setNotifications] = useState(false)
  const [navigation, setNavigation] = useState(false)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [rail, setRail] = useState(() => window.innerWidth > 1020)
  const [terminal, setTerminal] = useState(false)
  const [terminalOpened, setTerminalOpened] = useState(false)
  const [chrome, setChrome] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [renaming, setRenaming] = useState(false)
  const [renamingChatId, setRenamingChatId] = useState<string>()
  const [chatTitle, setChatTitle] = useState('')
  const [archives, setArchives] = useState(false)
  const [title, setTitle] = useState('')
  const [theme, setTheme] = useState(() =>
    accountStorage.getItem('xuya.codex.theme') === 'dark' ? 'dark' : 'light',
  )
  const [resource, setResource] = useState<{ id: string; kind: 'artifact' | 'source' }>()
  const [agentTask, setAgentTask] = useState<string>()
  const searchInput = useRef<HTMLInputElement>(null)
  const sectionWatched = useRef(true)
  const terminalToggle = useRef<() => Promise<void>>(async () => {})

  const icons = [
    PanelsTopLeft,
    FolderGit2,
    Target,
    GitCompare,
    Users,
    Puzzle,
    FileText,
    Brain,
    Clock3,
    Settings2,
  ]

  const chats = useMemo(
    () =>
      conversations.filter(
        (c) => !c.archived && `${c.title} ${c.id}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [conversations, search],
  )
  const recent = useMemo(
    () =>
      [...chats]
        .filter((chat) => !chat.pinned)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 12),
    [chats],
  )

  function go(id: string, plugin?: string) {
    setArchives(false)
    void navigate(
      id === 'workbench'
        ? '/codex'
        : '/codex?panel=' + id + (plugin ? '&plugin=' + encodeURIComponent(plugin) : ''),
    )
    setNavigation(false)
    setMobileSidebar(false)
    if (id !== 'outputs') setResource(undefined)
    if (id !== 'agents') setAgentTask(undefined)
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    accountStorage.setItem('xuya.codex.theme', next)
  }

  function showPending() {
    setNotifications(false)
    go('workbench')
  }

  async function newChat() {
    clearConversation()
    // 全局新聊天独立开始，不能隐式继承上一次项目或附件。
    await selectProjectAction('')
    for (const attachment of useCodexStore.getState().attachments)
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    useCodexStore.setState({ draft: '', attachments: [] })
    accountStorage.setItem('xuya.codex.conversation', '')
    go('workbench')
  }

  async function selectChat(id: string) {
    await perform(() => selectConversation(id))
    go('workbench')
  }

  function newProjectChat() {
    clearConversation()
    for (const attachment of useCodexStore.getState().attachments)
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    useCodexStore.setState({ draft: '', attachments: [] })
    accountStorage.setItem('xuya.codex.conversation', '')
    go('workbench')
  }

  async function selectProject(id: string) {
    await perform(() => selectProjectAction(id))
    go(useCodexStore.getState().selectedWorkspaceId ? 'workbench' : 'projects')
  }

  async function toggleTerminal() {
    // 刷新时先恢复会话工作区，不能把暂时为空的选择当作用户要创建独立聊天。
    const current = useCodexStore.getState()
    if (current.loading || !current.initialized || current.busy) return
    if (terminal) {
      setTerminal(false)
      return
    }
    if (!useCodexStore.getState().selectedWorkspaceId) {
      const draft = useCodexStore.getState().draft
      await perform(() => useCodexStore.getState().newConversation())
      useCodexStore.getState().setDraft(draft)
      if (useCodexStore.getState().error) return
    }
    setTerminal(true)
  }
  terminalToggle.current = toggleTerminal

  async function rename() {
    if (!conversation || !title.trim()) return
    await perform(async () => {
      await updateConversation(conversation!.id, { title: title.trim() })
    })
    setRenaming(false)
  }

  async function archiveChat(id: string) {
    await perform(async () => {
      await updateConversation(id, { archived: true })
      if (useCodexStore.getState().conversation?.id === id) await newChat()
    })
  }

  async function restoreChat(id: string) {
    await perform(() => updateConversation(id, { archived: false }))
  }

  async function deleteChat(id: string, label: string) {
    if (!window.confirm(`确定删除聊天「${label || '新聊天'}」吗？删除后无法恢复。`)) return
    await perform(() => deleteConversation(id))
  }

  function chatRow(chat: (typeof conversations)[number]) {
    if (renamingChatId === chat.id) {
      return (
        <div className="cx-chat-row" key={chat.id}>
          <form
            className="cx-chat-rename"
            onSubmit={(event) => {
              event.preventDefault()
              const next = chatTitle.trim()
              if (!next) return
              void perform(async () => {
                await updateConversation(chat.id, { title: next })
                setRenamingChatId(undefined)
              })
            }}
          >
            <input
              value={chatTitle}
              onChange={(event) => setChatTitle(event.target.value)}
              aria-label="聊天名称"
              autoFocus
            />
            <button className="cx-icon" aria-label="保存聊天名称" type="submit">
              <Check size={15} />
            </button>
            <button
              className="cx-icon"
              aria-label="取消重命名"
              type="button"
              onClick={() => setRenamingChatId(undefined)}
            >
              <X size={15} />
            </button>
          </form>
        </div>
      )
    }
    return (
      <div className="cx-chat-row" key={chat.id}>
        <button
          className={'cx-recent-chat' + (conversation?.id === chat.id ? ' active' : '')}
          onClick={() => void selectChat(chat.id)}
        >
          <span>{chat.title || '新聊天'}</span>
          {chat.pinned ? (
            <Pin size={12} />
          ) : (
            <small>
              {new Date(chat.updatedAt).toLocaleDateString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
              })}
            </small>
          )}
        </button>
        <details className="cx-chat-actions">
          <summary aria-label={`操作聊天 ${chat.title || '新聊天'}`}>
            <Ellipsis size={15} />
          </summary>
          <div>
            <button
              onClick={() => {
                setChatTitle(chat.title || '')
                setRenamingChatId(chat.id)
              }}
            >
              <SquarePen size={14} />
              重命名
            </button>
            <button
              onClick={() =>
                void perform(() => updateConversation(chat.id, { pinned: !chat.pinned }))
              }
            >
              {chat.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              {chat.pinned ? '取消置顶' : '置顶聊天'}
            </button>
            <button onClick={() => void archiveChat(chat.id)}>
              <Archive size={14} />
              归档聊天
            </button>
            <button className="cx-danger" onClick={() => void deleteChat(chat.id, chat.title)}>
              <Trash2 size={14} />
              删除聊天
            </button>
          </div>
        </details>
      </div>
    )
  }

  useEffect(() => {
    if (sectionWatched.current) {
      sectionWatched.current = false
      return
    }
    if (initialized) void perform(() => loadSection(section))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  useEffect(() => {
    if (terminal) setTerminalOpened(true)
  }, [terminal])

  useEffect(() => {
    if (searchVisible) searchInput.current?.focus()
  }, [searchVisible])

  useEffect(() => {
    const compactLayout = window.matchMedia('(max-width: 1020px)')
    function onCompactChange(event: MediaQueryListEvent) {
      if (event.matches) setRail(false)
    }
    function shortcuts(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.code === 'Backquote') {
        event.preventDefault()
        void terminalToggle.current()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchVisible(true)
        if (window.innerWidth <= 720) setMobileSidebar(true)
        setTimeout(() => searchInput.current?.focus(), 0)
      }
      if (event.key === 'Escape') {
        setNavigation(false)
        setMobileSidebar(false)
        setNotifications(false)
      }
    }
    document.addEventListener('keydown', shortcuts)
    compactLayout.addEventListener('change', onCompactChange)
    void (async () => {
      await initialize()
      const state = useCodexStore.getState()
      if (state.conversation && state.connection === 'offline') connect()
      if (useCodexStore.getState().initialized) await perform(() => loadSection(section))
    })()
    return () => {
      disconnect()
      compactLayout.removeEventListener('change', onCompactChange)
      document.removeEventListener('keydown', shortcuts)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="cx-shell" data-theme={theme} data-testid="codex-workbench">
      {mobileSidebar && (
        <div className="cx-sidebar-backdrop" onClick={() => setMobileSidebar(false)}></div>
      )}
      <aside
        className={'cx-sidebar' + (mobileSidebar ? ' cx-mobile-open' : '')}
        aria-label="码穹 项目与聊天"
      >
        <div className="cx-sidebar-top">
          <button
            className="cx-brand"
            aria-label="码穹 应用菜单"
            aria-expanded={navigation}
            onClick={() => setNavigation(!navigation)}
          >
            <Code2 size={21} />
            码穹
            <ChevronDown size={15} />
          </button>
          <div>
            <button
              className="cx-icon"
              aria-label="通知"
              aria-expanded={notifications}
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={17} />
              {interactions.length > 0 && <i className="cx-notification-dot"></i>}
            </button>
            <button
              className="cx-icon"
              aria-label="搜索聊天"
              onClick={() => setSearchVisible(!searchVisible)}
            >
              <Search size={17} />
            </button>
          </div>
        </div>
        {navigation && (
          <div className="cx-app-menu" role="menu" aria-label="工作台工具菜单">
            <Link to="/">
              <ArrowLeft size={15} />
              返回叙芽岛
            </Link>
            {sections.map((item, index) => {
              const Icon = icons[index]
              return (
                <button
                  key={item.id}
                  role="menuitem"
                  className={section === item.id ? 'active' : ''}
                  onClick={() => go(item.id)}
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              )
            })}
            <button role="menuitem" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              {theme === 'dark' ? '浅色外观' : '深色外观'}
            </button>
          </div>
        )}
        {notifications && (
          <div className="cx-sidebar-notifications">
            <strong>通知</strong>
            {interactions.map((interaction) => (
              <button key={interaction.id} onClick={showPending}>
                {interaction.message || '任务需要你的回复'}
              </button>
            ))}
            {!interactions.length && <p>暂无需要处理的通知。</p>}
          </div>
        )}
        {searchVisible && (
          <input
            ref={searchInput}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="cx-sidebar-search"
            placeholder="搜索聊天…"
            aria-label="搜索聊天"
          />
        )}
        <button className="cx-new-chat" onClick={() => void newChat()}>
          <SquarePen size={17} />
          新聊天
        </button>
        <div className="cx-sidebar-scroll">
          {chats.some((chat) => chat.pinned) && (
            <>
              <div className="cx-sidebar-label">
                <span>置顶</span>
              </div>
              {chats.filter((chat) => chat.pinned).map(chatRow)}
            </>
          )}
          <div className="cx-sidebar-label">
            <span>项目</span>
            <button className="cx-icon" aria-label="管理项目" onClick={() => go('projects')}>
              <FolderGit2 size={15} />
            </button>
          </div>
          {projects.map((projectItem) => (
            <section key={projectItem.id} className="cx-sidebar-project">
              <div>
                <button
                  className="cx-project-collapse"
                  aria-label={`展开 ${projectItem.name}`}
                  aria-expanded={!collapsed[projectItem.id]}
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [projectItem.id]: !c[projectItem.id] }))
                  }
                >
                  {collapsed[projectItem.id] ? (
                    <ChevronRight size={13} />
                  ) : (
                    <ChevronDown size={13} />
                  )}
                </button>
                <button
                  className={selectedProjectId === projectItem.id ? 'selected' : ''}
                  onClick={() => void selectProject(projectItem.id)}
                >
                  <FolderGit2 size={16} />
                  <span>{projectItem.name}</span>
                </button>
              </div>
              {!collapsed[projectItem.id] && (
                <div className="cx-project-chats">
                  {chats
                    .filter((c) => c.projectId === projectItem.id)
                    .slice(0, 5)
                    .map((chat) => (
                      <button
                        key={chat.id}
                        className={conversation?.id === chat.id ? 'active' : ''}
                        onClick={() => void selectChat(chat.id)}
                      >
                        {chat.title || '新聊天'}
                      </button>
                    ))}
                </div>
              )}
            </section>
          ))}
          {!projects.length && !loading && (
            <button className="cx-sidebar-action" onClick={() => go('projects')}>
              <FolderGit2 size={16} />
              添加本机项目
            </button>
          )}
          <div className="cx-sidebar-label cx-recent-label">
            <span>最近</span>
          </div>
          {recent.map(chatRow)}
          {!recent.length && (
            <p className="cx-sidebar-empty">
              {search ? '没有匹配的聊天。' : '你的聊天会出现在这里。'}
            </p>
          )}
        </div>
        <button
          className="cx-sidebar-action"
          onClick={() => {
            go('workbench')
            setArchives(true)
          }}
        >
          <Archive size={15} />
          已归档聊天
        </button>
        <button
          className="cx-tools-launcher"
          aria-label="工作台工具"
          aria-expanded={navigation}
          onClick={() => setNavigation(!navigation)}
        >
          <Wrench size={16} />
          <span>工作台工具</span>
          <ChevronDown size={13} />
        </button>
        <div className="cx-sidebar-footer">
          <Link to="/">
            <ArrowLeft size={14} />
            叙芽岛
          </Link>
          <span>
            <i className={'cx-status-dot' + (connection === 'live' ? ' live' : '')}></i>
            {connection === 'live'
              ? '本机已连接'
              : connection === 'retrying'
                ? '正在恢复'
                : '本机工作台'}
          </span>
          <button
            className="cx-icon"
            aria-label={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </aside>
      <main className="cx-main">
        <header className="cx-topbar">
          <div>
            <button
              className="cx-icon cx-mobile-menu"
              aria-label="打开项目导航"
              onClick={() => setMobileSidebar(true)}
            >
              <Menu size={19} />
            </button>
            {renaming ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void rename()
                }}
              >
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  aria-label="聊天名称"
                />
                <button className="cx-icon" aria-label="保存聊天名称">
                  <Check size={16} />
                </button>
              </form>
            ) : (
              <button
                className="cx-conversation-title"
                onClick={() => {
                  if (conversation) {
                    setTitle(conversation.title)
                    setRenaming(true)
                  }
                }}
              >
                {conversation?.title || '新聊天'}
              </button>
            )}
            {project && <small>{project.name}</small>}
          </div>
          <div>
            <button
              className="cx-topbar-tool"
              aria-label="变更审阅"
              title="审阅工作区变更"
              onClick={() => go('changes')}
            >
              <GitCompare size={17} />
              <span>变更</span>
            </button>
            <button
              className={'cx-icon' + (terminal ? ' active' : '')}
              aria-label="打开终端"
              disabled={loading || !initialized || busy}
              onClick={() => void toggleTerminal()}
            >
              <TerminalSquare size={18} />
            </button>
            <button
              className={'cx-icon' + (!rail ? ' active' : '')}
              aria-label="显示或隐藏上下文"
              onClick={() => setRail(!rail)}
            >
              <PanelRightClose size={18} />
            </button>
            {conversation && (
              <details className="cx-header-more">
                <summary aria-label="聊天操作">
                  <Ellipsis size={19} />
                </summary>
                <div>
                  <button onClick={() => void perform(() => refreshSnapshot())}>刷新会话</button>
                  <button
                    onClick={() =>
                      void perform(() =>
                        updateConversation(conversation.id, { pinned: !conversation.pinned }),
                      )
                    }
                  >
                    {conversation.pinned ? '取消置顶' : '置顶聊天'}
                  </button>
                  <button onClick={() => void archiveChat(conversation.id)}>归档聊天</button>
                </div>
              </details>
            )}
          </div>
        </header>
        {error && (
          <div className="cx-banner cx-error" role="alert">
            <span>{error}</span>
            {!initialized && (
              <button className="cx-button" onClick={() => void initialize()}>
                <RefreshCw size={14} />
                重新连接
              </button>
            )}
            <button
              className="cx-icon"
              aria-label="关闭错误提示"
              onClick={() => useCodexStore.setState({ error: '' })}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="cx-banner cx-notice" role="status">
            <span>{notice}</span>
            <button
              className="cx-icon"
              aria-label="关闭提示"
              onClick={() => useCodexStore.setState({ notice: '' })}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className={'cx-body' + (!rail ? ' cx-rail-hidden' : '')}>
          <section className="cx-center cx-center-chat" aria-label="编码聊天">
            {loading ? (
              <div className="cx-loading">正在连接本机码穹…</div>
            ) : switching ? (
              <div className="cx-loading">正在载入会话…</div>
            ) : (
              <>
                <ConversationTimeline onProject={() => go('projects')} onPlan={() => go('tasks')} />
                <Composer
                  onGoal={() => go('tasks')}
                  onChrome={() => setChrome(true)}
                  onPlugins={(plugin) => go('plugins', plugin)}
                />
              </>
            )}
          </section>
          <ContextRail
            onSection={go}
            onAgent={(taskId) => {
              setAgentTask(taskId)
              go('agents')
            }}
            onResource={(selection) => {
              setResource(selection)
              go('outputs')
            }}
            hidden={!rail}
          />
        </div>
        {terminalOpened && (
          <Suspense fallback={null}>
            <TerminalPane visible={terminal} onClose={() => setTerminal(false)} />
          </Suspense>
        )}
      </main>
      {section !== 'workbench' && (
        <WorkbenchDrawer title={sectionTitle} onClose={() => go('workbench')}>
          {section === 'projects' && (
            <ProjectPanel
              onTerminal={() => {
                go('workbench')
                setTerminal(true)
              }}
              onChat={newProjectChat}
            />
          )}
          {section === 'tasks' && <TasksPanel />}
          {section === 'changes' && <ChangesPanel />}
          {section === 'agents' && <AgentsPanel initialTaskId={agentTask} />}
          {section === 'plugins' && (
            <IntegrationsPanel initialPlugin={query.get('plugin') || 'github'} />
          )}
          {section === 'outputs' && <ResourcesPanel initialSelection={resource} />}
          {section === 'memory' && <MemoryPanel />}
          {section === 'automations' && <AutomationPanel />}
          {section === 'settings' && <SettingsPanel />}
        </WorkbenchDrawer>
      )}
      {chrome && <ChromeDialog onClose={() => setChrome(false)} />}
      {archives && (
        <WorkbenchDrawer title="已归档聊天" onClose={() => setArchives(false)}>
          <section className="cx-panel">
            <header className="cx-panel-heading">
              <div>
                <h1>已归档聊天</h1>
                <p>恢复原会话、消息和工作目录，继续之前的任务。</p>
              </div>
            </header>
            <input
              className="cx-archive-search"
              aria-label="搜索已归档聊天"
              placeholder="搜索已归档聊天…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {conversations
              .filter(
                (chat) =>
                  chat.archived &&
                  `${chat.title} ${chat.id}`.toLowerCase().includes(search.toLowerCase()),
              )
              .map((chat) => (
                <article className="cx-card cx-archive-card" key={chat.id}>
                  <div>
                    <strong>{chat.title}</strong>
                    <small>
                      {chat.projectId
                        ? projects.find((item) => item.id === chat.projectId)?.name || '项目聊天'
                        : '独立聊天'}{' '}
                      · {new Date(chat.updatedAt).toLocaleDateString('zh-CN')}
                    </small>
                  </div>
                  <div className="cx-archive-actions">
                    <button
                      className="cx-button"
                      aria-label={`恢复聊天 ${chat.title}`}
                      onClick={() => void restoreChat(chat.id)}
                    >
                      <ArchiveRestore size={15} />
                      恢复聊天
                    </button>
                    <button
                      className="cx-button cx-danger"
                      aria-label={`删除聊天 ${chat.title}`}
                      onClick={() => void deleteChat(chat.id, chat.title)}
                    >
                      <Trash2 size={15} />
                      删除
                    </button>
                  </div>
                </article>
              ))}
            {!conversations.some(
              (chat) =>
                chat.archived &&
                `${chat.title} ${chat.id}`.toLowerCase().includes(search.toLowerCase()),
            ) && <p className="cx-empty">{search ? '没有匹配的归档聊天。' : '暂无归档聊天。'}</p>}
          </section>
        </WorkbenchDrawer>
      )}
      {navigation && (
        <div
          className="cx-app-menu-dismiss"
          aria-hidden="true"
          onClick={() => setNavigation(false)}
        />
      )}
    </div>
  )
}
