import type { CSSProperties } from 'react'
import './motivation.css'

/** 小奇的两帧贴图：挥手与捂眼；其余情绪用轻微动效区分。 */
export type XiaoqiMood = 'hello' | 'cheer' | 'quiet'

const labels: Record<XiaoqiMood, string> = {
  hello: '小奇在挥手打招呼',
  cheer: '小奇在为你欢呼',
  quiet: '小奇安静地陪着你',
}

export default function Xiaoqi({
  mood = 'hello',
  size = 88,
  message,
}: {
  mood?: XiaoqiMood
  size?: number
  message?: string
}) {
  return (
    <figure
      className="xiaoqi"
      data-mood={mood}
      style={{ '--xiaoqi-size': `${size}px` } as CSSProperties}
    >
      <span className="xiaoqi-image" role="img" aria-label={labels[mood]} />
      {message && <figcaption className="xiaoqi-bubble">{message}</figcaption>}
    </figure>
  )
}
