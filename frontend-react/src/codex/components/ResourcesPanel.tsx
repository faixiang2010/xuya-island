import { useEffect, useRef, useState } from 'react'
import { FileText, ExternalLink, Download, BookOpen, X, RefreshCw } from 'lucide-react'
import { api, authorizedFetch, download } from '../api'
import type { ResourceRecord } from '../types'
import { useCodexStore } from '../store'
import MarkdownContent from './MarkdownContent'

export default function ResourcesPanel({
  initialSelection,
}: {
  initialSelection?: { id: string; kind: 'artifact' | 'source' }
}) {
  const artifacts = useCodexStore((s) => s.artifacts)
  const sources = useCodexStore((s) => s.sources)
  const perform = useCodexStore((s) => s.perform)
  const loadSection = useCodexStore((s) => s.loadSection)

  const [selected, setSelected] = useState<ResourceRecord>()
  const [preview, setPreview] = useState('')
  const [previewType, setPreviewType] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const previewRef = useRef('')
  previewRef.current = preview

  async function open(item: ResourceRecord) {
    if (preview) URL.revokeObjectURL(preview)
    setSelected(item)
    setPreview('')
    setContent('')
    setLoading(true)
    try {
      const record = await api<{ type: string; text?: string; mediaType?: string }>(
        `/codex/artifacts/${item.id}/preview`,
      )
      setPreviewType(
        record.mediaType || (record.type === 'text' ? 'text/plain' : 'application/octet-stream'),
      )
      if (record.type === 'text') setContent(record.text || '')
      else if (record.type === 'image') {
        const response = await authorizedFetch(`/codex/artifacts/${item.id}/preview/image`)
        setPreviewType('image/png')
        setPreview(URL.createObjectURL(await response.blob()))
      }
    } catch (e) {
      useCodexStore.setState({ error: e instanceof Error ? e.message : '产物打开失败。' })
    } finally {
      setLoading(false)
    }
  }

  function source(item: ResourceRecord) {
    const target = item.url || item.uri
    if (target && /^https?:\/\//.test(String(target))) {
      const url = new URL(String(target))
      window.open(url.href, '_blank', 'noopener,noreferrer')
    } else if (item.artifactId) void open({ ...item, id: String(item.artifactId) })
    else {
      setSelected(item)
      setPreview('')
      setContent(String(item.content || item.path || item.uri || ''))
      setPreviewType('text/plain')
    }
  }

  function close() {
    setSelected(undefined)
    if (preview) URL.revokeObjectURL(preview)
    setPreview('')
  }

  useEffect(() => {
    if (!initialSelection) return
    const item =
      initialSelection.kind === 'artifact'
        ? artifacts.find((record) => record.id === initialSelection.id)
        : sources.find((record) => record.id === initialSelection.id)
    if (item) {
      if (initialSelection.kind === 'artifact') void open(item)
      else source(item)
    }
    // 点击右栏中的具体来源/产物时直接打开，不因资源后台刷新重复打开。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelection?.id, initialSelection?.kind])

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  return (
    <section className="cx-panel">
      <header className="cx-panel-heading">
        <div>
          <h1>输出与来源</h1>
          <p>查看本会话实际生成的产物、引用和执行来源。</p>
        </div>
        <button className="cx-button" onClick={() => void perform(() => loadSection('outputs'))}>
          <RefreshCw size={15} />
          刷新
        </button>
      </header>
      <h3>输出内容</h3>
      <div className="cx-resource-grid">
        {artifacts.map((artifact) => (
          <article key={artifact.id} className="cx-card">
            <FileText size={22} />
            <strong>{artifact.name || artifact.title || artifact.id}</strong>
            <small>
              {String(artifact.type || artifact.mediaType || artifact.mimeType || '')}
              {artifact.status ? ' · ' + artifact.status : ''}
            </small>
            <div>
              <button className="cx-button" onClick={() => void open(artifact)}>
                打开
              </button>
              <button
                className="cx-icon"
                aria-label={`下载 ${artifact.name || artifact.title}`}
                onClick={() =>
                  void perform(() =>
                    download(
                      '/codex/artifacts/' + artifact.id + '/content',
                      String(artifact.name || artifact.title || '产物'),
                    ),
                  )
                }
              >
                <Download size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!artifacts.length && <p className="cx-empty">智能体生成文件后，会在这里显示。</p>}
      <h3>来源</h3>
      {sources.map((item) => (
        <button key={item.id} className="cx-card cx-source" onClick={() => source(item)}>
          <BookOpen size={18} />
          <span>
            <strong>{item.title || item.name || item.id}</strong>
            <small>
              {String(item.url || item.uri || item.path || item.type || item.kind || '')}
            </small>
          </span>
          {(item.url || String(item.uri).startsWith('http')) && <ExternalLink size={15} />}
        </button>
      ))}
      {!sources.length && <p className="cx-empty">当前没有已记录的引用来源。</p>}
      {selected && (
        <div
          className="cx-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <section
            className="cx-dialog cx-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="产物预览"
          >
            <header>
              <h2>{selected.name || selected.title}</h2>
              <button className="cx-icon" aria-label="关闭预览" onClick={close}>
                <X size={18} />
              </button>
            </header>
            {loading ? (
              <p>正在读取…</p>
            ) : previewType.startsWith('image/') ? (
              <img src={preview} alt={String(selected.name || selected.title || '产物')} />
            ) : preview && previewType.includes('pdf') ? (
              <iframe src={preview} sandbox="" title="PDF 预览" />
            ) : previewType.includes('markdown') ? (
              <MarkdownContent content={content} />
            ) : content ? (
              <pre>{content}</pre>
            ) : (
              <div className="cx-empty">
                <p>此文件格式使用下载后打开，或配置文档渲染依赖生成预览。</p>
                <button
                  className="cx-button"
                  onClick={() =>
                    void perform(() =>
                      download(
                        '/codex/artifacts/' + selected.id + '/content',
                        String(selected.name || '产物'),
                      ),
                    )
                  }
                >
                  下载文件
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
