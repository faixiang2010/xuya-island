import { useEffect, useRef, useState } from 'react'
import type * as Monaco from 'monaco-editor'

interface Props {
  value: string
  path?: string
  readonly?: boolean
  onChange?: (value: string) => void
}

function language(path = '') {
  const extension = path.split('.').at(-1)
  return (
    (
      {
        ts: 'typescript',
        js: 'javascript',
        java: 'java',
        py: 'python',
        json: 'json',
        css: 'css',
        html: 'html',
        vue: 'html',
        md: 'markdown',
        yml: 'yaml',
        yaml: 'yaml',
        sql: 'sql',
      } as Record<string, string>
    )[extension ?? ''] ?? 'plaintext'
  )
}

export default function CodeSurface({ value, path, readonly, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | undefined>(undefined)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let disposed = false
    let editor: Monaco.editor.IStandaloneCodeEditor | undefined
    let themeObserver: MutationObserver | undefined
    async function create() {
      try {
        const monaco = await import('monaco-editor/editor/editor.api.js')
        const { default: EditorWorker } =
          await import('monaco-editor/editor/editor.worker.js?worker')
        if (disposed || !host.current) return
        ;(globalThis as typeof globalThis & { MonacoEnvironment?: unknown }).MonacoEnvironment = {
          getWorker: () => new EditorWorker(),
        }
        const shell = host.current.closest('.cx-shell')
        const theme = () => (shell?.getAttribute('data-theme') === 'dark' ? 'vs-dark' : 'vs')
        editor = monaco.editor.create(host.current, {
          value,
          language: language(path),
          readOnly: readonly,
          theme: theme(),
          automaticLayout: true,
          fontSize: 16,
          fontFamily: 'Consolas, monospace',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 12 },
          wordWrap: 'on',
          ariaLabel: `编辑 ${path || '文件'}`,
          accessibilitySupport: 'on',
        })
        editorRef.current = editor
        if (shell) {
          themeObserver = new MutationObserver(() => monaco.editor.setTheme(theme()))
          themeObserver.observe(shell, { attributes: true, attributeFilter: ['data-theme'] })
        }
        editor.onDidChangeModelContent(() => onChange?.(editor!.getValue()))
        setReady(true)
      } catch {
        setReady(false)
      }
    }
    void create()
    return () => {
      disposed = true
      themeObserver?.disconnect()
      editor?.getModel()?.dispose()
      editor?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (editor && editor.getValue() !== value) editor.setValue(value)
  }, [value])

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: readonly })
  }, [readonly])

  return (
    <div className="cx-editor">
      <div ref={host} className={'cx-monaco' + (!ready ? ' cx-pending' : '')}></div>
      {!ready && (
        <textarea
          value={value}
          readOnly={readonly}
          aria-label={`编辑 ${path || '文件'}`}
          spellCheck={false}
          onChange={(event) => onChange?.((event.target as HTMLTextAreaElement).value)}
        ></textarea>
      )}
    </div>
  )
}
