import { newId } from '../../shared/id'
import { useEffect, useRef, useState } from 'react'
import { Target, ListChecks, Plus, X, Download } from 'lucide-react'
import { useCodexStore } from '../store'
import type { Plan } from '../types'

const goalLabels: Record<string, string> = {
  needs_review: '等待验收',
  budget_exhausted: '预算已用尽',
  active: '持续推进中',
  paused: '已暂停',
  complete: '已完成',
  completed: '已完成',
  blocked: '等待处理',
  cancelled: '已取消',
}

export default function TasksPanel() {
  const conversation = useCodexStore((s) => s.conversation)
  const usage = useCodexStore((s) => s.usage)
  const goals = useCodexStore((s) => s.goals)
  const plan = useCodexStore((s) => s.plan)
  const busy = useCodexStore((s) => s.busy)
  const perform = useCodexStore((s) => s.perform)
  const updateGoal = useCodexStore((s) => s.updateGoal)
  const savePlanAction = useCodexStore((s) => s.savePlan)
  const createGoal = useCodexStore((s) => s.createGoal)

  const [title, setTitle] = useState('')
  const [maxTokens, setMaxTokens] = useState(100000)
  const [activeMinutes, setActiveMinutes] = useState(30)
  const [editingPlan, setEditingPlan] = useState<Plan>({ title: '实施计划', steps: [] })
  const planDirtyRef = useRef(false)
  const [goalLimits, setGoalLimits] = useState<Record<string, { tokens: number; minutes: number }>>(
    {},
  )

  function editLimit(id: string, tokens: number, activeMs: number) {
    setGoalLimits((limits) => ({
      ...limits,
      [id]: { tokens, minutes: Math.max(1, Math.round(activeMs / 60000)) },
    }))
  }

  async function resumeGoal(id: string) {
    const limits = goalLimits[id]
    await perform(() =>
      updateGoal(
        id,
        'active',
        limits ? { maxTokens: limits.tokens, maxActiveMs: limits.minutes * 60000 } : undefined,
      ),
    )
  }

  useEffect(() => {
    if (!planDirtyRef.current)
      setEditingPlan(JSON.parse(JSON.stringify(plan || { title: '实施计划', steps: [] })))
  }, [plan])

  function addStep() {
    setEditingPlan((current) => ({
      ...current,
      steps: [...current.steps, { id: newId(), title: '', status: 'pending' }],
    }))
    planDirtyRef.current = true
  }

  function removeStep(index: number) {
    setEditingPlan((current) => ({
      ...current,
      steps: current.steps.filter((_, i) => i !== index),
    }))
    planDirtyRef.current = true
  }

  async function savePlan() {
    const result = await perform(() => savePlanAction(editingPlan))
    if (!useCodexStore.getState().error) {
      planDirtyRef.current = false
      useCodexStore.setState({ notice: '计划已保存。' })
    }
    return result
  }

  async function goal() {
    await perform(() => createGoal(title, maxTokens, activeMinutes * 60000))
    if (!useCodexStore.getState().error) setTitle('')
  }

  function exportPlan() {
    const text =
      '# ' +
      editingPlan.title +
      '\n\n' +
      editingPlan.steps
        .map((s) => '- [' + (s.status === 'completed' ? 'x' : ' ') + '] ' + s.title)
        .join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = '实施计划.md'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <section className="cx-panel">
      <header className="cx-panel-heading">
        <div>
          <h1>任务与目标</h1>
          <p>目标负责持续推进与预算，计划记录可审阅的执行步骤。</p>
        </div>
      </header>
      {!conversation ? (
        <div className="cx-empty">
          <p>目标和计划保存在当前聊天，可以独立开始。</p>
          <button
            className="cx-button"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const draft = useCodexStore.getState().draft
                await useCodexStore.getState().newConversation()
                useCodexStore.getState().setDraft(draft)
              })
            }
          >
            开始聊天并设置目标
          </button>
        </div>
      ) : (
        <>
          <div className="cx-budget">
            <span>已使用 {usage.tokens.toLocaleString()} tokens</span>
            <span>活跃时间 {Math.round(usage.activeMs / 60000)} 分钟</span>
            <span>
              会话预算 {conversation.maxTokens.toLocaleString()} tokens /{' '}
              {Math.round(conversation.maxActiveMs / 60000)} 分钟
            </span>
          </div>
          {goals.map((goalItem) => (
            <article key={goalItem.id} className="cx-card cx-goal">
              <Target size={20} />
              <div>
                <strong>{goalItem.title}</strong>
                <small>
                  {goalLabels[goalItem.status] || goalItem.status} ·{' '}
                  {goalItem.maxTokens || conversation.maxTokens} tokens
                </small>
                {goalItem.status === 'budget_exhausted' && (
                  <button
                    onClick={() =>
                      editLimit(
                        goalItem.id,
                        (goalItem.maxTokens || conversation.maxTokens) * 2,
                        (goalItem.maxActiveMs || conversation.maxActiveMs) * 2,
                      )
                    }
                  >
                    调整预算后恢复
                  </button>
                )}
                {goalLimits[goalItem.id] && (
                  <div className="cx-goal-limits">
                    <label>
                      Token 上限
                      <input
                        type="number"
                        min={1000}
                        value={goalLimits[goalItem.id]!.tokens}
                        onChange={(e) =>
                          setGoalLimits((limits) => ({
                            ...limits,
                            [goalItem.id]: {
                              ...limits[goalItem.id]!,
                              tokens: Number(e.target.value),
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      活跃分钟
                      <input
                        type="number"
                        min={1}
                        value={goalLimits[goalItem.id]!.minutes}
                        onChange={(e) =>
                          setGoalLimits((limits) => ({
                            ...limits,
                            [goalItem.id]: {
                              ...limits[goalItem.id]!,
                              minutes: Number(e.target.value),
                            },
                          }))
                        }
                      />
                    </label>
                    <button
                      className="cx-button"
                      disabled={busy}
                      onClick={() => void resumeGoal(goalItem.id)}
                    >
                      保存预算并恢复
                    </button>
                  </div>
                )}
              </div>
              {goalItem.status !== 'paused' &&
                goalItem.status !== 'completed' &&
                goalItem.status !== 'complete' && (
                  <button
                    className="cx-button"
                    onClick={() => void perform(() => updateGoal(goalItem.id, 'paused'))}
                  >
                    暂停
                  </button>
                )}
              {(goalItem.status === 'paused' || goalItem.status === 'blocked') && (
                <button className="cx-button" onClick={() => void resumeGoal(goalItem.id)}>
                  恢复
                </button>
              )}
              {goalItem.status !== 'completed' && goalItem.status !== 'complete' && (
                <button
                  className="cx-button"
                  onClick={() => void perform(() => updateGoal(goalItem.id, 'complete'))}
                >
                  标记完成
                </button>
              )}
            </article>
          ))}
          <form
            className="cx-card cx-form-grid"
            onSubmit={(e) => {
              e.preventDefault()
              void goal()
            }}
          >
            <h3>
              <Target size={17} />
              持续目标
            </h3>
            <label>
              目标
              <input
                value={title}
                placeholder="例如：完成登录模块并通过相关测试"
                required
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Token 预算
              <input
                type="number"
                min={1000}
                step={1000}
                required
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
              />
            </label>
            <label>
              活跃时间上限（分钟）
              <input
                type="number"
                min={1}
                max={1440}
                required
                value={activeMinutes}
                onChange={(e) => setActiveMinutes(Number(e.target.value))}
              />
            </label>
            <button className="cx-button cx-primary" disabled={busy}>
              创建目标
            </button>
          </form>
          <form
            className="cx-card cx-plan-editor"
            onSubmit={(e) => {
              e.preventDefault()
              void savePlan()
            }}
          >
            <header>
              <h3>
                <ListChecks size={18} />
                实施计划
              </h3>
              <button type="button" className="cx-icon" aria-label="下载计划" onClick={exportPlan}>
                <Download size={16} />
              </button>
            </header>
            <input
              aria-label="计划名称"
              value={editingPlan.title}
              onChange={(e) => {
                planDirtyRef.current = true
                const value = e.target.value
                setEditingPlan((current) => ({ ...current, title: value }))
              }}
            />
            {editingPlan.steps.map((step, index) => (
              <div key={step.id} className="cx-plan-row">
                <select
                  aria-label="步骤状态"
                  value={step.status}
                  onChange={(e) => {
                    planDirtyRef.current = true
                    const status = e.target.value
                    setEditingPlan((current) => ({
                      ...current,
                      steps: current.steps.map((s, i) => (i === index ? { ...s, status } : s)),
                    }))
                  }}
                >
                  <option value="pending">待处理</option>
                  <option value="in_progress">进行中</option>
                  <option value="completed">已完成</option>
                </select>
                <input
                  aria-label={`步骤 ${index + 1}`}
                  required
                  value={step.title}
                  onChange={(e) => {
                    planDirtyRef.current = true
                    const value = e.target.value
                    setEditingPlan((current) => ({
                      ...current,
                      steps: current.steps.map((s, i) =>
                        i === index ? { ...s, title: value } : s,
                      ),
                    }))
                  }}
                />
                <button
                  type="button"
                  className="cx-icon"
                  aria-label="删除步骤"
                  onClick={() => removeStep(index)}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <footer>
              <button type="button" className="cx-button" onClick={addStep}>
                <Plus size={15} />
                添加步骤
              </button>
              <button className="cx-button cx-primary" disabled={busy}>
                保存计划
              </button>
            </footer>
          </form>
        </>
      )}
    </section>
  )
}
