import { useEffect, useRef } from 'react'
import type { RunResult } from '../types'

interface Props {
  result?: RunResult
  type: 'cover' | 'drawing'
  theme: string
}

export default function StoryPreview({ result, type, theme }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)

  function paint() {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, 320, 300)
    context.fillStyle = '#fffefa'
    context.fillRect(0, 0, 320, 300)
    for (const item of result?.drawings ?? []) {
      context.fillStyle = item.color
      if (item.kind === 'circle') {
        context.beginPath()
        context.arc(item.x, item.y, item.radius!, 0, Math.PI * 2)
        context.fill()
      } else if (item.kind === 'rectangle')
        context.fillRect(item.x, item.y, item.width!, item.height!)
      else {
        context.font = '18px "Microsoft YaHei", sans-serif'
        context.fillText(item.text!, item.x, item.y)
      }
    }
  }

  useEffect(() => {
    paint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  return (
    <div className={`preview-paper theme-${theme}`}>
      {type === 'cover' ? (
        <>
          <span className="paper-label">MY LITTLE STORY</span>
          <div className="paper-stars">
            ✧<span>✦</span>✧
          </div>
          {result?.output ? (
            <div className="story-output" data-testid="story-output">
              {result.output
                .trimEnd()
                .split('\n')
                .slice(0, 8)
                .map((line, index) => (
                  <div key={index} className={index === 0 ? 'story-title' : undefined}>
                    {line}
                  </div>
                ))}
            </div>
          ) : (
            <div className="empty-story">
              <span>你的故事，会写在这里</span>
              <small>点击“运行”，看看代码说了什么</small>
            </div>
          )}
          <svg className="paper-landscape" viewBox="0 0 320 125" aria-hidden="true">
            <path
              d="M0 113 Q53 55 112 90 Q174 43 237 86 Q286 50 320 93 L320 125 L0 125Z"
              fill="currentColor"
              opacity=".22"
            />
            <path
              d="M20 125 Q99 90 158 110 Q237 74 320 110 L320 125Z"
              fill="currentColor"
              opacity=".25"
            />
            <path
              d="M100 102 L100 50 M81 74 Q54 26 92 32 Q108 12 121 41 Q143 45 126 74 Z"
              stroke="currentColor"
              strokeWidth="2"
              fill="currentColor"
              opacity=".4"
            />
          </svg>
          <span className="paper-caption">封面的装饰来自主题，文字来自你的 Python 输出</span>
        </>
      ) : (
        <>
          <canvas ref={canvas} width={320} height={300} aria-label="Python 画笔作品" />
          <small className="muted">画面来自代码里的 xuya.draw 指令</small>
        </>
      )}
    </div>
  )
}
