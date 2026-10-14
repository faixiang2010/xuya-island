// SharedArrayBuffer 只在执行域 iframe 与其 Worker 之间传递。
const parents = new Set(new URLSearchParams(location.search).getAll('parent'))
let worker, parentOrigin, channel, currentRun, timer, initTimer, inputBuffer, inputId
let ready = false,
  waiting = false,
  remaining = 10000,
  activeStart = 0,
  output = '',
  errors = '',
  inputs = [],
  stageEvents = []
function emit(type, payload = {}) {
  if (parentOrigin) parent.postMessage({ ...payload, channel, type }, parentOrigin)
}
function finish(status, error) {
  if (!waiting) remaining -= performance.now() - activeStart
  clearTimeout(timer)
  worker?.terminate()
  emit('result', {
    runId: currentRun,
    status,
    output,
    error: errors + error,
    drawings: [],
    stageEvents,
    inputs,
    files: [],
    durationMs: Math.round(10000 - Math.max(0, remaining)),
  })
  currentRun = undefined
  startWorker()
}
function executeTimer() {
  clearTimeout(timer)
  activeStart = performance.now()
  timer = setTimeout(
    () => finish('timeout', '这段代码运行超过 10 秒，已停下。检查一下循环能不能结束。'),
    Math.max(1, remaining),
  )
}
function startWorker() {
  worker?.terminate()
  clearTimeout(timer)
  clearTimeout(initTimer)
  ready = false
  waiting = false
  const instance = new Worker('/worker.js', { type: 'module' })
  worker = instance
  initTimer = setTimeout(() => {
    if (worker !== instance) return
    instance.terminate()
    emit('init-error', { message: 'Python 准备超过两分钟，请重试。' })
  }, 120000)
  instance.onmessage = (event) => {
    if (worker !== instance) return
    const message = event.data
    if (message.type === 'ready' || message.type === 'init-error') {
      clearTimeout(initTimer)
      ready = message.type === 'ready'
      if (!currentRun) emit(message.type, message)
    } else if (message.runId === currentRun && currentRun) {
      if (message.type === 'result') {
        clearTimeout(timer)
        emit('result', message)
        currentRun = undefined
        startWorker()
      } else if (message.type === 'stream') {
        output = message.output
        errors = message.error
        emit('stream', message)
      } else if (message.type === 'stage' && stageEvents.length < 5000) {
        stageEvents.push(message.event)
        emit('stage', message)
      } else if (message.type === 'input-needed') {
        remaining -= performance.now() - activeStart
        clearTimeout(timer)
        waiting = true
        inputId = message.inputId
        emit('input-needed', message)
        timer = setTimeout(() => finish('timeout', '输入等待超过 5 分钟，请重新运行。'), 300000)
      } else if (message.type === 'input-resumed') {
        waiting = false
        emit('input-resumed', message)
        executeTimer()
      }
    }
  }
  instance.onerror = () => {
    if (worker !== instance) return
    if (currentRun) finish('error', 'Python 运行环境遇到了问题，请重新运行。')
    else {
      clearTimeout(initTimer)
      emit('init-error', { message: 'Python 未准备好，请重新运行。' })
    }
  }
}
addEventListener('message', (event) => {
  if (event.source !== parent || !parents.has(event.origin)) return
  const message = event.data
  if (message?.type === 'init' && typeof message.channel === 'string' && !channel) {
    parentOrigin = event.origin
    channel = message.channel
    if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
      emit('init-error', {
        message: '交互执行需要隔离响应头，请重新启动本地服务并使用新版 Chrome 或 Edge。',
      })
      return
    }
    startWorker()
    return
  }
  if (message?.channel !== channel || event.origin !== parentOrigin) return
  if (
    message.type === 'run' &&
    ready &&
    !currentRun &&
    typeof message.code === 'string' &&
    message.code.length <= 65536 &&
    typeof message.runId === 'string'
  ) {
    currentRun = message.runId
    ready = false
    waiting = false
    remaining = 10000
    output = ''
    errors = ''
    inputs = []
    stageEvents = []
    inputBuffer = new SharedArrayBuffer(16400)
    worker.postMessage({
      type: 'run',
      code: message.code,
      runId: currentRun,
      inputBuffer,
      inputMode: message.inputMode === 'preset' ? 'preset' : 'live',
      presetInput: Array.isArray(message.presetInput) ? message.presetInput.slice(0, 50) : [],
      files: Array.isArray(message.files) ? message.files.slice(0, 32) : [],
    })
    executeTimer()
  } else if (
    message.type === 'input' &&
    message.runId === currentRun &&
    waiting &&
    message.inputId === inputId &&
    typeof message.value === 'string'
  ) {
    const bytes = new TextEncoder().encode(message.value)
    if (bytes.length > 16384) return
    const control = new Int32Array(inputBuffer, 0, 4)
    if (Atomics.load(control, 0) !== 0) return
    if (message.eof !== true) inputs.push(message.value)
    new Uint8Array(inputBuffer, 16, bytes.length).set(bytes)
    Atomics.store(control, 1, bytes.length)
    Atomics.store(control, 0, message.eof === true ? 2 : 1)
    Atomics.notify(control, 0)
  } else if (message.type === 'stop' && message.runId === currentRun) {
    finish('stopped', '已停止。你的代码仍保留着。')
  }
})
