// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import TypingGameView from '../views/TypingGameView'
import { useGameProgress } from './progress'
import { useLearningPreferences } from '../learning/preferences'

beforeEach(() => {
  localStorage.clear()
  useGameProgress.setState({ records: [], drafts: [], cacheAvailable: true })
  useLearningPreferences.setState({ theme: 'detective', sound: false, motion: true })
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
})

afterEach(cleanup)

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/games/:gameId" element={<TypingGameView />} />
      </Routes>
    </MemoryRouter>,
  )
}

const cases: [string, string][] = [
  ['tetris', '俄罗斯方块棋盘'],
  ['minesweeper', '扫雷棋盘'],
  ['echo', '回声迷宫'],
  ['wind', '风向邮差棋盘'],
  ['melody', '音符小径棋盘'],
  ['piano', '钢琴琴键'],
  ['mirror', '镜像画布'],
  ['memory', '记忆画布'],
]

describe('动脑小游戏路由', () => {
  it.each(cases)('%s 能直接打开并显示棋盘', (id, label) => {
    open(`/games/${id}`)
    expect(screen.getByLabelText(label)).toBeTruthy()
    expect(screen.getByRole('link', { name: '← 返回游戏中心' })).toBeTruthy()
  })
})
