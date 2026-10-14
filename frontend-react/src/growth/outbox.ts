import { familyApi } from '../account/api'
import { accountIdentity } from '../account/session'
import { newId } from '../shared/id'

export interface LearningCreate {
  id: string
  module: 'typing' | 'classroom' | 'adventure'
  activityId: string
  version: string
  mode: 'practice' | 'review'
  start: number
  count: number
}
export interface LearningEvent {
  id: string
  sequence: number
  type: string
  clientAt: string
  payload: Record<string, unknown>
}
export interface LearningReceipt {
  sessionId: string
  awarded: number
  awards: { reason: string; points: number; notice: string }[]
  summary: {
    total: number
    completed: number
    firstCorrect: number
    accuracy: number
    corrected: boolean
    independent: boolean
  }
  balance: { balance: number; frozen: number }
  notice: string
}
interface Pending {
  key: string
  owner: string
  create: LearningCreate
  events: LearningEvent[]
  complete: boolean
  receipt?: LearningReceipt
}
interface Session {
  id: string
  status: string
  cursor: number
  revision: number
  specification: { completion?: LearningReceipt; targets: string[] }
}
let database: Promise<IDBDatabase> | undefined
function open() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('xuya-learning-outbox', 1)
      request.onupgradeneeded = () =>
        request.result.createObjectStore('sessions', { keyPath: 'key' })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        database = undefined
        reject(new Error('学习记录的本地保存暂时不可用，请保持页面打开并重试。'))
      }
    })
  return database
}
async function append(value: Pending, events: LearningEvent[] = [], complete = false) {
  const db = await open()
  return new Promise<Pending>((resolve, reject) => {
    const transaction = db.transaction('sessions', 'readwrite')
    const store = transaction.objectStore('sessions')
    const request = store.get(value.key)
    let saved: Pending
    request.onsuccess = () => {
      saved = request.result ?? structuredClone(value)
      const fresh = events.filter(
        (event) => !saved.events.some((previous) => previous.id === event.id),
      )
      if (saved.complete) return
      for (const event of fresh) saved.events.push({ ...event, sequence: saved.events.length + 1 })
      saved.complete ||= complete
      store.put(saved)
    }
    transaction.oncomplete = () => resolve(saved)
    transaction.onerror = () => reject(new Error('学习记录还没存入本地，请重试。'))
    transaction.onabort = () =>
      reject(new Error('本地保存没有完成，或另一页面已完成这次活动。请重试同步或重新打开活动。'))
  })
}
async function all() {
  const db = await open()
  return new Promise<Pending[]>((resolve, reject) => {
    const request = db.transaction('sessions').objectStore('sessions').getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('学习记录暂时没有读出来。'))
  })
}
async function read(key: string) {
  const db = await open()
  return new Promise<Pending | undefined>((resolve, reject) => {
    const request = db.transaction('sessions').objectStore('sessions').get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('之前的学习活动暂时没有读出来，请重试。'))
  })
}
async function saveReceipt(key: string, receipt: LearningReceipt) {
  const db = await open()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('sessions', 'readwrite')
    const store = transaction.objectStore('sessions')
    const request = store.get(key)
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, receipt })
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(new Error('到账凭证暂未保存，请重试同步。'))
  })
}
const uploads = new Map<string, Promise<LearningReceipt | undefined>>()
async function send(value: Pending): Promise<LearningReceipt | undefined> {
  const previous = uploads.get(value.key)
  if (previous) {
    await previous
    return send(value)
  }
  const uploading = sendLatest(value)
  uploads.set(value.key, uploading)
  try {
    return await uploading
  } finally {
    if (uploads.get(value.key) === uploading) uploads.delete(value.key)
  }
}
async function sendLatest(original: Pending): Promise<LearningReceipt | undefined> {
  const value = (await read(original.key)) ?? original
  if (value.owner !== accountIdentity()) throw new Error('账户已切换，请重新打开学习活动。')
  if (value.receipt) return value.receipt
  let session = await familyApi<Session>('/learning/sessions', 'POST', value.create)
  if (session.status === 'completed') {
    value.receipt = session.specification.completion
    if (value.receipt) await saveReceipt(value.key, value.receipt)
    return value.receipt
  }
  const pending = value.events.filter((event) => event.sequence > session.cursor)
  for (let index = 0; index < pending.length; index += 50) {
    const response = await familyApi<{ session: Session }>(
      `/learning/sessions/${value.create.id}/events`,
      'POST',
      pending.slice(index, index + 50),
    )
    session = response.session
  }
  if (value.complete) {
    value.receipt = await familyApi<LearningReceipt>(
      `/learning/sessions/${value.create.id}/complete`,
      'POST',
      { revision: session.revision, lastSequence: value.events.length },
    )
    await saveReceipt(value.key, value.receipt)
    return value.receipt
  }
}

