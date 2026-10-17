import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  Wrench,
  Check,
  LoaderCircle,
  Copy,
  FileText,
  Pause,
  Square,
  Play,
} from 'lucide-react'
import { useCodexStore, selectCurrentRun, selectRunning } from '../store'
import MarkdownContent from './MarkdownContent'
import InteractionCard from './InteractionCard'
import AttachmentPreview from './AttachmentPreview'

interface Props {
  onPlan: () => void
  onProject: () => void
}

const statusLabels: Record<string, string> = {
  running: '正在处理任务',
  queued: '任务已排队',
  waiting: '等待你的回答或批准',
  completed: '本次任务已完成',
  failed: '任务失败',
  cancelled: '任务已取消',
  interrupted: '任务已中断',
  suspended: '等待你的回答或批准',
  budget_exhausted: '本次预算已用尽',
}

export default function ConversationTimeline({ onPlan, onProject }: Props) {
  const conversation = useCodexStore((s) => s.conversation)
  const messages = useCodexStore((s) => s.messages)
  const interactions = useCodexStore((s) => s.interactions)
  const activities = useCodexStore((s) => s.activities)
  const plan = useCodexStore((s) => s.plan)
  const currentRun = useCodexStore(selectCurrentRun)
  const running = useCodexStore(selectRunning)
  const perform = useCodexStore((s) => s.perform)
  const action = useCodexStore((s) => s.action)

  const hostRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const followRef = useRef(true)

  function scroll() {
    const element = hostRef.current
    if (element)
      followRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120
  }

  const activitySignature =
    messages.map((m) => m.content).join('') +
    interactions.length +
    activities.map((t) => t.output).join('')
  useEffect(() => {
    if (followRef.current) hostRef.current?.scrollTo({ top: hostRef.current.scrollHeight })
  }, [activitySignature])

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      useCodexStore.setState({ notice: '已复制。' })
    } catch {
      useCodexStore.setState({ error: '无法访问剪贴板。' })
    }
  }

  return (
    <div ref={hostRef} className="cx-timeline-scroll" onScroll={scroll}>
      <div className="cx-timeline">
        {!conversation ? (
          <div className="cx-welcome">
            <h1>开始创造吧。</h1>
            <p>直接提问、附加文件，或和 Codex代码助手一起规划、编码、验证。</p>
            <button className="cx-button" onClick={onProject}>
              选择项目（可选）
            </button>
            <div className="cx-welcome-examples">
              <button
                onClick={() =>
                  useCodexStore
                    .getState()
                    .setDraft('我想实现一个新功能，请先帮我梳理需求和具体的实现计划。')
                }
              >
                规划想法
              </button>
              <button
                onClick={() =>
                  useCodexStore
                    .getState()
                    .setDraft('帮我分析接下来提供的代码或报错，并给出可验证的修复方法。')
                }
              >
                修复问题
              </button>
              <button
                onClick={() =>
                  useCodexStore
                    .getState()
                    .setDraft('根据我附加的界面参考实现功能，先确认需求再修改代码。')
                }
              >
                实现功能
              </button>
              <button
                onClick={() =>
                  useCodexStore
                    .getState()
                    .setDraft('查询武汉今天和未来两天的天气，写明观测时间和数据来源。')
                }
              >
                查天气
              </button>
            </div>
          </div>
        ) : !messages.length ? (
          <div className="cx-empty-conversation">
            <h2>{conversation.title || '新聊天'}</h2>
            <p>
              {conversation.projectId
                ? '工作区已准备好，输入任务开始。'
                : '直接输入任务，也可以附加文件和图片。'}
            </p>
          </div>
        ) : null}
        {messages
          .filter((m) => m.role !== 'tool' && m.role !== 'system')
          .map((message) => (
            <article key={message.id} className={`cx-message ${message.role}`}>
              {message.attachments?.length ? (
                <div className="cx-message-attachments">
                  {message.attachments.map((attachment) => (
                    <AttachmentPreview key={attachment.id} attachment={attachment} />
                  ))}
                </div>
              ) : null}
              <MarkdownContent content={message.content} />
              {message.content && message.role === 'assistant' && (
                <button
                  className="cx-icon cx-copy-message"
                  aria-label="复制消息"
                  onClick={() => void copy(message.content)}
                >
                  <Copy size={14} />
                </button>
              )}
            </article>
          ))}
        {activities.length > 0 && (
          <div className="cx-activity-list">
            {activities.map((activity) => (
              <div key={activity.id}>
                <button
                  className="cx-tool-heading"
                  aria-expanded={expanded[activity.id]}
                  onClick={() =>
                    setExpanded((current) => ({
                      ...current,
                      [activity.id]: !current[activity.id],
                    }))
                  }
                >
                  <ChevronRight
                    size={13}
                    className={expanded[activity.id] ? 'rotated' : undefined}
                  />
                  {activity.status !== 'completed' ? (
                    <LoaderCircle size={14} className="cx-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>{activity.name}</span>
                  <small>{activity.status !== 'completed' ? '运行中' : '已返回'}</small>
                </button>
                {expanded[activity.id] && (
                  <div className="cx-tool-detail">
                    <strong>输入</strong>
                    <pre>{activity.arguments || '{}'}</pre>
                    {activity.output && <strong>输出</strong>}
                    {activity.output && <pre>{activity.output}</pre>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {plan && plan.steps.length > 0 && (
          <article className="cx-plan-document">
            <FileText size={21} />
            <div>
              <strong>{plan.title || '实施计划'}</strong>
              <small>
                {plan.steps.filter((s) => s.status === 'completed').length} / {plan.steps.length}{' '}
                步已完成
              </small>
            </div>
            <button className="cx-button" onClick={onPlan}>
              打开计划
            </button>
            <button
              className="cx-icon"
              aria-label="复制计划"
              onClick={() =>
                void copy(
                  plan.title +
                    '\n' +
                    plan.steps
                      .map((s) => '- [' + (s.status === 'completed' ? 'x' : ' ') + '] ' + s.title)
                      .join('\n'),
                )
              }
            >
              <Copy size={15} />
            </button>
          </article>
        )}
        {interactions.map((interaction) => (
          <InteractionCard key={interaction.id} interaction={interaction} />
        ))}
        {currentRun && (
          <div className="cx-run-status">
            {running ? <LoaderCircle className="cx-spin" size={14} /> : <Wrench size={14} />}
            <span>{statusLabels[currentRun.status] || currentRun.status}</span>
            {running ? (
              <div>
                <button onClick={() => void perform(() => action('interrupt'))}>
                  <Pause size={12} />
                  中断
                </button>
                <button onClick={() => void perform(() => action('cancel'))}>
                  <Square size={12} />
                  取消
                </button>
              </div>
            ) : ['interrupted', 'failed', 'budget_exhausted'].includes(currentRun.status) &&
              !interactions.length ? (
              <button onClick={() => void perform(() => action('resume'))}>
                <Play size={12} />
                继续
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
