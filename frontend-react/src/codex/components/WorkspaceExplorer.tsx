import { useEffect, useRef, useState } from 'react'
import { Folder, FileCode, ArrowUp, Save, RefreshCw } from 'lucide-react'
import { api } from '../api'
import { useCodexStore, selectWorkspace } from '../store'
import CodeSurface from './CodeSurface'
import { workspaceDrafts as stashed } from '../editor-state'

interface Entry {
  path: string
  name: string
  directory: boolean
  size: number
}

export default function WorkspaceExplorer() {
  const selectedWorkspaceId = useCodexStore((s) => s.selectedWorkspaceId)
  const workspace = useCodexStore(selectWorkspace)

  const [directory, setDirectory] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [path, setPath] = useState('')
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [hash, setHash] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fileWorkspace, setFileWorkspace] = useState('')
  const dirty = content !== original
  const previousWorkspaceRef = useRef<string | null>(null)
  const latestRef = useRef({ fileWorkspace, path, content, original, hash, directory })
  latestRef.current = { fileWorkspace, path, content, original, hash, directory }

  async function tree(next = directory) {
    if (!selectedWorkspaceId) return
    setLoading(true)
    setError('')
    try {
      const result = await api<{ entries: Entry[] }>(
        `/codex/workspaces/${selectedWorkspaceId}/tree?path=${encodeURIComponent(next)}`,
      )
      setDirectory(next)
      setEntries(result.entries)
    } catch (e) {
      setError(e instanceof Error ? e.message : '文件目录读取失败。')
    } finally {
      setLoading(false)
    }
  }

  async function open(next: string, force = false) {
    if (!force && dirty) {
      setError('当前文件有未保存的编辑，请先保存或点“重新读取”放弃编辑。')
      return
    }
    setError('')
    setLoading(true)
    try {
      const result = await api<{ path: string; content: string; hash: string }>(
        `/codex/workspaces/${selectedWorkspaceId}/file?path=${encodeURIComponent(next)}`,
      )
      setPath(result.path)
      setContent(result.content)
      setOriginal(result.content)
      setHash(result.hash)
      setFileWorkspace(selectedWorkspaceId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '文件读取失败。')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setError('')
    setLoading(true)
    try {
      const result = await api<{ hash: string }>(`/codex/workspaces/${fileWorkspace}/file`, 'PUT', {
        path,
        content,
        expectedHash: hash,
      })
      setHash(result.hash)
      setOriginal(content)
      useCodexStore.setState({ notice: '文件已保存到隔离工作区。' })
    } catch (e) {
      setError(e instanceof Error ? e.message : '文件保存失败。原编辑内容已保留。')
    } finally {
      setLoading(false)
    }
  }

  async function reloadFile() {
    const target = path
    setContent(original)
    await open(target, true)
  }

  useEffect(() => {
    const previous = previousWorkspaceRef.current
    previousWorkspaceRef.current = selectedWorkspaceId
    if (previous && path)
      stashed.set(previous, {
        path,
        content,
        original,
        hash,
        directory,
      })
    const draft = stashed.get(selectedWorkspaceId)
    setPath(draft?.path ?? '')
    setContent(draft?.content ?? '')
    setOriginal(draft?.original ?? '')
    setHash(draft?.hash ?? '')
    setDirectory(draft?.directory ?? '')
    setFileWorkspace(selectedWorkspaceId)
    setEntries([])
    void tree(draft?.directory ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId])

  useEffect(
    () => () => {
      const latest = latestRef.current
      if (latest.fileWorkspace && latest.path)
        stashed.set(latest.fileWorkspace, {
          path: latest.path,
          content: latest.content,
          original: latest.original,
          hash: latest.hash,
          directory: latest.directory,
        })
    },
    [],
  )

  return (
    <section className="cx-explorer">
      <div className="cx-file-list">
        <header>
          <strong>工作区文件</strong>
          <button className="cx-icon" aria-label="刷新文件目录" onClick={() => void tree()}>
            <RefreshCw size={16} />
          </button>
        </header>
        <p className="cx-path">{directory || '/'}</p>
        {directory && (
          <button onClick={() => void tree(directory.split('/').slice(0, -1).join('/'))}>
            <ArrowUp size={15} />
            上一级
          </button>
        )}
        {entries.map((entry) => (
          <button
            key={entry.path}
            className={path === entry.path ? 'active' : undefined}
            onClick={() => void (entry.directory ? tree(entry.path) : open(entry.path))}
          >
            {entry.directory ? <Folder size={16} /> : <FileCode size={16} />}
            {entry.name}
          </button>
        ))}
        {!workspace && <p className="cx-muted">创建工作区后查看文件。</p>}
        {workspace && !entries.length && !loading && (
          <p className="cx-muted">这个目录还没有文件。</p>
        )}
      </div>
      <div className="cx-file-content">
        <header>
          <span>
            {path || '选择文件'}
            {dirty && <small>· 未保存</small>}
          </span>
          {path && (
            <div>
              <button disabled={loading} onClick={() => void reloadFile()}>
                重新读取
              </button>
              <button
                className="cx-button"
                disabled={!dirty || loading}
                onClick={() => void save()}
              >
                <Save size={14} />
                保存
              </button>
            </div>
          )}
        </header>
        {error && (
          <p className="cx-error" role="alert">
            {error}
          </p>
        )}
        {path ? (
          <CodeSurface
            key={fileWorkspace + path}
            value={content}
            onChange={setContent}
            path={path}
          />
        ) : (
          <div className="cx-empty">在左侧选择文件，编辑会使用版本校验保存。</div>
        )}
      </div>
    </section>
  )
}
