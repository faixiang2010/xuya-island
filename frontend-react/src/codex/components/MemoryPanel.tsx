import { useEffect, useRef, useState } from 'react'
import { Brain, RefreshCw, Save, Plus } from 'lucide-react'
import { api } from '../api'
import { useCodexStore, selectWorkspace } from '../store'
import CodeSurface from './CodeSurface'

interface MemoryFile {
  path: string
  content: string
  hash?: string
}

export default function MemoryPanel() {
  const conversation = useCodexStore((s) => s.conversation)
  const workspace = useCodexStore(selectWorkspace)
  const usage = useCodexStore((s) => s.usage)
  const busy = useCodexStore((s) => s.busy)
  const perform = useCodexStore((s) => s.perform)

  const [files, setFiles] = useState<MemoryFile[]>([])
  const [selected, setSelected] = useState('MEMORY.md')
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [adding, setAdding] = useState(false)
  const [newPath, setNewPath] = useState('memory/')
  const [dirty, setDirty] = useState(false)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  async function refresh() {
    if (!useCodexStore.getState().conversation) return
    await perform(async () => {
      const result = await api<MemoryFile[] | { files: MemoryFile[] }>(
        `/codex/conversations/${useCodexStore.getState().conversation!.id}/memory`,
      )
      const list = Array.isArray(result) ? result : result.files || []
      setFiles(list)
      const next = list.find((f) => f.path === selectedRef.current) || list[0]
      setSelected(next?.path || 'MEMORY.md')
      setContent(next?.content || '')
      setOriginal(next?.content || '')
      setDirty(false)
    })
  }

  function select(file: MemoryFile) {
    if (dirty) {
      useCodexStore.setState({ error: '当前记忆有未保存的编辑，请先保存或重新读取。' })
      return
    }
    setSelected(file.path)
    setContent(file.content)
    setOriginal(file.content)
  }

  async function save() {
    if (!useCodexStore.getState().conversation) return
    await perform(async () => {
      await api(`/codex/conversations/${useCodexStore.getState().conversation!.id}/memory`, 'PUT', {
        path: selectedRef.current,
        content,
      })
      await refresh()
      useCodexStore.setState({ notice: '原生 Harness 记忆文件已保存。' })
    })
  }

  function create() {
    if (!newPath.trim()) return
    setSelected(newPath.trim())
    setContent('')
    setOriginal('')
    setDirty(true)
    setAdding(false)
  }

  useEffect(() => {
    setDirty(content !== original)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id])

  return (
    <section className="cx-panel">
      <header className="cx-panel-heading">
        <div>
          <h1>记忆与上下文</h1>
          <p>编辑当前 Harness 会话工作区的 MEMORY.md 与每日记忆文件。</p>
        </div>
        <button className="cx-button" disabled={!conversation} onClick={() => void refresh()}>
          <RefreshCw size={15} />
          重新读取
        </button>
      </header>
      {!conversation ? (
        <p className="cx-empty">
          <Brain size={28} />
          先选择会话，再读取实际记忆。
        </p>
      ) : (
        <>
          <div className="cx-memory-summary cx-card">
            <strong>会话上下文</strong>
            <p>
              会话 {conversation.id} · 工作区 {workspace?.path}
            </p>
            <p>{usage.tokens} tokens · 原生会话负责历史、压缩与检查点恢复。</p>
          </div>
          <div className="cx-explorer">
            <nav className="cx-file-list">
              <header>
                <strong>记忆文件</strong>
                <button
                  className="cx-icon"
                  aria-label="新建记忆文件"
                  onClick={() => setAdding(true)}
                >
                  <Plus size={15} />
                </button>
              </header>
              {files.map((file) => (
                <button
                  key={file.path}
                  className={selected === file.path ? 'active' : undefined}
                  onClick={() => select(file)}
                >
                  {file.path}
                </button>
              ))}
            </nav>
            <div className="cx-file-content">
              <header>
                <span>
                  {selected}
                  {dirty ? ' · 未保存' : ''}
                </span>
                <button className="cx-button" disabled={busy} onClick={() => void save()}>
                  <Save size={14} />
                  保存记忆
                </button>
              </header>
              <CodeSurface value={content} onChange={setContent} path={selected} />
            </div>
          </div>
          {adding && (
            <form
              className="cx-card cx-form-grid"
              onSubmit={(e) => {
                e.preventDefault()
                create()
              }}
            >
              <label>
                记忆路径
                <input
                  value={newPath}
                  required
                  placeholder="memory/2026-10-11.md"
                  onChange={(e) => setNewPath(e.target.value)}
                />
              </label>
              <button className="cx-button">创建</button>
              <p className="cx-muted">路径限定于该 Harness 工作区，禁止访问教学数据或其他项目。</p>
            </form>
          )}
        </>
      )}
    </section>
  )
}
