import { fingerInfo, type FingerId } from '../games/keyboard'
import styles from './FingerKeyboard.module.css'

type FingerName = 'pinky' | 'ring' | 'middle' | 'index'

const fingerOrder: FingerName[] = ['pinky', 'ring', 'middle', 'index']

/** 手指在 200×160 画布中的位置；四指朝下，拇指从内侧伸向空格。 */
const layout: Record<
  FingerName,
  { x: number; y: number; width: number; height: number; rotate: number }
> = {
  pinky: { x: 44, y: 56, width: 22, height: 84, rotate: -4 },
  ring: { x: 74, y: 48, width: 24, height: 94, rotate: -1 },
  middle: { x: 106, y: 44, width: 24, height: 100, rotate: 0 },
  index: { x: 138, y: 50, width: 24, height: 94, rotate: 2 },
}

interface HandIllustrationProps {
  side: 'left' | 'right'
  active?: FingerId
  extra?: FingerId
}

/**
 * 悬浮在键盘上方的一只手。目标手指会下压、出现白边与指尖光圈；
 * 左手画拇指在右侧，右手整体镜像，保证两只拇指都朝向空格。
 */
export default function HandIllustration({ side, active, extra }: HandIllustrationProps) {
  const prefix = side === 'left' ? 'left' : 'right'
  const isActive = (finger: FingerId) =>
    finger === active ||
    finger === extra ||
    (active !== undefined && active.endsWith('thumb') && finger.endsWith('thumb'))

  return (
    <svg viewBox="0 0 200 160" className={styles.handSvg} aria-hidden="true">
      <g
        transform={
          side === 'right' ? 'translate(200 160) scale(-1 -1)' : 'translate(0 160) scale(1 -1)'
        }
      >
        <ellipse className={styles.handShadow} cx="98" cy="6" rx="72" ry="7" />
        <rect className={styles.wrist} x="76" y="-2" width="56" height="26" rx="13" />
        <path
          className={styles.palm}
          d="M40 28 Q40 16 58 16 H132 Q152 16 152 34 V70 Q152 90 122 90 H70 Q40 90 40 70 Z"
        />
        {fingerOrder.map((name) => {
          const finger = `${prefix}-${name}` as FingerId
          const info = fingerInfo[finger]
          const item = layout[name]
          const activeFinger = isActive(finger)
          const center = item.x + item.width / 2
          return (
            <g key={finger} transform={`rotate(${item.rotate} ${center} ${item.y})`}>
              <rect
                x={item.x}
                y={item.y}
                width={item.width}
                height={item.height}
                rx={item.width / 2}
                className={styles.handFinger + (activeFinger ? ' ' + styles.handFingerActive : '')}
                style={{ fill: info.color }}
              />
              <line
                className={styles.knuckle}
                x1={item.x + 4}
                x2={item.x + item.width - 4}
                y1={item.y + item.height * 0.46}
                y2={item.y + item.height * 0.46}
              />
              <line
                className={styles.knuckle}
                x1={item.x + 5}
                x2={item.x + item.width - 5}
                y1={item.y + item.height * 0.7}
                y2={item.y + item.height * 0.7}
              />
              <rect
                className={styles.nail}
                x={item.x + 6}
                y={item.y + item.height - 18}
                width={item.width - 12}
                height="9"
                rx="4.5"
              />
              {activeFinger && (
                <>
                  <circle
                    cx={center}
                    cy={item.y + item.height - 8}
                    r="17"
                    className={styles.tipHalo}
                    style={{ stroke: info.color }}
                  />
                  <circle
                    cx={center}
                    cy={item.y + item.height - 8}
                    r="9"
                    className={styles.tipPulse}
                    style={{ fill: info.color }}
                  />
                </>
              )}
            </g>
          )
        })}
        <g transform="rotate(-32 160 74)">
          <rect
            x="152"
            y="66"
            width="20"
            height="68"
            rx="10"
            className={
              styles.handFinger + (isActive(`${prefix}-thumb`) ? ' ' + styles.handFingerActive : '')
            }
            style={{ fill: fingerInfo[`${prefix}-thumb`].color }}
          />
          <rect className={styles.nail} x="157" y="118" width="10" height="8" rx="4" />
          {isActive(`${prefix}-thumb`) && (
            <>
              <circle
                cx="162"
                cy="126"
                r="16"
                className={styles.tipHalo}
                style={{ stroke: fingerInfo[`${prefix}-thumb`].color }}
              />
              <circle
                cx="162"
                cy="126"
                r="9"
                className={styles.tipPulse}
                style={{ fill: fingerInfo[`${prefix}-thumb`].color }}
              />
            </>
          )}
        </g>
      </g>
    </svg>
  )
}
