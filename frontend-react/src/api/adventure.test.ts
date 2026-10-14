import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isAdventureEpisode, matchesScene, readAdventureDraft } from './adventure'

const course = JSON.parse(
  readFileSync(
    new URL('../../../backend/src/main/resources/curriculum/absurd-town-v1.json', import.meta.url),
    'utf8',
  ),
)

describe('离谱小镇内容与执行证据', () => {
  it('前四集均包含三级提示、独立示范、创作分支与场景检查', () => {
    expect(course.version).toBe('absurd-town-1.0')
    expect(course.episodes).toHaveLength(4)
    expect(course.episodes.every(isAdventureEpisode)).toBe(true)
    expect(new Set(course.episodes.map((item: { id: string }) => item.id)).size).toBe(4)
    expect(
      isAdventureEpisode({
        ...course.episodes[0],
        checks: [{ name: '空检查', input: [], expectedState: {} }],
      }),
    ).toBe(false)
    expect(isAdventureEpisode({ ...course.episodes[0], hints: ['只给答案'] })).toBe(false)
  })

  it('检查真实状态，不能用成功文字、打印输出或失败执行代替', () => {
    expect(
      matchesScene(
        'success',
        { filled: 1, spilled: 0, cupOpen: false },
        { filled: 1, spilled: 0, cupOpen: false },
      ),
    ).toBe(true)
    expect(matchesScene('success', { filled: 0, spilled: 1 }, { filled: 1, spilled: 0 })).toBe(
      false,
    )
    expect(matchesScene('error', { drinks: 6 }, { drinks: 6 })).toBe(false)
    expect(matchesScene('success', undefined, { drinks: 6 })).toBe(false)
    expect(matchesScene('success', { drinks: '6' }, { drinks: 6 })).toBe(false)
  })

  it('草稿使用新课程版本键，损坏内容不能覆盖课程代码', () => {
    let key = ''
    expect(
      readAdventureDraft(
        {
          getItem: (value) => {
            key = value
            return '{"code":"print(1)"}'
          },
        },
        'town-cup-order',
      ),
    ).toBe('print(1)')
    expect(key).toBe('xuya:adventure:absurd-town-1.0:town-cup-order')
    expect(readAdventureDraft({ getItem: () => 'broken' }, 'town-cup-order')).toBeUndefined()
    expect(readAdventureDraft({ getItem: () => '{"code":123}' }, 'town-cup-order')).toBeUndefined()
    expect(
      readAdventureDraft(
        {
          getItem: () => {
            throw new Error('blocked')
          },
        },
        'town-cup-order',
      ),
    ).toBeUndefined()
  })
})
