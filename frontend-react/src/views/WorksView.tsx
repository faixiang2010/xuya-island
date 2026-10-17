import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderHeart, Sparkles, Trash2 } from 'lucide-react'
import { Modal } from 'antd'
import { request } from '../api/client'
import { useClassroomStore } from '../stores/classroom'
import type { Work } from '../types'

export default function WorksView() {
  const works = useClassroomStore((state) => state.works)
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Work>()
  const [removing, setRemoving] = useState(false)

  async function load() {
    const works = await request<Work[]>('/works')
    useClassroomStore.setState({ works, savedCount: works.length })
  }

  useEffect(() => {
    void (async () => {
      try {
        await load()
      } catch (error) {
        setFailure(error instanceof Error ? error.message : '作品集暂时没有连接。')
      }
    })()
  }, [])

  async function removeWork(work: Work) {
    setRemoving(true)
    setFailure('')
    try {
      await request<Work>(`/works/${encodeURIComponent(work.id)}`, { method: 'DELETE' })
      setNotice(`已删除《${work.title}》。`)
      await load()
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '这次没有删掉，请稍后再试。')
    } finally {
      setRemoving(false)
      setPendingDelete(undefined)
    }
  }

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
      {notice && (
        <p className="inline-notice" role="status">
          {notice}
        </p>
      )}
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
            <div key={work.id} className="work-card-shell">
              <Link to={`/classroom/${work.lessonId}?work=${work.id}`} className="work-card">
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
              <button
                type="button"
                className="card-delete"
                aria-label={`删除作品 ${work.title}`}
                disabled={removing}
                onClick={() => setPendingDelete(work)}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={!!pendingDelete}
        title="确定要删除这件作品吗？"
        okText="删除"
        cancelText="先留着"
        okButtonProps={{ danger: true, disabled: removing }}
        cancelButtonProps={{ disabled: removing }}
        confirmLoading={removing}
        onOk={() => pendingDelete && void removeWork(pendingDelete)}
        onCancel={() => setPendingDelete(undefined)}
      >
        <p>《{pendingDelete?.title}》和它的历史版本都会被删掉，删除以后就找不回来了。</p>
      </Modal>
    </main>
  )
}
