import type { CSSProperties } from 'react'
import {
  fingerColor,
  fingerForKey,
  fingerInfo,
  isLetterKey,
  keyRows,
  type FingerId,
} from '../games/keyboard'
import HandIllustration from './HandIllustration'
import styles from './FingerKeyboard.module.css'

interface FingerKeyboardProps {
  nextKey?: string
  needsShift?: boolean
  showLetters?: boolean
  compact?: boolean
  pressedKey?: string
  ariaLabel?: string
}

export default function FingerKeyboard({
  nextKey,
  needsShift,
  showLetters = true,
  compact,
  pressedKey,
  ariaLabel,
}: FingerKeyboardProps) {
  const target = nextKey?.toLowerCase()
  const targetFinger = target ? fingerForKey(target) : undefined
  const pressed = pressedKey?.toLowerCase()
  const shiftFinger: FingerId | undefined =
    needsShift && targetFinger
      ? targetFinger.startsWith('left')
        ? 'right-pinky'
        : 'left-pinky'
      : undefined

  return (
    <section
      className={styles.wrap + (compact ? ' ' + styles.compact : '')}
      aria-label={ariaLabel ?? '指法键盘'}
    >
      <div className={styles.screen}>
        {keyRows.map((row) => (
          <div className={styles.row} key={row.id}>
            {row.keys.map((item) => {
              const info = item.finger ? fingerInfo[item.finger] : undefined
              const isTarget = target !== undefined && item.key.toLowerCase() === target
              const isShift = !!needsShift && item.key.startsWith('Shift')
              const isPressed = pressed !== undefined && item.key.toLowerCase() === pressed
              const hot = isTarget || isShift || isPressed
              return (
                <kbd
                  key={item.key}
                  className={styles.key + (hot ? ' ' + styles.hot : '')}
                  data-finger={item.finger}
                  data-home={item.home ? 'true' : undefined}
                  data-hot={hot ? 'true' : undefined}
                  style={
                    {
                      flexGrow: item.width ?? 1,
                      flexBasis: 0,
                      '--finger': info?.color ?? '#c9ced8',
                    } as CSSProperties
                  }
                >
                  {info && <span className={styles.tint} aria-hidden="true" />}
                  <span className={styles.cap}>
                    {showLetters || !isLetterKey(item.key)
                      ? (item.label ?? item.key.toUpperCase())
                      : '·'}
                  </span>
                  {item.home && <span className={styles.bump} aria-hidden="true" />}
                </kbd>
              )
            })}
          </div>
        ))}
      </div>
      <div className={styles.handsStage} data-testid="finger-hands" aria-hidden="true">
        <div className={styles.handLeft}>
          <HandIllustration side="left" active={targetFinger} extra={shiftFinger} />
        </div>
        <div className={styles.handRight}>
          <HandIllustration side="right" active={targetFinger} extra={shiftFinger} />
        </div>
      </div>
      <div className={styles.hint}>
        {target && targetFinger ? (
          <>
            <span
              className={styles.fingerDot}
              style={{ background: fingerColor(target) }}
              aria-hidden="true"
            />
            <strong>{target === ' ' ? '左右手拇指' : fingerInfo[targetFinger].name}</strong>
            <span>
              按 <b>{target === ' ' ? '空格' : target.toUpperCase()}</b>
              {needsShift && target !== ' ' ? '，先按住 Shift' : ''}
            </span>
          </>
        ) : (
          <span>左手放 ASDF，右手放 JKL;，食指摸到 F 和 J 的凸点。</span>
        )}
      </div>
    </section>
  )
}
