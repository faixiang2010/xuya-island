import { useEffect, useState } from 'react'
import { Globe, RefreshCw, X, Camera } from 'lucide-react'
import { api } from '../api'
import { useCodexStore } from '../store'

interface ChromeStatus {
  connected: boolean
  lastSeen?: string
  registrationPresent: boolean
  extensionInstalled: boolean
  selectedTabId?: number
  message?: string
}

interface ChromeTab {
  id: number
  title: string
  url: string
  active: boolean
}

export default function ChromeDialog({ onClose }: { onClose: () => void }) {
  const conversation = useCodexStore((s) => s.conversation)
  const [status, setStatus] = useState<ChromeStatus>()
  const [tabs, setTabs] = useState<ChromeTab[]>([])
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [url, setUrl] = useState('')
  const [extensionId, setExtensionId] = useState('')
  const installCommand = `powershell -ExecutionPolicy Bypass -File backend/scripts/codex-chrome.ps1 -Mode Install -ExtensionId ${/^[a-p]{32}$/.test(extensionId) ? extensionId : '<实际扩展ID>'}`

  async function copyInstall() {
    try {
      await navigator.clipboard.writeText(installCommand)
      setResult('安装命令已复制；在工程根目录执行，然后在扩展弹窗点击连接。')
    } catch {
      setError('剪贴板不可用，请手动复制下方命令。')
    }
  }

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const next = await api<ChromeStatus>('/codex/chrome/status')
      setStatus(next)
      if (next?.connected) {
        const response = await api<{ tabs: ChromeTab[] }>('/codex/chrome/tabs')
        setTabs(response.tabs)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chrome 连接检查失败。')
    } finally {
      setLoading(false)
    }
  }

  async function action(kind: string, tabId?: number) {
    setLoading(true)
    setError('')
    try {
      const response = await api('/codex/chrome/actions', 'POST', {
        action: kind,
        tabId: tabId ?? status?.selectedTabId,
        url: kind === 'navigate' ? url : undefined,
      })
      setResult(JSON.stringify(response, null, 2))
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chrome 操作失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="cx-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="cx-dialog" role="dialog" aria-modal="true" aria-labelledby="chrome-title">
        <header>
          <div>
            <h2 id="chrome-title">
              <Globe size={20} />
              附加 Google Chrome
            </h2>
            <p>通过专用扩展连接已有登录标签页。</p>
          </div>
          <button className="cx-icon" aria-label="关闭 Chrome 面板" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {error && (
          <p className="cx-error" role="alert">
            {error}
          </p>
        )}
        <div className="cx-chrome-status">
          <span className={'cx-status-dot' + (status?.connected ? ' live' : '')}></span>
          {status?.connected ? '已连接' : '未连接'}
          <small>{status?.message}</small>
          <button className="cx-button" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw size={14} />
            重新检查
          </button>
        </div>
        {status && !status.connected ? (
          <div className="cx-card">
            <strong>完成本机连接配置</strong>
            <ol>
              <li>
                在 Chrome 扩展页启用开发者模式，加载{' '}
                <code>backend/src/main/resources/codex/chrome/extension</code>。
              </li>
              <li>
                复制扩展实际 ID，执行下方 <code>backend/scripts/codex-chrome.ps1</code>{' '}
                安装命令，为当前用户注册 Native Messaging。
              </li>
              <li>打开扩展并连接本机码穹，然后点击“重新检查”。</li>
            </ol>
            <label className="cx-chrome-install">
              实际扩展 ID
              <input
                value={extensionId}
                onChange={(event) => setExtensionId(event.target.value)}
                placeholder="在 chrome://extensions 中复制 32 位 ID"
              />
            </label>
            <pre>{installCommand}</pre>
            <button className="cx-button" onClick={() => void copyInstall()}>
              复制安装命令
            </button>
            <p className="cx-muted">
              Native host {status.registrationPresent ? '已注册' : '未注册'} · 扩展
              {status.extensionInstalled ? '已连接过' : '尚未连接'}。普通 Chrome
              无需开放调试端口；连接失败不会阻止编码业务。
            </p>
          </div>
        ) : (
          <div>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={
                  'cx-card cx-chrome-tab' + (tab.id === status?.selectedTabId ? ' selected' : '')
                }
                disabled={loading}
                onClick={() => void action('selectTab', tab.id)}
              >
                <Globe size={18} />
                <span>
                  <strong>{tab.title}</strong>
                  <small>{tab.url}</small>
                </span>
                <small>{tab.id === status?.selectedTabId ? '已附加' : '附加'}</small>
              </button>
            ))}
            {status?.selectedTabId ? (
              <div className="cx-chrome-controls">
                <button
                  className="cx-button"
                  disabled={loading}
                  onClick={() => void action('snapshot')}
                >
                  读取页面
                </button>
                <button
                  className="cx-button"
                  disabled={loading}
                  onClick={() => void action('screenshot')}
                >
                  <Camera size={14} />
                  截图
                </button>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void action('navigate')
                  }}
                >
                  <input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    type="url"
                    required
                    placeholder="https://…"
                    aria-label="浏览器访问地址"
                  />
                  <button className="cx-button" disabled={loading}>
                    访问
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        )}
        {result && <pre className="cx-result">{result}</pre>}
        <footer>
          <span className="cx-muted">当前会话：{conversation?.title || '尚未创建'}</span>
          <button className="cx-button" onClick={onClose}>
            完成
          </button>
        </footer>
      </section>
    </div>
  )
}
