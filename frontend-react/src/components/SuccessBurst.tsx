import type { CSSProperties } from 'react'
import styles from './SuccessBurst.module.css'

const pieces = [
  [-86, -54, -40],
  [-58, -92, -15],
  [-22, -106, 30],
  [18, -98, -25],
  [52, -80, 55],
  [84, -42, 10],
  [-72, 28, 25],
  [-34, 54, -50],
  [8, 62, 40],
  [46, 46, -10],
  [78, 12, 65],
  [-96, -6, -70],
] as const
const colors = ['#ffca6b', '#ff8fa3', '#8bd3c7', '#8db7ff', '#c6a8ff']

/** 一次成功反馈的彩色纸屑；只做视觉提示，不拦截点击。 */
export default function SuccessBurst({ burstKey }: { burstKey: number }) {
  if (!burstKey) return null
  return (
    <div key={burstKey} className={styles.burst} aria-hidden="true">
      {pieces.map(([x, y, rotate], index) => (
        <i
          key={index}
          style={
            {
              '--x': `${x}px`,
              '--y': `${y}px`,
              '--r': `${rotate}deg`,
              '--c': colors[index % colors.length],
              '--d': `${index * 18}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
