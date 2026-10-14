// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import CodeEditor from './CodeEditor'

const pending = vi.hoisted(() => {
  let release!: () => void
  return {
    ready: new Promise<void>((resolve) => {
      release = resolve
    }),
    release: () => release(),
    create: vi.fn(),
  }
})
vi.mock('monaco-editor/editor/editor.api.js', async () => {
  await pending.ready
  return {
    languages: {
      register: vi.fn(),
      setLanguageConfiguration: vi.fn(),
      setMonarchTokensProvider: vi.fn(),
    },
    editor: { defineTheme: vi.fn(), create: pending.create },
  }
})
vi.mock('monaco-editor/languages/definitions/python/python.js', () => ({ conf: {}, language: {} }))
vi.mock('monaco-editor/editor/editor.worker.js?worker', () => ({ default: class {} }))

it('编辑器准备期间更新的草稿不会被初始内容覆盖', async () => {
  let value = ''
  pending.create.mockImplementation((_element, options) => {
    value = options.value
    return {
      getValue: () => value,
      setValue: (next: string) => {
        value = next
      },
      onDidChangeModelContent: vi.fn(),
      getModel: () => ({ dispose: vi.fn() }),
      dispose: vi.fn(),
    }
  })
  const editor = render(<CodeEditor modelValue="print('旧内容')" onUpdateModelValue={() => {}} />)
  editor.rerender(<CodeEditor modelValue="print('我刚写的代码')" onUpdateModelValue={() => {}} />)
  pending.release()
  await waitFor(() => expect(pending.create).toHaveBeenCalled())
  expect(value).toBe("print('我刚写的代码')")
  editor.unmount()
})
