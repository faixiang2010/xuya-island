import { describe, expect, it } from 'vitest'
import { gameCategories, gameTags } from './categories'
import { typingGames, type GameId } from './content'

describe('游戏中心分类', () => {
  const ids = Object.keys(typingGames) as GameId[]

  it('每款游戏恰好出现在一个分类里', () => {
    const listed = gameCategories.flatMap((category) => category.ids)
    expect(new Set(listed).size).toBe(listed.length)
    expect([...listed].sort()).toEqual([...ids].sort())
  })

  it('每款游戏都有卡片小标签', () => {
    for (const id of ids) expect(gameTags[id]).toBeTruthy()
  })
})
