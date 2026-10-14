import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderHeart, Sparkles } from 'lucide-react'
import { request } from '../api/client'
import { useClassroomStore } from '../stores/classroom'
import type { Work } from '../types'

export default function WorksView() {
  const works = useClassroomStore((state) => state.works)
  const [failure, setFailure] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const works = await request<Work[]>('/works')
        useClassroomStore.setState({ works, savedCount: works.length })
      } catch (error) {
        setFailure(error instanceof Error ? error.message : '作品集暂时没有连接。')
      }
    })()
  }, [])

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MADE BY YOU</span>
          <h1>每一份创作，都值得留下。</h1>
          <p>这是你用想象和代码，一点点长出来的作品。</p>
        </div>
        <span className="pill">{works.length} 件作品</span>
      </div>
      {failure && <p className="inline-notice">{failure}</p>}
      {!works.length ? (
        <div className="empty-works">
          <span className="works-empty-icon">
            <FolderHeart size={44} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h2>这里，等着你的第一个故事。</h2>
          <p>到课堂运行代码，再点击“保存到我的作品”。</p>
          <Link className="button primary" to="/classroom/story-cover">
            去做一张故事封面 →
          </Link>
        </div>
      ) : (
        <div className="works-grid">
          {works.map((work) => (
            <Link
              key={work.id}
              to={`/classroom/${work.lessonId}?work=${work.id}`}
              className="work-card"
            >
              <div className="work-thumbnail">
                <Sparkles size={35} aria-hidden="true" />
                <h2>{work.title}</h2>
                <small>MY LITTLE STORY</small>
              </div>
              <div className="work-card-body">
                <h3>{work.title}</h3>
                <p>
                  第 {work.revision} 版 · {new Date(work.updatedAt).toLocaleDateString('zh-CN')}
                </p>
                <span className="card-link">继续创作 ↗</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
