import { newId } from '../shared/id'
import type { PendingRun, RunExecution, ProjectFile, StudioRunResult } from '../studio-types'
import { studioPost, validExecution } from '../api/studio'

interface Journal {
  clientExecutionId: string
  executionId?: string
  phase: 'claiming' | 'running' | 'receipt'
  result?: StudioRunResult
}
type ExecutionApi = (path: string, body: unknown) => Promise<RunExecution>
/** 先落执行日志再运行；回执丢失只补交结果，刷新后绝不自动重跑未知执行。 */
export class StudioExecutionBroker {
  private inFlight = new Set<string>()
  private finished = new Set<string>()
  private disposed = false
  private active = new Map<string, string>()
  constructor(
    readonly sessionId: string,
    private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
    private execute: (files: ProjectFile[]) => Promise<StudioRunResult>,
    private api: ExecutionApi = (path, body) => studioPost(path, body, validExecution),
  ) {}
  private path(requestId: string) {
    return `/study-sessions/${encodeURIComponent(this.sessionId)}/run-requests/${encodeURIComponent(requestId)}`
  }
  private executionPath(id: string) {
    return `/study-sessions/${encodeURIComponent(this.sessionId)}/run-executions/${encodeURIComponent(id)}`
  }
  private key(requestId: string) {
    return `xuya:studio:execution:${this.sessionId}:${requestId}`
  }
  private read(requestId: string): Journal | undefined {
    try {
      const value = JSON.parse(this.storage.getItem(this.key(requestId)) ?? 'null')
      if (
        !value ||
        typeof value.clientExecutionId !== 'string' ||
        !['claiming', 'running', 'receipt'].includes(value.phase)
      )
        return
      if (
        value.phase === 'receipt' &&
        (!value.result ||
          typeof value.result.runId !== 'string' ||
          typeof value.executionId !== 'string')
      )
        return
      return value
    } catch {
      return
    }
  }
  private write(requestId: string, value: Journal) {
    // 无法保存执行日志时不开始运行，避免刷新造成二次执行。
    this.storage.setItem(this.key(requestId), JSON.stringify(value))
  }
  hasReceipt(requestId: string) {
    return this.read(requestId)?.phase === 'receipt'
  }
  async process(pending: PendingRun, retry = false): Promise<RunExecution | undefined> {
    if (
      this.disposed ||
      this.inFlight.has(pending.requestId) ||
      this.finished.has(pending.requestId)
    )
      return
    const previous = this.read(pending.requestId)
    if (pending.status === 'completed' && !previous) return
    if (pending.status === 'unknown' && !retry && previous?.phase !== 'receipt') return
    if (pending.status === 'running' && !previous) return
    this.inFlight.add(pending.requestId)
    let heartbeat: ReturnType<typeof setInterval> | undefined
    try {
      if (previous?.phase === 'receipt') {
        const acknowledged = await this.api(
          `${this.executionPath(previous.executionId!)}/result`,
          previous.result!,
        )
        this.storage.removeItem(this.key(pending.requestId))
        this.finished.add(pending.requestId)
        return acknowledged
      }
      if (previous?.phase === 'running' && !retry) {
        // 只有本页拥有的执行能被标记未知；其他标签页通过领取租约恢复。
        return await this.api(`${this.executionPath(previous.executionId!)}/abandon`, {})
      }
      const journal: Journal =
        previous?.phase === 'claiming' && !retry
          ? previous
          : { clientExecutionId: newId(), phase: 'claiming' }
      this.write(pending.requestId, journal)
      const execution = await this.api(
        `${this.path(pending.requestId)}/${retry ? 'retry' : 'claim'}`,
        { clientExecutionId: journal.clientExecutionId },
      )
      if (execution.status !== 'running') return execution
      journal.phase = 'running'
      journal.executionId = execution.id
      this.write(pending.requestId, journal)
      if (this.disposed) return await this.api(`${this.executionPath(execution.id)}/abandon`, {})
      this.active.set(pending.requestId, execution.id)
      heartbeat = setInterval(() => {
        void this.api(`${this.executionPath(execution.id)}/heartbeat`, {}).catch(() => {})
      }, 10000)
      let result: StudioRunResult
      try {
        result = await this.execute(execution.files)
      } catch (error) {
        await this.api(`${this.executionPath(execution.id)}/abandon`, {}).catch(() => {})
        throw error
      }
      if (this.disposed) return
      journal.phase = 'receipt'
      journal.result = result
      this.write(pending.requestId, journal)
      const acknowledged = await this.api(`${this.executionPath(execution.id)}/result`, result)
      this.storage.removeItem(this.key(pending.requestId))
      this.finished.add(pending.requestId)
      return acknowledged
    } finally {
      clearInterval(heartbeat)
      this.active.delete(pending.requestId)
      this.inFlight.delete(pending.requestId)
    }
  }
  dispose() {
    this.disposed = true
    for (const executionId of this.active.values()) {
      void this.api(`${this.executionPath(executionId)}/abandon`, {}).catch(() => {})
    }
  }
}
