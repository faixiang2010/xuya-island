// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import LearningQuest from './LearningQuest'

afterEach(cleanup)

function steps() {
  return screen.getByRole('group', { name: '探索节奏' }).querySelectorAll('button')
}

describe('课堂“四步小冒险”的真实进度', () => {
  it('按走过的动作标记小步，并给出还差几步', () => {
    render(
      <LearningQuest
        prediction="先运行看看"
        change="只改一处"
        creation="做自己的版本"
        editorId="classroom-editor"
        progress={[true, false, true, false]}
      />,
    )
    const buttons = steps()
    expect(buttons).toHaveLength(4)
    expect([...buttons].map((item) => item.getAttribute('data-done'))).toEqual([
      'true',
      'false',
      'true',
      'false',
    ])
    expect(screen.getByText('已经走过 2 / 4 步，不用一次做完。')).toBeTruthy()
    expect(screen.getByText(/1 · 先看变化/)).toBeTruthy()
  })

  it('没有进度信息时按 0 步显示，不报错', () => {
    render(
      <LearningQuest
        prediction="先运行看看"
        change="只改一处"
        creation="做自己的版本"
        editorId="classroom-editor"
      />,
    )
    expect(screen.getByText('已经走过 0 / 4 步，不用一次做完。')).toBeTruthy()
  })

  it('四步都走过时换成鼓励收尾的提示', () => {
    render(
      <LearningQuest
        prediction="先运行看看"
        change="只改一处"
        creation="做自己的版本"
        editorId="classroom-editor"
        progress={[true, true, true, true]}
      />,
    )
    expect(screen.getByText('四个小步都走过了，随时可以回来再改一版。')).toBeTruthy()
  })
})
