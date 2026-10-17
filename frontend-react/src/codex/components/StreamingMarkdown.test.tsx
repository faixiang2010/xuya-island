// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import StreamingMarkdown from './StreamingMarkdown'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('历史内容直接显示，新增内容逐字追上', () => {
  const history = '历史回答'
  const added = '新的内容'.repeat(4)
  const { rerender } = render(<StreamingMarkdown content={history} />)
  expect(screen.getByText(history)).toBeTruthy()
  rerender(<StreamingMarkdown content={history + added} />)
  act(() => vi.advanceTimersByTime(60))
  const partial = screen.getByText(/历史回答/).textContent ?? ''
  expect(partial.length).toBeGreaterThan(history.length)
  expect(partial.length).toBeLessThan(history.length + added.length)
  act(() => vi.advanceTimersByTime(2000))
  expect(screen.getByText(history + added)).toBeTruthy()
})
