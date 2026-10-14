import type { StageActor, StageEvent, StageState } from '../types'

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10000
const quantity = (value: unknown): value is number => finite(value) && value >= 0
const name = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-zA-Z0-9_\u4e00-\u9fff -]{1,40}$/.test(value) &&
  !['__proto__', 'prototype', 'constructor'].includes(value)

/** Only data describing the local stage may leave the Python execution origin. */
export function safeStageEvent(value: unknown): StageEvent | undefined {
  if (!value || typeof value !== 'object') return
  const event = value as Record<string, unknown>
  switch (event.kind) {
    case 'cup':
    case 'lid':
      return { kind: event.kind }
    case 'pour':
    case 'pearls':
      return quantity(event.amount) ? { kind: event.kind, amount: event.amount } : undefined
    case 'drink':
      return typeof event.value === 'string' && quantity(event.amount)
        ? { kind: 'drink', value: event.value.slice(0, 80), amount: event.amount }
        : undefined
    case 'say':
      return name(event.actor) && typeof event.text === 'string'
        ? { kind: 'say', actor: event.actor, text: event.text.slice(0, 200) }
        : undefined
    case 'actor':
      return name(event.actor) && ['monster', 'robot', 'cat', 'ghost'].includes(String(event.value))
        ? { kind: 'actor', actor: event.actor, value: String(event.value) }
        : undefined
    case 'move':
      return name(event.actor) && finite(event.x) && finite(event.y)
        ? { kind: 'move', actor: event.actor, x: event.x, y: event.y }
        : undefined
    case 'size':
      return name(event.actor) && quantity(event.value) && event.value <= 3
        ? { kind: 'size', actor: event.actor, value: event.value }
        : undefined
    case 'counter':
      return name(event.actor) && finite(event.value)
        ? { kind: 'counter', actor: event.actor, value: event.value }
        : undefined
  }
}

export function readStageEvents(value: unknown): StageEvent[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, 5000)
    .map(safeStageEvent)
    .filter((event): event is StageEvent => !!event)
}

export function initialStageState(): StageState {
  return {
    cupOpen: true,
    filled: 0,
    spilled: 0,
    pearls: 0,
    drinks: 0,
    flavour: '',
    lastSpeech: '',
    actors: Object.assign(Object.create(null), {
      bubu: { kind: 'robot', x: 0, y: 0, size: 1, text: '' },
    }),
    counters: Object.create(null),
  }
}

/** Replay always starts from the same scene, so prior runs cannot affect a puzzle. */
export function deriveStageState(events: readonly StageEvent[]): StageState {
  const state = initialStageState()
  const actor = (id: string): StageActor | undefined => {
    if (!Object.hasOwn(state.actors, id)) {
      if (Object.keys(state.actors).length >= 32) return
      state.actors[id] = { kind: 'monster', x: 0, y: 0, size: 1, text: '' }
    }
    return state.actors[id]
  }
  for (const raw of events.slice(0, 5000)) {
    const event = safeStageEvent(raw)
    if (!event) continue
    switch (event.kind) {
      case 'cup':
        state.cupOpen = true
        state.filled = 0
        state.spilled = 0
        state.pearls = 0
        state.flavour = ''
        break
      case 'lid':
        state.cupOpen = false
        break
      case 'pour':
        if (state.cupOpen) state.filled += event.amount!
        else state.spilled += event.amount!
        break
      case 'pearls':
        state.pearls = event.amount!
        break
      case 'drink':
        state.flavour = String(event.value)
        state.drinks += event.amount!
        break
      case 'say': {
        state.lastSpeech = event.text!
        const person = actor(event.actor!)
        if (person) person.text = event.text!
        break
      }
      case 'actor': {
        const person = actor(event.actor!)
        if (person) person.kind = event.value as StageActor['kind']
        break
      }
      case 'move': {
        const person = actor(event.actor!)
        if (person) {
          person.x = event.x!
          person.y = event.y!
        }
        break
      }
      case 'size': {
        const person = actor(event.actor!)
        if (person) person.size = event.value as number
        break
      }
      case 'counter':
        if (Object.hasOwn(state.counters, event.actor!) || Object.keys(state.counters).length < 32)
          state.counters[event.actor!] = event.value as number
    }
  }
  return state
}
