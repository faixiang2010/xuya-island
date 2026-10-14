import { expect, it, vi } from 'vitest'
import { request } from '../api/client'
import { useClassroomStore } from './classroom'
import type { Lesson, Work } from '../types'
import { readFileSync } from 'node:fs'

vi.mock('../api/client', async (original) => ({
  ...(await original<typeof import('../api/client')>()),
  request: vi.fn(),
}))

it('保存响应晚到时，不得把它的作品标识写到已经切换的作品草稿中', async () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  const first: Work = {
    id: 'first',
    lessonId: 'story-cover',
    title: '作品一',
    code: 'print(1)',
    revision: 1,
    createdAt: '',
    updatedAt: '',
  }
  const second: Work = { ...first, id: 'second', title: '作品二', code: 'print(2)' }
  const lesson: Lesson = {
    ...JSON.parse(
      readFileSync(
        new URL(
          '../../../backend/src/main/resources/curriculum/python-interest-v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ).lessons[0],
    id: 'story-cover',
    number: 1,
    title: '故事',
    subtitle: '',
    mission: '',
    starterCode: '',
    goals: [],
    hints: [],
    previewType: 'cover',
  }
  let finishSave!: (work: Work) => void
  vi.mocked(request).mockImplementation(async (url, options) => {
    if (options?.method === 'PUT')
      return new Promise<Work>((resolve) => {
        finishSave = resolve
      }) as never
    return (url === '/works' ? [first, second] : lesson) as never
  })
  try {
    const store = useClassroomStore.getState()
    await store.selectLesson('story-cover', 'first')
    store.editCode('print(11)')
    const pending = store.save()
    await store.selectLesson('story-cover', 'second')
    finishSave({ ...first, code: 'print(11)', revision: 2 })
    await pending
    const draft = useClassroomStore.getState().draft
    expect(draft.workId).toBe('second')
    expect(draft.code).toBe('print(2)')
    expect(draft.revision).toBe(1)
  } finally {
    vi.unstubAllGlobals()
  }
})
