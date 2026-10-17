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
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  VolumeX,
  Share2,
} from 'lucide-react'
import { useCodexStore, selectCurrentRun, selectRunning } from '../store'
import { accountStorage } from '../../account/session'
import MarkdownContent from './MarkdownContent'
import StreamingMarkdown from './StreamingMarkdown'
import InteractionCard from './InteractionCard'
import AttachmentPreview from './AttachmentPreview'

const feedbackKey = 'xuya.codex.feedback:v1'

/** 朗读和分享前去掉 Markdown 标记，避免把星号、表格线读出来。 */
function plainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' 代码块 ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

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
  const switching = useCodexStore((s) => s.switching)
  const perform = useCodexStore((s) => s.perform)
  const action = useCodexStore((s) => s.action)

  const hostRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>(() => {
    try {
      return JSON.parse(accountStorage.getItem(feedbackKey) ?? '{}')
    } catch {
      return {}
    }
  })
  const [speaking, setSpeaking] = useState<string>()
  const followRef = useRef(true)
  // 打开历史会话时直接显示全文；挂载后新到的回答才逐字播放。
  const seenMessages = useRef<Set<string>>(new Set())
  const seenConversation = useRef<string | undefined>(undefined)
  const wasSwitching = useRef(false)
  if (seenConversation.current !== conversation?.id) {
    seenConversation.current = conversation?.id
    // 首次进入或切换会话时，已经存在的消息全部视为历史记录，直接显示全文。
    seenMessages.current =
      !switching && messages.length ? new Set(messages.map((message) => message.id)) : new Set()
    wasSwitching.current = false
  }
  if (switching) wasSwitching.current = true
  if (!switching && wasSwitching.current) {
    // 历史快照加载完成：已有回答不再重播；空会话也要结束这次切换标记。
    if (messages.length) seenMessages.current = new Set(messages.map((message) => message.id))
    wasSwitching.current = false
  }
  if (!switching && messages.length && !seenMessages.current.size)
    // 只把已有的用户消息记为“已见”，新回答保持逐字显示。
    seenMessages.current = new Set(
      messages.filter((message) => message.role !== 'assistant').map((message) => message.id),
    )

  useEffect(() => () => window.speechSynthesis?.cancel(), [])

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
  useEffect(() => {
    const follow = () => {
      if (followRef.current) hostRef.current?.scrollTo({ top: hostRef.current.scrollHeight })
    }
    window.addEventListener('cx:stream-progress', follow)
    return () => window.removeEventListener('cx:stream-progress', follow)
  }, [])

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      useCodexStore.setState({ notice: '已复制。' })
    } catch {
      useCodexStore.setState({ error: '无法访问剪贴板。' })
    }
  }

  function vote(messageId: string, value: 'up' | 'down') {
    const next = { ...feedback }
    if (next[messageId] === value) delete next[messageId]
    else next[messageId] = value
    setFeedback(next)
    try {
      accountStorage.setItem(feedbackKey, JSON.stringify(next))
    } catch {
      /* 反馈只是本机记录，写入失败不影响聊天。 */
    }
    useCodexStore.setState({
      notice:
        next[messageId] === 'up'
          ? '已记录：这个回答有帮助。'
          : next[messageId] === 'down'
            ? '已记录：这个回答还需要改进。'
            : '已取消这条反馈。',
    })
  }

  function speak(messageId: string, content: string) {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      useCodexStore.setState({ error: '当前浏览器不支持语音朗读。' })
      return
    }
    if (speaking === messageId) {
      window.speechSynthesis.cancel()
      setSpeaking(undefined)
      return
    }
    window.speechSynthesis.cancel()
    const text = plainText(content)
    if (!text) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = /[\u4e00-\u9fff]/.test(text) ? 'zh-CN' : 'en-US'
    utterance.rate = 1
    utterance.onend = () => setSpeaking(undefined)
    utterance.onerror = () => setSpeaking(undefined)
    setSpeaking(messageId)
    window.speechSynthesis.speak(utterance)
  }

  async function share(content: string) {
    const text = plainText(content)
    if (navigator.share) {
      try {
        await navigator.share({ title: '叙芽岛 · 码穹', text })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    await copy(text)
    useCodexStore.setState({ notice: '分享内容已复制到剪贴板。' })
  }

  async function regenerate(messageId: string) {
    const index = messages.findIndex((message) => message.id === messageId)
    const previous = [...messages.slice(0, index)]
      .reverse()
      .find((message) => message.role === 'user')
    if (!previous) {
      useCodexStore.setState({ notice: '没有找到这条回答对应的提问，无法重新生成。' })
      return
    }
    const savedDraft = useCodexStore.getState().draft
    const savedAttachments = useCodexStore.getState().attachments
    await perform(async () => {
      try {
        useCodexStore.setState({ draft: previous.content, attachments: [] })
        await useCodexStore.getState().send()
      } finally {
        useCodexStore.getState().setDraft(savedDraft)
        useCodexStore.setState({ attachments: savedAttachments })
      }
    })
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
          .map((message) => {
            const sourceIndex = messages.indexOf(message)
            const canRegenerate =
              message.role === 'assistant' &&
              messages.slice(0, sourceIndex).some((item) => item.role === 'user')
            return (
              <article key={message.id} className={`cx-message ${message.role}`}>
                {message.attachments?.length ? (
                  <div className="cx-message-attachments">
                    {message.attachments.map((attachment) => (
                      <AttachmentPreview key={attachment.id} attachment={attachment} />
                    ))}
                  </div>
                ) : null}
                {message.role === 'assistant' ? (
                  <StreamingMarkdown
                    content={message.content}
                    animate={!seenMessages.current.has(message.id)}
                  />
                ) : (
                  <MarkdownContent content={message.content} />
                )}
                {message.content && message.role === 'assistant' && (
                  <div className="cx-message-actions" role="group" aria-label="消息操作">
                    <button
                      type="button"
                      className="cx-message-action"
                      title="复制"
                      aria-label="复制消息"
                      onClick={() => void copy(message.content)}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      type="button"
                      className="cx-message-action"
                      title="重新生成"
                      aria-label="重新生成"
                      disabled={!canRegenerate}
                      onClick={() => void regenerate(message.id)}
                    >
                      <RefreshCw size={15} />
                    </button>
                    <button
                      type="button"
                      className={
                        'cx-message-action' + (feedback[message.id] === 'up' ? ' active' : '')
                      }
                      title="这个回答有帮助"
                      aria-label="这个回答有帮助"
                      aria-pressed={feedback[message.id] === 'up'}
                      onClick={() => vote(message.id, 'up')}
                    >
                      <ThumbsUp size={15} />
                    </button>
                    <button
                      type="button"
                      className={
                        'cx-message-action' + (feedback[message.id] === 'down' ? ' active' : '')
                      }
                      title="这个回答需要改进"
                      aria-label="这个回答需要改进"
                      aria-pressed={feedback[message.id] === 'down'}
                      onClick={() => vote(message.id, 'down')}
                    >
                      <ThumbsDown size={15} />
                    </button>
                    <button
                      type="button"
                      className="cx-message-action"
                      title={speaking === message.id ? '停止朗读' : '朗读回答'}
                      aria-label={speaking === message.id ? '停止朗读' : '朗读回答'}
                      onClick={() => speak(message.id, message.content)}
                    >
                      {speaking === message.id ? <VolumeX size={15} /> : <Volume2 size={15} />}
                    </button>
                    <button
                      type="button"
                      className="cx-message-action"
                      title="分享"
                      aria-label="分享回答"
                      onClick={() => void share(message.content)}
                    >
                      <Share2 size={15} />
                    </button>
                  </div>
                )}
              </article>
            )
          })}
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
