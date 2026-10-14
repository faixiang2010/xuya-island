import { useState } from 'react'
import { FolderGit2, Plus, GitBranch, Copy, TerminalSquare } from 'lucide-react'
import { useCodexStore, selectProject } from '../store'
import WorkspaceExplorer from './WorkspaceExplorer'

interface Props {
  onTerminal: () => void
  onChat: () => void
}

export default function ProjectPanel({ onTerminal, onChat }: Props) {
  const projects = useCodexStore((s) => s.projects)
  const workspaces = useCodexStore((s) => s.workspaces)
  const selectedProjectId = useCodexStore((s) => s.selectedProjectId)
  const selectedWorkspaceId = useCodexStore((s) => s.selectedWorkspaceId)
  const busy = useCodexStore((s) => s.busy)
  const project = useCodexStore(selectProject)
  const perform = useCodexStore((s) => s.perform)
  const registerProject = useCodexStore((s) => s.registerProject)
  const createWorkspace = useCodexStore((s) => s.createWorkspace)
  const selectProjectAction = useCodexStore((s) => s.selectProject)
  const selectWorkspaceAction = useCodexStore((s) => s.selectWorkspace)

  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [mode, setMode] = useState('worktree')
  const [environment, setEnvironment] = useState('host')
  const [baseRef, setBaseRef] = useState('')
  const [dockerImage, setDockerImage] = useState('')
  const [registering, setRegistering] = useState(false)
  const [pane, setPane] = useState('overview')

  const valid = path.trim() && name.trim()

  async function register() {
    const result = await perform(() => registerProject(name.trim(), path.trim(), mode))
    if (result) {
      setRegistering(false)
      setName('')
      setPath('')
    }
  }

  async function create() {
    await perform(() =>
      createWorkspace({
        mode,
        baseRef: baseRef || undefined,
        environment,
        dockerImage: dockerImage || undefined,
      }),
    )
  }

  function beginChat(id: string) {
    selectWorkspaceAction(id)
    onChat()
  }

  return (
    <section className="cx-panel">
      <header className="cx-panel-heading">
        <div>
          <h1>项目与工作区</h1>
          <p>注册本机项目，在独立 worktree 或副本中完成修改。</p>
        </div>
        <button className="cx-button" onClick={() => setRegistering(!registering)}>
          <Plus size={16} />
          注册项目
        </button>
      </header>
      {(registering || !projects.length) && (
        <form
          className="cx-card cx-form-grid"
          onSubmit={(e) => {
            e.preventDefault()
            void register()
          }}
        >
          <label>
            项目名称
            <input
              value={name}
              placeholder="我的项目"
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            本机目录
            <input
              value={path}
              placeholder="D:\projects\my-app"
              required
              onChange={(e) => setPath(e.target.value)}
              onBlur={() => {
                if (!name)
                  setName(
                    path
                      .replace(/[\\/]+$/, '')
                      .split(/[\\/]/)
                      .at(-1) || '',
                  )
              }}
            />
          </label>
          <label>
            默认工作区
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="worktree">Git worktree（默认）</option>
              <option value="isolated-copy">隔离副本（非 Git 项目）</option>
            </select>
          </label>
          <p className="cx-muted">
            源项目保持独立。非 Git 或尚无首个提交的仓库可明确选择隔离副本。
          </p>
          <button className="cx-button cx-primary" disabled={!valid || busy}>
            注册
          </button>
        </form>
      )}
      <div className="cx-project-cards">
        {projects.map((projectItem) => (
          <button
            key={projectItem.id}
            className={`cx-card${selectedProjectId === projectItem.id ? ' selected' : ''}`}
            onClick={() => void perform(() => selectProjectAction(projectItem.id))}
          >
            <FolderGit2 size={22} />
            <strong>{projectItem.name}</strong>
            <small>{projectItem.path}</small>
            <span>{projectItem.mode}</span>
          </button>
        ))}
      </div>
      {project && (
        <>
          <div className="cx-tabbar">
            <button
              className={pane === 'overview' ? 'active' : undefined}
              onClick={() => setPane('overview')}
            >
              工作区
            </button>
            <button
              className={pane === 'files' ? 'active' : undefined}
              onClick={() => setPane('files')}
            >
              文件编辑器
            </button>
            <button onClick={onTerminal}>
              <TerminalSquare size={14} />
              终端
            </button>
          </div>
          <div style={pane === 'overview' ? undefined : { display: 'none' }}>
            <div className="cx-workspace-list">
              {workspaces.map((workspace) => (
                <article
                  key={workspace.id}
                  className={`cx-card${selectedWorkspaceId === workspace.id ? ' selected' : ''}`}
                >
                  {workspace.mode === 'worktree' ? <GitBranch size={17} /> : <Copy size={17} />}
                  <div>
                    <strong>
                      {workspace.mode} · {workspace.environment}
                    </strong>
                    <small>{workspace.path}</small>
                    <span>
                      {workspace.status}
                      {workspace.sourceRevision
                        ? ' · ' + workspace.sourceRevision.slice(0, 12)
                        : ''}
                    </span>
                  </div>
                  <button className="cx-button" onClick={() => selectWorkspaceAction(workspace.id)}>
                    {selectedWorkspaceId === workspace.id ? '已选择' : '选择'}
                  </button>
                  <button className="cx-button" onClick={() => beginChat(workspace.id)}>
                    开始聊天
                  </button>
                </article>
              ))}
            </div>
            <form
              className="cx-card cx-form-grid"
              onSubmit={(e) => {
                e.preventDefault()
                void create()
              }}
            >
              <h3>创建隔离工作区</h3>
              <label>
                工作区类型
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="worktree">Git worktree</option>
                  <option value="isolated-copy">隔离副本</option>
                </select>
              </label>
              <label>
                基础分支 / 引用
                <input
                  value={baseRef}
                  placeholder="留空使用仓库默认分支"
                  onChange={(e) => setBaseRef(e.target.value)}
                />
              </label>
              <label>
                执行环境
                <select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
                  <option value="host">本机 Windows</option>
                  <option value="docker">Docker</option>
                </select>
              </label>
              {environment === 'docker' && (
                <label>
                  容器镜像
                  <input
                    value={dockerImage}
                    placeholder="选择本机已有或允许拉取的镜像"
                    required
                    onChange={(e) => setDockerImage(e.target.value)}
                  />
                </label>
              )}
              <button className="cx-button cx-primary" disabled={busy}>
                创建工作区
              </button>
            </form>
          </div>
          <div style={pane === 'files' ? undefined : { display: 'none' }}>
            <WorkspaceExplorer />
          </div>
        </>
      )}
    </section>
  )
}
