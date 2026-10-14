import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  Plus,
  ArrowUp,
  Mic,
  Square,
  Paperclip,
  Folder,
  Globe,
  Target,
  ListChecks,
  Pencil,
  Check,
  X,
  ChevronDown,
  GitPullRequest,
  Palette,
  FileText,
  FileType2,
} from 'lucide-react'
import {
  useCodexStore,
  selectProject,
  selectWorkspace,
  selectCurrentRun,
  selectRunning,
  selectActiveExecution,
  selectModel,
} from '../store'
import { permissionLabels } from '../types'
import type { Conversation, PermissionMode } from '../types'
import SketchDialog from './SketchDialog'

interface RecognitionEvent {
  resultIndex: number
  results: {
    length: number
    [key: number]: { isFinal: boolean; [key: number]: { transcript: string } }
  }
}

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult?: (event: RecognitionEvent) => void
  onerror?: (event: { error: string }) => void
  onend?: () => void
  start(): void
  stop(): void
  abort(): void
}

interface Props {
  onGoal: () => void
  onChrome: () => void
  onPlugins: (plugin?: string) => void
}

export default function Composer({ onGoal, onChrome, onPlugins }: Props) {
  const conversation = useCodexStore((s) => s.conversation)
  const newSettings = useCodexStore((s) => s.newSettings)
  const model = useCodexStore(selectModel)
  const draft = useCodexStore((s) => s.draft)
  const attachments = useCodexStore((s) => s.attachments)
  const interactions = useCodexStore((s) => s.interactions)
  const currentRun = useCodexStore(selectCurrentRun)
  const running = useCodexStore(selectRunning)
  const activeExecution = useCodexStore(selectActiveExecution)
  const busy = useCodexStore((s) => s.busy)
  const capabilities = useCodexStore((s) => s.capabilities)
  const project = useCodexStore(selectProject)
  const workspace = useCodexStore(selectWorkspace)
  const perform = useCodexStore((s) => s.perform)
  const sendAction = useCodexStore((s) => s.send)
  const attachAction = useCodexStore((s) => s.attach)
  const runAction = useCodexStore((s) => s.action)
  const configureStore = useCodexStore((s) => s.configure)
  const [popover, setPopover] = useState('')
  const files = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  const [sketch, setSketch] = useState(false)
  const [recording, setRecording] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [speechDraft, setSpeechDraft] = useState('')
  const recognitionRef = useRef<Recognition | undefined>(undefined)
  const permission = conversation?.permissionMode ?? newSettings.permissionMode ?? 'auto'
  const planMode = conversation?.planMode ?? newSettings.planMode ?? false
  const effort =
    conversation?.reasoningEffort || newSettings.reasoningEffort || model?.reasoningEfforts[0] || ''
  const efforts = model?.reasoningEfforts ?? []
  const effortIndex = Math.max(0, efforts.indexOf(effort))
  const modes: { id: PermissionMode; description: string }[] = [
    { id: 'ask', description: '编辑外部文件和使用互联网时始终询问' },
    { id: 'auto', description: '仅对检测到的风险操作请求批准' },
    { id: 'full', description: '可访问授权范围内的本机文件与互联网' },
  ]

  async function configure(settings: Partial<Conversation>) {
    setPopover('')
    await perform(() => configureStore(settings))
  }

  async function attach(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target as HTMLInputElement
    const selected = Array.from(input.files ?? [])
    input.value = ''
    setPopover('')
    await perform(() => attachAction(selected))
  }

  function remove(index: number) {
    const item = attachments[index]
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
    useCodexStore.setState((s) => ({
      attachments: s.attachments.filter((_, i) => i !== index),
    }))
  }

  async function send() {
    if (interactions.length || ['suspended', 'waiting'].includes(currentRun?.status || '')) return
    if (running) {
      await perform(() => runAction('steer', draft))
      if (!useCodexStore.getState().error) useCodexStore.getState().setDraft('')
    } else await perform(() => sendAction())
  }

  async function saveSketch(file: File) {
    setSketch(false)
    await perform(() => attachAction([file]))
  }

  function chooseAction(kind: 'chrome' | 'goal' | 'sketch') {
    setPopover('')
    if (kind === 'sketch') setSketch(true)
    else if (kind === 'chrome') onChrome()
    else if (kind === 'goal') onGoal()
  }

  function voice() {
    if (recording) {
      recognitionRef.current?.stop()
      return
    }
    const Constructor =
      (
        window as unknown as {
          SpeechRecognition?: new () => Recognition
          webkitSpeechRecognition?: new () => Recognition
        }
      ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => Recognition })
        .webkitSpeechRecognition
    if (!Constructor) {
      setVoiceError(
        '当前浏览器不支持语音转写。请使用 Chrome，或在设置中配置音频模型后上传录音附件。',
      )
      return
    }
    setVoiceError('')
    setSpeechDraft('')
    const recognition = new Constructor()
    recognitionRef.current = recognition
    recognition.lang = 'zh-CN'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let pending = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!
        if (result.isFinal) {
          const state = useCodexStore.getState()
          state.setDraft(state.draft + result[0]!.transcript)
        } else pending += result[0]!.transcript
      }
      setSpeechDraft(pending)
    }
    recognition.onerror = (event) => {
      setVoiceError(
        event.error === 'not-allowed'
          ? '麦克风未获授权。请在浏览器设置中允许麦克风。'
          : '语音转写中断，请检查麦克风与网络后重试。',
      )
      setRecording(false)
    }
    recognition.onend = () => {
      setRecording(false)
      setSpeechDraft('')
    }
    try {
      recognition.start()
      setRecording(true)
    } catch {
      setVoiceError('无法启动语音转写，请重试。')
    }
  }

  useEffect(
    () => () => {
      recognitionRef.current?.abort()
    },
    [],
  )

  return (
    <div className="cx-composer-wrap">
      {voiceError && (
        <p className="cx-error" role="alert">
          {voiceError}
          <button className="cx-icon" aria-label="关闭语音提示" onClick={() => setVoiceError('')}>
            <X size={14} />
          </button>
        </p>
      )}
      <div className={'cx-composer' + (recording ? ' recording' : '')}>
        {attachments.length > 0 && (
          <div className="cx-draft-attachments">
            {attachments.map((attachment, index) => (
              <div key={attachment.id} className="cx-attachment">
                {attachment.previewUrl ? (
                  <img src={attachment.previewUrl} alt={attachment.name} />
                ) : (
                  <Paperclip size={18} />
                )}
                <span>{attachment.relativePath || attachment.name}</span>
                <button
                  className="cx-icon"
                  aria-label={`移除附件 ${attachment.name}`}
                  onClick={() => remove(index)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          value={draft}
          onChange={(event) => useCodexStore.getState().setDraft(event.target.value)}
          data-testid="codex-composer"
          rows={2}
          placeholder={running ? '继续指导当前任务…' : '让 Codex代码助手帮你写代码…'}
          aria-label="给智能体的消息"
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.metaKey
            ) {
              event.preventDefault()
              void send()
            }
          }}
          onPaste={(event) => {
            const items = Array.from(event.clipboardData?.files || [])
            if (items.length) {
              event.preventDefault()
              void perform(() => attachAction(items))
            }
          }}
        ></textarea>
        {recording && (
          <p className="cx-voice-transcript">
            正在听… {speechDraft}
            <small>转写只加入输入框，确认后再发送。</small>
          </p>
        )}
        <footer>
          <div className="cx-composer-left">
            <div className="cx-popover-anchor">
              <button
                className="cx-icon"
                aria-label="添加附件和工具"
                aria-expanded={popover === 'add'}
                onClick={() => setPopover(popover === 'add' ? '' : 'add')}
              >
                <Plus size={20} />
              </button>
              {popover === 'add' && (
                <div className="cx-popover cx-add-menu">
                  <button onClick={() => files.current?.click()}>
                    <Paperclip size={16} />
                    <span>添加文件</span>
                  </button>
                  <button onClick={() => folder.current?.click()}>
                    <Folder size={16} />
                    <span>添加文件夹</span>
                  </button>
                  <button onClick={() => chooseAction('chrome')}>
                    <Globe size={16} />
                    <span>
                      附加 Google Chrome
                      <small>使用已登录的标签页</small>
                    </span>
                  </button>
                  <hr />
                  <button onClick={() => chooseAction('goal')}>
                    <Target size={16} />
                    <span>
                      目标
                      <small>设置要持续追求的目标</small>
                    </span>
                  </button>
                  <button
                    disabled={activeExecution}
                    onClick={() => void configure({ planMode: !planMode })}
                  >
                    <ListChecks size={16} />
                    <span>
                      计划模式
                      <small>{planMode ? '关闭计划模式' : '开启计划模式'}</small>
                    </span>
                  </button>
                  <button onClick={() => chooseAction('sketch')}>
                    <Pencil size={16} />
                    <span>绘制草图</span>
                  </button>
                  <hr />
                  {[
                    { id: 'github', name: 'GitHub', icon: GitPullRequest },
                    { id: 'design', name: 'Product Design', icon: Palette },
                    { id: 'documents', name: 'Documents', icon: FileText },
                    { id: 'pdf', name: 'PDF', icon: FileType2 },
                  ].map((plugin) => (
                    <button
                      key={plugin.id}
                      onClick={() => {
                        setPopover('')
                        onPlugins(plugin.id)
                      }}
                    >
                      <plugin.icon size={16} />
                      <span>{plugin.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="cx-popover-anchor">
              <button
                className={'cx-permission ' + permission}
                disabled={activeExecution}
                onClick={() => setPopover(popover === 'permission' ? '' : 'permission')}
              >
                {permissionLabels[permission]}
              </button>
              {popover === 'permission' && (
                <div className="cx-popover cx-permission-menu">
                  {modes.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => void configure({ permissionMode: mode.id })}
                    >
                      <span>
                        {permissionLabels[mode.id]}
                        <small>{mode.description}</small>
                      </span>
                      {mode.id === permission && <Check size={17} />}
                    </button>
                  ))}
                  <p>访问权限与计划模式分别控制；发布仍需明确确认。</p>
                </div>
              )}
            </div>
            <button
              className={'cx-plan-toggle' + (planMode ? ' active' : '')}
              disabled={activeExecution}
              aria-pressed={planMode}
              onClick={() => void configure({ planMode: !planMode })}
            >
              <ListChecks size={15} />
              计划
            </button>
          </div>
          <div className="cx-composer-right">
            <div className="cx-popover-anchor">
              <button
                className="cx-model-select"
                disabled={activeExecution}
                onClick={() => setPopover(popover === 'model' ? '' : 'model')}
              >
                {model?.name || '选择模型'}
                <ChevronDown size={12} />
              </button>
              {popover === 'model' && (
                <div className="cx-popover cx-model-menu">
                  <strong>模型</strong>
                  {(capabilities?.models ?? []).map((profile) => (
                    <button
                      key={profile.id}
                      disabled={!profile.configured}
                      onClick={() =>
                        void configure({
                          modelId: profile.id,
                          reasoningEffort: profile.reasoningEfforts.includes(effort)
                            ? effort
                            : profile.reasoningEfforts[0],
                        })
                      }
                    >
                      <span>
                        {profile.name}
                        <small>
                          {profile.provider}
                          {!profile.configured ? ' · 尚未配置' : ''}
                          {profile.vision ? ' · 支持图片' : ''}
                        </small>
                      </span>
                      {model?.id === profile.id && <Check size={15} />}
                    </button>
                  ))}
                  {!capabilities?.models.length && <p>请在设置中配置模型档案。</p>}
                </div>
              )}
            </div>
            {efforts.length > 0 && (
              <div className="cx-popover-anchor">
                <button
                  className="cx-effort-select"
                  disabled={activeExecution}
                  onClick={() => setPopover(popover === 'effort' ? '' : 'effort')}
                >
                  {effort}
                </button>
                {popover === 'effort' && (
                  <div className="cx-popover cx-effort-menu">
                    <header>
                      <strong>推理强度</strong>
                      <button onClick={() => void configure({ reasoningEffort: efforts[0] })}>
                        重置
                      </button>
                    </header>
                    <strong>{effort}</strong>
                    <input
                      value={effortIndex}
                      type="range"
                      min={0}
                      max={efforts.length - 1}
                      step={1}
                      aria-label="推理强度"
                      onChange={(event) =>
                        void configure({
                          reasoningEffort:
                            efforts[Number((event.target as HTMLInputElement).value)],
                        })
                      }
                    />
                    <div>
                      {efforts.map((level) => (
                        <small key={level}>{level}</small>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              className={'cx-icon cx-mic' + (recording ? ' active' : '')}
              aria-label={recording ? '停止语音转写' : '语音输入'}
              onClick={voice}
            >
              {recording ? <Square size={16} /> : <Mic size={18} />}
            </button>
            <button
              className="cx-send"
              disabled={
                busy ||
                interactions.length > 0 ||
                ['suspended', 'waiting'].includes(currentRun?.status || '') ||
                (!draft.trim() && !attachments.length) ||
                (running && attachments.length > 0)
              }
              aria-label={running ? '发送任务指导' : '发送消息'}
              onClick={() => void send()}
            >
              <ArrowUp size={19} />
            </button>
          </div>
        </footer>
      </div>
      <p className="cx-composer-hint">
        {project?.name || '独立聊天 · 可直接开始，也可选择项目'}
        {workspace && (
          <span>
            · {workspace.mode === 'scratch' ? '独立工作目录' : workspace.mode} ·{' '}
            {workspace.environment}
          </span>
        )}
        {running && <span>· 任务正在执行，可继续指导</span>}
      </p>
      <input ref={files} className="cx-hidden" type="file" multiple onChange={attach} />
      <input
        ref={folder}
        className="cx-hidden"
        type="file"
        multiple
        {...({ webkitdirectory: '' } as Record<string, string>)}
        onChange={attach}
      />
      {sketch && <SketchDialog onClose={() => setSketch(false)} onSave={saveSketch} />}
      {popover && (
        <div className="cx-popover-dismiss" aria-hidden="true" onClick={() => setPopover('')}></div>
      )}
    </div>
  )
}
