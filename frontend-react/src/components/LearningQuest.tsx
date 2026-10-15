import { useState } from 'react'
import { ScanSearch, Palette, Music2, Eye, PencilLine, Sparkles, Share2, Check } from 'lucide-react'
import { learningThemes, useLearningPreferences } from '../learning/preferences'
import styles from './LearningQuest.module.css'

interface Props {
  prediction: string
  change: string
  creation: string
  firstProgram?: boolean
  editorId: string
  /** 四个小步各自的完成状态，由课堂真实动作决定（运行、改代码、保存、写发现）。 */
  progress?: boolean[]
}
const icons = { detective: ScanSearch, painting: Palette, piano: Music2 }
export default function LearningQuest({
  prediction,
  change,
  creation,
  firstProgram,
  editorId,
  progress,
}: Props) {
  const [step, setStep] = useState(0)
  const theme = useLearningPreferences((state) => state.theme)
  const world = learningThemes[theme]
  const Icon = icons[theme]
  const steps = [
    {
      title: '先看变化',
      icon: Eye,
      text: firstProgram
        ? '先运行现成的程序，看看它已经说了什么。再猜猜：换一个故事名会发生什么？'
        : prediction,
    },
    {
      title: '只改一处',
      icon: PencilLine,
      text: firstProgram
        ? '只改一处引号里的故事名字，例如“月光森林”，保留两边的英文引号和括号，再运行一次。'
        : change,
    },
    { title: '做我的版本', icon: Sparkles, text: creation },
    {
      title: '分享一个发现',
      icon: Share2,
      text: '告诉家人：我改了哪里，结果怎样变化？还想试什么？也可以在下方“我的发现”里留一句话。',
    },
  ]
  const done = progress ?? []
  const doneCount = steps.filter((_, index) => done[index]).length
  return (
    <section className={styles.quest} aria-label="今天的小冒险">
      <div className={styles.heading}>
        <Icon size={28} aria-hidden="true" />
        <div>
          <span>{world.title} · 今天的小冒险</span>
          <h2>先发现一个变化，再做自己的版本</h2>
        </div>
        <small>先玩 5–10 分钟也可以</small>
      </div>
      <div className={styles.steps} role="group" aria-label="探索节奏">
        {steps.map((item, index) => (
          <button
            key={item.title}
            aria-pressed={step === index}
            data-done={done[index] ? 'true' : 'false'}
            onClick={() => setStep(index)}
          >
            {done[index] ? (
              <Check size={17} aria-hidden="true" />
            ) : (
              <item.icon size={17} aria-hidden="true" />
            )}
            <span>
              {index + 1} · {item.title}
            </span>
          </button>
        ))}
      </div>
      <p>{steps[step].text}</p>
      <p className={styles.tally}>
        {doneCount >= steps.length
          ? '四个小步都走过了，随时可以回来再改一版。'
          : `已经走过 ${doneCount} / ${steps.length} 步，不用一次做完。`}
      </p>
      <div className={styles.actions}>
        <button
          className="button primary"
          onClick={() =>
            document.getElementById(editorId)?.scrollIntoView({ block: 'start', behavior: 'auto' })
          }
        >
          到代码里试试 →
        </button>
        <span>不用一次做完，也不急着照着参考写。</span>
      </div>
    </section>
  )
}
