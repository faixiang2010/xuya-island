import { useEffect, useState } from 'react'
import { Users, Send, RefreshCw, FileSearch, X } from 'lucide-react'
import { useCodexStore, selectRunning } from '../store'
import { api, requestId } from '../api'
import type { ResourceRecord } from '../types'

export default function AgentsPanel({ initialTaskId }: { initialTaskId?: string }) {
  const conversation = useCodexStore((s) => s.conversation)
  const busy = useCodexStore((s) => s.busy)
  const subagents = useCodexStore((s) => s.subagents)
  const running = useCodexStore(selectRunning)
  const perform = useCodexStore((s) => s.perform)
  const sendAction = useCodexStore((s) => s.send)
  const loadSection = useCodexStore((s) => s.loadSection)
  const cancelAction = useCodexStore((s) => s.action)
  const [task, setTask] = useState('')
  const [name, setName] = useState('')
  const [detail, setDetail] = useState<ResourceRecord>()
  const statusLabels: Record<string, string> = {
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }

  async function delegate() {
    if (!conversation) return
    useCodexStore
      .getState()
      .setDraft(
        `请调用 Harness 原生 agent_spawn，参数 agent_id="reviewer"、timeout_seconds=0，任务为：${name ? name + '。' : ''}${task}。reviewer 执行只读分析与审阅，请使用 task_list/task_output 获取实际结果。保持主智能体负责修改、审批与最终交付。`,
      )
    await perform(() => sendAction())
    if (!useCodexStore.getState().error) setTask('')
  }

  async function inspect(agent: ResourceRecord) {
    if (!conversation) return
    await perform(async () =>
      setDetail(
        await api<ResourceRecord>(
          `/codex/conversations/${conversation.id}/agents/${encodeURIComponent(String(agent.taskId || agent.id))}`,
        ),
      ),
    )
  }

  async function cancelChild(agent: ResourceRecord) {
    if (!conversation) return
    await perform(async () => {
      const result = await api<{ accepted: boolean; cancelled: boolean }>(
        `/codex/conversations/${conversation.id}/agents/${encodeURIComponent(String(agent.taskId || agent.id))}/cancel`,
        'POST',
        { clientRequestId: requestId() },
      )
      await loadSection('agents')
      useCodexStore.setState({
        notice: result.cancelled ? '子任务已取消。' : '子任务已结束，无需取消。',
      })
      if (detail?.id === agent.id) await inspect(agent)
    })
  }

  useEffect(() => {
    if (initialTaskId && conversation) {
      void inspect(
        subagents.find((agent) => agent.taskId === initialTaskId || agent.id === initialTaskId) || {
          id: initialTaskId,
          taskId: initialTaskId,
        },
      )
    }
    // 仅处理用户点击的任务；自动资源刷新不重复拉取详情。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTaskId, conversation?.id])

  return (
    <section className="cx-panel">
      <header className="cx-panel-heading">
        <div>
          <h1>智能体协作</h1>
          <p>委派 reviewer 进行只读审阅，查看原生后台任务与完整结果。</p>
        </div>
        <button className="cx-button" onClick={() => void perform(() => loadSection('agents'))}>
          <RefreshCw size={15} />
          刷新活动
        </button>
      </header>
      <form
        className="cx-card cx-form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          void delegate()
        }}
      >
        <h3>
          <Users size={18} />
          委派任务
        </h3>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="任务名称（可选）"
          aria-label="子智能体任务名称"
        />
        <textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          required
          rows={4}
          placeholder="描述独立任务、修改范围与验收条件"
          aria-label="子智能体任务"
        ></textarea>
        <button className="cx-button cx-primary" disabled={busy || !conversation || running}>
          <Send size={15} />
          发送委派请求
        </button>
        {running && (
          <button
            type="button"
            className="cx-button"
            onClick={() => void perform(() => cancelAction('cancel'))}
          >
            取消当前父任务
          </button>
        )}
        <p className="cx-muted">
          reviewer 在当前受控环境中只读审阅；主智能体负责改码。取消父任务会停止本次执行及其协作。
        </p>
      </form>
      {subagents.map((agent) => {
        const body = (agent.task || agent.content) as string | undefined
        const result = agent.result as string | undefined
        return (
          <article key={agent.id} className="cx-card cx-agent">
            <Users size={18} />
            <div>
              <strong>{agent.name || agent.title || agent.id}</strong>
              <small>
                {statusLabels[agent.status || ''] || agent.status || '已记录'} ·{' '}
                {String(agent.agentId || 'reviewer')}
              </small>
              {body && <p>{body}</p>}
              {result && <pre>{result}</pre>}
              {Boolean(agent.error) && <p className="cx-error">{String(agent.error)}</p>}
              <button className="cx-button" onClick={() => void inspect(agent)}>
                <FileSearch size={14} />
                查看任务详情
              </button>
              {agent.status === 'running' && (
                <button
                  className="cx-button"
                  disabled={busy}
                  onClick={() => void cancelChild(agent)}
                >
                  取消此子任务
                </button>
              )}
            </div>
          </article>
        )
      })}
      {!subagents.length && <p className="cx-empty">本会话暂未创建子智能体。</p>}
      {detail && (
        <article className="cx-card cx-agent-detail">
          <header>
            <h3>{detail.name || detail.id}</h3>
            <button
              className="cx-icon"
              aria-label="关闭子任务详情"
              onClick={() => setDetail(undefined)}
            >
              <X size={16} />
            </button>
          </header>
          <p>{statusLabels[detail.status || ''] || detail.status}</p>
          {Boolean(detail.result) && <pre className="cx-result">{String(detail.result)}</pre>}
          {Boolean(detail.error) && <p className="cx-error">{String(detail.error)}</p>}
          <details open>
            <summary>原生任务日志</summary>
            <pre className="cx-result">{JSON.stringify(detail.events || [], null, 2)}</pre>
          </details>
        </article>
      )}
    </section>
  )
}
