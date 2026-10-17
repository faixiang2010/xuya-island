import { describe, expect, it } from 'vitest'
import { fingerForKey, homeKeys, keyRows, practiceCharacters } from './keyboard'
import { fingerLevels } from './fingerCourse'
import { fallingDifficulties, fallingLevels } from './fallingWords'
import { passages, passageLevels, splitPassageText } from './passages'

describe('全键盘十指分区', () => {
  it('26 个字母和 10 个数字都有明确手指', () => {
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') expect(fingerForKey(letter)).toBeDefined()
    for (const digit of '1234567890') expect(fingerForKey(digit)).toBeDefined()
    expect(fingerForKey('F')).toBe('left-index')
    expect(fingerForKey('j')).toBe('right-index')
    expect(fingerForKey('a')).toBe('left-pinky')
    expect(fingerForKey(';')).toBe('right-pinky')
    expect(fingerForKey('5')).toBe('left-index')
    expect(fingerForKey('6')).toBe('right-index')
    expect(fingerForKey(' ')).toBe('right-thumb')
  })

  it('家位键有标记，键盘包含 Shift、空格和回车', () => {
    const keys = keyRows.flatMap((row) => row.keys)
    for (const key of homeKeys) expect(keys.find((item) => item.key === key)?.home).toBe(true)
    for (const key of ['ShiftLeft', 'ShiftRight', 'Space', 'Enter', 'Backspace'])
      expect(keys.some((item) => item.key === key)).toBe(true)
    expect(practiceCharacters()).toEqual(expect.arrayContaining(['a', 'z', '0', ';']))
  })
})

describe('指法课程与掉落词库', () => {
  it('指法六关只使用已映射的键位', () => {
    expect(fingerLevels).toHaveLength(6)
    for (const level of fingerLevels)
      for (const task of level.tasks)
        for (const character of task.target) expect(fingerForKey(character)).toBeDefined()
  })

  it('掉落游戏五档难度逐档变快，关卡与词库一致', () => {
    expect(fallingLevels()).toHaveLength(5)
    for (let index = 1; index < fallingDifficulties.length; index += 1) {
      const previous = fallingDifficulties[index - 1]
      const current = fallingDifficulties[index]
      expect(current.spawnMs).toBeLessThan(previous.spawnMs)
      expect(current.fallSeconds).toBeLessThan(previous.fallSeconds)
    }
    for (const level of fallingLevels())
      expect(
        fallingDifficulties.find((item) => item.id === level.id)?.words.length,
      ).toBeGreaterThan(0)
  })
})

describe('六年级课文库', () => {
  it('语文和英语覆盖六上、六下，只保留 200–500 字长文', () => {
    expect(passages).toHaveLength(26)
    expect(passages.filter((item) => item.language === 'zh')).toHaveLength(14)
    expect(passages.filter((item) => item.language === 'en')).toHaveLength(12)
    expect(passages.filter((item) => item.grade === '六年级上')).toHaveLength(14)
    expect(passages.filter((item) => item.grade === '六年级下')).toHaveLength(12)
    expect(passages.every((item) => item.long)).toBe(true)
    expect(passageLevels('zh')).toHaveLength(14)
    expect(passageLevels('en')).toHaveLength(12)
    expect(new Set(passages.map((item) => item.id)).size).toBe(passages.length)
    for (const passage of passages) {
      expect(passage.segments.length).toBeGreaterThanOrEqual(2)
      for (const segment of passage.segments) {
        expect(segment.trim().length).toBeGreaterThan(0)
        expect(segment.length).toBeLessThanOrEqual(90)
      }
      if (passage.long) {
        const total = passage.segments.reduce((sum, segment) => sum + segment.length, 0)
        expect(total).toBeGreaterThanOrEqual(200)
        expect(total).toBeLessThanOrEqual(500)
      }
    }
  })

  it('自定义长文按行和长度切段', () => {
    expect(splitPassageText('\n第一行。\n第二行。\n')).toEqual(['第一行。', '第二行。'])
    const long = 'word '.repeat(60).trim()
    const chunks = splitPassageText(long)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(90)
    expect(splitPassageText('   ')).toEqual([])
  })
})
