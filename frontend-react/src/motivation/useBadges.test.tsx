// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Lesson, Progress } from '../types'
import { useClassroomStore } from '../stores/classroom'
import { useGameProgress } from '../games/progress'
import { useCelebration } from './celebrate'
import { useBadgeWatch } from './useBadges'

function Probe() {
  useBadgeWatch(true)
  return null
}

function lesson(id: string, phaseId: string, number: number): Lesson {
  return { id, phaseId, number, track: 'core', version: 'v1' } as Lesson
}

function completed(lessonId: string): Progress {
  return {
    lessonId,
    lessonVersion: 'v1',
    status: 'completed',
    hintLevel: 0,
    referenceViewed: false,
    reflection: '',
    parentObservation: '',
    updatedAt: '2026-10-14T02:00:00Z',
  }
}

beforeEach(() => {
  localStorage.clear()
  useCelebration.setState({ queue: [] })
  useClassroomStore.setState({ lessons: [], progress: [], works: [], savedCount: 0 })
  useGameProgress.setState({ records: [], drafts: [], cacheAvailable: true })
})

afterEach(cleanup)

describe('徽章解锁监听', () => {
  it('首次启用只静默记录已有收获，不补庆祝历史', () => {
    useClassroomStore.setState({ lessons: [lesson('a', 'story', 1)], progress: [completed('a')] })
    render(<Probe />)
    expect(useCelebration.getState().queue).toHaveLength(0)
  })

  it('之后新增的徽章才庆祝一次，重复渲染不重复弹窗', () => {
    render(<Probe />)
    expect(useCelebration.getState().queue).toHaveLength(0)
    act(() => {
      useClassroomStore.setState({ savedCount: 1 })
    })
    expect(useCelebration.getState().queue.map((item) => item.title)).toEqual([
      '解锁徽章 · 小小创作者',
    ])
    act(() => {
      useClassroomStore.setState({ savedCount: 2 })
    })
    expect(useCelebration.getState().queue).toHaveLength(1)
  })
})
