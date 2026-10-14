import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface Props {
  content: string
}

export default function MarkdownContent({ content }: Props) {
  const html = useMemo(
    () =>
      DOMPurify.sanitize(marked.parse(content, { async: false, breaks: true }) as string, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['iframe', 'form', 'input', 'button', 'style'],
      }),
    [content],
  )
  return <div className="cx-markdown" dangerouslySetInnerHTML={{ __html: html }} />
}
