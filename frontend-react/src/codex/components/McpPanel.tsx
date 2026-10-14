import { useEffect, useState } from 'react'
import { Plug, Plus, RefreshCw, ShieldCheck, Trash2, Save, KeyRound } from 'lucide-react'
import { api } from '../api'
import { useCodexStore } from '../store'
import type { CodexSchemas } from '../types'

interface McpServer extends Omit<
  Required<CodexSchemas['CodexMcpServerView']>,
  'transport' | 'url' | 'command' | 'lastError' | 'tools'
> {
  transport: 'stdio' | 'streamable-http'
  url?: string
  command?: string
  lastError?: string
  tools: { name: string; description?: string; readOnly: boolean }[]
}
type SecretMode = 'keep' | 'replace' | 'clear'
type SecretEntry = { name: string; value: string }
const lines = (value: string) =>
  value
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean)
const empty = (): McpServer => ({
  id: '',
  name: '',
  transport: 'stdio',
  command: '',
  args: [],
  enabled: false,
  allowedTools: [],
  readOnlyTools: [],
  headerNames: [],
  environmentNames: [],
  hasSecrets: false,
  status: 'disconnected',
  appliesTo: 'next-turn',
  tools: [],
})
const statusLabels: Record<string, string> = {
  connected: '已连接',
  disconnected: '未连接',
  unavailable: '连接不可用',
}

