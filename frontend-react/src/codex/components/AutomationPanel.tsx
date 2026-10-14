import { useState } from 'react'
import { Clock3, Plus, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useCodexStore } from '../store'
import type { Automation } from '../types'

export default function AutomationPanel() {
  const conversation = useCodexStore((s) => s.conversation)
  const busy = useCodexStore((s) => s.busy)
  const automations = useCodexStore((s) => s.automations)
  const perform = useCodexStore((s) => s.perform)
  const loadSection = useCodexStore((s) => s.loadSection)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [intervalMinutes, setIntervalMinutes] = useState(60)
  const [creating, setCreating] = useState(false)

  async function refresh() {
    await loadSection('automations')
  }

  async function create() {
    if (!conversation) {
      useCodexStore.setState({ error: '请先选择会话。' })
      return
    }
    await perform(async () => {
      await api('/codex/automations', 'POST', {
        conversationId: conversation.id,
        name,
        prompt,
        intervalMinutes,
        enabled: true,
      })
      await refresh()
      setName('')
      setPrompt('')
      setCreating(false)
    })
  }

  async function toggle(item: Automation) {
    await perform(async () => {
      await api(`/codex/automations/${item.id}`, 'PUT', { ...item, enabled: !item.enabled })
      await refresh()
    })
  }

  async function remove(item: Automation) {
    await perform(async () => {
      await api(`/codex/automations/${item.id}`, 'DELETE')
      await refresh()
    })
  }

  return (
    <section className="cx-panel">
      <header className="cx-panel-heading">
        <div>
          <h1>自动化</h1>
          <p>定时检查项目，结果归入绑定的会话；同一工作区遵守运行锁与审批策略。</p>
        </div>
        <button className="cx-button" onClick={() => setCreating(!creating)}>
          <Plus size={15} />
          新建自动化
        </button>
      </header>
      {creating && (
        <form
          className="cx-card cx-form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          <label>
            名称
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder="每日测试检查"
            />
          </label>
          <label>
            任务
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              required
              placeholder="写明检查内容以及何时需要提醒我"
            />
          </label>
          <label>
            间隔（分钟）
            <input
              value={intervalMinutes}
              onChange={(event) => setIntervalMinutes(Number(event.target.value))}
              type="number"
              min={1}
              max={10080}
              required
            />
          </label>
          <p className="cx-muted">
            绑定会话：{conversation?.title || '尚未选择'}。自动化不会自动批准发布。
          </p>
          <button className="cx-button cx-primary" disabled={busy || !conversation}>
            保存自动化
          </button>
        </form>
      )}
      {automations.map((item) => (
        <article key={item.id} className="cx-card cx-automation">
          <Clock3 size={20} />
          <div>
            <strong>{item.name}</strong>
            <p>{item.prompt}</p>
            <small>
              每 {item.intervalMinutes} 分钟 · {item.enabled ? '已启用' : '已暂停'}
              {item.nextRunAt ? ' · 下次 ' + new Date(item.nextRunAt).toLocaleString() : ''}
            </small>
          </div>
          <button className="cx-button" disabled={busy} onClick={() => void toggle(item)}>
            {item.enabled ? '暂停' : '启用'}
          </button>
          <button
            className="cx-icon"
            disabled={busy}
            aria-label={`删除自动化 ${item.name}`}
            onClick={() => void remove(item)}
          >
            <Trash2 size={16} />
          </button>
        </article>
      ))}
      {!automations.length && <p className="cx-empty">还没有自动化。创建后可在这里暂停或恢复。</p>}
    </section>
  )
}
