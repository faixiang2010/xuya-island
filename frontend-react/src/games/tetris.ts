/** 俄罗斯方块规则：纯函数实现，界面只负责按键和绘制。 */

export const TETRIS_WIDTH = 10
export const TETRIS_HEIGHT = 20

const SHAPES: number[][][] = [
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
]

export const TETRIS_COLORS = [
  '#7ec8e3',
  '#f4c95d',
  '#c89cf0',
  '#8fd3a8',
  '#f29b9b',
  '#9bb7f2',
  '#f2a97e',
]

export interface Piece {
  type: number
  shape: number[][]
  x: number
  y: number
}

export interface TetrisState {
  board: number[][]
  piece: Piece
  next: number
  lines: number
  score: number
  targetLines: number
  status: 'playing' | 'over' | 'won'
}

export interface TetrisLevel {
  dropMs: number
  targetLines: number
}

const LEVELS: Record<string, TetrisLevel> = {
  calm: { dropMs: 820, targetLines: 5 },
  steady: { dropMs: 620, targetLines: 10 },
  swift: { dropMs: 430, targetLines: 15 },
}

export function tetrisLevel(levelId: string): TetrisLevel {
  return LEVELS[levelId] ?? LEVELS.calm
}

export function emptyBoard(): number[][] {
  return Array.from({ length: TETRIS_HEIGHT }, () => Array<number>(TETRIS_WIDTH).fill(0))
}

function rotateShape(shape: number[][]): number[][] {
  return shape[0].map((_, column) => shape.map((row) => row[column]).reverse())
}

function collides(board: number[][], shape: number[][], x: number, y: number) {
  for (let row = 0; row < shape.length; row += 1)
    for (let column = 0; column < shape[row].length; column += 1) {
      if (!shape[row][column]) continue
      const nextX = x + column
      const nextY = y + row
      if (nextX < 0 || nextX >= TETRIS_WIDTH || nextY >= TETRIS_HEIGHT) return true
      if (nextY >= 0 && board[nextY][nextX] !== 0) return true
    }
  return false
}

function spawn(type: number): Piece {
  const shape = SHAPES[type].map((row) => [...row])
  return {
    type,
    shape,
    x: Math.floor((TETRIS_WIDTH - shape[0].length) / 2),
    y: 0,
  }
}

function randomType(random: () => number) {
  return Math.min(SHAPES.length - 1, Math.floor(random() * SHAPES.length))
}

export function createTetris(targetLines: number, random: () => number = Math.random): TetrisState {
  const first = randomType(random)
  return {
    board: emptyBoard(),
    piece: spawn(first),
    next: randomType(random),
    lines: 0,
    score: 0,
    targetLines,
    status: 'playing',
  }
}

function lock(state: TetrisState, random: () => number): TetrisState {
  const board = state.board.map((row) => [...row])
  let outside = false
  for (let row = 0; row < state.piece.shape.length; row += 1)
    for (let column = 0; column < state.piece.shape[row].length; column += 1) {
      if (!state.piece.shape[row][column]) continue
      const y = state.piece.y + row
      const x = state.piece.x + column
      if (y < 0) outside = true
      else board[y][x] = state.piece.type + 1
    }
  if (outside) return { ...state, status: 'over' }
  const kept = board.filter((row) => row.some((cell) => cell === 0))
  const cleared = TETRIS_HEIGHT - kept.length
  while (kept.length < TETRIS_HEIGHT) kept.unshift(Array<number>(TETRIS_WIDTH).fill(0))
  const points = [0, 100, 300, 500, 800][cleared] ?? 800
  const lines = state.lines + cleared
  if (lines >= state.targetLines)
    return { ...state, board: kept, lines, score: state.score + points, status: 'won' }
  const piece = spawn(state.next)
  if (collides(kept, piece.shape, piece.x, piece.y))
    return {
      ...state,
      board: kept,
      lines,
      score: state.score + points,
      piece,
      status: 'over',
    }
  return {
    ...state,
    board: kept,
    lines,
    score: state.score + points,
    piece,
    next: randomType(random),
  }
}

export function movePiece(
  state: TetrisState,
  dx: number,
  dy: number,
  random: () => number = Math.random,
): TetrisState {
  if (state.status !== 'playing') return state
  if (!collides(state.board, state.piece.shape, state.piece.x + dx, state.piece.y + dy))
    return { ...state, piece: { ...state.piece, x: state.piece.x + dx, y: state.piece.y + dy } }
  return dy > 0 ? lock(state, random) : state
}

export function rotatePiece(state: TetrisState): TetrisState {
  if (state.status !== 'playing') return state
  const shape = rotateShape(state.piece.shape)
  for (const offset of [0, -1, 1, -2, 2])
    if (!collides(state.board, shape, state.piece.x + offset, state.piece.y))
      return { ...state, piece: { ...state.piece, shape, x: state.piece.x + offset } }
  return state
}

export function hardDrop(state: TetrisState, random: () => number = Math.random): TetrisState {
  if (state.status !== 'playing') return state
  let next = state
  while (!collides(next.board, next.piece.shape, next.piece.x, next.piece.y + 1))
    next = { ...next, piece: { ...next.piece, y: next.piece.y + 1 } }
  return lock(next, random)
}

export function tick(state: TetrisState, random: () => number = Math.random): TetrisState {
  return movePiece(state, 0, 1, random)
}
