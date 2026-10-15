import { useEffect, type CSSProperties } from 'react'
import { useCelebration } from './celebrate'
import Xiaoqi from './Xiaoqi'

const sparkCount = 12

/** 固定角度的星点位置，避免依赖较新的 CSS 三角函数。 */
const sparkPositions = Array.from({ length: sparkCount }, (_, index) => {
  const angle = (index / sparkCount) * Math.PI * 2
  return { x: 50 + Math.cos(angle) * 46, y: 50 + Math.sin(angle) * 34 }
})

/** 全局庆祝反馈：徽章解锁、练完一级、保存作品时短暂出现，不阻挡操作。 */
export default function Celebration() {
  const queue = useCelebration((state) => state.queue)
  const dismiss = useCelebration((state) => state.dismiss)
  const current = queue[0]
  useEffect(() => {
    if (!current) return
    const timer = window.setTimeout(() => dismiss(current.id), 4200)
    return () => window.clearTimeout(timer)
  }, [current, dismiss])
  if (!current) return null
  return (
    <div className="celebration-layer" role="status" aria-live="polite">
      <div className="celebration-card" key={current.id} data-kind={current.kind}>
        <span className="celebration-sparks" aria-hidden="true">
          {sparkPositions.map((position, index) => (
            <span
              key={index}
              style={
                {
                  '--spark-x': `${position.x}%`,
                  '--spark-y': `${position.y}%`,
                  '--spark-delay': `${index * 35}ms`,
                } as CSSProperties
              }
            />
          ))}
        </span>
        <Xiaoqi mood="cheer" size={92} />
        <div className="celebration-copy">
          <strong>{current.title}</strong>
          {current.detail && <p>{current.detail}</p>}
        </div>
      </div>
    </div>
  )
}
