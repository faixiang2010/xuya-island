import { describe, expect, it } from 'vitest'
import { readDraft, writeDraft } from './draft'

describe('本机草稿恢复', () => {
  it('损坏或结构错误的缓存不会覆盖服务端作品', () => {
    expect(readDraft({ getItem: () => '{broken' }, 'story')).toBeUndefined()
    expect(
      readDraft({ getItem: () => JSON.stringify({ code: 'x', revision: '1' }) }, 'story'),
    ).toBeUndefined()
  })
  it('中文代码、作品标识和原始 revision 一起保留', () => {
    let content = ''
    const draft = {
      workId: 'work-1',
      revision: 2,
      title: '月亮',
      code: 'print("你好")',
      dirty: true,
    }
    expect(
      writeDraft(
        {
          setItem: (_key, value) => {
            content = value
          },
        },
        'story',
        draft,
      ),
    ).toBe(true)
    expect(readDraft({ getItem: () => content }, 'story')).toEqual(draft)
  })
  it('存储满时明确返回失败，不能声称已缓存', () => {
    expect(
      writeDraft(
        {
          setItem: () => {
            throw new Error('quota')
          },
        },
        'story',
        { revision: 0, title: '月亮', code: 'print(1)', dirty: true },
      ),
    ).toBe(false)
  })
})
