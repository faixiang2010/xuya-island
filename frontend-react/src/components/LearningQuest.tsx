import { useState } from 'react'
import { ScanSearch, Palette, Music2, Eye, PencilLine, Sparkles, Share2 } from 'lucide-react'
import { learningThemes, useLearningPreferences } from '../learning/preferences'
import styles from './LearningQuest.module.css'

interface Props {
  prediction: string
  change: string
  creation: string
  firstProgram?: boolean
  editorId: string
}
const icons = { detective: ScanSearch, painting: Palette, piano: Music2 }
export default function LearningQuest({
  prediction,
  change,
  creation,
  firstProgram,
  editorId,
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
          <button key={item.title} aria-pressed={step === index} onClick={() => setStep(index)}>
            <item.icon size={17} aria-hidden="true" />
            <span>
              {index + 1} · {item.title}
            </span>
          </button>
        ))}
      </div>
      <p>{steps[step].text}</p>
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
