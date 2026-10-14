import { useEffect, useRef, useState } from 'react'
import type * as Monaco from 'monaco-editor'

interface Props {
  modelValue: string
  onUpdateModelValue: (code: string) => void
}

export default function CodeEditor({ modelValue, onUpdateModelValue }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const fallback = useRef<HTMLTextAreaElement>(null)
  const [available, setAvailable] = useState(false)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | undefined>(undefined)
  const onModelValueChange = useRef(onUpdateModelValue)
  const latestModelValue = useRef(modelValue)
  latestModelValue.current = modelValue
  onModelValueChange.current = onUpdateModelValue

  useEffect(() => {
    let disposed = false
    let instance: Monaco.editor.IStandaloneCodeEditor | undefined
    void (async () => {
      try {
        const monaco = await import('monaco-editor/editor/editor.api.js')
        const python = await import('monaco-editor/languages/definitions/python/python.js')
        const { default: EditorWorker } =
          await import('monaco-editor/editor/editor.worker.js?worker')
        if (disposed || !container.current) return
        ;(globalThis as typeof globalThis & { MonacoEnvironment?: unknown }).MonacoEnvironment = {
          getWorker: () => new EditorWorker(),
        }
        monaco.languages.register({ id: 'python', extensions: ['.py'], aliases: ['Python'] })
        monaco.languages.setLanguageConfiguration('python', python.conf)
        monaco.languages.setMonarchTokensProvider('python', python.language)
        monaco.editor.defineTheme('xuya-paper', {
          base: 'vs',
          inherit: true,
          rules: [
            { token: 'comment', foreground: '829181', fontStyle: 'italic' },
            { token: 'string', foreground: '9D684E' },
            { token: 'keyword', foreground: '7763A0' },
          ],
          colors: {
            'editor.background': '#FFFEFA',
            'editorLineNumber.foreground': '#B8B2C1',
            'editor.lineHighlightBackground': '#F3F0F7',
            'editor.selectionBackground': '#DDD5ED',
          },
        })
        const keepFocus = document.activeElement === fallback.current
        const selectedStart = fallback.current?.selectionStart ?? 0
        const selectedEnd = fallback.current?.selectionEnd ?? 0
        const created = monaco.editor.create(container.current, {
          value: latestModelValue.current,
          language: 'python',
          theme: 'xuya-paper',
          fontSize: 16,
          fontFamily: 'Consolas, "Microsoft YaHei", monospace',
          lineHeight: 29,
          tabSize: 4,
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 20, bottom: 20 },
          wordWrap: 'on',
          renderLineHighlight: 'line',
          suggestOnTriggerCharacters: false,
          quickSuggestions: false,
          accessibilitySupport: 'on',
          ariaLabel: 'Python 代码编辑器',
          glyphMargin: false,
          folding: false,
        })
        instance = created
        editorRef.current = created
        created.onDidChangeModelContent(() => onModelValueChange.current(created.getValue()))
        setAvailable(true)
        if (keepFocus) {
          await Promise.resolve()
          const model = created.getModel()!
          const start = model.getPositionAt(selectedStart)
          const end = model.getPositionAt(selectedEnd)
          created.setSelection(
            new monaco.Selection(start.lineNumber, start.column, end.lineNumber, end.column),
          )
          created.focus()
        }
      } catch {
        setAvailable(false)
      }
    })()
    return () => {
      disposed = true
      instance?.getModel()?.dispose()
      instance?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (editor && editor.getValue() !== modelValue) editor.setValue(modelValue)
  }, [modelValue])

  return (
    <div className="code-editor">
      <div
        ref={container}
        className={available ? 'monaco-container' : 'monaco-container pending'}
      ></div>
      {!available && (
        <textarea
          ref={fallback}
          className="fallback-editor"
          aria-label="Python 代码编辑器"
          spellCheck={false}
          value={modelValue}
          onChange={(event) => onUpdateModelValue((event.target as HTMLTextAreaElement).value)}
        ></textarea>
      )}
    </div>
  )
}
