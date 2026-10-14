// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import GrowthView from './GrowthView'
import type { Dashboard, LearningSession } from '../growth/types'

const api = vi.hoisted(() => vi.fn())
vi.mock('../account/api', () => ({ familyApi: api }))
vi.mock('../components/FamilyPanel', () => ({
  default: ({
    open,
    title,
    onClose,
    children,
  }: {
    open: boolean
    title: string
    onClose: () => void
    children: ReactNode
  }) =>
    open ? (
      <section role="dialog" aria-label={title}>
        <button onClick={onClose}>关闭面板</button>
        {children}
      </section>
    ) : null,
}))
vi.mock('../account/LegacyLearningImport', () => ({ default: () => null }))
vi.mock('antd', () => ({
  Button: ({
    children,
    loading: _loading,
    type: _type,
    ...props
  }: {
    children: ReactNode
    loading?: boolean
    type?: string
  }) => <button {...props}>{children}</button>,
  Skeleton: () => <p>正在读取</p>,
}))
function session(id: string): LearningSession {
  return {
    id,
    module: 'classroom',
    activity_id: 'story-cover',
    status: 'paused',
    started_at: '2026-10-14T01:00:00Z',
    content_version: 'v1',
    specification: { title: '探索' + id },
  }
}
function dashboard(sessions: LearningSession[] = []): Dashboard {
  return {
    learner: { id: 'child', nickname: '小芽' },
    sessions,
    skills: [],
    reviews: [],
    balance: { balance: 0, frozen: 0 },
    ledger: [],
    redemptions: [],
    savedRuns: [],
    report: {
      period: '2026-10-12',
      conclusion: '真实记录',
      learningCount: sessions.length,
      completed: 0,
      unfinished: sessions.length,
      helpSources: [],
      timingNotice: '',
      consolidate: [],
    },
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
afterEach(() => {
  cleanup()
  api.mockReset()
  localStorage.clear()
})
describe('成长页的真实状态与详情恢复', () => {
  it('加载失败显示重试，不把失败当作全新空记录', async () => {
    api.mockRejectedValue(new Error('主机未连接'))
    render(
      <MemoryRouter>
        <GrowthView />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('主机未连接'))
    expect(screen.queryByText('你的第一段探索，从这里开始')).toBeNull()
    expect(screen.queryByText('可用成长积分')).toBeNull()
  })
  it('礼物接口失败不会遮掉最近的真实尝试', async () => {
    api.mockImplementation((url: string) =>
      url === '/learning/dashboard'
        ? Promise.resolve(dashboard([session('A')]))
        : Promise.reject(new Error('礼物未连接')),
    )
    render(
      <MemoryRouter>
        <GrowthView />
      </MemoryRouter>,
    )
    await screen.findByText('探索A')
    fireEvent.click(screen.getByText('心愿礼物'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('礼物未连接'))
    fireEvent.click(screen.getByText('最近探索'))
    expect(screen.getByText('探索A')).toBeTruthy()
    expect(screen.getByRole('link', { name: '继续探索 →' }).getAttribute('href')).toBe(
      '/classroom/story-cover',
    )
  })
  it('慢返回的上一条详情不能覆盖当前选择，关闭后也不能重新弹出', async () => {
    const first = deferred<LearningSession>(),
      second = deferred<LearningSession>()
    api.mockImplementation((url: string) =>
      url === '/learning/dashboard'
        ? Promise.resolve(dashboard([session('A'), session('B')]))
        : url.endsWith('/A')
          ? first.promise
          : second.promise,
    )
    render(
      <MemoryRouter>
        <GrowthView />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByText('探索A'))
    fireEvent.click(screen.getAllByText('探索B')[0])
    await act(async () => {
      second.resolve({ ...session('B'), content_version: 'B版本' })
    })
    await screen.findByText('等你继续 · 内容版本 B版本')
    await act(async () => {
      first.resolve({ ...session('A'), content_version: 'A版本' })
    })
    expect(screen.queryByText('等你继续 · 内容版本 A版本')).toBeNull()
    fireEvent.click(screen.getByText('关闭面板'))
    expect(screen.queryByRole('dialog')).toBeNull()
    const third = deferred<LearningSession>()
    api.mockImplementation(() => third.promise)
    fireEvent.click(screen.getByText('探索A'))
    fireEvent.click(screen.getByText('关闭面板'))
    await act(async () => {
      third.resolve(session('A'))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
