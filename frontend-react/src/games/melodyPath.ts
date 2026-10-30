/** 音符小径：棋盘的每个格子是一个音，走出一条与目标旋律一致的路线。 */

export interface MelodyPoint {
  x: number
  y: number
}

export interface MelodyLevel {
  size: number
  melody: number[]
  solution: MelodyPoint[]
}

export interface MelodyState {
  board: number[][]
  melody: number[]
  player: MelodyPoint
  visited: boolean[][]
  path: MelodyPoint[]
  notes: number[]
  status: 'playing' | 'won'
}

const LEVELS: Record<string, MelodyLevel> = {
  first: {
    size: 4,
    melody: [0, 2, 4, 2],
    solution: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
  },
  climb: {
    size: 5,
    melody: [0, 1, 2, 3, 4],
    solution: [
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
    ],
  },
  song: {
    size: 6,
    melody: [2, 4, 5, 4, 2, 0],
    solution: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ],
  },
}

export function melodyLevel(levelId: string): MelodyLevel {
  return LEVELS[levelId] ?? LEVELS.first
}

export function createMelody(levelId: string): MelodyState {
  const level = melodyLevel(levelId)
  const board = Array.from({ length: level.size }, (_, y) =>
    Array.from({ length: level.size }, (_, x) => (x * 3 + y * 5 + 1) % 8),
  )
  level.solution.forEach((point, index) => {
    board[point.y][point.x] = level.melody[index]
  })
  const start = level.solution[0]
  return {
    board,
    melody: [...level.melody],
    player: { ...start },
    visited: Array.from({ length: level.size }, () =>
      Array.from({ length: level.size }, () => false),
    ).map((row, y) => row.map((_, x) => x === start.x && y === start.y)),
    path: [{ ...start }],
    notes: [board[start.y][start.x]],
    status: 'playing',
  }
}

export function matchedNotes(state: MelodyState) {
  let matched = 0
  while (matched < state.notes.length && state.notes[matched] === state.melody[matched])
    matched += 1
  return matched
}

export function moveMelody(state: MelodyState, x: number, y: number): MelodyState {
  if (state.status === 'won') return state
  if (Math.abs(state.player.x - x) + Math.abs(state.player.y - y) !== 1) return state
  if (x < 0 || y < 0 || x >= state.board.length || y >= state.board.length) return state
  if (state.visited[y][x]) return state
  const visited = state.visited.map((row) => [...row])
  visited[y][x] = true
  const notes = [...state.notes, state.board[y][x]]
  const won =
    notes.length === state.melody.length &&
    notes.every((note, index) => note === state.melody[index])
  return {
    ...state,
    player: { x, y },
    visited,
    path: [...state.path, { x, y }],
    notes,
    status: won ? 'won' : 'playing',
  }
}

export function undoMelody(state: MelodyState): MelodyState {
  if (state.path.length <= 1) return state
  const path = state.path.slice(0, -1)
  const player = path[path.length - 1]
  const visited = state.visited.map((row) => [...row])
  visited[state.player.y][state.player.x] = false
  return {
    ...state,
    player,
    visited,
    path,
    notes: state.notes.slice(0, -1),
    status: 'playing',
  }
}
