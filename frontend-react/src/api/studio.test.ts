import { afterEach, expect, it, vi } from 'vitest'
import { connectStudioEvents, studioRequest, validProject, validSnapshot } from './studio'
import type { StudioSnapshot } from '../studio-types'

const project = {
  id: 'p',
  title: '作品',
  scene: 'free',
  lessonId: null,
  sourceWorkId: null,
  revision: 1,
  files: [{ path: 'main.py', content: '' }],
  preferences: { favoriteThemes: [], humor: '' },
  createdAt: '',
  updatedAt: '',
}
const snapshot: StudioSnapshot = {
  session: {
    id: 's',
    projectId: 'p',
    scene: 'free',
    mode: 'studio',
    lessonId: null,
    createdAt: '',
  },
  cursor: 1,
  messages: [],
  tasks: [],
  candidates: [],
  pendingRuns: [],
  budget: {
    modelCalls: 0,
    activeMs: 0,
    repairAttempts: 0,
    limitCalls: 5,
    limitActiveMs: 90000,
    limitRepairs: 2,
  },
}
afterEach(() => vi.unstubAllGlobals())
it('HTTP合同检查阻止不完整项目进入编辑器', async () => {
  expect(validProject(project)).toBe(true)
  expect(validProject({ ...project, files: [{ path: '../escape', content: '' }] })).toBe(false)
  expect(validSnapshot(snapshot)).toBe(true)
  expect(validSnapshot({ ...snapshot, tasks: [{ status: 'banana' }] })).toBe(false)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...project, revision: '1' }))),
  )
  await expect(studioRequest('/projects/p', {}, validProject)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  })
})
it('原生 SSE 保留 cursor，拒绝旧快照、跨会话快照与损坏事件', () => {
  let listener!: (event: { data: string }) => void
  const close = vi.fn()
  const EventSourceMock = vi.fn(
    class {
      onopen?: () => void
      onerror?: () => void
      addEventListener(_type: string, value: typeof listener) {
        listener = value
      }
      close = close
    },
  )
  vi.stubGlobal('EventSource', EventSourceMock)
  const update = vi.fn()
  const connection = vi.fn()
  const stop = connectStudioEvents('s', 1, update, connection)
  listener({ data: JSON.stringify({ ...snapshot, cursor: 2 }) })
  listener({ data: JSON.stringify({ ...snapshot, cursor: 2 }) })
  listener({
    data: JSON.stringify({
      ...snapshot,
      cursor: 2,
      messages: [{ id: 'm', role: 'assistant', text: '副本已修改' }],
    }),
  })
  listener({ data: JSON.stringify({ ...snapshot, cursor: 1 }) })
  listener({
    data: JSON.stringify({ ...snapshot, cursor: 3, session: { ...snapshot.session, id: 'other' } }),
  })
  listener({ data: '{' })
  expect(update).toHaveBeenCalledTimes(2)
  expect(EventSourceMock).toHaveBeenCalledWith('/api/study-sessions/s/events?cursor=1')
  expect(connection).toHaveBeenCalledWith(false)
  stop()
  expect(close).toHaveBeenCalledTimes(1)
})
