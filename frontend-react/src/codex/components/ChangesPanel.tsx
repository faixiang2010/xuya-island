import { useEffect, useState } from 'react'
import { RefreshCw, GitCompare, Check } from 'lucide-react'
import { api } from '../api'
import { useCodexStore, selectProject, selectWorkspace } from '../store'

interface ChangedFile {
  path: string
  status: string
  binary: boolean
  before: string
  after: string
  patch: string
}

interface Diff {
  workspaceId: string
  sourceRevision: string
  currentSourceRevision: string
  resultRevision: string
  files: ChangedFile[]
}

interface Conflict {
  path: string
  reason: string
  mergedContent?: string
}

export default function ChangesPanel() {
  const project = useCodexStore(selectProject)
  const workspace = useCodexStore(selectWorkspace)
  const selectedWorkspaceId = useCodexStore((s) => s.selectedWorkspaceId)
  const [diff, setDiff] = useState<Diff>()
  const [selected, setSelected] = useState('')
  const [strategy, setStrategy] = useState('cas')
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const file = diff?.files.find((f) => f.path === selected)

  async function refresh() {
    if (!workspace) return
    setLoading(true)
    setError('')
    setConfirm(false)
    try {
      const next = await api<Diff>(`/codex/workspaces/${selectedWorkspaceId}/diff`)
      setDiff(next)
      setSelected(next.files[0]?.path ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法读取变更。')
    } finally {
      setLoading(false)
    }
  }

  async function apply() {
    if (!diff) return
    setLoading(true)
    setError('')
    try {
      const result = await api<{
        status: string
        applied: string[]
        conflicts: Conflict[]
      }>(`/codex/workspaces/${diff.workspaceId}/apply`, 'POST', {
        expectedSourceRevision: diff.currentSourceRevision,
        resultRevision: diff.resultRevision,
        strategy,
      })
      setConflicts(result.conflicts ?? [])
      setConfirm(false)
      if (result.status !== 'applied' || result.conflicts.length)
        setError(
          `已回写 ${result.applied.length} 个文件，仍有 ${result.conflicts.length} 个未合并的冲突。请处理下方冲突后重新审阅。`,
        )
      else {
        useCodexStore.setState({ notice: `已回写 ${result.applied.length} 个文件到源项目。` })
        await refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '回写失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId])

  return (
    <section className="cx-panel">
      <header className="cx-panel-heading">
        <div>
          <h1>变更审阅</h1>
          <p>审阅隔离工作区与源项目的实际差异。</p>
        </div>
        <button
          className="cx-button"
          disabled={loading || !workspace}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} />
          刷新
        </button>
      </header>
      {error && (
        <p className="cx-error" role="alert">
          {error}
        </p>
      )}
      {!diff?.files.length ? (
        <div className="cx-empty">
          <GitCompare size={30} />
          <p>
            {workspace ? '当前工作目录没有变更。' : '开始任务后，可在这里审阅生成或修改的文件。'}
          </p>
        </div>
      ) : (
        <div className="cx-diff-layout">
          <nav>
            {diff.files.map((change) => (
              <button
                key={change.path}
                className={selected === change.path ? 'active' : ''}
                onClick={() => setSelected(change.path)}
              >
                <span className={'cx-change-' + change.status}>
                  {change.status === 'added' ? '+' : change.status === 'deleted' ? '−' : 'M'}
                </span>
                {change.path}
              </button>
            ))}
          </nav>
          <div className="cx-diff-content">
            <h3>{selected}</h3>
            {file?.binary ? (
              <p>二进制文件，无法显示文本差异。</p>
            ) : (
              <pre className="cx-patch">
                {(file?.patch || '').split('\n').map((line, index) => (
                  <span
                    key={index}
                    className={
                      (line.startsWith('+') ? 'added ' : '') +
                      (line.startsWith('-') ? 'removed ' : '') +
                      (line.startsWith('@@') ? 'hunk' : '')
                    }
                  >
                    {line + '\n'}
                  </span>
                ))}
              </pre>
            )}
          </div>
        </div>
      )}
      {diff?.files.length && project ? (
        <div className="cx-apply-bar">
          <select
            value={strategy}
            onChange={(event) => setStrategy(event.target.value)}
            aria-label="回写策略"
          >
            <option value="cas">版本校验回写</option>
            <option value="three-way">三方合并</option>
          </select>
          <button
            className="cx-button cx-primary"
            disabled={loading}
            onClick={() => setConfirm(true)}
          >
            <Check size={15} />
            回写源项目
          </button>
        </div>
      ) : null}
      {confirm && (
        <div className="cx-confirm">
          <strong>确认回写 {diff?.files.length} 个文件？</strong>
          <p>
            目标：{project?.path}。后端将再次核验源版本
            {diff?.currentSourceRevision?.slice(0, 12) || '空版本'}，发现冲突时保留源文件。
          </p>
          <button className="cx-button" onClick={() => setConfirm(false)}>
            返回审阅
          </button>
          <button className="cx-button cx-primary" disabled={loading} onClick={() => void apply()}>
            确认回写
          </button>
        </div>
      )}
      {conflicts.map((conflict) => (
        <article key={conflict.path} className="cx-card">
          <strong>{conflict.path}</strong>
          <p>{conflict.reason}</p>
          {conflict.mergedContent && <pre>{conflict.mergedContent}</pre>}
        </article>
      ))}
    </section>
  )
}
