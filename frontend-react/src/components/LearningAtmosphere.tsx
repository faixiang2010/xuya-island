import { useState } from 'react'
import { ScanSearch, Palette, Music2, Volume2, VolumeX, Sparkles } from 'lucide-react'
import { learningThemes, useLearningPreferences, type LearningTheme } from '../learning/preferences'
import { prepareLearningAudio, silenceLearningAudio } from '../learning/audio'
import styles from './LearningAtmosphere.module.css'

const icons = { detective: ScanSearch, painting: Palette, piano: Music2 }
export default function LearningAtmosphere({ compact = false }: { compact?: boolean }) {
  const { theme, sound, motion, cacheAvailable, update } = useLearningPreferences()
  const [audioAvailable, setAudioAvailable] = useState(true)
  return (
    <section className={styles.panel} aria-label="学习氛围">
      {!compact && (
        <div className={styles.heading}>
          <Sparkles size={19} aria-hidden="true" />
          <strong>今天想去哪里探索？</strong>
          <span>选你喜欢的，随时可以换</span>
        </div>
      )}
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
            onClick={() => {
              if (sound) {
                silenceLearningAudio()
                update({ sound: false })
                return
              }
              const available = prepareLearningAudio(true)
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
  )
}
