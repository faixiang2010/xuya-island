import { newId } from '../shared/id'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { familyApi } from '../account/api'
import { csrfHeaders } from '../account/session'
import type { RunResult, StageEvent, VirtualFile } from '../types'
import { readResult } from './protocol'
import { readStageEvents } from './stage'
export type RunnerStatus = 'loading' | 'ready' | 'running' | 'waiting' | 'failed'
export interface RunnerSnapshot {
  frameUrl: string
  state: RunnerStatus
  /** 仅因“还没选好主机 Python”失败时为真：界面要引导找大人，而不是抛运维提示。 */
  needsSetup: boolean
  inputRequestId: number
  failure: string
  preparation: string
  notice: string
  result?: RunResult
  liveOutput: string
  liveError: string
  stageEvents: StageEvent[]
}
interface NativeSnapshot {
  id: string
  state: 'running' | 'waiting' | 'completed' | 'unknown'
  inputId: number
  result: RunResult
  notice?: string
}
/** HTTP控制主机Python；页面无需SharedArrayBuffer或自身的Python环境。 */
export function usePythonRunner(
  _frame: RefObject<HTMLIFrameElement | null>,
  onResult: (result: RunResult, code: string) => void,
) {
  const [snap, setSnap] = useState<RunnerSnapshot>({
    frameUrl: '',
    state: 'loading',
    needsSetup: false,
    inputRequestId: 0,
    failure: '',
    preparation: '正在连接主机 Python…',
    notice: '',
    liveOutput: '',
    liveError: '',
    stageEvents: [],
  })
  const current = useRef(snap),
    alive = useRef(true),
    attempt = useRef(0),
    id = useRef('')
  const callback = useRef(onResult)
  callback.current = onResult
  const update = useCallback((value: Partial<RunnerSnapshot>) => {
    current.current = { ...current.current, ...value }
    if (alive.current) setSnap(current.current)
  }, [])
  const initialize = useCallback(async () => {
    const ticket = ++attempt.current
    update({
      state: 'loading',
      needsSetup: false,
      failure: '',
      preparation: '正在连接主机 Python…',
    })
    try {
      const environment = await familyApi<{ configured: boolean }>('/execution/environment')
      if (!alive.current || ticket !== attempt.current) return
      if (!environment.configured) {
        // 这条提示会直接呈现给孩子：先说“找大人帮忙”，再给出大人要走的那条路径。
        update({
          state: 'failed',
          needsSetup: true,
          failure:
            '还没有找到可以运行代码的 Python。请大人打开「家庭管理 → 运行与共享」，选中电脑上的 Python 就可以了。',
        })
        return
      }
      update({ state: 'ready', needsSetup: false, preparation: '主机 Python 已准备好' })
    } catch (error) {
      if (alive.current && ticket === attempt.current)
        update({
          state: 'failed',
          needsSetup: false,
          failure: error instanceof Error ? error.message : 'Python没有连接好。',
        })
    }
  }, [update])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      attempt.current++
      if (id.current)
        void fetch(`/api/v1/execution/runs/${encodeURIComponent(id.current)}/stop`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: csrfHeaders({ 'Content-Type': 'application/json' }),
          body: '{}',
          keepalive: true,
        })
    }
  }, [])
  const run = useCallback(
    async (
      code: string,
      options: {
        inputMode?: 'live' | 'preset'
        presetInput?: string[]
        files?: VirtualFile[]
      } = {},
    ): Promise<RunResult> => {
      if (current.current.state !== 'ready') throw new Error('Python还没有准备好。')
      update({
        state: 'running',
        result: undefined,
        liveOutput: '',
        liveError: '',
        stageEvents: [],
        failure: '',
        notice: '',
      })
      const ticket = ++attempt.current
      try {
        let value = await familyApi<NativeSnapshot>('/execution/runs', 'POST', {
          clientId: newId(),
          code,
          inputMode: options.inputMode ?? 'live',
          presetInput: options.presetInput ?? [],
          files: options.files?.some((file) => file.name === 'main.py')
            ? options.files.map((file) => ({
                path: file.name,
                content: file.name === 'main.py' ? code : file.content,
              }))
            : [
                { path: 'main.py', content: code },
                ...(options.files ?? []).map((file) => ({
                  path: file.name,
                  content: file.content,
                })),
              ],
        })
        id.current = value.id
        if (!alive.current || ticket !== attempt.current) {
          await familyApi(`/execution/runs/${encodeURIComponent(value.id)}/stop`, 'POST', {})
          throw new Error('课程已切换，运行已停止。')
        }
        for (;;) {
          if (!alive.current || ticket !== attempt.current)
            throw new Error('课程已切换，运行已停止。')
          update({
            state: value.state === 'waiting' ? 'waiting' : 'running',
            inputRequestId: value.inputId,
            liveOutput: value.result.output,
            liveError: value.result.error,
            stageEvents: readStageEvents(value.result.stageEvents),
            notice: value.notice ?? '',
          })
          if (value.state === 'completed' || value.state === 'unknown') {
            const result = readResult(
              {
                ...value.result,
                ...(value.state === 'unknown' ? { status: 'error', error: value.notice } : {}),
              },
              value.id,
            )
            if (!result) throw new Error('主机返回的运行结果不完整，请重新连接。')
            id.current = ''
            update({
              state: 'ready',
              result,
              liveOutput: result.output,
              liveError: result.error,
              stageEvents: result.stageEvents ?? [],
            })
            callback.current(result, code)
            return result
          }
          await new Promise((resolve) => setTimeout(resolve, 250))
          value = await familyApi<NativeSnapshot>(`/execution/runs/${encodeURIComponent(value.id)}`)
        }
      } catch (error) {
        if (alive.current && ticket === attempt.current)
          update({
            state: 'failed',
            failure: error instanceof Error ? error.message : '主机连接中断。',
          })
        throw error
      }
    },
    [update],
  )
  const submitInput = useCallback(
    (value: string, eof = false) => {
      if (current.current.state !== 'waiting' || !id.current) return
      update({ state: 'running' })
      void familyApi(`/execution/runs/${encodeURIComponent(id.current)}/input`, 'POST', {
        inputId: current.current.inputRequestId,
        value,
        eof,
      }).catch((error: Error) => update({ failure: error.message }))
    },
    [update],
  )
  const stop = useCallback(() => {
    if (id.current)
      void familyApi(`/execution/runs/${encodeURIComponent(id.current)}/stop`, 'POST', {}).catch(
        (error: Error) => update({ failure: error.message }),
      )
  }, [update])
  const waitReady = useCallback(async () => {
    const deadline = Date.now() + 10000
    while (current.current.state !== 'ready') {
      if (!alive.current || current.current.state === 'failed' || Date.now() > deadline)
        throw new Error('Python无法继续检查，请重新准备。')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }, [])
  const clearResult = useCallback(
    () => update({ result: undefined, liveOutput: '', liveError: '', stageEvents: [] }),
    [update],
  )
  return {
    ...snap,
    initialize,
    run,
    stop,
    waitReady,
    clearResult,
    submitInput,
    retry: initialize,
    onFrameLoad: () => {},
  }
}