export default function McpPanel() {
  const perform = useCodexStore((s) => s.perform)
  const busy = useCodexStore((s) => s.busy)
  const [servers, setServers] = useState<McpServer[]>([])
  const [selected, setSelected] = useState<McpServer>()
  const [creating, setCreating] = useState(false)
  const [args, setArgs] = useState('')
  const [allowed, setAllowed] = useState('')
  const [readOnly, setReadOnly] = useState('')
  const [headersMode, setHeadersMode] = useState<SecretMode>('keep')
  const [environmentMode, setEnvironmentMode] = useState<SecretMode>('keep')
  const [headers, setHeaders] = useState<SecretEntry[]>([])
  const [environment, setEnvironment] = useState<SecretEntry[]>([])
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const outsideWhitelist = lines(readOnly).filter((name) => !lines(allowed).includes(name))

  async function refresh() {
    setServers(await api<McpServer[]>('/codex/mcp/servers'))
  }
  useEffect(() => {
    void perform(refresh)
  }, [perform])
  function edit(server: McpServer) {
    setCreating(!server.id)
    setSelected({ ...server })
    setArgs(server.args.join('\n'))
    setAllowed(server.allowedTools.join('\n'))
    setReadOnly(server.readOnlyTools.join('\n'))
    setHeadersMode('keep')
    setEnvironmentMode('keep')
    setHeaders([])
    setEnvironment([])
    setDeleteConfirm(false)
  }
  function patch(value: Partial<McpServer>) {
    setSelected((old) => (old ? { ...old, ...value } : old))
  }
  function secrets(mode: SecretMode, entries: SecretEntry[]) {
    if (mode === 'keep') return undefined
    if (mode === 'clear') return {}
    return Object.fromEntries(
      entries.filter((entry) => entry.name.trim()).map((entry) => [entry.name.trim(), entry.value]),
    )
  }
  async function save() {
    if (!selected) return
    if (creating && servers.some((item) => item.id === selected.id)) {
      useCodexStore.setState({ error: '此 MCP 连接标识已经存在，请选择其他标识。' })
      return
    }
    await perform(async () => {
      await api('/codex/mcp/servers/' + encodeURIComponent(selected.id), 'PUT', {
        name: selected.name,
        transport: selected.transport,
        enabled: selected.enabled,
        command: selected.transport === 'stdio' ? selected.command : undefined,
        url: selected.transport === 'streamable-http' ? selected.url : undefined,
        args: args.split('\n').filter((arg) => arg.length > 0),
        allowedTools: lines(allowed),
        readOnlyTools: lines(readOnly),
        headers: secrets(headersMode, headers),
        environment: secrets(environmentMode, environment),
      } satisfies CodexSchemas['CodexMcpServerInput'])
      await refresh()
      setCreating(false)
      setHeaders([])
      setEnvironment([])
      setHeadersMode('keep')
      setEnvironmentMode('keep')
      useCodexStore.setState({ notice: 'MCP 配置已保存。下次执行时使用新配置。' })
    })
  }
  async function connect(server: McpServer) {
    await perform(async () => {
      await api('/codex/mcp/servers/' + encodeURIComponent(server.id) + '/connect', 'POST', {})
      const items = await api<McpServer[]>('/codex/mcp/servers')
      setServers(items)
      const next = items.find((item) => item.id === server.id)
      if (next) edit(next)
    })
  }
  async function remove() {
    if (!selected) return
    await perform(async () => {
      await api('/codex/mcp/servers/' + encodeURIComponent(selected.id), 'DELETE')
      setSelected(undefined)
      setHeaders([])
      setEnvironment([])
      await refresh()
    })
  }
  function secretFields(
    label: string,
    names: string[],
    mode: SecretMode,
    setMode: (mode: SecretMode) => void,
    entries: SecretEntry[],
    setEntries: (entries: SecretEntry[]) => void,
  ) {
    return (
      <fieldset className="cx-mcp-secret">
        <legend>
          <KeyRound size={14} />
          {label}
        </legend>
        <p className="cx-muted">
          已保存名称：{names.length ? names.join('、') : '无'}。服务端不会返回密钥值。
        </p>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as SecretMode)}
          aria-label={label + '修改方式'}
        >
          <option value="keep">保留已保存内容</option>
          <option value="replace">替换所有内容</option>
          <option value="clear">清空所有内容</option>
        </select>
        {mode === 'replace' && (
          <>
            {entries.map((entry, index) => (
              <div className="cx-secret-row" key={index}>
                <input
                  aria-label={label + '名称 ' + (index + 1)}
                  value={entry.name}
                  placeholder="名称"
                  onChange={(e) =>
                    setEntries(
                      entries.map((item, i) =>
                        i === index ? { ...item, name: e.target.value } : item,
                      ),
                    )
                  }
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  aria-label={label + '值 ' + (index + 1)}
                  value={entry.value}
                  placeholder="密钥值"
                  onChange={(e) =>
                    setEntries(
                      entries.map((item, i) =>
                        i === index ? { ...item, value: e.target.value } : item,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="cx-icon"
                  aria-label={label + '移除 ' + (index + 1)}
                  onClick={() => setEntries(entries.filter((_, i) => i !== index))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="cx-button"
              onClick={() => setEntries([...entries, { name: '', value: '' }])}
            >
              <Plus size={13} />
              添加{label}
            </button>
          </>
        )}
      </fieldset>
    )
  }
  return (
    <section className="cx-mcp-panel">
      <header className="cx-panel-heading">
        <div>
          <h2>
            <Plug size={19} />
            MCP 连接
          </h2>
          <p>连接本机进程或 HTTP 服务，下次执行时使用新配置。</p>
        </div>
        <div className="cx-inline-actions">
          <button className="cx-button" onClick={() => void perform(refresh)}>
            <RefreshCw size={14} />
            刷新
          </button>
          <button className="cx-button" onClick={() => edit(empty())}>
            <Plus size={14} />
            添加 MCP
          </button>
        </div>
      </header>
      <div className="cx-mcp-servers">
        {servers.map((server) => (
          <article className="cx-card" key={server.id}>
            <Plug size={18} />
            <div>
              <strong>{server.name}</strong>
              <small>
                {server.transport} · {server.enabled ? '已启用' : '已停用'} ·{' '}
                {statusLabels[server.status] || server.status}
              </small>
              {server.lastError && <p className="cx-error">{server.lastError}</p>}
            </div>
            <button className="cx-button" onClick={() => edit(server)}>
              配置
            </button>
            <button
              className="cx-button"
              disabled={!server.enabled || busy}
              onClick={() => void connect(server)}
            >
              连接与发现
            </button>
          </article>
        ))}
      </div>
      {!servers.length && (
        <p className="cx-empty">尚未配置 MCP 服务。空白工具名单不会授予任何工具权限。</p>
      )}
      {selected && (
        <form
          className="cx-card cx-form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <h3>
            <ShieldCheck size={17} />
            {selected.name || '新的 MCP 连接'}
          </h3>
          <label>
            连接标识
            <input
              required
              maxLength={20}
              pattern="[A-Za-z0-9_-]+"
              value={selected.id}
              disabled={!creating}
              onChange={(event) => patch({ id: event.target.value })}
              placeholder="例如 local-tools"
            />
          </label>
          <label>
            连接名称
            <input
              required
              value={selected.name}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </label>
          <label>
            传输方式
            <select
              value={selected.transport}
              onChange={(event) =>
                patch({ transport: event.target.value as McpServer['transport'] })
              }
            >
              <option value="stdio">本机进程 stdio</option>
              <option value="streamable-http">Streamable HTTP</option>
            </select>
          </label>
          <label className="cx-checkbox">
            <input
              type="checkbox"
              checked={selected.enabled}
              onChange={(event) => patch({ enabled: event.target.checked })}
            />
            启用此连接
          </label>
          {selected.transport === 'stdio' ? (
            <>
              <label>
                可执行文件绝对路径
                <input
                  required
                  value={selected.command || ''}
                  onChange={(event) => patch({ command: event.target.value })}
                  placeholder="D:\\tools\\mcp-server.exe"
                />
              </label>
              <label>
                启动参数（每行一个）
                <textarea value={args} onChange={(event) => setArgs(event.target.value)} rows={3} />
              </label>
            </>
          ) : (
            <label>
              服务 URL
              <input
                type="url"
                required
                value={selected.url || ''}
                onChange={(event) => patch({ url: event.target.value })}
                placeholder="http://127.0.0.1:8080/mcp"
              />
            </label>
          )}
          <label>
            允许工具白名单
            <textarea
              value={allowed}
              onChange={(event) => setAllowed(event.target.value)}
              rows={3}
              placeholder="每行一个工具名称，空列表表示全部禁止"
            />
          </label>
          <label>
            已确认只读工具
            <textarea
              value={readOnly}
              onChange={(event) => setReadOnly(event.target.value)}
              rows={3}
              placeholder="仅填写已确认不会修改状态的工具"
            />
          </label>
          {outsideWhitelist.length > 0 && (
            <p className="cx-error" role="alert">
              只读名单必须包含在允许名单中：{outsideWhitelist.join('、')}
            </p>
          )}
          {secretFields(
            '请求头',
            selected.headerNames,
            headersMode,
            setHeadersMode,
            headers,
            setHeaders,
          )}
          {secretFields(
            '环境变量',
            selected.environmentNames,
            environmentMode,
            setEnvironmentMode,
            environment,
            setEnvironment,
          )}
          {!!selected.tools.length && (
            <div className="cx-mcp-discovered">
              <h3>实际发现的工具</h3>
              {selected.tools.map((tool) => (
                <label key={tool.name} className="cx-option">
                  <input
                    type="checkbox"
                    checked={lines(allowed).includes(tool.name)}
                    onChange={(event) =>
                      setAllowed(
                        (event.target.checked
                          ? [...new Set([...lines(allowed), tool.name])]
                          : lines(allowed).filter((name) => name !== tool.name)
                        ).join('\n'),
                      )
                    }
                  />
                  <span>
                    {tool.name}
                    <small>
                      {tool.description || '未提供工具描述'} ·{' '}
                      {tool.readOnly ? '服务声明只读' : '可能修改状态'}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="cx-muted">
            更新会撤销旧工具绑定，当前运行结束后的下次执行会自动重建。修改操作仍遵循会话审批模式。
          </p>
          <div className="cx-inline-actions">
            <button className="cx-button cx-primary" disabled={busy || outsideWhitelist.length > 0}>
              <Save size={14} />
              保存 MCP
            </button>
            {servers.some((item) => item.id === selected.id) && (
              <button type="button" className="cx-button" onClick={() => setDeleteConfirm(true)}>
                <Trash2 size={14} />
                删除连接
              </button>
            )}
          </div>
          {deleteConfirm && (
            <div className="cx-confirm-box">
              <p>删除“{selected.name}”配置并关闭连接？</p>
              <button type="button" className="cx-button" onClick={() => void remove()}>
                确认删除 MCP
              </button>
              <button type="button" className="cx-button" onClick={() => setDeleteConfirm(false)}>
                返回
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  )
}
