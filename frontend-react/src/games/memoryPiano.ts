/** 记忆琴房：旋律逐轮变长，弹错就重听同一段。 */

export interface PianoState {
  sequence: number[]
  input: number[]
  targetLength: number
  mistakes: number
  attempt: number
  status: 'playing' | 'won'
}

const LEVELS: Record<string, number> = {
  short: 4,
  long: 6,
  song: 8,
}

export const PIANO_KEYS = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si']

export function pianoTarget(levelId: string) {
  return LEVELS[levelId] ?? LEVELS.short
}

function randomNote(random: () => number) {
  return Math.min(PIANO_KEYS.length - 1, Math.floor(random() * PIANO_KEYS.length))
}

export function createPiano(levelId: string, random: () => number = Math.random): PianoState {
  return {
    sequence: [randomNote(random), randomNote(random)],
    input: [],
    targetLength: pianoTarget(levelId),
    mistakes: 0,
    attempt: 0,
    status: 'playing',
  }
}

export function appendPiano(
  state: PianoState,
  note: number,
  random: () => number = Math.random,
): PianoState {
  if (state.status === 'won') return state
  const expected = state.sequence[state.input.length]
  if (note !== expected)
    return { ...state, input: [], mistakes: state.mistakes + 1, attempt: state.attempt + 1 }
  const input = [...state.input, note]
  if (input.length < state.sequence.length) return { ...state, input }
  if (state.sequence.length >= state.targetLength) return { ...state, input, status: 'won' }
  return {
    ...state,
    sequence: [...state.sequence, randomNote(random)],
    input: [],
    attempt: state.attempt + 1,
  }
}
