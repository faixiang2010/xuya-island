import { useState } from 'react'
import {
  Puzzle,
  GitPullRequest as Github,
  FileText,
  Palette,
  RefreshCw,
  Download,
} from 'lucide-react'
import { api } from '../api'
import { useCodexStore, selectWorkspace, selectModel, selectRunning } from '../store'
import McpPanel from './McpPanel'

type PreviewRecord = {
  id: string
  url?: string
  expiresAt: string
  status: string
  build?: { exitCode: number; output: string; timedOut: boolean; truncated: boolean }
}

function isolatedPreviewUrl(value?: string) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      url.origin !== location.origin &&
      Number(url.port) >= 43200
      ? url.href
      : ''
  } catch {
    return ''
  }
}

export default function IntegrationsPanel({
  initialPlugin = 'github',
}: {
  initialPlugin?: string
}) {
  const plugins = useCodexStore((s) => s.plugins)
  const skills = useCodexStore((s) => s.skills)
  const artifacts = useCodexStore((s) => s.artifacts)
  const busy = useCodexStore((s) => s.busy)
  const selectedWorkspaceId = useCodexStore((s) => s.selectedWorkspaceId)
  const workspace = useCodexStore(selectWorkspace)
  const running = useCodexStore(selectRunning)
  const model = useCodexStore(selectModel)
  const perform = useCodexStore((s) => s.perform)
  const send = useCodexStore((s) => s.send)
  const loadSection = useCodexStore((s) => s.loadSection)

  const [plugin, setPlugin] = useState(initialPlugin)
  const [repository, setRepository] = useState('')
  const [kind, setKind] = useState('pulls')
  const [result, setResult] = useState('')
  const [name, setName] = useState('document')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [svg, setSvg] = useState(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>',
  )
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [head, setHead] = useState('')
  const [base, setBase] = useState('main')
  const [confirmPr, setConfirmPr] = useState(false)
  const [designTask, setDesignTask] = useState('')
  const [designDirectory, setDesignDirectory] = useState('')
  const [buildCommand, setBuildCommand] = useState('npm run build')
  const [outputDirectory, setOutputDirectory] = useState('dist')
  const [referenceArtifactId, setReferenceArtifactId] = useState('')
  const [preview, setPreview] = useState<PreviewRecord>()
  const [documentId, setDocumentId] = useState('')
  const [paragraphs, setParagraphs] = useState<{ index: number; text: string }[]>([])
  const [renderStatus, setRenderStatus] = useState('')
  const [issueTitle, setIssueTitle] = useState('')
  const [issueBody, setIssueBody] = useState('')
  const [confirmIssue, setConfirmIssue] = useState(false)

  const descriptor = plugins.find((p) => p.id === plugin)
  const previewUrl = isolatedPreviewUrl(preview?.url)

  async function invoke(path: string, body: unknown) {
    setResult('')
    await perform(async () => {
      setResult(JSON.stringify(await api(path, 'POST', body), null, 2))
      if (useCodexStore.getState().conversation) await loadSection('outputs')
    })
  }

  async function query() {
    await invoke('/codex/plugins/github/query', {
      workspaceId: selectedWorkspaceId,
      repository,
      kind,
    })
  }

  async function createPr() {
    await invoke('/codex/plugins/github/pull-requests', {
      workspaceId: selectedWorkspaceId,
      repository,
      title: prTitle,
      body: prBody,
      head,
      base,
    })
    if (!useCodexStore.getState().error) setConfirmPr(false)
  }

  async function exportDocument() {
    await invoke(`/codex/plugins/${plugin}/export`, {
      workspaceId: selectedWorkspaceId,
      name,
      title,
      text,
    })
  }

  async function exportDesign() {
    await invoke('/codex/plugins/design/export', {
      workspaceId: selectedWorkspaceId,
      name,
      svg,
    })
  }

  async function imageToCode() {
    useCodexStore
      .getState()
      .setDraft(
        `请使用 Product Design 图到代码能力，结合当前已附加图片和真实项目，实现以下界面要求。先检查框架与现有组件，修改受控工作区，运行构建并给出实际预览和产物。\n${designTask}`,
      )
    await perform(() => send())
  }

  async function previewDesign(build: boolean) {
    await perform(async () => {
      setPreview(
        await api<PreviewRecord>(`/codex/plugins/design/${build ? 'build' : 'preview'}`, 'POST', {
          workspaceId: selectedWorkspaceId,
          directory: designDirectory,
          command: build ? buildCommand : undefined,
          outputDirectory: build ? outputDirectory : undefined,
          referenceArtifactId: referenceArtifactId || undefined,
        }),
      )
    })
  }

  async function verifyDesign() {
    if (preview)
      await invoke('/codex/plugins/design/verify', {
        workspaceId: selectedWorkspaceId,
        previewId: preview.id,
      })
  }

  async function readDocument() {
    await perform(async () => {
      const record = await api<{ paragraphs: { index: number; text: string }[] }>(
        '/codex/plugins/documents/read',
        'POST',
        { workspaceId: selectedWorkspaceId, artifactId: documentId },
      )
      setParagraphs(record.paragraphs)
      setRenderStatus(JSON.stringify(await api('/codex/plugins/documents/render-status'), null, 2))
    })
  }

  async function editDocument() {
    await invoke('/codex/plugins/documents/edit', {
      workspaceId: selectedWorkspaceId,
      artifactId: documentId,
      name,
      edits: paragraphs,
    })
  }

  async function renderDocument() {
    await invoke('/codex/plugins/documents/render', {
      workspaceId: selectedWorkspaceId,
      artifactId: documentId,
    })
  }

  async function createIssue() {
    await invoke('/codex/plugins/github/issues', {
      workspaceId: selectedWorkspaceId,
      repository,
      title: issueTitle,
      body: issueBody,
    })
    if (!useCodexStore.getState().error) setConfirmIssue(false)
  }

  async function toggleSkill(id: string, enabled: boolean) {
    await perform(async () => {
      await api(`/codex/skills/${encodeURIComponent(id)}`, 'PUT', { enabled })
      await loadSection('plugins')
    })
  }

  return (
    <section className="cx-panel">
      <header className="cx-panel-heading">
        <div>
          <h1>技能与插件</h1>
          <p>连接真实工具与本机依赖，缺少配置时显示具体原因。</p>
        </div>
        <button className="cx-button" onClick={() => void perform(() => loadSection('plugins'))}>
          <RefreshCw size={15} />
          检查依赖
        </button>
      </header>
      <div className="cx-plugin-grid">
        {plugins.map((item) => (
          <button
            key={item.id}
            className={`cx-card${plugin === item.id ? ' selected' : ''}`}
            onClick={() => setPlugin(item.id)}
          >
            {item.id === 'github' ? (
              <Github size={22} />
            ) : item.id === 'design' || item.id === 'product-design' ? (
              <Palette size={22} />
            ) : (
              <FileText size={22} />
            )}
            <strong>{item.name || item.id}</strong>
            <small>
              {item.status}
              {item.message ? ' · ' + String(item.message) : ''}
            </small>
          </button>
        ))}
      </div>
      {descriptor && (
        <article className="cx-card cx-plugin-status">
          <strong>{descriptor.name}</strong>
          <p>{String(descriptor.message || descriptor.status)}</p>
          {descriptor.dependencies ? (
            <details>
              <summary>依赖检查结果</summary>
              <pre>{JSON.stringify(descriptor.dependencies, null, 2)}</pre>
            </details>
          ) : null}
        </article>
      )}
      {!plugins.length && (
        <div className="cx-empty">
          <Puzzle size={28} />
          <p>暂无插件记录，点击“检查依赖”读取本机状态。</p>
        </div>
      )}
      {plugin === 'github' && (
        <form
          className="cx-card cx-form-grid"
          onSubmit={(e) => {
            e.preventDefault()
            void query()
          }}
        >
          <h3>
            <Github size={18} />
            GitHub
          </h3>
          <label>
            仓库
            <input
              value={repository}
              placeholder="owner/repository"
              required
              onChange={(e) => setRepository(e.target.value)}
            />
          </label>
          <label>
            查询
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="pulls">Pull Requests</option>
              <option value="issues">Issues</option>
              <option value="repository">仓库信息</option>
              <option value="actions">CI 工作流</option>
            </select>
          </label>
          <button className="cx-button" disabled={busy || !workspace}>
            查询
          </button>
          <details>
            <summary>创建草稿 Pull Request</summary>
            <div className="cx-form-grid">
              <label>
                标题
                <input value={prTitle} onChange={(e) => setPrTitle(e.target.value)} />
              </label>
              <label>
                正文
                <textarea value={prBody} rows={4} onChange={(e) => setPrBody(e.target.value)} />
              </label>
              <label>
                已推送的来源分支
                <input value={head} onChange={(e) => setHead(e.target.value)} />
              </label>
              <label>
                目标分支
                <input value={base} onChange={(e) => setBase(e.target.value)} />
              </label>
              <p className="cx-muted">
                这一步会写入 GitHub，使用已存在的远程分支，不会自动推送或合并。
              </p>
              <button
                type="button"
                className="cx-button"
                disabled={!repository || !head || !prTitle || busy}
                onClick={() => setConfirmPr(true)}
              >
                准备创建草稿 PR
              </button>
            </div>
          </details>
          <details>
            <summary>创建 Issue</summary>
            <div className="cx-form-grid">
              <label>
                标题
                <input value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} />
              </label>
              <label>
                正文
                <textarea
                  value={issueBody}
                  rows={4}
                  onChange={(e) => setIssueBody(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="cx-button"
                disabled={!issueTitle || !repository || busy}
                onClick={() => setConfirmIssue(true)}
              >
                准备创建 Issue
              </button>
            </div>
          </details>
          {confirmIssue && (
            <div className="cx-confirm">
              <strong>确认在 {repository} 创建 Issue？</strong>
              <p>{issueTitle}</p>
              <button type="button" className="cx-button" onClick={() => setConfirmIssue(false)}>
                返回检查
              </button>
              <button
                type="button"
                className="cx-button cx-primary"
                disabled={busy}
                onClick={() => void createIssue()}
              >
                确认创建 Issue
              </button>
            </div>
          )}
          {confirmPr && (
            <div className="cx-confirm">
              <strong>确认在 {repository} 创建草稿 PR？</strong>
              <p>
                {head} → {base} · {prTitle}
              </p>
              <button type="button" className="cx-button" onClick={() => setConfirmPr(false)}>
                返回检查
              </button>
              <button
                type="button"
                className="cx-button cx-primary"
                disabled={busy}
                onClick={() => void createPr()}
              >
                确认创建
              </button>
            </div>
          )}
        </form>
      )}
      {(plugin === 'design' || plugin === 'product-design') && (
        <>
          <form
            className="cx-card cx-form-grid"
            onSubmit={(e) => {
              e.preventDefault()
              void imageToCode()
            }}
          >
            <h3>
              <Palette size={18} />
              图片到代码
            </h3>
            <p>
              在工作台附加截图或草图，再提交界面要求。使用所选视觉模型和浏览器工具完成 React
              界面实现。
            </p>
            <textarea
              value={designTask}
              required
              rows={3}
              placeholder="描述需要还原的界面与交互"
              aria-label="图到代码要求"
              onChange={(e) => setDesignTask(e.target.value)}
            />
            <button
              className="cx-button cx-primary"
              disabled={busy || running || !model?.vision || !workspace}
            >
              开始图到代码
            </button>
            {!model?.vision && <small>当前模型未声明视觉能力，请先选择支持图片的模型。</small>}
          </form>
          <form
            className="cx-card cx-form-grid"
            onSubmit={(e) => {
              e.preventDefault()
              void previewDesign(true)
            }}
          >
            <h3>真实构建与预览</h3>
            <label>
              工作区中的前端目录
              <input
                value={designDirectory}
                placeholder="例如 frontend，留空为工作区根目录"
                onChange={(e) => setDesignDirectory(e.target.value)}
              />
            </label>
            <label>
              构建命令
              <input
                value={buildCommand}
                required
                onChange={(e) => setBuildCommand(e.target.value)}
              />
            </label>
            <label>
              构建输出目录
              <input
                value={outputDirectory}
                required
                onChange={(e) => setOutputDirectory(e.target.value)}
              />
            </label>
            <label>
              参考产物
              <select
                value={referenceArtifactId}
                onChange={(e) => setReferenceArtifactId(e.target.value)}
              >
                <option value="">未指定</option>
                {artifacts.map((artifact) => (
                  <option key={artifact.id} value={artifact.id}>
                    {artifact.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="cx-button cx-primary" disabled={busy || !workspace}>
              构建并预览
            </button>
            <button
              type="button"
              className="cx-button"
              disabled={busy || !workspace}
              onClick={() => void previewDesign(false)}
            >
              预览现有文件
            </button>
          </form>
          {preview && (
            <article className="cx-card">
              <header>
                <h3>隔离来源预览</h3>
                <small>到期 {new Date(preview.expiresAt).toLocaleString()}</small>
              </header>
              {preview.status === 'ready' && previewUrl && (
                <iframe
                  src={previewUrl}
                  sandbox="allow-scripts allow-same-origin"
                  title="Product Design 预览"
                  className="cx-design-preview"
                />
              )}
              {preview.status === 'build-failed' && (
                <div className="cx-error" role="alert">
                  <strong>构建失败 · 退出码 {preview.build?.exitCode}</strong>
                  <pre>{preview.build?.output}</pre>
                  <p>
                    {preview.build?.timedOut ? '构建已超时。' : ''}
                    {preview.build?.truncated ? '输出已截断。' : ''}
                  </p>
                </div>
              )}
              {preview.status === 'ready' && !previewUrl && (
                <p className="cx-error" role="alert">
                  预览地址必须位于独立的本机预览来源，当前地址未通过检查。
                </p>
              )}
              <button
                className="cx-button"
                disabled={busy || preview.status !== 'ready' || !preview.url}
                onClick={() => void verifyDesign()}
              >
                使用已连接 Chrome 截图验证
              </button>
              <p className="cx-muted">
                预览不会收到前端凭证、教学桥或宿主权限；截图保存为实际产物。
              </p>
            </article>
          )}
          <form
            className="cx-card cx-form-grid"
            onSubmit={(e) => {
              e.preventDefault()
              void exportDesign()
            }}
          >
            <h3>导出 SVG 设计稿</h3>
            <label>
              产物名称
              <input value={name} required onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              SVG 源码
              <textarea
                value={svg}
                rows={7}
                required
                spellCheck={false}
                onChange={(e) => setSvg(e.target.value)}
              />
            </label>
            <button className="cx-button" disabled={busy || !workspace}>
              <Download size={15} />
              导出 SVG
            </button>
          </form>
        </>
      )}
      {(plugin === 'documents' || plugin === 'pdf') && (
        <form
          className="cx-card cx-form-grid"
          onSubmit={(e) => {
            e.preventDefault()
            void exportDocument()
          }}
        >
          <h3>
            <FileText size={18} />
            {plugin === 'pdf' ? 'PDF' : 'Word 文档'}
          </h3>
          <label>
            文件名称
            <input value={name} required onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            标题
            <input value={title} required onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            正文
            <textarea
              value={text}
              required
              rows={10}
              placeholder="文档正文"
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <p className="cx-muted">文件写入当前隔离工作区。预览依赖的可用情况见上方检查结果。</p>
          <button className="cx-button cx-primary" disabled={busy || !workspace}>
            生成文档
          </button>
        </form>
      )}
      {plugin === 'documents' && (
        <article className="cx-card cx-form-grid">
          <h3>读取、编辑与渲染 DOCX</h3>
          <label>
            文档产物 ID
            <input
              value={documentId}
              placeholder="从输出内容中选择文档的实际 ID"
              onChange={(e) => setDocumentId(e.target.value)}
            />
          </label>
          <label>
            已生成文档
            <select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
              <option value="">选择 DOCX</option>
              {artifacts
                .filter((a) => String(a.name).endsWith('.docx'))
                .map((artifact) => (
                  <option key={artifact.id} value={artifact.id}>
                    {artifact.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="cx-button"
            disabled={!documentId || busy}
            onClick={() => void readDocument()}
          >
            读取段落
          </button>
          {paragraphs.map((paragraph) => (
            <label key={paragraph.index}>
              段落 {paragraph.index + 1}
              <textarea
                rows={2}
                value={paragraph.text}
                onChange={(e) =>
                  setParagraphs((list) =>
                    list.map((p) =>
                      p.index === paragraph.index ? { ...p, text: e.target.value } : p,
                    ),
                  )
                }
              />
            </label>
          ))}
          {paragraphs.length > 0 && (
            <button className="cx-button" disabled={busy} onClick={() => void editDocument()}>
              另存编辑后的文档
            </button>
          )}
          <button
            className="cx-button"
            disabled={!documentId || busy}
            onClick={() => void renderDocument()}
          >
            渲染 PDF 预览
          </button>
          {renderStatus && <pre className="cx-result">{renderStatus}</pre>}
        </article>
      )}
      {result && <pre className="cx-result">{result}</pre>}
      <h3>Harness 技能</h3>
      {skills.map((skill) => (
        <article key={skill.id} className="cx-card">
          <strong>{String(skill.name || skill.title || skill.id)}</strong>
          <p>{String(skill.description || skill.content || '')}</p>
          <small>{skill.path}</small>
          <button
            className="cx-button"
            disabled={busy}
            onClick={() => void toggleSkill(skill.id, !skill.enabled)}
          >
            {skill.enabled ? '停用' : '启用'}
          </button>
          <details>
            <summary>技能内容与加载状态</summary>
            <pre>{JSON.stringify(skill, null, 2)}</pre>
          </details>
        </article>
      ))}
      {!skills.length && (
        <p className="cx-empty">未发现可加载技能。技能目录和启停策略可在设置中管理。</p>
      )}
      <McpPanel />
    </section>
  )
}
