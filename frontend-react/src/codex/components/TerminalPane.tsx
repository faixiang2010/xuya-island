import { useEffect, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Plus, X, TerminalSquare } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { api } from '../api'
import type { CodexSchemas } from '../types'
import { useCodexStore, selectWorkspace } from '../store'
import { accountStorage } from '../../account/session'

interface Props {
  visible: boolean
  onClose: () => void
}

interface Session {
  id: string
  workspaceId: string
  label: string
  directory?: string
  terminal: Terminal
  fit: FitAddon
  socket?: WebSocket
  host?: HTMLDivElement
  status: string
}

export default function TerminalPane({ visible, onClose }: Props) {
  const selectedWorkspaceId = useCodexStore((s) => s.selectedWorkspaceId)
  const workspace = useCodexStore(selectWorkspace)

  const sessionsRef = useRef<Session[]>([])
  const [selected, setSelectedState] = useState('')
  const selectedRef = useRef('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [shell, setShell] = useState('')
  const [directory, setDirectory] = useState('')
  const [, bump] = useReducer((count: number) => count + 1, 0)
  const observerRef = useRef<ResizeObserver | undefined>(undefined)
  const visibleRef = useRef(visible)
  const disposedRef = useRef(false)
  visibleRef.current = visible

  function setSelected(id: string) {
    selectedRef.current = id
    setSelectedState(id)
  }

  const tabs = sessionsRef.current.filter((s) => s.workspaceId === selectedWorkspaceId)
  const active = sessionsRef.current.find((s) => s.id === selected)
  const directoryKey = selectedWorkspaceId
    ? `xuya.codex.terminal.directory.${selectedWorkspaceId}`
    : ''
  const activeDirectory = active?.directory || workspace?.path || ''

  function changeDirectory(value: string) {
    setDirectory(value)
    if (directoryKey) accountStorage.setItem(directoryKey, value)
  }

  useEffect(() => {
    setDirectory(directoryKey ? (accountStorage.getItem(directoryKey) ?? '') : '')
  }, [directoryKey])

  function fit(session: Session) {
    if (!visibleRef.current || session.id !== selectedRef.current || !session.host?.clientWidth)
      return
    session.fit.fit()
    if (session.socket?.readyState === WebSocket.OPEN)
      session.socket.send(
        JSON.stringify({
          type: 'resize',
          cols: session.terminal.cols,
          rows: session.terminal.rows,
        }),
      )
  }

  async function connect(session: Session) {
    const ticket = await api<CodexSchemas['CodexTerminalTicket']>(
      `/codex/terminals/${session.id}/ticket`,
      'POST',
      {},
    )
    if (!ticket.ticket) throw new Error('终端连接票据没有返回。')
    const endpoint = new URL(
      ticket.webSocketPath ||
        `/api/v1/codex/terminal/socket?ticket=${encodeURIComponent(ticket.ticket)}`,
      location.href,
    )
    if (!endpoint.searchParams.has('ticket')) endpoint.searchParams.set('ticket', ticket.ticket)
    endpoint.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(endpoint)
    session.socket = socket
    session.status = '连接中'
    bump()
    socket.onopen = () => {
      session.status = '已连接'
      bump()
      fit(session)
    }
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data))
        if (message.type === 'output')
          session.terminal.write(String(message.text ?? message.data ?? ''))
        if (message.type === 'exit') {
          session.status = '已退出'
          session.terminal.writeln(`\r\n[进程退出 ${message.exitCode ?? ''}]`)
          bump()
        }
      } catch {
        session.terminal.write(String(event.data))
      }
    }
    socket.onerror = () => {
      session.status = '连接失败'
      bump()
      setError('终端连接失败。请检查本机 PTY 能力，或重新连接当前终端。')
    }
    socket.onclose = () => {
      if (session.status !== '已退出') {
        session.status = '已断开'
        bump()
      }
    }
  }

  function createSession(id: string, workspaceId: string, workingDirectory?: string) {
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 16,
      fontFamily: 'Consolas, monospace',
      theme: { background: '#181b20', foreground: '#e5e7eb' },
      allowProposedApi: false,
      scrollback: 5000,
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    // 工作台快捷键由页面处理，不把 Ctrl+反引号作为输入写入持续运行的 Shell。
    terminal.attachCustomKeyEventHandler(
      (event) => !((event.ctrlKey || event.metaKey) && event.code === 'Backquote'),
    )
    const session: Session = {
      id,
      workspaceId,
      label: `终端 ${sessionsRef.current.filter((s) => s.workspaceId === workspaceId).length + 1}`,
      directory: workingDirectory,
      terminal,
      fit: fitAddon,
      status: '准备中',
    }
    sessionsRef.current.push(session)
    flushSync(() => {
      setSelected(session.id)
      bump()
    })
    terminal.onData((data) => {
      if (session.socket?.readyState === WebSocket.OPEN)
        session.socket.send(JSON.stringify({ type: 'input', data }))
    })
    return session
  }

  async function create() {
    if (!selectedWorkspaceId) {
      setError('请先选择工作区。')
      return
    }
    setCreating(true)
    setError('')
    try {
      const result = await api<CodexSchemas['CodexTerminalInfo']>(
        `/codex/workspaces/${selectedWorkspaceId}/terminals`,
        'POST',
        {
          shell: shell || undefined,
          directory: directory.trim() || undefined,
          cols: 100,
          rows: 20,
        } satisfies CodexSchemas['CodexTerminalCreate'],
      )
      if (disposedRef.current) return
      const id = result.id
      if (!id) throw new Error('终端没有返回有效标识。')
      const session = createSession(id, selectedWorkspaceId, result.directory)
      await connect(session)
      fit(session)
      session.terminal.focus()
    } catch (e) {
      setError(e instanceof Error ? e.message : '终端启动失败。')
    } finally {
      setCreating(false)
    }
  }

  function mountHost(element: HTMLDivElement | null, session: Session) {
    if (!element || session.host) return
    session.host = element
    session.terminal.open(element)
    if (!observerRef.current)
      observerRef.current = new ResizeObserver(() => {
        const current = sessionsRef.current.find((s) => s.id === selectedRef.current)
        if (current) fit(current)
      })
    observerRef.current.observe(element)
    fit(session)
  }

  async function close(session: Session) {
    try {
      await api(`/codex/terminals/${session.id}`, 'DELETE')
      session.socket?.close()
      session.terminal.dispose()
      if (session.host) observerRef.current?.unobserve(session.host)
      sessionsRef.current = sessionsRef.current.filter((s) => s.id !== session.id)
      const remaining = sessionsRef.current.filter((s) => s.workspaceId === selectedWorkspaceId)
      setSelected(remaining[0]?.id ?? '')
      bump()
    } catch (e) {
      setError(e instanceof Error ? e.message : '终端关闭失败。')
    }
  }

  async function reconnect() {
    const current = sessionsRef.current.find((s) => s.id === selectedRef.current)
    if (current) {
      current.socket?.close()
      try {
        await connect(current)
      } catch (e) {
        setError(String(e))
      }
    }
  }

  useEffect(() => {
    const remaining = sessionsRef.current.filter((s) => s.workspaceId === selectedWorkspaceId)
    setSelected(remaining[0]?.id ?? '')
    if (!selectedWorkspaceId) return
    let current = true
    void (async () => {
      try {
        // 页面刷新后连接仍在运行的后台PTY，避免创建第二个进程重复执行用户命令。
        const records = await api<CodexSchemas['CodexTerminalInfo'][]>(
          `/codex/workspaces/${selectedWorkspaceId}/terminals`,
        )
        for (const record of records) {
          if (!current || disposedRef.current) return
          if (
            !record.id ||
            !record.running ||
            sessionsRef.current.some((session) => session.id === record.id)
          )
            continue
          const session = createSession(record.id, selectedWorkspaceId, record.directory)
          await connect(session)
        }
      } catch (e) {
        if (current && !disposedRef.current)
          setError(e instanceof Error ? e.message : '现有终端恢复失败。')
      }
    })()
    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId])

  useEffect(() => {
    if (visible) {
      const current = sessionsRef.current.find((s) => s.id === selectedRef.current)
      if (current) fit(current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  useEffect(() => {
    const current = sessionsRef.current.find((s) => s.id === selectedRef.current)
    if (current) {
      fit(current)
      current.terminal.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      observerRef.current?.disconnect()
      for (const session of sessionsRef.current) {
        session.socket?.close()
        session.terminal.dispose()
      }
    }
  }, [])

  return (
    <section
      className="cx-terminal-pane"
      aria-label="工作区终端"
      style={visible ? undefined : { display: 'none' }}
    >
      <header>
        <span>
          <TerminalSquare size={16} />
          完整终端
          <small className="cx-terminal-meta" title={activeDirectory}>
            {active?.status ? `${active.status} · ${activeDirectory}` : activeDirectory}
          </small>
        </span>
        <div>
          <input
            className="cx-terminal-directory"
            value={directory}
            disabled={creating || workspace?.environment === 'docker'}
            aria-label="终端工作目录"
            title={directory || workspace?.path || '当前工作区目录'}
            placeholder={workspace?.path ? `默认：${workspace.path}` : '默认：当前工作区'}
            onChange={(event) => changeDirectory(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !creating && workspace) {
                event.preventDefault()
                void create()
              }
            }}
          />
          <select value={shell} aria-label="终端 Shell" onChange={(e) => setShell(e.target.value)}>
            <option value="">默认 Shell</option>
            <option value="powershell">PowerShell</option>
            <option value="cmd">CMD</option>
          </select>
          <button
            aria-label="新建终端"
            disabled={creating || !workspace}
            onClick={() => void create()}
          >
            <Plus size={15} />
            新建
          </button>
          {(active?.status === '已断开' || active?.status === '连接失败') && (
            <button onClick={() => void reconnect()}>重新连接</button>
          )}
          <button className="cx-icon" aria-label="收起终端" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
      </header>
      {workspace?.mode === 'scratch' && (
        <p className="cx-terminal-hint">
          独立工作区目录为空。可在上方填写本机项目目录（如 D:\my-project），新建终端会从该目录启动。
        </p>
      )}
      {workspace?.environment === 'docker' && (
        <p className="cx-terminal-hint">Docker 工作区终端固定启动在 /workspace。</p>
      )}
      {error && (
        <p className="cx-error" role="alert">
          {error}
        </p>
      )}
      <div className="cx-terminal-tabs">
        {tabs.map((tab) => (
          <span key={tab.id} className={selected === tab.id ? 'active' : undefined}>
            <button onClick={() => setSelected(tab.id)}>{tab.label}</button>
            <button
              className="cx-icon"
              aria-label={`关闭${tab.label}`}
              onClick={() => void close(tab)}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      {!tabs.length && (
        <div className="cx-terminal-empty">
          <p>使用当前工作区或填写本机目录，启动 PowerShell 或 CMD。</p>
          <button
            className="cx-button"
            disabled={creating || !workspace}
            onClick={() => void create()}
          >
            新建终端
          </button>
        </div>
      )}
      {sessionsRef.current.map((session) => (
        <div
          key={session.id}
          ref={(element) => {
            if (element) mountHost(element, session)
          }}
          className="cx-terminal-host"
          style={
            selected === session.id && session.workspaceId === selectedWorkspaceId
              ? undefined
              : { display: 'none' }
          }
        />
      ))}
    </section>
  )
}
