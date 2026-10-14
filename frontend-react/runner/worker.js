import { loadPyodide } from '/pyodide/pyodide.mjs'
const MAX_OUTPUT = 20000
let output = '',
  errors = '',
  drawings = [],
  stageEvents = [],
  inputs = [],
  outputTruncated = false,
  activeRun = '',
  waitedMs = 0
let pyodide
const DRAW_MODULE = `
import sys, types, json, js
_xuya = types.ModuleType("xuya")
_draw = types.ModuleType("xuya.draw")
def _send(kind, **values):
    js.xuyaDraw(json.dumps(dict(kind=kind, **values)))
def circle(x, y, radius, color="#c7bbff"):
    _send("circle", x=x, y=y, radius=radius, color=color)
def rectangle(x, y, width, height, color="#9ad9bb"):
    _send("rectangle", x=x, y=y, width=width, height=height, color=color)
def text(x, y, value, color="#493964"):
    _send("text", x=x, y=y, text=str(value), color=color)
_draw.circle, _draw.rectangle, _draw.text = circle, rectangle, text
_xuya.draw = _draw
sys.modules["xuya"] = _xuya
sys.modules["xuya.draw"] = _draw
_xuya.__path__ = []
_stage = types.ModuleType("xuya.stage")
import math as _math

def _stage_send(kind, **values):
    js.xuyaStage(json.dumps(dict(kind=kind, **values)))

def _quantity(value):
    number = float(value)
    if not _math.isfinite(number) or not 0 <= number <= 10000:
        raise ValueError("数量需要在 0 到 10000 之间")
    return int(number) if number.is_integer() else number

def cup():
    _stage_send("cup")

def pour(amount=1):
    _stage_send("pour", amount=_quantity(amount))

def lid():
    _stage_send("lid")

def pearls(amount):
    _stage_send("pearls", amount=_quantity(amount))

def drink(flavour, amount=1):
    _stage_send("drink", value=str(flavour)[:80], amount=_quantity(amount))

def say(value, actor="bubu"):
    _stage_send("say", actor=str(actor), text=str(value)[:200])

def actor(name, kind="monster"):
    if kind not in ("monster", "robot", "cat", "ghost"):
        raise ValueError("角色可选 monster、robot、cat 或 ghost")
    _stage_send("actor", actor=str(name), value=kind)

def move(name, x, y):
    x, y = float(x), float(y)
    if not _math.isfinite(x) or not _math.isfinite(y) or abs(x) > 10000 or abs(y) > 10000:
        raise ValueError("坐标需要在 -10000 到 10000 之间")
    _stage_send("move", actor=str(name), x=x, y=y)

def size(name, value):
    value = _quantity(value)
    if value > 3:
        raise ValueError("角色大小需要在 0 到 3 之间，1 是原来的大小")
    _stage_send("size", actor=str(name), value=value)

def counter(name, value):
    number = float(value)
    if not _math.isfinite(number) or abs(number) > 10000:
        raise ValueError("计数需要在 -10000 到 10000 之间")
    _stage_send("counter", actor=str(name), value=number)

_stage.cup, _stage.pour, _stage.lid = cup, pour, lid
_stage.pearls, _stage.drink, _stage.say = pearls, drink, say
_stage.actor, _stage.move, _stage.size, _stage.counter = actor, move, size, counter
_xuya.stage = _stage
sys.modules["xuya.stage"] = _stage
if "/workspace" not in sys.path:
    sys.path.insert(0, "/workspace")
`
globalThis.xuyaDraw = (json) => {
  if (drawings.length >= 5000) throw new Error('画笔指令超过 5000 条')
  drawings.push(JSON.parse(json))
}
globalThis.xuyaStage = (json) => {
  if (stageEvents.length >= 5000) throw new Error('舞台动作超过 5000 条，请减少重复次数')
  const event = JSON.parse(json)
  stageEvents.push(event)
  postMessage({ type: 'stage', runId: activeRun, event })
}
try {
  pyodide = await loadPyodide({ indexURL: '/pyodide/' })
  postMessage({ type: 'ready' })
} catch {
  postMessage({ type: 'init-error', message: 'Python 资源加载失败，请检查本地服务。' })
}
function write(bytes, isError, decoder) {
  const text = decoder.decode(bytes, { stream: true })
  const remaining = MAX_OUTPUT - output.length - errors.length
  const piece = text.slice(0, Math.max(0, remaining))
  if (isError) errors += piece
  else output += piece
  if (piece.length < text.length) outputTruncated = true
  if (piece) postMessage({ type: 'stream', runId: activeRun, output, error: errors })
  return bytes.length
}
function safeName(name) {
  return (
    typeof name === 'string' &&
    name.length <= 240 &&
    name.split('/').length <= 4 &&
    name
      .split('/')
      .every(
        (part) => /^[\w\u4e00-\u9fff. -]{1,80}$/.test(part) && part !== '.' && !part.includes('..'),
      )
  )
}
onmessage = async (event) => {
  if (event.data?.type !== 'run' || !pyodide) return
  const { code, runId, inputMode, presetInput = [], inputBuffer, files = [] } = event.data
  activeRun = runId
  output = ''
  errors = ''
  drawings = []
  stageEvents = []
  inputs = []
  outputTruncated = false
  waitedMs = 0
  const start = performance.now()
  let status = 'success',
    globals,
    exported = []
  let inputIndex = 0
  try {
    if (new TextEncoder().encode(code).length > 65536) throw new Error('代码请控制在 64 KiB 以内')
    pyodide.setStdout({ write: (bytes) => write(bytes, false, newOutputDecoder) })
    pyodide.setStderr({ write: (bytes) => write(bytes, true, newErrorDecoder) })
    pyodide.setStdin({
      stdin: () => {
        if (inputIndex >= 50) throw new Error('本次运行已回答 50 次，请保存作品并重新运行。')
        if (inputMode === 'preset') {
          const value = presetInput[inputIndex++]
          if (value !== undefined) inputs.push(value)
          return value ?? null
        }
        const control = new Int32Array(inputBuffer, 0, 4)
        Atomics.store(control, 0, 0)
        const inputId = ++inputIndex
        postMessage({ type: 'input-needed', runId, inputId })
        const before = performance.now()
        const wait = Atomics.wait(control, 0, 0, 300000)
        waitedMs += performance.now() - before
        if (wait === 'timed-out') throw new Error('输入等待超过 5 分钟，请重新运行')
        postMessage({ type: 'input-resumed', runId, inputId })
        if (Atomics.load(control, 0) === 2) return null
        const length = Atomics.load(control, 1)
        if (length < 0 || length > 16384) throw new Error('输入长度无效')
        // TextDecoder 不接受共享内存视图，先复制本次回答再解码。
        const value = new TextDecoder().decode(new Uint8Array(inputBuffer, 16, length).slice())
        inputs.push(value)
        return value
      },
    })
    pyodide.FS.mkdirTree('/workspace')
    pyodide.FS.chdir('/workspace')
    if (files.length > 32) throw new Error('最多导入 32 个文件')
    let importSize = 0
    for (const file of files) {
      if (!safeName(file.name) || typeof file.content !== 'string')
        throw new Error('导入文件名无效')
      const bytes = new TextEncoder().encode(file.content)
      importSize += bytes.length
      if (bytes.length > 65536 || importSize > 524288) throw new Error('导入文件超过大小限制')
      const slash = file.name.lastIndexOf('/')
      if (slash > 0) pyodide.FS.mkdirTree('/workspace/' + file.name.slice(0, slash))
      pyodide.FS.writeFile(file.name, bytes)
    }
    await pyodide.runPythonAsync(DRAW_MODULE)
    globals = pyodide.toPy({ __name__: '__main__' })
    await pyodide.runPythonAsync(code, { globals, filename: '我的作品.py' })
    let exportSize = 0
    let visited = 0
    const collect = (directory, prefix = '') => {
      for (const part of pyodide.FS.readdir(directory)) {
        if (part === '.' || part === '..') continue
        if (++visited > 512 || exported.length >= 32) return
        const name = prefix + part
        if (!safeName(name)) continue
        const fullPath = '/workspace/' + name
        const stat = pyodide.FS.lstat(fullPath)
        if (pyodide.FS.isDir(stat.mode)) {
          if (name.split('/').length < 4) collect(fullPath, name + '/')
          continue
        }
        if (!pyodide.FS.isFile(stat.mode) || stat.size > 65536 || exportSize + stat.size > 524288)
          continue
        const bytes = pyodide.FS.readFile(fullPath)
        try {
          const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
          exported.push({ name, content })
          exportSize += bytes.length
        } catch {
          /* Only UTF-8 teaching files are exported; symlinks are never followed. */
        }
      }
    }
    collect('/workspace')
  } catch (error) {
    status = 'error'
    errors = (errors + String(error)).slice(0, MAX_OUTPUT)
  } finally {
    globals?.destroy()
  }
  postMessage({
    type: 'result',
    runId,
    status,
    output,
    error: errors,
    drawings,
    stageEvents,
    inputs,
    files: exported,
    outputTruncated,
    durationMs: Math.round(performance.now() - start - waitedMs),
  })
}
let newOutputDecoder = new TextDecoder()
let newErrorDecoder = new TextDecoder()
