import { accountStorage } from '../account/session'
import { create } from 'zustand'
import { ApiError, request } from '../api/client'
import type { Curriculum, Draft, Lesson, Progress, Work } from '../types'
import { readDraft, writeDraft } from './draft'

export interface ClassroomState {
  lessons: Lesson[]
  curriculum?: Curriculum
  progress: Progress[]
  works: Work[]
  lesson?: Lesson
  draft: Draft
  saving: boolean
  message: string
  conflict: boolean
  cacheAvailable: boolean
  loading: boolean
  savedCount: number
  initialize: (permissions?: string[]) => Promise<void>
  selectLesson: (id: string, workId?: string) => Promise<void>
  editCode: (code: string) => void
  editTitle: (title: string) => void
  save: (asNew?: boolean) => Promise<void>
}

export const useClassroomStore = create<ClassroomState>((set, get) => {
  let selection = 0
  let canManageWorks = true

  function cache() {
    const { lesson, draft } = get()
    if (lesson) set({ cacheAvailable: writeDraft(accountStorage, lesson.id, draft) })
  }

  async function initialize(permissions = ['*']) {
    const allowed = (permission: string) =>
      permissions.includes('*') || permissions.includes(permission)
    canManageWorks = allowed('works:manage')
    const canReadLearning = allowed('learning:read') || allowed('classroom:use')
    const [lessons, works, curriculum, progress] = await Promise.all([
      canReadLearning ? request<Lesson[]>('/lessons') : Promise.resolve([]),
      canManageWorks ? request<Work[]>('/works') : Promise.resolve([]),
      canReadLearning ? request<Curriculum>('/curriculum') : Promise.resolve(undefined),
      canReadLearning ? request<Progress[]>('/progress') : Promise.resolve([]),
    ])
    set({ lessons, works, curriculum, progress, savedCount: works.length })
  }

  function editCode(code: string) {
    set((state) => ({ draft: { ...state.draft, code, dirty: true } }))
    cache()
  }

  function editTitle(title: string) {
    set((state) => ({ draft: { ...state.draft, title, dirty: true } }))
    cache()
  }

  async function selectLesson(id: string, workId?: string) {
    cache()
    const ticket = ++selection
    set({ loading: true, lesson: undefined, message: '', conflict: false })
    try {
      const [selected, available] = await Promise.all([
        request<Lesson>(`/lessons/${encodeURIComponent(id)}`),
        canManageWorks ? request<Work[]>('/works') : Promise.resolve([]),
      ])
      if (ticket !== selection) return
      const work = workId
        ? available.find((item) => item.id === workId)
        : available.find((item) => item.lessonId === id)
      const cached = readDraft(accountStorage, id)
      if (cached?.dirty && (!workId || cached.workId === workId)) {
        set({
          lesson: selected,
          works: available,
          savedCount: available.length,
          draft: cached,
          message: '恢复了这个浏览器里的草稿；点击保存后会写入作品集。',
        })
      } else if (work) {
        set({
          lesson: selected,
          works: available,
          savedCount: available.length,
          draft: {
            workId: work.id,
            revision: work.revision,
            title: work.title,
            code: work.code,
            dirty: false,
          },
          message: `已打开作品，第 ${work.revision} 版。`,
        })
      } else {
        set({
          lesson: selected,
          works: available,
          savedCount: available.length,
          draft: {
            revision: 0,
            title: selected.title,
            code: selected.starterCode,
            dirty: false,
          },
        })
      }
      cache()
    } finally {
      if (ticket === selection) set({ loading: false })
    }
  }

  async function save(asNew = false) {
    const { lesson, draft, saving } = get()
    if (!lesson || saving) return
    set({ saving: true })
    const lessonId = lesson.id
    const selectedAtSubmit = selection
    const snapshot = { ...draft }
    const payload = {
      lessonId,
      title: snapshot.title.trim() || '我的故事',
      code: snapshot.code,
      revision: asNew ? 0 : snapshot.revision,
    }
    try {
      const work = await request<Work>(
        asNew || !snapshot.workId ? '/works' : `/works/${snapshot.workId}`,
        {
          method: asNew || !snapshot.workId ? 'POST' : 'PUT',
          body: JSON.stringify(payload),
        },
      )
      const works = [work, ...get().works.filter((item) => item.id !== work.id)]
      set({ works, savedCount: works.length })
      // 保存期间可能切换到同一课程的另一件作品，晚到的响应只更新提交时的草稿。
      const current = get()
      if (selectedAtSubmit === selection && current.lesson?.id === lessonId) {
        const nextDraft = { ...current.draft, workId: work.id, revision: work.revision }
        if (nextDraft.title === snapshot.title) nextDraft.title = work.title
        nextDraft.dirty = nextDraft.code !== work.code || nextDraft.title !== work.title
        set({
          draft: nextDraft,
          conflict: false,
          message: nextDraft.dirty
            ? '刚才的版本已保存；新修改仍在草稿里。'
            : `已保存到作品集 · 第 ${work.revision} 版`,
        })
        cache()
      }
    } catch (error) {
      if (selectedAtSubmit !== selection) return
      set({
        message: error instanceof Error ? error.message : '保存没有完成。',
        conflict: error instanceof ApiError && error.status === 409,
      })
      cache()
    } finally {
      set({ saving: false })
    }
  }

  return {
    lessons: [],
    curriculum: undefined,
    progress: [],
    works: [],
    lesson: undefined,
    draft: { revision: 0, title: '', code: '', dirty: false },
    saving: false,
    message: '',
    conflict: false,
    cacheAvailable: true,
    loading: false,
    savedCount: 0,
    initialize,
    selectLesson,
    editCode,
    editTitle,
    save,
  }
})
