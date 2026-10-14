import { useEffect, useState } from 'react'
import { Settings2, Activity, RefreshCw, ExternalLink, Save } from 'lucide-react'
import { api } from '../api'
import { useCodexStore, selectActiveExecution } from '../store'

interface Settings {
  models?: Record<string, unknown>[]
  model: {
    provider: string
    baseUrl: string
    name: string
    configured: boolean
    supportsImages: boolean
    reasoningEfforts: string[]
  }
  jev: Record<string, unknown>
  studio: Record<string, unknown>
  swaggerUrl: string
}

export default function SettingsPanel() {
  const conversation = useCodexStore((s) => s.conversation)
  const busy = useCodexStore((s) => s.busy)
  const activeExecution = useCodexStore(selectActiveExecution)
  const eventLog = useCodexStore((s) => s.eventLog)
  const perform = useCodexStore((s) => s.perform)
  const configure = useCodexStore((s) => s.configure)
  const loadSection = useCodexStore((s) => s.loadSection)

  const [settings, setSettings] = useState<Settings>()
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown>>()
  const [provider, setProvider] = useState('openai')
  const [baseUrl, setBaseUrl] = useState('')
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [images, setImages] = useState(false)
  const [efforts, setEfforts] = useState('low,medium,high')
  const [budget, setBudget] = useState(100000)
  const [minutes, setMinutes] = useState(30)
  const [skillName, setSkillName] = useState('')
  const [skillContent, setSkillContent] = useState('')
  const [skillEnabled, setSkillEnabled] = useState(true)

  async function refresh() {
    await perform(async () => {
      const [config, state] = await Promise.all([
        api<Settings>('/codex/settings'),
        api<Record<string, unknown>>('/codex/diagnostics'),
      ])
      const snapshot = useCodexStore.getState()
      setSettings(config)
      setDiagnostics(state)
      setProvider(config.model.provider)
      setBaseUrl(config.model.baseUrl)
      setName(config.model.name)
      setImages(config.model.supportsImages)
      setEfforts((config.model.reasoningEfforts || []).join(','))
      setBudget(
        snapshot.conversation?.maxTokens ?? snapshot.capabilities?.defaults.maxTokens ?? 100000,
      )
      setMinutes(Math.round((snapshot.conversation?.maxActiveMs ?? 1800000) / 60000))
    })
  }

  async function saveModel() {
    await perform(async () => {
      await api('/codex/settings/model', 'PUT', {
        provider,
        baseUrl,
        name,
        apiKey: clearKey ? '' : apiKey || undefined,
        supportsImages: images,
        reasoningEfforts: efforts
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean),
      })
      setApiKey('')
      setClearKey(false)
      await refresh()
      await loadSection('settings')
      useCodexStore.setState({ notice: '模型配置已保存到后端。' })
    })
  }

  async function toggleOptional(service: 'jev' | 'studio', enabled: boolean) {
    const saved = await perform(() =>
      api<{ saved: boolean }>(`/codex/settings/${service}`, 'PUT', { enabled }),
    )
    if (saved) {
      await refresh()
      useCodexStore.setState({
        notice: `${service === 'jev' ? 'JEV' : 'AgentScope Studio'} 开关已保存，下次执行使用新配置。`,
      })
    }
  }

  async function saveSkill() {
    await perform(async () => {
      await api(`/codex/skills/${encodeURIComponent(skillName)}`, 'PUT', {
        content: skillContent,
        enabled: skillEnabled,
      })
      useCodexStore.setState({ notice: '技能已保存。' })
      await loadSection('plugins')
    })
  }

  async function saveBudget() {
    await perform(() => configure({ maxTokens: budget, maxActiveMs: minutes * 60000 }))
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="cx-panel">
      <header className="cx-panel-heading">
        <div>
          <h1>设置与观测</h1>
          <p>本机模型配置、运行预算与可选服务状态。</p>
        </div>
        <button className="cx-button" onClick={() => void refresh()}>
          <RefreshCw size={15} />
          检查状态
        </button>
      </header>
      <form
        className="cx-card cx-form-grid"
        onSubmit={(e) => {
          e.preventDefault()
          void saveModel()
        }}
      >
        <h3>
          <Settings2 size={18} />
          模型连接
        </h3>
        {settings && (
          <p className="cx-muted">
            {settings.model.configured ? '已有密钥配置，留空可保留。' : '尚未配置模型。'}
            密钥只提交给本机后端，不保存在浏览器。
          </p>
        )}
        <label>
          提供商
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="openai">OpenAI 兼容</option>
            <option value="dashscope">DashScope（OpenAI 兼容地址）</option>
          </select>
        </label>
        <label>
          Base URL
          <input
            value={baseUrl}
            type="url"
            required
            placeholder="https://api.example.com/v1"
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>
        <label>
          模型名称
          <input
            value={name}
            required
            placeholder="模型服务的实际名称"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          API Key
          <input
            value={apiKey}
            type="password"
            autoComplete="new-password"
            placeholder="留空保留已有配置"
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        <label>
          推理强度（逗号分隔）
          <input
            value={efforts}
            placeholder="low,medium,high,xhigh"
            onChange={(e) => setEfforts(e.target.value)}
          />
        </label>
        <label className="cx-check">
          <input type="checkbox" checked={images} onChange={(e) => setImages(e.target.checked)} />
          模型支持图片输入
        </label>
        <label className="cx-check">
          <input
            type="checkbox"
            checked={clearKey}
            onChange={(e) => setClearKey(e.target.checked)}
          />
          明确清除已有密钥
        </label>
        <button className="cx-button cx-primary" disabled={busy}>
          <Save size={14} />
          保存模型配置
        </button>
      </form>
      <form
        className="cx-card cx-form-grid"
        onSubmit={(e) => {
          e.preventDefault()
          void saveBudget()
        }}
      >
        <h3>当前会话预算</h3>
        <label>
          Token 上限
          <input
            value={budget}
            type="number"
            min={1000}
            required
            onChange={(e) => setBudget(Number(e.target.value))}
          />
        </label>
        <label>
          活跃时间上限（分钟）
          <input
            value={minutes}
            type="number"
            min={1}
            required
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
        <button className="cx-button" disabled={busy || activeExecution || !conversation}>
          保存预算
        </button>
      </form>
      <div className="cx-observability-grid">
        <article className="cx-card">
          <h3>
            <Activity size={17} />
            JEV 风险决策
          </h3>
          <label className="cx-service-switch">
            <span>启用 JEV</span>
            <input
              role="switch"
              type="checkbox"
              checked={Boolean(settings?.jev.enabled)}
              disabled={busy || !settings}
              onChange={(event) => void toggleOptional('jev', event.target.checked)}
            />
          </label>
          <p>
            {settings?.jev.enabled ? '开关已启用' : '开关未启用'} ·{' '}
            {String(settings?.jev.state || '尚未检查')}
          </p>
          <p className="cx-muted">服务不可达时按本机审批策略继续，不阻塞正常业务启动。</p>
          <details>
            <summary>查看状态</summary>
            <pre>{JSON.stringify(diagnostics?.jev || settings?.jev, null, 2)}</pre>
          </details>
        </article>
        <article className="cx-card">
          <h3>AgentScope Studio</h3>
          <label className="cx-service-switch">
            <span>启用 Studio</span>
            <input
              role="switch"
              type="checkbox"
              checked={Boolean(settings?.studio.enabled)}
              disabled={busy || !settings}
              onChange={(event) => void toggleOptional('studio', event.target.checked)}
            />
          </label>
          <p>
            {settings?.studio.enabled ? '已启用' : '未启用'} ·{' '}
            {String(settings?.studio.state || '尚未检查')}
          </p>
          <small>
            队列 {Number(settings?.studio.queueSize || 0)} · 丢弃{' '}
            {Number(settings?.studio.dropped || 0)}
          </small>
          <details>
            <summary>查看状态</summary>
            <pre>{JSON.stringify(diagnostics?.studio || settings?.studio, null, 2)}</pre>
          </details>
        </article>
      </div>
      <article className="cx-card">
        <h3>通用 API 与诊断</h3>
        <p className="cx-muted">
          REST 用于持久任务与资源；AG-UI 提供标准事件协议。所有界面使用同一个会话事实源。
        </p>
        {settings?.swaggerUrl && (
          <a
            className="cx-button"
            href={settings.swaggerUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={14} />
            打开 Swagger
          </a>
        )}
        <details>
          <summary>完整运行诊断</summary>
          <pre>{JSON.stringify(diagnostics, null, 2)}</pre>
        </details>
      </article>
      <form
        className="cx-card cx-form-grid"
        onSubmit={(e) => {
          e.preventDefault()
          void saveSkill()
        }}
      >
        <h3>Harness 技能管理</h3>
        <label>
          技能名称
          <input
            value={skillName}
            required
            placeholder="code-review"
            onChange={(e) => setSkillName(e.target.value)}
          />
        </label>
        <label className="cx-check">
          <input
            type="checkbox"
            checked={skillEnabled}
            onChange={(e) => setSkillEnabled(e.target.checked)}
          />
          启用技能
        </label>
        <label>
          SKILL.md 内容
          <textarea
            value={skillContent}
            rows={8}
            required
            placeholder={'---\nname: code-review\ndescription: ...\n---\n技能的执行步骤与约束'}
            onChange={(e) => setSkillContent(e.target.value)}
          />
        </label>
        <button className="cx-button" disabled={busy}>
          保存技能
        </button>
      </form>
      <details className="cx-card">
        <summary>本会话事件观测</summary>
        <pre>{JSON.stringify(eventLog.slice(-30), null, 2)}</pre>
      </details>
    </section>
  )
}
