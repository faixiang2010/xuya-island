import { useRef } from 'react'
import { Film } from 'lucide-react'
import { learningMedia, type LearningMediaId } from '../learning/media'
import styles from './LearningMedia.module.css'

export default function LearningMedia({ kind }: { kind: LearningMediaId }) {
  const item = learningMedia[kind]
  const video = useRef<HTMLVideoElement>(null)
  return (
    <details
      className={styles.media}
      onToggle={(event) => {
        if (!event.currentTarget.open && video.current && !video.current.paused)
          video.current.pause()
      }}
    >
      <summary>
        <Film size={17} aria-hidden="true" />
        看一段演示：{item.title}
        <span>{item.duration} · 可暂停重播</span>
      </summary>
      <div className={styles.body}>
        <video ref={video} controls playsInline preload="metadata" aria-label={item.title}>
          <source src={`/media/learning/${item.file}.mp4`} type="video/mp4" />
          <track
            kind="captions"
            src={`/media/learning/${item.file}.vtt`}
            srcLang="zh"
            label="中文字幕"
          />
          这个浏览器无法播放演示，请看下方文字版。
        </video>
        <details>
          <summary>文字版演示</summary>
          <ol>
            {item.transcript.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </details>
        <small>原创本地演示，无声、有字幕。看完就动手试一试，不需要先看完才能练习。</small>
      </div>
    </details>
  )
}
