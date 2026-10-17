import { useEffect, useRef, useState } from 'react'
import { ScanSearch, Palette, Music2, Volume2, VolumeX, Sparkles } from 'lucide-react'
import { learningThemes, useLearningPreferences, type LearningTheme } from '../learning/preferences'
import { prepareLearningAudio, silenceLearningAudio } from '../learning/audio'
import styles from './LearningAtmosphere.module.css'

const icons = { detective: ScanSearch, painting: Palette, piano: Music2 }
/**
 * 学习氛围是一次性的全局偏好，所以全站只留一个入口：
 * 收起时用当前主题的色点说明现状，展开后才是一整块选择，避免它抢走学习任务的视觉重量。
 */
export default function LearningAtmosphere() {
  const { theme, sound, motion, cacheAvailable, update } = useLearningPreferences()
  const [audioAvailable, setAudioAvailable] = useState(true)
  const panel = useRef<HTMLDetailsElement>(null)
  // 展开后是一块压在内容之上的浮层：点别处或按 Esc 都要能收起，而不是只能再点一次摘要。
  useEffect(() => {
    const close = () => {
      if (panel.current?.open) panel.current.open = false
    }
    const dismissOutside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) close()
    }
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('keydown', dismissOnEscape)
    }
  }, [])
  return (
    <details className={styles.atmosphere} data-testid="learning-atmosphere" ref={panel}>
      <summary aria-label={`学习氛围：${learningThemes[theme].title}`}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.label}>氛围</span>
      </summary>
      <section className={styles.panel} aria-label="学习氛围">
        <div className={styles.heading}>
          <Sparkles size={19} aria-hidden="true" />
          <strong>今天想去哪里探索？</strong>
          <span>选你喜欢的，随时可以换</span>
        </div>
        <div className={styles.options}>
          <div className={styles.themes} role="group" aria-label="学习主题">
            {(Object.keys(learningThemes) as LearningTheme[]).map((id) => {
              const Icon = icons[id]
              return (
                <button
                  key={id}
                  className={'button ' + (id === theme ? 'primary' : 'secondary')}
                  aria-pressed={id === theme}
                  onClick={() => update({ theme: id })}
                >
                  <Icon size={17} aria-hidden="true" />
                  {learningThemes[id].title}
                </button>
              )
            })}
          </div>
          <div className={styles.controls}>
            <button
              className="button secondary"
              aria-pressed={sound}
              onClick={async () => {
                if (sound) {
                  silenceLearningAudio()
                  update({ sound: false })
                  return
                }
                const available = await prepareLearningAudio(true)
                setAudioAvailable(available)
                update({ sound: available })
              }}
            >
              {sound ? (
                <Volume2 size={16} aria-hidden="true" />
              ) : (
                <VolumeX size={16} aria-hidden="true" />
              )}
              {sound ? '琴音已开' : '开启琴音'}
            </button>
            <button
              className="button secondary"
              aria-pressed={!motion}
              onClick={() => update({ motion: !motion })}
            >
              {motion ? '减少动画' : '恢复动画'}
            </button>
          </div>
        </div>
        {!audioAvailable && <small>当前浏览器暂不支持琴音，我们继续无声探索。</small>}
        {!cacheAvailable && <small>偏好暂时不能保存，本次选择仍然生效。</small>}
      </section>
    </details>
  )
}