/** 单活动的事实先落IndexedDB，重连保留原事件ID与顺序；切换账户后拒绝上传。 */
export class LearningRecorder {
  private value: Pending
  private writes = Promise.resolve()
  private sending?: Promise<LearningReceipt | undefined>
  private uploadAgain = false
  private active = true
  private readonly owner = accountIdentity()
  private localError = ''
  private pending: LearningEvent[] = []
  private finishing = false
  constructor(
    create: Omit<LearningCreate, 'id'>,
    private readonly feedback: (message: string, receipt?: LearningReceipt) => void,
    id = newId(),
  ) {
    const initial: Pending = {
      key: `${this.owner}:${id}`,
      owner: this.owner,
      create: { ...create, id },
      events: [],
      complete: false,
    }
    this.value = initial
    if (this.owner)
      this.writes = append(initial)
        .then((value) => {
          this.value = value
        })
        .catch((error: Error) => {
          this.localError = error.message
          if (this.active) this.feedback(error.message)
        })
  }
  get id() {
    return this.value.create.id
  }
  event(type: string, payload: Record<string, unknown>) {
    if (!this.owner || !this.active || this.value.complete || this.finishing) return
    this.pending.push({
      id: newId(),
      sequence: 0,
      type,
      clientAt: new Date().toISOString(),
      payload: structuredClone(payload),
    })
    this.writes = this.writes.then(() => this.persist())
    void this.flush()
  }
  finish() {
    if (!this.owner || this.value.complete || this.finishing) return
    this.finishing = true
    this.writes = this.writes.then(() => this.persist())
    void this.flush()
  }
  private async persist() {
    const events = this.pending.slice()
    try {
      this.value = await append(this.value, events, this.finishing)
      this.pending.splice(0, events.length)
      this.localError = ''
    } catch (error) {
      this.localError =
        error instanceof Error ? error.message : '本地记录暂未保存，请保持页面打开并重试。'
    }
  }
  async flush() {
    if (!this.owner || !this.active) return
    if (this.sending) {
      this.uploadAgain = true
      return this.sending
    }
    this.sending = (async () => {
      try {
        let writing: Promise<void>
        do {
          writing = this.writes
          await writing
        } while (writing !== this.writes)
        if (this.localError || this.pending.length) await this.persist()
        if (this.localError) throw new Error(this.localError)
        const snapshot = structuredClone(this.value)
        const receipt = await send(snapshot)
        if (receipt) {
          this.value.receipt = receipt
          if (this.active) this.feedback(`本次到账 ${receipt.awarded} 积分`, receipt)
        } else if (this.active) this.feedback('学习记录已同步')
        return receipt
      } catch {
        if (this.active)
          this.feedback(this.localError || '学习记录待同步，已保留在这个账户的浏览器里。')
        return undefined
      } finally {
        this.sending = undefined
        if (this.uploadAgain) {
          this.uploadAgain = false
          setTimeout(() => {
            if (this.active) void this.flush()
          }, 0)
        }
      }
    })()
    return this.sending
  }
  close() {
    this.active = false
  }
}

export async function synchronizeLearning() {
  if (!accountIdentity() || typeof indexedDB === 'undefined') return
  for (const value of await all())
    if (value.owner === accountIdentity() && !value.receipt) {
      try {
        await send(value)
      } catch {
        /* 保留原始事实，后续重连/手动同步继续。 */
      }
    }
}

export async function restoreLearningSession(id: string) {
  const session = await familyApi<
    Session & {
      events: {
        event_id: string
        sequence: number
        type: string
        client_at: string
        payload: string
      }[]
      specification: Session['specification'] & { request: LearningCreate }
    }
  >(`/learning/sessions/${id}`)
  const owner = accountIdentity()
  const key = `${owner}:${id}`
  const events = session.events.map((event) => ({
    id: event.event_id,
    sequence: event.sequence,
    type: event.type,
    clientAt: event.client_at,
    payload: JSON.parse(event.payload) as Record<string, unknown>,
  }))
  const value: Pending = {
    key,
    owner,
    create: session.specification.request,
    events,
    complete: session.status === 'completed',
    receipt: session.specification.completion,
  }
  const local = await read(key)
  if (!local) await append(value)
  else if (
    local.events.length < events.length &&
    local.events.every((event, index) => event.id === events[index]?.id)
  )
    await append(local, events.slice(local.events.length), value.complete)
  else if (!local.receipt && local.events.length < events.length)
    throw new Error('这次活动也在另一页面学习，请先同步原页面，或开始新的活动。')
  if (value.receipt) await saveReceipt(key, value.receipt)
}
