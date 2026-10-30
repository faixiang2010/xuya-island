/** 扫雷规则：首次点击后才布雷，保证第一下安全。 */

export interface MineCell {
  mine: boolean
  open: boolean
  flag: boolean
  adjacent: number
}

export interface MinesweeperState {
  board: MineCell[][]
  width: number
  height: number
  mines: number
  status: 'ready' | 'playing' | 'won' | 'lost'
}

export interface MinesweeperLevel {
  width: number
  height: number
  mines: number
}

const LEVELS: Record<string, MinesweeperLevel> = {
  beach: { width: 9, height: 9, mines: 10 },
  reef: { width: 12, height: 12, mines: 24 },
  trench: { width: 16, height: 16, mines: 40 },
}

export function minesweeperLevel(levelId: string): MinesweeperLevel {
  return LEVELS[levelId] ?? LEVELS.beach
}

function emptyCell(): MineCell {
  return { mine: false, open: false, flag: false, adjacent: 0 }
}

export function createMinesweeper(levelId: string): MinesweeperState {
  const level = minesweeperLevel(levelId)
  return {
    board: Array.from({ length: level.height }, () =>
      Array.from({ length: level.width }, emptyCell),
    ),
    width: level.width,
    height: level.height,
    mines: level.mines,
    status: 'ready',
  }
}

function neighbors(width: number, height: number, x: number, y: number) {
  const result: [number, number][] = []
  for (let row = y - 1; row <= y + 1; row += 1)
    for (let column = x - 1; column <= x + 1; column += 1) {
      if (row === y && column === x) continue
      if (column >= 0 && column < width && row >= 0 && row < height) result.push([column, row])
    }
  return result
}

function placeMines(state: MinesweeperState, safeX: number, safeY: number, random: () => number) {
  const safe = new Set<string>([`${safeX},${safeY}`])
  for (const [x, y] of neighbors(state.width, state.height, safeX, safeY)) safe.add(`${x},${y}`)
  const available: [number, number][] = []
  for (let y = 0; y < state.height; y += 1)
    for (let x = 0; x < state.width; x += 1) if (!safe.has(`${x},${y}`)) available.push([x, y])
  const board = state.board.map((row) => row.map((cell) => ({ ...cell })))
  for (let index = 0; index < state.mines; index += 1) {
    const pick = Math.floor(random() * available.length)
    const [x, y] = available.splice(pick, 1)[0]
    board[y][x].mine = true
  }
  for (let y = 0; y < state.height; y += 1)
    for (let x = 0; x < state.width; x += 1)
      board[y][x].adjacent = neighbors(state.width, state.height, x, y).filter(
        ([column, row]) => board[row][column].mine,
      ).length
  return board
}

function openArea(board: MineCell[][], startX: number, startY: number) {
  const queue: [number, number][] = [[startX, startY]]
  while (queue.length) {
    const [x, y] = queue.pop()!
    const cell = board[y][x]
    if (cell.open || cell.flag) continue
    cell.open = true
    if (cell.adjacent !== 0) continue
    for (const [column, row] of neighbors(board[0].length, board.length, x, y))
      if (!board[row][column].open && !board[row][column].mine) queue.push([column, row])
  }
}

function openedCount(board: MineCell[][]) {
  return board.flat().filter((cell) => cell.open).length
}

export function revealCell(
  state: MinesweeperState,
  x: number,
  y: number,
  random: () => number = Math.random,
): MinesweeperState {
  if (state.status === 'won' || state.status === 'lost') return state
  if (x < 0 || x >= state.width || y < 0 || y >= state.height) return state
  const target = state.board[y][x]
  if (target.open || target.flag) return state
  let board = state.board
  let status: MinesweeperState['status'] = state.status
  if (status === 'ready') {
    board = placeMines(state, x, y, random)
    status = 'playing'
  } else {
    board = board.map((row) => row.map((cell) => ({ ...cell })))
  }
  if (board[y][x].mine) {
    for (const cell of board.flat()) if (cell.mine) cell.open = true
    return { ...state, board, status: 'lost' }
  }
  openArea(board, x, y)
  const won = openedCount(board) === state.width * state.height - state.mines
  if (won) for (const cell of board.flat()) if (cell.mine) cell.flag = true
  return { ...state, board, status: won ? 'won' : 'playing' }
}

export function toggleFlag(state: MinesweeperState, x: number, y: number): MinesweeperState {
  if (state.status === 'won' || state.status === 'lost') return state
  if (x < 0 || x >= state.width || y < 0 || y >= state.height) return state
  const target = state.board[y][x]
  if (target.open) return state
  const board = state.board.map((row) => row.map((cell) => ({ ...cell })))
  board[y][x].flag = !board[y][x].flag
  return { ...state, board }
}

export function remainingMines(state: MinesweeperState) {
  return state.mines - state.board.flat().filter((cell) => cell.flag).length
}
