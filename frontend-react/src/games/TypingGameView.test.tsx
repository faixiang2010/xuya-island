// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import TypingGameView from '../views/TypingGameView'
import { useGameProgress } from './progress'
import { useLearningPreferences } from '../learning/preferences'
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useGameProgress.setState({ records: [], drafts: [], cacheAvailable: true })
  useLearningPreferences.setState({
    theme: 'detective',
    sound: false,
    motion: true,
    cacheAvailable: true,
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
function open(path = '/games/pinyin') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/games/:gameId" element={<TypingGameView />} />
      </Routes>
    </MemoryRouter>,
  )
}
const settle = () => act(() => vi.advanceTimersByTime(250))
it('中文选字期间不校验，重复提交事件只自动前进一题', () => {
  open()
  const input = screen.getByLabelText('用拼音输入法输入汉字')
  fireEvent.compositionStart(input)
  fireEvent.change(input, { target: { value: 'lv tan' } })
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })
  settle()
  expect(screen.getByTestId('typing-target').textContent).toBe('绿毯')
  fireEvent.change(input, { target: { value: '绿毯' } })
  settle()
  expect(screen.getByTestId('typing-target').textContent).toBe('绿毯')
  fireEvent.compositionEnd(input)
  fireEvent.change(input, { target: { value: '绿毯' } })
  fireEvent.compositionEnd(input)
  settle()
  expect(screen.getByTestId('typing-target').textContent).toBe('线条')
  expect(useGameProgress.getState().drafts[0].nextIndex).toBe(1)
  expect(document.activeElement).toBe(input)
  expect(screen.queryByRole('button', { name: '检查答案' })).toBeNull()
})
it('大小写错误保留供修改，正确后自动前进并保持焦点', () => {
  open('/games/keyboard?level=uppercase')
  const input = screen.getByLabelText('输入字母或数字') as HTMLInputElement
  fireEvent.change(input, { target: { value: 'f' } })
  settle()
  expect(input.value).toBe('f')
  expect(screen.getByTestId('typing-target').textContent).toBe('F')
  expect(screen.getByRole('status').textContent).toContain('大写 F')
  fireEvent.change(input, { target: { value: 'F' } })
  settle()
  expect(screen.getByTestId('typing-target').textContent).toBe('J')
  expect(document.activeElement).toBe(input)
})
it('正确前缀不会判错，重玩、暂停与换级会取消待处理校验', () => {
  open('/games/keyboard?level=mixed')
  let input = screen.getByLabelText('输入字母或数字')
  fireEvent.change(input, { target: { value: 'a' } })
  settle()
  expect(screen.getByRole('status').textContent).toContain('接着输入')
  expect(screen.getByTestId('typing-target').textContent).toBe('a1')
  fireEvent.change(input, { target: { value: 'a1' } })
  fireEvent.click(screen.getByRole('button', { name: '歇一会' }))
  settle()
  expect(useGameProgress.getState().drafts).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: '继续这次冒险 →' }))
  settle()
  expect(screen.getByTestId('typing-target').textContent).toBe('A1')
  fireEvent.change(input, { target: { value: 'A1' } })
  fireEvent.click(screen.getByRole('button', { name: /小写字母/ }))
  settle()
  expect(screen.getByTestId('typing-target').textContent).toBe('f')
  expect(
    useGameProgress.getState().drafts.find((item) => item.levelId === 'mixed')?.nextIndex,
  ).toBe(1)
  input = screen.getByLabelText('输入字母或数字')
  fireEvent.change(input, { target: { value: 'f' } })
  fireEvent.click(screen.getByRole('button', { name: '重新练这一轮' }))
  settle()
  expect(screen.getByTestId('typing-target').textContent).toBe('f')
})
it('六卡后可休息，刷新游标能继续且不会把一组当作整级掌握', () => {
  open('/games/keyboard')
  const input = screen.getByLabelText('输入字母或数字')
  for (const target of ['f', 'j', 'a', 's', 'd', 'g']) {
    fireEvent.change(input, { target: { value: target } })
    settle()
  }
  expect(screen.getByTestId('mission-result')).toBeTruthy()
  expect(useGameProgress.getState().records).toHaveLength(0)
  expect(useGameProgress.getState().drafts[0].nextIndex).toBe(6)
  fireEvent.click(screen.getByRole('button', { name: '再送一组 →' }))
  expect(screen.getByTestId('typing-target').textContent).toBe('h')
})
