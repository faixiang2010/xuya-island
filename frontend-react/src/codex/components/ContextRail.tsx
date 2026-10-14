import { useState } from 'react'
import {
  ChevronDown,
  FileText,
  Users,
  BookOpen,
  ListChecks,
  CircleCheck,
  ExternalLink,
} from 'lucide-react'
import { useCodexStore } from '../store'

interface Props {
  onSection: (section: string) => void
  onResource?: (selection: { id: string; kind: 'artifact' | 'source' }) => void
  onAgent?: (taskId: string) => void
  hidden?: boolean
}

export default function ContextRail({ onSection, onResource, onAgent, hidden }: Props) {
  const plan = useCodexStore((s) => s.plan)
  const artifacts = useCodexStore((s) => s.artifacts)
  const subagents = useCodexStore((s) => s.subagents)
  const sources = useCodexStore((s) => s.sources)
  const [folded, setFolded] = useState<Record<string, boolean>>({})

  return (
    <aside
      className="cx-context-rail"
      aria-label="会话上下文"
      style={hidden ? { display: 'none' } : undefined}
    >
      {plan?.steps.length ? (
        <section className="cx-context-card">
          <header>
            <ListChecks size={16} />
            <button onClick={() => onSection('tasks')}>{plan.title || '计划'}</button>
            <button
              className="cx-icon"
              aria-label="折叠计划"
              onClick={() => setFolded((f) => ({ ...f, plan: !f.plan }))}
            >
              <ChevronDown size={15} />
            </button>
          </header>
          {!folded.plan && (
            <div className="cx-context-body">
              {plan.steps.map((step) => (
                <button
                  key={step.id}
                  className="cx-context-plan"
                  onClick={() => onSection('tasks')}
                >
                  {step.status === 'completed' ? (
                    <CircleCheck size={14} />
                  ) : (
                    <span className={'cx-step-dot ' + step.status}></span>
                  )}
                  <span>{step.title}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}
      <section className="cx-context-card">
        <header>
          <FileText size={16} />
          <button onClick={() => onSection('outputs')}>输出内容</button>
          <button
            className="cx-icon"
            aria-label="折叠输出内容"
            onClick={() => setFolded((f) => ({ ...f, outputs: !f.outputs }))}
          >
            <ChevronDown size={15} />
          </button>
        </header>
        {!folded.outputs && (
          <div className="cx-context-body">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                className="cx-context-item"
                onClick={() =>
                  onResource
                    ? onResource({ id: artifact.id, kind: 'artifact' })
                    : onSection('outputs')
                }
              >
                <FileText size={15} />
                <span>
                  {artifact.name || artifact.title || artifact.id}
                  <small>
                    {String(artifact.status || artifact.mediaType || artifact.type || '')}
                  </small>
                </span>
              </button>
            ))}
            {!artifacts.length && <p className="cx-muted">生成的文件会出现在这里。</p>}
          </div>
        )}
        <header>
          <Users size={16} />
          <button onClick={() => onSection('agents')}>子智能体</button>
          <button
            className="cx-icon"
            aria-label="折叠子智能体"
            onClick={() => setFolded((f) => ({ ...f, agents: !f.agents }))}
          >
            <ChevronDown size={15} />
          </button>
        </header>
        {!folded.agents && (
          <div className="cx-context-body">
            {subagents.map((agent) => (
              <button
                key={agent.id}
                className="cx-context-item"
                onClick={() =>
                  onAgent ? onAgent(String(agent.taskId || agent.id)) : onSection('agents')
                }
              >
                <span className={'cx-agent-dot ' + String(agent.status)}></span>
                <span>
                  {agent.name || agent.title || agent.id}
                  <small>{agent.status}</small>
                </span>
              </button>
            ))}
            {!subagents.length && <p className="cx-muted">本会话暂无子智能体。</p>}
          </div>
        )}
        <header>
          <BookOpen size={16} />
          <button onClick={() => onSection('outputs')}>来源</button>
          <button
            className="cx-icon"
            aria-label="折叠来源"
            onClick={() => setFolded((f) => ({ ...f, sources: !f.sources }))}
          >
            <ChevronDown size={15} />
          </button>
        </header>
        {!folded.sources && (
          <div className="cx-context-body">
            {sources.map((source) => (
              <button
                key={source.id}
                className="cx-context-item"
                onClick={() =>
                  onResource ? onResource({ id: source.id, kind: 'source' }) : onSection('outputs')
                }
              >
                <BookOpen size={15} />
                <span>
                  {source.title || source.name || source.id}
                  <small>{source.url || (source.uri as string | undefined) || source.path}</small>
                </span>
                {(source.url || String(source.uri).startsWith('http')) && (
                  <ExternalLink size={12} />
                )}
              </button>
            ))}
            {!sources.length && <p className="cx-muted">引用资料会在这里保留。</p>}
          </div>
        )}
      </section>
    </aside>
  )
}
