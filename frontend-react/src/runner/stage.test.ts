import { describe, expect, it } from 'vitest'
import { deriveStageState, readStageEvents, safeStageEvent } from './stage'
import { readResult, safeVirtualPath } from './protocol'

describe('离谱小镇执行与重演', () => {
  it('相同动作换顺序真的改变漏奶结果，每次运行独立开始', () => {
    const wrong = deriveStageState([{ kind: 'cup' }, { kind: 'lid' }, { kind: 'pour', amount: 1 }])
    const fixed = deriveStageState([{ kind: 'cup' }, { kind: 'pour', amount: 1 }, { kind: 'lid' }])
    expect(wrong).toMatchObject({ filled: 0, spilled: 1, cupOpen: false })
    expect(fixed).toMatchObject({ filled: 1, spilled: 0, cupOpen: false })
    expect(deriveStageState([])).toMatchObject({ filled: 0, spilled: 0, cupOpen: true })
  })
  it('保留真实数量，展示可聚合；角色变化和计数独立', () => {
    const state = deriveStageState([
      { kind: 'pearls', amount: 300 },
      { kind: 'drink', value: '怪味奶茶', amount: 33 },
      { kind: 'actor', actor: '害羞怪兽', value: 'monster' },
      { kind: 'size', actor: '害羞怪兽', value: 0.4 },
      { kind: 'move', actor: '害羞怪兽', x: 120, y: -20 },
      { kind: 'counter', actor: '赞美次数', value: 3 },
    ])
    expect(state).toMatchObject({ pearls: 300, drinks: 33, flavour: '怪味奶茶' })
    expect(state.actors['害羞怪兽']).toMatchObject({ size: 0.4, x: 120, y: -20 })
    expect(state.counters['赞美次数']).toBe(3)
  })
  it('拒绝执行指令、原型属性、无穷值与任意角色样式', () => {
    expect(safeStageEvent({ kind: 'execute', text: 'alert(1)' })).toBeUndefined()
    expect(safeStageEvent({ kind: 'counter', actor: '__proto__', value: 1 })).toBeUndefined()
    expect(safeStageEvent({ kind: 'pour', amount: Infinity })).toBeUndefined()
    expect(safeStageEvent({ kind: 'actor', actor: 'bob', value: 'url(https://x)' })).toBeUndefined()
    expect(safeStageEvent({ kind: 'size', actor: 'bob', value: 1000 })).toBeUndefined()
    expect(readStageEvents([{ kind: 'lid', html: '<script>' }])).toEqual([{ kind: 'lid' }])
  })
  it('运行回执忽略伪造场景摘要，只从合法事件推导场景', () => {
    const result = readResult(
      {
        runId: 'run',
        status: 'success',
        output: '',
        error: '',
        stageEvents: [{ kind: 'lid' }, { kind: 'pour', amount: 1 }],
        stageState: { spilled: 0, filled: 1 },
      },
      'run',
    )!
    expect(result.stageState).toMatchObject({ spilled: 1, filled: 0 })
  })
  it('虚拟工程支持受限相对目录，拒绝越界与过深路径', () => {
    expect(safeVirtualPath('角色/monster.py')).toBe(true)
    expect(safeVirtualPath('../main.py')).toBe(false)
    expect(safeVirtualPath('/main.py')).toBe(false)
    expect(safeVirtualPath('folder\\main.py')).toBe(false)
    expect(safeVirtualPath('a/b/c/d/e.py')).toBe(false)
    expect(safeVirtualPath('a/./b.py')).toBe(false)
  })
  it('不可信回执的文本文件按 UTF-8 限制总量，重复文件不能绕过限制', () => {
    const files = Array.from({ length: 12 }, (_, i) => ({
      name: `file${i}.txt`,
      content: 'x'.repeat(65536),
    }))
    files.unshift({ name: 'file0.txt', content: 'x'.repeat(65536) })
    const result = readResult(
      { runId: 'run', status: 'success', output: '', error: '', files },
      'run',
    )!
    expect(result.files).toHaveLength(8)
    expect(new Set(result.files!.map((file) => file.name)).size).toBe(8)
  })
})
