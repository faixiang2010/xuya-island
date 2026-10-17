import { useEffect, useRef, useState } from 'react'
import MarkdownContent from './MarkdownContent'

/**
 * 助手回复逐字显示：历史消息首次挂载时直接完整显示；
 * 新消息从空内容开始，按固定节奏追上新到的增量，避免整段文字一下出现。
 */
export default function StreamingMarkdown({
  content,
  animate = false,
}: {
  content: string
  animate?: boolean
}) {
  const [shown, setShown] = useState(animate ? '' : content)
  const shownRef = useRef(animate ? '' : content)
  const contentRef = useRef(content)
  contentRef.current = content

  useEffect(() => {
    const timer = window.setInterval(() => {
      const target = contentRef.current
      if (shownRef.current.length >= target.length) return
      const next = Math.min(target.length, shownRef.current.length + 2)
      shownRef.current = target.slice(0, next)
      setShown(shownRef.current)
      window.dispatchEvent(new Event('cx:stream-progress'))
    }, 30)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (content.length < shownRef.current.length) {
      shownRef.current = content
      setShown(content)
    }
  }, [content])

  return <MarkdownContent content={shown} />
}
