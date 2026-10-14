import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { validResponse } from './schema'
const curriculum = JSON.parse(
  readFileSync(
    new URL(
      '../../../backend/src/main/resources/curriculum/python-interest-v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
)
it('完整课程能校验，缺少练习检查的响应被拒绝', () => {
  expect(validResponse('/curriculum', curriculum)).toBe(true)
  const lesson = structuredClone(curriculum.lessons[0])
  delete lesson.exercises[0].tests
  expect(validResponse('/lessons/story-cover', lesson)).toBe(false)
})
it('作品版本和 AI 回复必须满足运行时合同', () => {
  expect(
    validResponse('/works', [
      {
        id: 'x',
        lessonId: 'story-cover',
        title: '标题',
        code: 'print(1)',
        revision: '1',
        createdAt: '',
        updatedAt: '',
      },
    ]),
  ).toBe(false)
  expect(validResponse('/tutor/ask', { answer: 123 })).toBe(false)
  expect(validResponse('/progress', [{ lessonId: 'x', status: 'completed' }])).toBe(false)
})
