import { describe, expect, it } from 'vitest'
import { readResult, safeDrawing } from './protocol'

describe('执行域边界', () => {
  it('旧任务不能污染新任务的结果', () => {
    expect(
      readResult({ runId: 'old', status: 'success', output: 'old', error: '' }, 'new'),
    ).toBeUndefined()
  })
  it('拒绝无穷坐标、CSS 注入和不支持的指令', () => {
    expect(
      safeDrawing({ kind: 'text', x: Infinity, y: 0, text: 'x', color: '#ffffff' }),
    ).toBeUndefined()
    expect(
      safeDrawing({ kind: 'circle', x: 1, y: 2, radius: 4, color: 'url(http://x)' }),
    ).toBeUndefined()
    expect(safeDrawing({ kind: 'execute', x: 1, y: 2, color: '#ffffff' })).toBeUndefined()
  })
  it('截断过长输出，不把执行域传入的额外属性交给 UI', () => {
    const result = readResult(
      {
        runId: 'one',
        status: 'success',
        output: 'a'.repeat(30000),
        error: '',
        drawings: [
          { kind: 'text', x: 1, y: 2, text: '<script>code</script>', color: '#ffffff', html: true },
        ],
      },
      'one',
    )!
    expect(result.output.length).toBe(20000)
    expect(result.drawings[0]).not.toHaveProperty('html')
    expect(result.drawings[0].text).toBe('<script>code</script>')
  })
})
