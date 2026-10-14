import { useEffect, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { authorizedFetch, download } from '../api'
import type { Attachment } from '../types'

export default function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let objectUrl = ''
    let disposed = false
    async function load() {
      if (!/^(image|audio)\//.test(attachment.mimeType || '')) return
      try {
        const response = await authorizedFetch(`/codex/attachments/${attachment.id}/content`)
        const created = URL.createObjectURL(await response.blob())
        objectUrl = created
        if (disposed) {
          URL.revokeObjectURL(created)
          return
        }
        setUrl(created)
      } catch {
        setError('附件预览暂不可用')
      }
    }
    void load()
    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    try {
      await download(`/codex/attachments/${attachment.id}/content`, attachment.name)
    } catch {
      setError('附件下载失败')
    }
  }

  return (
    <div className="cx-message-attachment">
      {url && attachment.mimeType.startsWith('image/') ? (
        <img src={url} alt={attachment.name} />
      ) : url && attachment.mimeType.startsWith('audio/') ? (
        <audio src={url} controls></audio>
      ) : (
        <button onClick={() => void save()}>
          <Paperclip size={16} />
          {attachment.name}
        </button>
      )}
      {error && <small>{error}</small>}
    </div>
  )
}
