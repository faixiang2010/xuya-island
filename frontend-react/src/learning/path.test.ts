import { expect, it } from 'vitest'
import { nextLesson } from './path'
import type { Lesson, Progress } from '../types'

const lessons = [
  { id: 'a', number: 1, version: '1', track: 'core' },
  { id: 'b', number: 2, version: '1', track: 'core' },
  { id: 'extra', number: 33, version: '1', track: 'extension' },
] as Lesson[]
const record = (lessonId: string, status: Progress['status'], lessonVersion = '1') =>
  ({ lessonId, lessonVersion, status }) as Progress
it('零记录从首课开始，已完成进下一课，旧版本不算已完成', () => {
  expect(nextLesson([...lessons].reverse(), [])?.id).toBe('a')
  expect(nextLesson(lessons, [record('a', 'completed')])?.id).toBe('b')
  expect(nextLesson(lessons, [record('a', 'completed', 'old')])?.id).toBe('a')
})
it('优先复习，主线完成后不强制扩展课', () => {
  expect(nextLesson(lessons, [record('b', 'needs-review')])?.id).toBe('b')
  expect(nextLesson(lessons, [record('a', 'completed'), record('b', 'completed')])).toBeUndefined()
})
