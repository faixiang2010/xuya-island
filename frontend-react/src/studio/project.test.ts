import { expect, it } from 'vitest'
import { candidateDiff, readStudioDraft, sameFiles, validFiles, writeStudioDraft } from './project'

it('作品路径限制与运行器一致，禁止穿越、重复、绝对路径及超大单文件', () => {
  const main = { path: 'main.py', content: 'print("你好")' }
  expect(validFiles([main, { path: '角色/台词.txt', content: '欢迎光临' }])).toBe(true)
  for (const path of [
    '../key.txt',
    '/data.txt',
    'C:/secret.txt',
    'a\\b.txt',
    'a//b',
    'a/b/c/d/e.txt',
    'a..txt',
  ]) {
    expect(validFiles([main, { path, content: '' }])).toBe(false)
  }
  expect(validFiles([main, main])).toBe(false)
  expect(validFiles([{ path: 'main.py', content: '中'.repeat(22000) }])).toBe(false)
  expect(validFiles([{ path: 'other.py', content: '' }])).toBe(false)
})
it('草稿缓存拒绝损坏数据，存储已满时保留明确失败信息', () => {
  const draft = {
    title: '我的奶茶',
    revision: 1,
    files: [{ path: 'main.py', content: 'print(1)' }],
  }
  let serialized = ''
  expect(
    writeStudioDraft(
      {
        setItem: (_, text) => {
          serialized = text
        },
      },
      'p',
      draft,
    ),
  ).toBe(true)
  expect(readStudioDraft({ getItem: () => serialized }, 'p')).toEqual(draft)
  expect(readStudioDraft({ getItem: () => '{' }, 'p')).toBeUndefined()
  expect(
    readStudioDraft(
      { getItem: () => JSON.stringify({ ...draft, files: [{ path: '../x', content: '' }] }) },
      'p',
    ),
  ).toBeUndefined()
  expect(
    writeStudioDraft(
      {
        setItem: () => {
          throw new Error('full')
        },
      },
      'p',
      draft,
    ),
  ).toBe(false)
})
it('候选差异覆盖添加、删除及修改，文件顺序变化不算修改', () => {
  const before = [
    { path: 'main.py', content: 'print(1)' },
    { path: 'old.txt', content: '旧' },
  ]
  const after = [
    { path: 'main.py', content: 'print(2)' },
    { path: 'new.txt', content: '新' },
  ]
  expect(candidateDiff({ files: before }, after)).toEqual([
    { path: 'main.py', before: 'print(1)', after: 'print(2)', kind: 'changed' },
    { path: 'old.txt', before: '旧', after: '', kind: 'removed' },
    { path: 'new.txt', before: '', after: '新', kind: 'added' },
  ])
  expect(sameFiles(before, [...before].reverse())).toBe(true)
})
