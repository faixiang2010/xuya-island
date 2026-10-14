import { parentPort } from 'node:worker_threads'
import { readFileSync } from 'node:fs'
import { loadPyodide } from 'pyodide'
const pyodide = await loadPyodide()
const source = readFileSync(new URL('../runner/worker.js', import.meta.url), 'utf8')
const module = source.match(/const DRAW_MODULE = `([\s\S]*?)`/)[1]
let drawings = [],
  stageEvents = []
globalThis.xuyaDraw = (text) => drawings.push(JSON.parse(text))
globalThis.xuyaStage = (text) => stageEvents.push(JSON.parse(text))
function clearDirectory(directory) {
  for (const name of pyodide.FS.readdir(directory)) {
    if (name === '.' || name === '..') continue
    const file = directory + '/' + name
    if (pyodide.FS.isDir(pyodide.FS.lstat(file).mode)) {
      clearDirectory(file)
      pyodide.FS.rmdir(file)
    } else pyodide.FS.unlink(file)
  }
}
pyodide.FS.mkdirTree('/workspace')
parentPort.on('message', async ({ code, input, files = [] }) => {
  let output = '',
    error = '',
    index = 0,
    globals
  drawings = []
  stageEvents = []
  const decoder = new TextDecoder()
  pyodide.setStdout({
    write: (bytes) => {
      output += decoder.decode(bytes, { stream: true })
      return bytes.length
    },
  })
  pyodide.setStderr({
    write: (bytes) => {
      error += decoder.decode(bytes, { stream: true })
      return bytes.length
    },
  })
  pyodide.setStdin({ stdin: () => input[index++] ?? null })
  try {
    pyodide.FS.chdir('/')
    clearDirectory('/workspace')
    pyodide.FS.chdir('/workspace')
    for (const file of files) {
      const slash = file.name.lastIndexOf('/')
      if (slash > 0) pyodide.FS.mkdirTree('/workspace/' + file.name.slice(0, slash))
      pyodide.FS.writeFile(file.name, file.content, { encoding: 'utf8' })
    }
    await pyodide.runPythonAsync(module)
    await pyodide.runPythonAsync('import random; random.seed(42)')
    globals = pyodide.toPy({ __name__: '__main__' })
    await pyodide.runPythonAsync(code, { globals })
    parentPort.postMessage({
      output,
      error,
      drawings,
      stageEvents,
      files: pyodide.FS.readdir('/workspace'),
    })
  } catch (e) {
    parentPort.postMessage({ output, error: error + String(e), drawings, stageEvents, files: [] })
  } finally {
    globals?.destroy()
  }
})
parentPort.postMessage({ ready: true })
