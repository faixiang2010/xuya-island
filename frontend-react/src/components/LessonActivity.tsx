import { useState, type FormEvent, type SyntheticEvent } from 'react'
import type { Lesson, Progress } from '../types'

interface Props {
  lesson: Lesson
  current?: Progress
  hintLevel: number
  referenceViewed: boolean
  onSave: (value: {
    status: Progress['status']
    reflection: string
    parentObservation: string
  }) => void
  onReference: () => void
}

export default function LessonActivity({
  lesson,
  current,
  hintLevel,
  referenceViewed,
  onSave,
  onReference,
}: Props) {
  const [status, setStatus] = useState<Progress['status']>(current?.status ?? 'in-progress')
  const [reflection, setReflection] = useState(current?.reflection ?? '')
  const [parentObservation, setParentObservation] = useState(current?.parentObservation ?? '')
  const [referenceOpen, setReferenceOpen] = useState(false)

  function opened(event: SyntheticEvent<HTMLDetailsElement>) {
    const open = (event.target as HTMLDetailsElement).open
    setReferenceOpen(open)
    if (open) onReference()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave({ status, reflection, parentObservation })
  }

  return (
    <section className="learning-activity panel">
      <h2>把发现变成自己的作品</h2>
      <div className="learning-path">
        <details open>
          <summary>1 · 先猜一猜</summary>
          <p>{lesson.prediction}</p>
        </details>
        <details>
          <summary>2 · 运行、观察和理解</summary>
          <p>{lesson.explanation}</p>
          <p>先运行示例，再只改一处，对照你的预测。</p>
        </details>
        <details>
          <summary>3 · 动手改造</summary>
          {lesson.exercises.map((exercise) => (
            <article key={exercise.id}>
              <p>{exercise.instruction}</p>
              <details>
                <summary>查看检查用例</summary>
                {exercise.tests.map((item) => (
                  <div key={item.name} className="case-card">
                    <b>{item.name}</b>
                    <p>输入：{item.input.length ? JSON.stringify(item.input) : '无需输入'}</p>
                    <p>依次出现：{item.outputContains.join(' → ')}</p>
                    {item.minDrawings ? (
                      <p>至少 {item.minDrawings} 条画笔指令；图形规律还需要你自己观察。</p>
                    ) : null}
                    {item.expectedFiles.length ? (
                      <p>虚拟文件：{item.expectedFiles.join('、')}</p>
                    ) : null}
                  </div>
                ))}
              </details>
            </article>
          ))}
        </details>
        <details>
          <summary>4 · 自由创作与快速挑战</summary>
          <p>{lesson.creation}</p>
          <p>
            <strong>已经会了？</strong> {lesson.quickChallenge}
          </p>
        </details>
        <details>
          <summary>常见问题</summary>
          <ul>
            {lesson.commonErrors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
        <details onToggle={opened}>
          <summary>我想查看参考实现</summary>
          <p>先尝试自己的办法，再对照思路。打开参考不会替换你的草稿。</p>
          {lesson.exercises.map((exercise) => (
            <pre key={exercise.id} className="reference-code">
              {exercise.referenceCode}
            </pre>
          ))}
        </details>
      </div>
      <form className="reflection-form" onSubmit={submit}>
        <h3>5 · 留一句发现，或讲给家人听</h3>
        <p>这次只记一个变化也可以。学习状态由你来选择，不用一次把挑战全做完。</p>
        <details>
          <summary>想看看这一课的完整目标？</summary>
          <ul>
            {lesson.rubric.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
        <label>
          我的学习状态
          <select
            value={status}
            aria-label="我的学习状态"
            onChange={(event) => setStatus(event.target.value as Progress['status'])}
          >
            <option value="not-started">未开始</option>
            <option value="in-progress">学习中</option>
            <option value="completed">已完成</option>
            <option value="needs-review">建议复习</option>
          </select>
        </label>
        <label>
          我的发现
          <textarea
            value={reflection}
            maxLength={2000}
            rows={3}
            placeholder={lesson.reflectionPrompts.join(' ')}
            onChange={(event) => setReflection(event.target.value)}
          />
        </label>
        <details>
          <summary>家长一起观察</summary>
          <p>{lesson.parentPrompt}</p>
          <label>
            补充观察
            <textarea
              value={parentObservation}
              maxLength={2000}
              rows={2}
              placeholder="她解释了什么，下一次可以一起试什么？"
              onChange={(event) => setParentObservation(event.target.value)}
            />
          </label>
        </details>
        <small>
          已打开 {hintLevel} 层提示{referenceViewed ? '，查看过参考' : ''}
          。练习检查通过不会自动标记为掌握。
        </small>
        <button className="button secondary" type="submit">
          保存学习记录
        </button>
      </form>
    </section>
  )
}
