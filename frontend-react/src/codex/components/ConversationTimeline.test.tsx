// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import ConversationTimeline from './ConversationTimeline'
import { useCodexStore } from '../store'

beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollTo = () => {}
  useCodexStore.setState({
    conversation: {
      id: 'chat',
      title: '测试会话',
      projectId: '',
      workspaceId: 'workspace',
    } as never,
    messages: [
      { id: 'user-1', role: 'user', content: '你好' },
      { id: 'assistant-1', role: 'assistant', content: '你好，有什么可以帮你？' },
    ],
    activities: [],
    interactions: [],
    plan: undefined,
    runs: [],
    switching: false,
    eventLog: [],
    cursor: '0',
  })
})

afterEach(cleanup)

it('助手回答下方始终显示复制、重新生成、评价、朗读和分享按钮', () => {
  render(<ConversationTimeline onPlan={() => {}} onProject={() => {}} />)
  for (const name of [
    '复制消息',
    '重新生成',
    '这个回答有帮助',
    '这个回答需要改进',
    '朗读回答',
    '分享回答',
  ])
    expect(screen.getByRole('button', { name })).toBeTruthy()
})
