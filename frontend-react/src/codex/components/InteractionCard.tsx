import { useState } from 'react'
import { ShieldCheck, MessageCircle, ChevronDown } from 'lucide-react'
import type { Interaction } from '../types'
import { useCodexStore } from '../store'

interface Props {
  interaction: Interaction
}

interface Question {
  id: string
  question: string
  options: { label: string; description?: string; value?: string }[]
}

function computeQuestions(interaction: Interaction): Question[] {
  const args = interaction.arguments as
    | {
        question?: string
        options?: (string | { label: string; description?: string; value?: string })[]
        questions?: {
          id?: string
          question?: string
          prompt?: string
          options?: (string | { label: string; description?: string; value?: string })[]
        }[]
      }
    | undefined
  if (Array.isArray(args?.questions))
    return args.questions.map((q, i) => ({
      id: q.id || `question_${i}`,
      question: q.question || q.prompt || '',
      options: (q.options || []).map((o) => (typeof o === 'string' ? { label: o } : o)),
    }))
  if (args?.question)
    return [
      {
        id: 'answer',
        question: args.question,
        options: (args.options || []).map((o) => (typeof o === 'string' ? { label: o } : o)),
      },
    ]
  const schema = interaction.responseSchema as
    | { properties?: { answer?: { enum?: string[] } }; enum?: string[]; options?: string[] }
    | undefined
  const choices = schema?.properties?.answer?.enum || schema?.enum || schema?.options || []
  return [
    {
      id: 'answer',
      question: interaction.message || '智能体需要你的回答',
      options: choices.map((label) => ({ label })),
    },
  ]
}

export default function InteractionCard({ interaction }: Props) {
  const busy = useCodexStore((s) => s.busy)
  const perform = useCodexStore((s) => s.perform)
  const respondAction = useCodexStore((s) => s.respond)
  const [answer, setAnswer] = useState('')
  const [editedArgs, setEditedArgs] = useState(() =>
    JSON.stringify(interaction.arguments ?? {}, null, 2),
  )
  const [edit, setEdit] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [localError, setLocalError] = useState('')

  const approval = /approval|approve|permission|confirm/i.test(interaction.kind)
  const questions = computeQuestions(interaction)

  async function respond(approved?: boolean) {
    setLocalError('')
    let payload: Record<string, unknown>
    if (approval) {
      payload = { approved }
      if (edit && approved) {
        try {
          const next = JSON.parse(editedArgs)
          if (!next || typeof next !== 'object' || Array.isArray(next)) {
            setLocalError('工具参数必须是 JSON 对象。')
            return
          }
          payload.editedArgs = next
        } catch {
          setLocalError('修改后的参数不是有效 JSON。')
          return
        }
      }
    } else {
      const answers = { ...selections }
      if (answer.trim()) answers.answer = answer.trim()
      if (!Object.values(answers).some((v) => v.trim())) {
        setLocalError('请选择选项或输入回答。')
        return
      }
      payload = { answer: answers.answer || Object.values(answers).join('\n'), answers }
    }
    await perform(() => respondAction(interaction, payload))
  }

  return (
    <article
      className={`cx-interaction${approval ? ' approval' : ''}`}
      data-interaction-id={interaction.id}
    >
      <button
        className="cx-interaction-heading"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {approval ? <ShieldCheck size={17} /> : <MessageCircle size={17} />}
        <strong>{approval ? '需要你的批准' : '请帮智能体确认'}</strong>
        <ChevronDown size={16} className={expanded ? undefined : 'rotated'} />
      </button>
      {expanded && (
        <div className="cx-interaction-body">
          {approval && (
            <p>{interaction.message || `允许 ${interaction.toolName || '工具'} 执行以下操作？`}</p>
          )}
          {approval && (
            <>
              {!edit && <pre>{JSON.stringify(interaction.arguments ?? {}, null, 2)}</pre>}
              <label className="cx-check">
                <input type="checkbox" checked={edit} onChange={(e) => setEdit(e.target.checked)} />
                修改工具参数后批准
              </label>
              {edit && (
                <textarea
                  rows={5}
                  aria-label="修改工具参数"
                  value={editedArgs}
                  onChange={(e) => setEditedArgs(e.target.value)}
                />
              )}
            </>
          )}
          {(approval ? [] : questions).map((question) => (
            <fieldset key={question.id}>
              <legend>{question.question}</legend>
              {question.options.map((option) => (
                <label key={option.label} className="cx-option">
                  <input
                    type="radio"
                    name={interaction.id + question.id}
                    value={option.value || option.label}
                    checked={selections[question.id] === (option.value || option.label)}
                    onChange={() =>
                      setSelections((current) => ({
                        ...current,
                        [question.id]: option.value || option.label,
                      }))
                    }
                  />
                  <span>
                    {option.label}
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
              {question.options.length > 0 && (
                <input
                  placeholder="其他回答"
                  aria-label={`${question.question}的其他回答`}
                  value={
                    question.options.some(
                      (option) => (option.value || option.label) === selections[question.id],
                    )
                      ? ''
                      : (selections[question.id] ?? '')
                  }
                  onChange={(e) =>
                    setSelections((current) => ({ ...current, [question.id]: e.target.value }))
                  }
                />
              )}
            </fieldset>
          ))}
          {!approval && (
            <textarea
              rows={2}
              placeholder="补充你的回答…"
              aria-label="回答智能体"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}
          {localError && (
            <p className="cx-error" role="alert">
              {localError}
            </p>
          )}
          <footer>
            {approval && (
              <button className="cx-button" disabled={busy} onClick={() => void respond(false)}>
                拒绝
              </button>
            )}
            <button
              className="cx-button cx-primary"
              disabled={busy}
              onClick={() => void respond(approval ? true : undefined)}
            >
              {approval ? '批准并继续' : '提交回答并继续'}
            </button>
          </footer>
        </div>
      )}
    </article>
  )
}
