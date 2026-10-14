import { useEffect, useState } from 'react'
import { familyApi } from './api'
import { accountStorage } from './session'
import { readSaved, gameStorageKey, useGameProgress } from '../games/progress'
import { readDraft } from '../stores/draft'
import { useClassroomStore } from '../stores/classroom'
import { newId } from '../shared/id'

type Snapshot = {
  typing: ReturnType<typeof readSaved>
  drafts: { lessonId: string; title: string; code: string; revision: number; dirty: boolean }[]
}
type State = {
  allowed: boolean
  latest: { snapshot?: Snapshot; receivedAt?: string }
  notice: string
}
export default function LegacyLearningImport() {
  const [state, setState] = useState<State>()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void familyApi<State>('/learning/imports')
      .then(setState)
      .catch(() => {})
  }, [])
  function restore(snapshot: Snapshot) {
    const current = readSaved(accountStorage)
    for (const record of snapshot.typing.records)
      if (
        !current.records.some(
          (item) => item.gameId === record.gameId && item.levelId === record.levelId,
        )
      )
        current.records.push(record)
    for (const draft of snapshot.typing.drafts)
      if (
        !current.drafts.some(
          (item) => item.gameId === draft.gameId && item.levelId === draft.levelId,
        )
      )
        current.drafts.push(draft)
    accountStorage.setItem(gameStorageKey, JSON.stringify({ version: 2, ...current }))
    for (const draft of snapshot.drafts)
      if (!accountStorage.getItem(`xuya:draft:${draft.lessonId}`))
        accountStorage.setItem(`xuya:draft:${draft.lessonId}`, JSON.stringify(draft))
    useGameProgress.getState().hydrate()
    setMessage('已恢复旧记录；当前账户已有的草稿继续保留，原浏览器记录没有删除。')
  }
  async function importLegacy() {
    setBusy(true)
    try {
      const typing = readSaved(localStorage)
      const drafts = useClassroomStore.getState().lessons.flatMap((lesson) => {
        const draft = readDraft(localStorage, lesson.id)
        return draft
          ? [
              {
                lessonId: lesson.id,
                title: draft.title || '我的旧草稿',
                code: draft.code,
                revision: 0,
                dirty: true,
              },
            ]
          : []
      })
      if (!typing.records.length && !typing.drafts.length && !drafts.length) {
        setMessage('这台浏览器没有找到可恢复的旧学习记录。')
        return
      }
      const key = 'xuya:legacy-import-request'
      const id = accountStorage.getItem(key) || newId()
      accountStorage.setItem(key, id)
      const result = await familyApi<State>('/learning/imports', 'POST', { id, typing, drafts })
      setState(result)
      if (result.latest.snapshot) restore(result.latest.snapshot)
      accountStorage.removeItem(key)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '旧记录没有导入，原记录仍然保留。')
    } finally {
      setBusy(false)
    }
  }
  if (!state?.allowed && !state?.latest.snapshot) return null
  return (
    <section className="growth-paper">
      <h3>找回以前的学习记录</h3>
      <p>{state.notice}</p>
      {state.allowed && (
        <button className="button secondary" disabled={busy} onClick={() => void importLegacy()}>
          确认把这台浏览器的旧学习记录归到我的账户
        </button>
      )}
      {state.latest.snapshot && (
        <>
          <p>
            已确认导入：{new Date(state.latest.receivedAt!).toLocaleString('zh-CN')}
            。旧记录作为历史快照保留。
          </p>
          <button className="button secondary" onClick={() => restore(state.latest.snapshot!)}>
            恢复已导入的继续位置和旧草稿
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
